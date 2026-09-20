/**
 * 用意した音素材の一覧を読み、合図ごとに鳴らす音を選ぶ。
 * 一覧やファイルが無くてもゲームは止めず、合成音だけで続ける。
 */
export type SfxEntry={files:string[];gainDb:number;synth:boolean};
export type BgmEntry={file:string;gainDb:number;loop:boolean;credit:string};
export type Manifest={bgm:BgmEntry|null;sfx:Record<string,SfxEntry>;credits:string[]};
export type LoadReport={manifest:boolean;loaded:string[];missing:string[]};

export function dbToGain(db:number){return Math.pow(10,db/20);}

function text(value:unknown,fallback=''){return typeof value==='string'?value:fallback;}
function num(value:unknown,fallback:number){return typeof value==='number'&&Number.isFinite(value)?value:fallback;}

/** 一覧の形を整える。欠けた項目は既定値で埋め、壊れた項目は捨てる。 */
export function parseManifest(json:unknown):Manifest {
  const raw=(json&&typeof json==='object'?json:{}) as Record<string,unknown>;
  const credits=new Set<string>();
  let bgm:BgmEntry|null=null;
  if(raw.bgm&&typeof raw.bgm==='object') {
    const b=raw.bgm as Record<string,unknown>;
    if(text(b.file))bgm={file:text(b.file),gainDb:num(b.gainDb,-6),loop:b.loop!==false,credit:text(b.credit)};
    if(bgm?.credit)credits.add(bgm.credit);
  }
  const sfx:Record<string,SfxEntry>={};
  if(raw.sfx&&typeof raw.sfx==='object') {
    for(const [name,value] of Object.entries(raw.sfx as Record<string,unknown>)) {
      if(!value||typeof value!=='object')continue;
      const e=value as Record<string,unknown>;
      const files=(Array.isArray(e.files)?e.files:[e.file]).filter((f):f is string=>typeof f==='string'&&f.length>0);
      if(!files.length)continue;
      sfx[name]={files,gainDb:num(e.gainDb,0),synth:e.synth!==false};
      if(text(e.credit))credits.add(text(e.credit));
    }
  }
  return {bgm,sfx,credits:[...credits]};
}

/** 合図名と属性から、使う項目を選ぶ。「impact.lightning」のような属性つきを優先する。 */
export function chooseEntry(manifest:Manifest,cue:string,element:string|null|undefined):SfxEntry|null {
  if(element&&manifest.sfx[`${cue}.${element}`])return manifest.sfx[`${cue}.${element}`];
  return manifest.sfx[cue]??null;
}

type Decoder={decodeAudioData(data:ArrayBuffer):Promise<AudioBuffer>};
type Fetch=(url:string)=>Promise<{ok:boolean;status:number;json():Promise<unknown>;arrayBuffer():Promise<ArrayBuffer>}>;

export class SampleBank {
  manifest:Manifest={bgm:null,sfx:{},credits:[]};
  private buffers=new Map<string,AudioBuffer>();
  private turn=new Map<string,number>();
  report:LoadReport={manifest:false,loaded:[],missing:[]};
  private loading:Promise<LoadReport>|null=null;

  /** 一覧と音を読む。二度目以降は最初の結果を返す。 */
  load(decoder:Decoder,fetchImpl:Fetch,base:string):Promise<LoadReport> {
    if(!this.loading)this.loading=this.loadOnce(decoder,fetchImpl,base);
    return this.loading;
  }
  private async loadOnce(decoder:Decoder,fetchImpl:Fetch,base:string):Promise<LoadReport> {
    const url=(path:string)=>base.replace(/\/?$/,'/')+path.replace(/^\//,'');
    try {
      const response=await fetchImpl(url('audio/manifest.json'));
      if(!response.ok)return this.report;
      this.manifest=parseManifest(await response.json());this.report.manifest=true;
    } catch {return this.report;}
    const files=new Set<string>();
    if(this.manifest.bgm)files.add(this.manifest.bgm.file);
    for(const entry of Object.values(this.manifest.sfx))entry.files.forEach(f=>files.add(f));
    await Promise.all([...files].map(async file=>{
      try {
        const response=await fetchImpl(url('audio/'+file));
        if(!response.ok)throw new Error(String(response.status));
        this.buffers.set(file,await decoder.decodeAudioData(await response.arrayBuffer()));this.report.loaded.push(file);
      } catch {this.report.missing.push(file);}
    }));
    this.report.loaded.sort();this.report.missing.sort();
    return this.report;
  }
  get bgm():{buffer:AudioBuffer;entry:BgmEntry}|null {
    const entry=this.manifest.bgm;const buffer=entry&&this.buffers.get(entry.file);
    return entry&&buffer?{buffer,entry}:null;
  }
  /** 合図に使う音を一つ返す。複数あれば順番に回す。読めていない音は飛ばす。 */
  pick(cue:string,element:string|null|undefined):{buffer:AudioBuffer;gain:number;synth:boolean}|null {
    const entry=chooseEntry(this.manifest,cue,element);if(!entry)return null;
    const key=element&&this.manifest.sfx[`${cue}.${element}`]?`${cue}.${element}`:cue;
    const ready=entry.files.filter(f=>this.buffers.has(f));if(!ready.length)return null;
    const turn=this.turn.get(key)??0;this.turn.set(key,turn+1);
    return {buffer:this.buffers.get(ready[turn%ready.length])!,gain:dbToGain(entry.gainDb),synth:entry.synth};
  }
  get names(){return [...this.buffers.keys()];}
}
