import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { LocalSpeech } from '../server/local-speech';
import { makeRecipe } from '../src/game/recipe';
import { CastSession } from '../src/game/session';

export function readPcm(wav:Buffer) {
  if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('WAV形式ではありません');
  let valid=false;
  for(let offset=12;offset+8<=wav.length;){
    const id=wav.toString('ascii',offset,offset+4),length=wav.readUInt32LE(offset+4),body=offset+8;
    if(id==='fmt ')valid=wav.readUInt16LE(body)===1&&wav.readUInt16LE(body+2)===1&&wav.readUInt32LE(body+4)===16000&&wav.readUInt16LE(body+14)===16;
    if(id==='data'){if(!valid)throw new Error('16kHz・一チャンネル・16bitの音声を使ってください');return wav.subarray(body,body+length);}
    offset=body+length+(length%2);
  }
  throw new Error('音声がありません');
}

await new Promise<void>((resolvePromise,reject)=>{
  const child=spawn(process.execPath,[resolve('scripts/make-speech-fixtures.mjs')],{windowsHide:true,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolvePromise():reject(new Error('確認用音声を作れませんでした')));
});
const local=new LocalSpeech();local.start();
try {
  const deadline=performance.now()+60000;
  while(local.getStatus().state==='loading'&&performance.now()<deadline)await sleep(100);
  if(local.getStatus().state!=='ready')throw new Error(local.getStatus().message);
  const results=[];
  for(const id of ['ice','seven','correction','negation']) {
    const pcm=readPcm(await readFile(`.local-speech/test-audio/${id}.wav`));
    for(let run=0;run<3;run++) {
      const result=await local.recognize(pcm);
      const session=new CastSession(()=>0);
      session.speech.add({id:0,revision:1,startMs:0,endMs:pcm.length/32,text:result.text,final:true,stability:1,source:'local'});
      const recipe=makeRecipe(session.freeze());
      const ok=id==='ice'||id==='correction'?recipe.element==='ice'&&recipe.form==='wall':id==='seven'?recipe.element==='lightning'&&recipe.count===7:recipe.noAttack&&recipe.purpose==='defend';
      results.push({id,run:run+1,...result,element:recipe.element,form:recipe.form,count:recipe.count,purpose:recipe.purpose,ok});
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  const silence=await local.recognize(Buffer.alloc(16000*2*3));
  const report={date:new Date().toISOString(),kind:'PCで合成した日本語の音声。実際の人による確認ではない',model:local.getStatus(),results,silence};
  await writeFile('.local-speech/test-report.json',JSON.stringify(report,null,2));
  if(results.some(r=>!r.ok)||silence.text)process.exitCode=1;
} finally {local.dispose();}
