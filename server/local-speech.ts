import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type LocalSpeechResult = {text:string;processingMs:number};
export type LocalSpeechStatus = {state:'missing'|'loading'|'ready'|'error';message:string;model:string;device:string;computeType?:string;threads?:number;loadMs?:number};
type Job = {id:number;pcm:Buffer;resolve:(value:LocalSpeechResult)=>void;reject:(reason:Error)=>void;createdAt:number;sentAt?:number};
/** 確認用。一回ごとの音の長さ、待ち時間、処理時間。 */
export type LocalSpeechJobRecord = {id:number;at:string;audioMs:number;queuedMs:number;processingMs:number;roundTripMs:number;error?:string};

/** setup:speech が作るPython環境の場所。WindowsとMac/Linuxで置き場所が違う。 */
export const defaultSpeechPython=()=>resolve(process.platform==='win32'?'.venv-speech/Scripts/python.exe':'.venv-speech/bin/python');

/** モデルは一度だけ読み込む。音声は子プロセスの標準入力へ渡し、保存しない。 */
export class LocalSpeech {
  private process:ChildProcessWithoutNullStreams|null=null;
  private active:Job|null=null;
  private queued:Job|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private serial=0;
  private owner:object|null=null;
  private disposed=false;
  private recent:LocalSpeechJobRecord[]=[];
  private rejectedBusy=0;
  private failures=0;
  private startedAt=0;
  private status:LocalSpeechStatus={state:'missing',message:'npm run setup:speech で音声認識を準備してください',model:'kotoba-whisper-v2.0',device:process.platform==='win32'?'cuda':'cpu'};
  constructor(private python=process.env.LOCAL_SPEECH_PYTHON||defaultSpeechPython(),private model=process.env.LOCAL_SPEECH_MODEL||resolve('.local-speech/models/kotoba-v2.0')) {}
  getStatus(){return {...this.status};}
  /** 確認用の記録。音声は含まない。 */
  diagnostics(){return {status:this.getStatus(),python:this.python,recentJobs:[...this.recent],rejectedBusy:this.rejectedBusy,failures:this.failures};}
  private remember(record:LocalSpeechJobRecord){this.recent.push(record);if(this.recent.length>60)this.recent.shift();}
  start() {
    if(this.process||this.disposed)return;
    if(!existsSync(this.python)||!existsSync(resolve(this.model,'model.bin')))return;
    this.status={...this.status,state:'loading',message:'このPCの音声認識を準備しています'};this.startedAt=performance.now();
    const child=spawn(this.python,['-X','utf8',resolve('speech/worker.py')],{
      windowsHide:true,stdio:'pipe',env:{...process.env,LOCAL_SPEECH_MODEL:this.model,PYTHONIOENCODING:'utf-8',HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'},
    });
    this.process=child;
    // CPUだけのPCでは読み込みに時間がかかるため、長めに待つ。
    this.timer=setTimeout(()=>this.fail('音声認識の準備が時間内に終わりませんでした。アプリを起動し直してください。'),180000);
    createInterface({input:child.stdout}).on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{return;}
      if(message.type==='ready') {
        if(this.timer)clearTimeout(this.timer);this.timer=null;
        const device=typeof message.device==='string'?message.device:this.status.device;
        this.status={...this.status,state:'ready',device,computeType:message.computeType,threads:message.threads,loadMs:Math.round(performance.now()-this.startedAt),message:device==='cpu'?'このPCで音声を認識できます（CPUで動作中。遅れることがあります）':'このPCで音声を認識できます'};return;
      }
      if(message.type==='unavailable'){this.fail(message.reason);return;}
      if(message.type==='result'&&this.active?.id===message.id) {
        if(this.timer)clearTimeout(this.timer);this.timer=null;
        const job=this.active;this.active=null;
        if(!job)return;
        const now=performance.now();
        const record:LocalSpeechJobRecord={id:job.id,at:new Date().toISOString(),audioMs:Math.round(job.pcm.length/32),queuedMs:Math.round((job.sentAt??now)-job.createdAt),processingMs:Number(message.processingMs)||0,roundTripMs:Math.round(now-(job.sentAt??job.createdAt))};
        if(message.error||typeof message.text!=='string'||message.text.length>1500){this.failures++;this.remember({...record,error:'変換できなかった'});job.reject(new Error('音声を文字に変換できませんでした'));}
        else {this.remember(record);job.resolve({text:message.text,processingMs:record.processingMs});}
        const next=this.queued;this.queued=null;if(next)this.dispatch(next);
      }
    });
    child.stderr.setEncoding('utf8');child.stderr.on('data',text=>console.error('[音声認識]',String(text).trim().slice(0,2000)));
    child.on('error',()=>this.fail('音声認識を起動できませんでした。npm run setup:speech を確認してください。'));
    child.on('exit',()=>{this.process=null;if(!this.disposed&&this.status.state!=='error')this.fail('音声認識が停止しました。アプリを起動し直してください。');});
    child.stdin.on('error',()=>{if(!this.disposed)this.fail('音声認識との接続が切れました。');});
  }
  reserve(owner:object){if(this.owner&&this.owner!==owner)return false;this.owner=owner;return true;}
  release(owner:object){if(this.owner===owner)this.owner=null;}
  recognize(pcm:Buffer):Promise<LocalSpeechResult> {
    if(this.status.state!=='ready'||!this.process)return Promise.reject(new Error(this.status.message));
    return new Promise((resolve,reject)=>{
      const job:Job={id:++this.serial,pcm,resolve,reject,createdAt:performance.now()};
      if(!this.active)this.dispatch(job);
      else if(!this.queued)this.queued=job;
      else {this.rejectedBusy++;reject(new Error('音声認識の処理が混み合っています'));}
    });
  }
  private dispatch(job:Job) {
    this.active=job;job.sentAt=performance.now();
    this.timer=setTimeout(()=>this.fail('音声認識が時間内に終わりませんでした。'),10000);
    this.process?.stdin.write(JSON.stringify({id:job.id,pcm:job.pcm.toString('base64')})+'\n');
  }
  private fail(message:string) {
    if(this.timer)clearTimeout(this.timer);this.timer=null;
    this.status={...this.status,state:'error',message};
    this.active?.reject(new Error(message));this.queued?.reject(new Error(message));
    this.active=null;this.queued=null;this.process?.kill();
  }
  dispose(){this.disposed=true;this.fail('音声認識を終了しました');this.owner=null;}
}
