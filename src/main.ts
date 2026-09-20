import './style.css';
import './cast-style.css';
import { CastSession, REPLY_LIMIT_MS, SPEECH_LIMIT_MS, SPEECH_WAIT_MS } from './game/session';
import { summarizeMotion } from './game/motion';
import { ELEMENT_LABELS, PURPOSE_LABELS, FORM_LABELS, type Phase } from './game/types';
import { HandCamera } from './input/camera';
import { VoiceInput } from './input/voice';
import { CastScene } from './render/cast-scene';
import { MagicCanvas, colors } from './render/magic';
import { chantDictionary } from './game/chant-dictionary';
import { CastAudio } from './audio/cast-audio';
import { Diagnostics } from './game/diagnostics';
import { liveInput, emptyLive } from './game/live-input';
import { ScreenOverlay } from './render/overlay';
import { HealthBar } from './render/health-bar';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <img id="world" src="/art/ruins-empty-v1.png" alt="石の柱と城が見える遺跡"><canvas id="knight" aria-label="剣と盾を持つ遺跡の騎士"></canvas><canvas id="spell" aria-hidden="true"></canvas><canvas id="magic" aria-label="手やマウスの動きで術式を描く場所"></canvas>
  <div class="vignette"></div>
  <header><div class="brand"><span class="sigil" aria-hidden="true"></span><div><div class="brand-name">はじまりの魔法</div><p class="eyebrow">描いて、唱えて、解き放つ</p></div></div><div class="top-right"><span class="trial dev-only">最初の24秒・試作</span><div class="timer" id="timer" hidden><small>のこり</small><b>24</b><small>秒</small></div></div></header>
  <section class="welcome" id="welcome"><div class="chapter">第一幕 / 最初の魔法</div><h1><span>その手で描く</span><span>その言葉で放つ</span></h1><p class="intro">自由に描いた線が、ひとつの魔法になる。<br>手を動かしながら、好きな言葉を唱えよう。<br>形に正解はないので、小さな動きでも大丈夫</p>
    <fieldset class="mode-options"><legend>描き方を選ぶ</legend><label class="mode-option"><input type="radio" name="mode" value="camera"><strong>手で描く</strong><small>カメラに手を映す（片手でも大丈夫）</small></label><label class="mode-option"><input type="radio" name="mode" value="pointer" checked><strong>マウスで試す</strong><small>画面を押したまま動かす</small></label></fieldset>
    <label class="voice-option"><input type="checkbox" id="use-voice">マイクで唱える <span id="voice-availability"></span></label>
    <div class="sound-options"><label><input id="use-sound" type="checkbox" checked>効果音</label><label for="sound-volume">音量</label><input id="sound-volume" type="range" min="0" max="100" value="25" aria-label="効果音の音量"><output id="sound-volume-value">25%</output><button id="test-sound" type="button">音を試す</button></div>
    <button class="primary" id="start">魔法をつくる <span class="arrow" aria-hidden="true">↗</span></button><div class="welcome-actions"><button class="text-button" id="demo">見本の動きを見る</button><button class="text-button" id="chant-words">詠唱の言葉を見る</button><button class="text-button dev-only" id="settings">接続の確認</button><button class="text-button" id="last-record" hidden>前回の記録を保存する</button></div>
    <p class="dev-only"><a class="text-button" href="/?view=look">新しい背景・騎士・術式を見る ↗</a></p>
    <p class="notice" id="notice" role="status"></p><p class="privacy" id="privacy">カメラの映像はこのPC内で処理します。音声認識の設定を確認しています。</p>
  </section>
  <section class="hud" id="hud" hidden><div class="top-progress"><i id="progress"></i></div><div class="enemy-health">遺跡の騎士<i><b id="health"></b></i></div><button class="exit" id="cancel">中止する</button><div class="demo-tag" id="demo-tag" hidden>見本を再生中</div>
    <div class="countdown" id="countdown" hidden role="status"><p class="countdown-title">詠唱の準備を始めよ</p><div class="countdown-number" id="countdown-number">3</div><p class="countdown-hint" id="countdown-hint"></p></div>
    <div class="recognized" id="recognized" hidden></div><div class="voice-meter" id="meter" aria-hidden="true">${'<i></i>'.repeat(22)}</div><div class="voice-label" id="voice-label" hidden>声を受け付けています</div><p class="service-notice" id="service-notice" role="status"></p>
    <div class="input-panel" id="input-panel"><label for="chant">声の代わりに、文字で試す</label><input id="chant" type="text" maxlength="160" autocomplete="off" placeholder="例：雷よ、七つに分かれろ"><p>14秒までは書き直せます<br>何も入れず、線だけでも遊べます</p></div>
    <div class="bottom-hud" id="bottom-hud"><h2 class="instruction" id="instruction">手を動かしてみよう</h2><div class="hint" id="hint"></div><div class="steps"><span id="step-input" class="active"><b>1</b>線を描く</span><i></i><span id="step-complete"><b>2</b>形になる</span><i></i><span id="step-release"><b>3</b>放つ</span></div></div>
  </section>
  <section class="result" id="result" hidden><div class="chapter">最初の魔法が完成した</div><h2 id="spell-name"></h2><p class="spell-description" id="spell-description"></p><p class="transcript" id="transcript"></p><div class="result-actions"><button class="primary" id="again">もう一度つくる</button><button class="secondary" id="back">最初へ戻る</button></div><div class="feedback dev-only" id="feedback"><span>自分の魔法を放ったと感じましたか？</span><button data-feedback="yes">そう感じた</button><button data-feedback="unclear">まだ分かりにくい</button></div><div class="report-actions dev-only"><button class="text-button" id="record">確認用の記録を見る</button><button class="text-button" id="download">記録を保存する</button></div><p class="credits" id="credits" hidden></p></section>
  <div class="status-sheet" id="sheet" hidden><section class="status-content" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="secondary" id="sheet-close">閉じる</button></div><div id="sheet-body"></div></section></div>
  <div class="loading" id="loading">魔法の準備をしています…</div>`;

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
// 確認用の表示。遊ぶ人には出さず、?dev=1 を付けたときだけ出す。
const devView=new URLSearchParams(location.search).has('dev');
if(devView)document.body.dataset.dev='1';
const show=(id:string,visible:boolean)=>{el(id).hidden=!visible;};
// 見た目の設定は ?preset=calm|vivid|max で選べる。指定がなければ派手な設定。
const presetName=new URLSearchParams(location.search).get('preset');
const magic=new MagicCanvas(el<HTMLCanvasElement>('magic'),presetName);
// 控えめモード。?calm=1 と「動きを減らす」設定が一番強く、次に画面のボタン（前回の選択を覚えている）。
const CALM_KEY='calm-mode';
const calmForced=new URLSearchParams(location.search).get('calm')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const calmSaved=(()=>{try{return localStorage.getItem(CALM_KEY)==='1';}catch{return false;}})();
let calmMode=calmForced||calmSaved;
const overlay=new ScreenOverlay(el('app'),{world:el('world'),knight:el('knight'),spell:el('spell')});
const healthBar=new HealthBar(el('health'));
const sound=new CastAudio();
const soundToggle=document.createElement('button');soundToggle.id='sound-toggle';soundToggle.className='sound-toggle';soundToggle.textContent='音を消す';el('hud').append(soundToggle);
// 演出を控えめにする切り替え。開始画面は音の設定の隣、プレイ中は「音を消す」の隣に置く。
const calmToggle=document.createElement('button');calmToggle.id='calm-toggle';calmToggle.className='calm-toggle';calmToggle.type='button';el('hud').append(calmToggle);
const calmOption=document.createElement('button');calmOption.id='calm-option';calmOption.className='calm-option';calmOption.type='button';document.querySelector('.sound-options')?.append(calmOption);
function setCalm(on:boolean,remember=true){
  // ?calm=1 と「動きを減らす」設定のときは、ボタンで派手にはできない。
  calmMode=calmForced||on;
  magic.setCalm(calmMode);
  const label=calmMode?'演出を派手にする':'演出を控えめにする';
  for(const button of [calmToggle,calmOption]){button.textContent=label;button.setAttribute('aria-pressed',String(calmMode));button.disabled=calmForced&&calmMode;}
  if(remember&&!calmForced){try{localStorage.setItem(CALM_KEY,calmMode?'1':'0');}catch{/* 保存できなくても遊べます。 */}}
}
calmToggle.addEventListener('click',()=>setCalm(!calmMode));
calmOption.addEventListener('click',()=>setCalm(!calmMode));
setCalm(calmMode,false);
function setSound(enabled:boolean){sound.setEnabled(enabled);el<HTMLInputElement>('use-sound').checked=enabled;el<HTMLButtonElement>('test-sound').disabled=!enabled;soundToggle.textContent=enabled?'音を消す':'音を出す';soundToggle.setAttribute('aria-pressed',String(!enabled));if(enabled)void sound.prepare();}
el('test-sound').addEventListener('click',()=>void sound.preview().then(()=>{if(sound.snapshot.state==='unavailable')el('notice').textContent='このブラウザーでは音を使えません。音なしで続けられます。';}));
el('use-sound').addEventListener('change',()=>setSound(el<HTMLInputElement>('use-sound').checked));
soundToggle.addEventListener('click',()=>setSound(!el<HTMLInputElement>('use-sound').checked));
el<HTMLInputElement>('sound-volume').addEventListener('input',event=>{const value=Number((event.target as HTMLInputElement).value);sound.setVolume(value/100);el('sound-volume-value').textContent=`${value}%`;});
let stage:CastScene;
try {stage=new CastScene(el<HTMLCanvasElement>('spell'),el<HTMLImageElement>('world'),magic,el<HTMLCanvasElement>('knight'));}catch {el('loading').textContent='光の表示を準備できませんでした。Chromeの画像処理の設定を確認してください。';throw new Error('WebGL初期化に失敗');}
const resultCanvas=document.createElement('canvas');resultCanvas.id='result-spell';resultCanvas.setAttribute('aria-label','今回描いた術式');el('result').prepend(resultCanvas);
const resultMagic=new MagicCanvas(resultCanvas);
let session:CastSession|null=null,camera:HandCamera|null=null,voice:VoiceInput|null=null;
let cursors:Array<{x:number;y:number}>=[],lastHandAt=0,mode='pointer',demo=false,preparing=false;
let endedInput=false,requested=false,resultShown=false,lastUi=0,feedback:string|null=null,lastCameraLatency=0;
let requestAbort:AbortController|null=null;
let status:{jev:boolean;speech:boolean;handModel:boolean;model:string;speechProvider:'local'|'google'|'off';localSpeech:{state:string;message:string;model:string;device:string}|null}={jev:false,speech:false,handModel:false,model:'',speechProvider:'local',localSpeech:null};
let serviceNotice='',prepareVersion=0;
const frameIntervals:number[]=[];let lastFrame=performance.now();
let diag:Diagnostics|null=null,lastReport:ReturnType<typeof report>|null=null,lockLogged=false;
/** 24秒の前に置く準備の秒数。手や声の位置を決める時間で、24秒にも60秒にも含めない。 */
const COUNTDOWN_SECONDS=3;let countingDown=false;

async function readStatus(){try{status=await fetch('/api/status').then(r=>r.json());}catch{serviceNotice='接続を確認できません。このPCの中だけで魔法を決めます。';status.speech=false;}
  el('voice-availability').textContent=status.speech?(status.speechProvider==='local'?'（このPCで聞き取ります）':'（Googleで聞き取ります）'):status.localSpeech?.state==='loading'?'（準備中です）':'（いまは使えません）';
  el<HTMLInputElement>('use-voice').disabled=!status.speech;
  if(!status.speech)el<HTMLInputElement>('use-voice').checked=false;
  el('privacy').textContent=`${status.speechProvider==='google'?'カメラの映像はこのPCの中だけで扱います。声はGoogleへ送って文字に変えます。':'カメラの映像も声も、このPCの中だけで扱い、外へ送りません。'}${status.jev?'文字にした言葉と動きの形だけ、魔法を決める処理へ送ります。':''}記録は保存しません。`;}
void readStatus();
const statusTimer=setInterval(()=>{if(!session&&!preparing)void readStatus();},3000);

function cleanup(){sound.stop();camera?.dispose();camera=null;voice?.dispose();voice=null;requestAbort?.abort();requestAbort=null;cursors=[];}
function toReady(message='') {
  el('app').dataset.screen='ready';
  if(session&&!resultShown){diag?.log('中止');lastReport=report();}
  prepareVersion++;session?.cancel();cleanup();session=null;preparing=false;countingDown=false;show('countdown',false);
  show('last-record',!!lastReport);
  show('welcome',true);show('hud',false);show('result',false);show('timer',false);show('sheet',false);
  el<HTMLButtonElement>('start').disabled=false;el<HTMLButtonElement>('demo').disabled=false;el('notice').textContent=message;
}
async function begin(isDemo=false) {
  if(preparing)return;preparing=true;const version=++prepareVersion;
  void sound.prepare();
  cleanup();session=null;demo=isDemo;mode=(document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value??'pointer');
  diag=new Diagnostics(performance.now());lockLogged=false;diag.log('準備を開始',{mode,voice:el<HTMLInputElement>('use-voice').checked,speechProvider:status.speechProvider,localSpeech:status.localSpeech});
  el<HTMLButtonElement>('start').disabled=true;el<HTMLButtonElement>('demo').disabled=true;el('notice').textContent='準備しています…';
  const id=crypto.randomUUID();
  try {
    if(mode==='camera'&&!demo) {
      if(!status.handModel)throw new Error(devView?'手の認識ファイルがありません。接続の確認から準備方法をご覧ください。':'いまは手で描けません。「マウスで試す」で遊べます。');
      const record=diag;
      const input=new HandCamera((hands,timestamp)=>{
        if(version!==prepareVersion)return;
        cursors=hands;if(hands.length)lastHandAt=timestamp;
        if(session?.accepting)for(const hand of hands)session.motion.add(hand.x,hand.y,timestamp-session.startMs,hand.id);
      },message=>{serviceNotice=message;},{
        frame:(detectMs,latencyMs)=>{lastCameraLatency=latencyMs;record?.camera(detectMs,latencyMs);},
        event:(kind,detail)=>{record?.log(kind,detail);if(record&&typeof detail?.delegate==='string')record.cameraDelegate=detail.delegate;},
      });camera=input;await input.prepare();
      if(record)record.cameraDelegate=input.delegate;
      if(version!==prepareVersion){input.dispose();return;}
    }
    if(el<HTMLInputElement>('use-voice').checked&&!demo) {
      const record=diag;
      const input=new VoiceInput(entry=>{if(version!==prepareVersion)return;record?.transcript(entry);session?.speech.add(entry);},message=>{serviceNotice=message;record?.log('音声の知らせ',{message});},{audio:(bytes,startMs)=>record?.audio(bytes,startMs),event:(kind,detail)=>record?.log(kind,detail)});voice=input;
      await input.prepare();await input.connect(id);
      if(version!==prepareVersion){input.dispose();return;}
    }
  }catch(error){
    let message=error instanceof Error?error.message:'機器を準備できませんでした。マウス操作でも試せます。';
    if(error instanceof DOMException)message=error.name==='NotAllowedError'?'カメラまたはマイクの使用が許可されませんでした。ブラウザーの許可を確認するか、マウスで試してください。':error.name==='NotFoundError'?'カメラまたはマイクが見つかりません。接続を確認してください。':'機器を使用できませんでした。他のアプリで使っていないか確認してください。';
    if(version===prepareVersion)toReady(message);return;
  }
  if(version!==prepareVersion)return;
  if(!demo) {
    // 機器の準備が終わってから、手の位置と声の用意をする時間を置く。ここは24秒に含めない。
    countingDown=true;el('app').dataset.screen='countdown';
    show('welcome',false);show('result',false);show('hud',true);show('timer',false);show('bottom-hud',false);show('input-panel',false);show('recognized',false);show('demo-tag',false);
    show('meter',!!voice);show('voice-label',false);show('countdown',true);
    el('countdown-hint').textContent=mode==='camera'?'手を画面の前に出して、描き始める位置を決めよう':'マウスを、描き始めたい位置へ動かそう';
    el<HTMLInputElement>('chant').value='';
    diag?.log('準備の合図を開始',{seconds:COUNTDOWN_SECONDS});
    for(let remaining=COUNTDOWN_SECONDS;remaining>0;remaining--) {
      el('countdown-number').textContent=String(remaining);
      await new Promise(resolve=>setTimeout(resolve,1000));
      if(version!==prepareVersion)return;
    }
    countingDown=false;show('countdown',false);
  }
  session=new CastSession(undefined,id);diag?.rebase(session.startMs);diag?.log('24秒を開始');voice?.start(performance.now()-session.startMs);
  sound.start(!!voice);
  el('app').dataset.screen='playing';
  endedInput=false;requested=false;resultShown=false;preparing=false;feedback=null;serviceNotice='';lastHandAt=performance.now();lastCameraLatency=0;frameIntervals.length=0;
  show('welcome',false);show('result',false);show('hud',true);show('timer',true);show('bottom-hud',true);show('demo-tag',demo);show('recognized',false);
  show('input-panel',!voice&&!demo);show('meter',!!voice);show('voice-label',!!voice&&!demo);
  el('service-notice').textContent='';
  el<HTMLInputElement>('chant').value='';el<HTMLInputElement>('chant').disabled=false;healthBar.reset();
  document.querySelectorAll('[data-feedback]').forEach(button=>button.classList.remove('selected'));
  if(demo)session.speech.add({id:0,revision:1,startMs:11000,endMs:13500,text:'雷よ、七つに分かれろ',final:true,stability:1,source:'typed'});
  if(el<HTMLInputElement>('chant').value)addTypedChant();
  updateUi();
}

el('start').addEventListener('click',()=>void begin());el('demo').addEventListener('click',()=>void begin(true));
el('again').addEventListener('click',()=>{toReady();void begin();});el('back').addEventListener('click',()=>toReady());
el('cancel').addEventListener('click',()=>toReady('中止しました。もう一度、最初から始められます。'));
let pointerDown=false;
const pointer=(event:PointerEvent)=>{
  if(mode!=='pointer'||demo||!pointerDown)return;
  const rect=magic.canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  if(countingDown){cursors=[{x,y}];return;}
  if(!session?.accepting)return;
  session.motion.add(x,y,performance.now()-session.startMs);cursors=[{x,y}];diag?.pointer();
};
magic.canvas.addEventListener('pointerdown',event=>{pointerDown=true;magic.canvas.setPointerCapture(event.pointerId);pointer(event);});
magic.canvas.addEventListener('pointermove',pointer);
for(const name of ['pointerup','pointercancel','lostpointercapture'])magic.canvas.addEventListener(name,()=>{pointerDown=false;session?.motion.break(0);cursors=[];});
function addTypedChant(){if(session?.accepting)session.speech.add({id:10000,revision:Math.ceil(performance.now()*1000),startMs:0,endMs:Math.min(13999,performance.now()-session.startMs),text:el<HTMLInputElement>('chant').value,final:true,stability:1,source:'typed'});}
el('chant').addEventListener('input',()=>{diag?.log('文字を入力',{length:el<HTMLInputElement>('chant').value.length});addTypedChant();});

function updateUi() {
  if(!session)return;
  const t=session.elapsed/1000,phase=session.phase;
  el('timer').innerHTML=`<small>のこり</small><b>${Math.max(0,Math.ceil(24-t))}</b><small>秒</small>`;
  el('progress').style.width=`${Math.min(100,t/24*100)}%`;
  const labels:Partial<Record<Phase,[string,string]>>={
    draw:[mode==='pointer'?'押したまま、自由に描こう':'手を動かしてみよう','止まっても、また描き足せます'],
    build:['そのまま、描き足して','好きな言葉を、いつ唱え始めても大丈夫'],
    chant:[voice?'描きながら、詠唱せよ':'描きながら、言葉を添えて','声や文字がなくても、魔法は完成します'],
    complete:[t<16?'描いた線に、力が集まる':'あなたの魔法が、完成する','もう手を止めても大丈夫'],
    release:[session.recipe?.name??'魔法を解き放つ',session.recipe?.purpose==='defend'?'あなたの壁が、騎士の前へ広がる':session.recipe?.purpose==='bind'?'あなたの魔法が、騎士を囲む':session.recipe?.purpose==='enhance'?'描いた形から出た力が、騎士へ届く':'あなたの描いた形から、騎士へ放たれる'],
    handoff:['最初の魔法を、放った','描いた形は、この後も残ります'],
  };
  const label=labels[phase];if(label){el('instruction').textContent=label[0];el('hint').textContent=label[1];}
  if(t>=2&&t<6&&!summarizeMotion(session.motion.raw).hasMovement)el('hint').textContent=mode==='pointer'?'画面を押したまま、少し動かそう':'片手を少し動かそう';
  if(mode==='camera'&&t<14&&!cursors.length&&performance.now()-lastHandAt>800)el('hint').textContent='手を画面の前に戻そう。描いた線は消えません';
  const heard=voice?session.speech.latest():null;
  if(heard&&heard.source!=='typed'&&t<16)el('voice-label').textContent=`聞き取り：「${heard.text.slice(-40)}」${heard.final?'':'（途中）'}`;
  el('service-notice').textContent=serviceNotice;
  if(t>=16||(t>=14&&!heard))show('voice-label',false);
  el('step-input').classList.toggle('active',t<14);el('step-complete').classList.toggle('active',t>=14&&t<17);el('step-release').classList.toggle('active',t>=17);
  el<HTMLInputElement>('chant').disabled=t>=14;show('input-panel',!voice&&!demo&&t<14);
  if(session.locked&&session.recipe&&t>=16&&t<18.5){show('recognized',true);el('recognized').textContent=[ELEMENT_LABELS[session.recipe.element],session.recipe.count>1?`${session.recipe.count}つ`:PURPOSE_LABELS[session.recipe.purpose]].join('　・　');}
  else show('recognized',false);
  const level=voice?.level??0;
  el('meter').querySelectorAll<HTMLElement>('i').forEach((bar,i)=>{bar.style.height=`${3+level*23*(0.3+Math.abs(Math.sin(i*1.73+t*4))*0.7)}px`;});
}

function finish() {
  sound.stop();
  if(!session?.recipe)return;resultShown=true;voice?.dispose();voice=null;camera?.dispose();camera=null;cursors=[];
  show('bottom-hud',false);show('input-panel',false);show('meter',false);show('voice-label',false);show('result',true);show('feedback',!demo);
  const r=session.recipe;
  el('spell-name').textContent=r.name;el('spell-description').textContent=`${ELEMENT_LABELS[r.element]}の${PURPOSE_LABELS[r.purpose]}。${r.count>1?`${r.count}つの`:''}${FORM_LABELS[r.form]}のかたち。`;
  el('transcript').textContent=session.state?.speech.rawTranscript?`「${session.state.speech.rawTranscript}」${session.state.speech.status==='typed'?'（文字で入力）':session.speech.usedFallback?'（確定が間に合わず、途中の聞き取りを使用）':''}`:'詠唱はなく、描いた線だけで魔法をつくりました';
  diag?.log('結果を表示',{transcript:session.state?.speech.rawTranscript??'',usedFallback:session.speech.usedFallback});
  const credits=sound.snapshot.credits;el('credits').textContent=credits.join('　');show('credits',credits.length>0);
  el('app').dataset.screen='result';show('hud',false);show('timer',false);drawResult();
}

function drawResult(){if(session?.recipe)resultMagic.thumbnail(session.motion.display,colors[session.recipe.element],{width:magic.canvas.clientWidth,height:magic.canvas.clientHeight});}

function report() {
  const sorted=[...frameIntervals].sort((a,b)=>a-b);
  return {...session?.report(),mode:demo?'demo':mode,feedback,calmMode,audio:sound.snapshot,speechFallback:session?.speech.usedFallback??false,measurement:{averageFps:sorted.length?1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length):null,p99FrameMs:sorted[Math.floor(sorted.length*0.99)]??null,cameraProcessingMs:lastCameraLatency||null,note:'手を動かしてから表示されるまでの遅れは未計測。カメラ処理時間とは別。マウスの入力から描画までは diagnostics.drawing にある。'},
    diagnostics:diag?.summary()??null,recordedAt:new Date().toISOString(),userAgent:navigator.userAgent,screen:{width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio}};
}
/** サーバー側の記録（音声認識の処理時間など）も合わせて一つのJSONにする。 */
async function fullReport(base:ReturnType<typeof report>=report()) {
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),1500);
  const server=await fetch('/api/diagnostics',{signal:abort.signal}).then(r=>r.ok?r.json():null).catch(()=>null).finally(()=>clearTimeout(timer));
  return {...base,server:server??{note:'サーバー側の記録を取得できませんでした'}};
}
function saveJson(data:unknown,name:string) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.querySelectorAll<HTMLButtonElement>('[data-feedback]').forEach(button=>button.addEventListener('click',()=>{feedback=button.dataset.feedback??null;document.querySelectorAll('[data-feedback]').forEach(b=>b.classList.toggle('selected',b===button));}));
el('download').addEventListener('click',()=>void fullReport().then(data=>saveJson(data,`魔法の記録_${session?.id??'試作'}.json`)));
el('last-record').addEventListener('click',()=>{if(lastReport)void fullReport(lastReport).then(data=>saveJson(data,`魔法の記録_${String(lastReport?.sessionId??'中止')}.json`));});
let sheetReturnFocus:HTMLElement|null=null;
function sheet(title:string,body:string){sheetReturnFocus=document.activeElement as HTMLElement;el('sheet-title').textContent=title;el('sheet-body').replaceChildren();const pre=document.createElement('pre');pre.textContent=body;el('sheet-body').append(pre);show('sheet',true);el('sheet-close').focus({preventScroll:true});el('sheet-body').closest('.status-content')!.scrollTop=0;}
el('chant-words').addEventListener('click',()=>{
  const groups=[...new Set(chantDictionary.entries.map(w=>w.group))];
  sheet('詠唱の言葉',`好きな言葉を組み合わせて唱えられます。短い言葉でも大丈夫です。\n難しい言葉は聞き違えることがあります。声の代わりに文字でも試せます。\n\n試しに唱える例\n${chantDictionary.examples.join('\n\n')}\n\n${groups.map(group=>`${group}\n${chantDictionary.entries.filter(w=>w.group===group).map(w=>`${w.term}（${w.reading}）`).join('・')}`).join('\n\n')}\n\nほかの作品の言葉は、読み方の参考として載せています。`);
});
el('settings').addEventListener('click',async()=>{await readStatus();sheet('接続の確認',`Jev：${status.jev?'設定済み（通信はプレイ中に行います）':'未設定（このPCの中だけで魔法を決めます）'}\n音声認識：${status.speechProvider==='local'?status.localSpeech?.message??'このPCでの認識を準備してください':status.speechProvider==='google'?'Google Cloudで認識':'使わない設定'}\n${status.speechProvider==='local'?`認識モデル：Kotoba-Whisper v2.0 / このPCの${status.localSpeech?.device==='cpu'?'CPU（遅れることがあります）':'GPU'}\n`:''}手の認識：${status.handModel?'ファイルを準備済み':'npm run setup:assets で準備してください'}\n\nローカル音声認識の準備は npm run setup:speech です。GoogleのAPIキーや課金設定は不要です。変更後はアプリを起動し直します。\n\n${el('privacy').textContent}\n\n詳しくは README.md をご覧ください。これは最初の24秒の試作です。防御・最後の魔法・魔導書・QRは次の段階で追加します。`);});
el('record').addEventListener('click',()=>{
  // まず手元の記録をすぐ出し、サーバー側の記録が届いたら同じ画面を差し替える。
  const base=report();sheet('今回の確認用記録',JSON.stringify(base,null,2));
  void fullReport(base).then(data=>{const pre=el('sheet-body').querySelector('pre');if(pre&&!el('sheet').hidden&&el('sheet-title').textContent==='今回の確認用記録')pre.textContent=JSON.stringify(data,null,2);});
});
function closeSheet(){show('sheet',false);sheetReturnFocus?.focus();}
el('sheet-close').addEventListener('click',closeSheet);
el('sheet').addEventListener('click',event=>{if(event.target===el('sheet'))closeSheet();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!el('sheet').hidden)closeSheet();else if(session||preparing)toReady('中止しました');}if(event.key==='Tab'&&!el('sheet').hidden){event.preventDefault();el('sheet-close').focus();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(preparing||session&&!resultShown))toReady('画面が隠れたため中止しました。最初から始められます。');});
window.addEventListener('resize',()=>{stage.resize();magic.resize();if(resultShown)drawResult();});
window.addEventListener('pagehide',()=>{clearInterval(statusTimer);cleanup();});

function animate(now:number) {
  requestAnimationFrame(animate);
  if(session&&!resultShown){frameIntervals.push(now-lastFrame);if(frameIntervals.length>4000)frameIntervals.shift();diag?.frame(now-lastFrame);}
  lastFrame=now;
  if(session) {
    const current=session;current.tick();
    if(demo&&current.accepting) {
      const t=current.elapsed/1000;
      // 見本は見本と表示し、本人の入力を確かめる記録には数えません。
      if(!(t>4.2&&t<5.1)){const x=0.49+Math.sin(t*0.9)*0.18+Math.sin(t*1.8)*0.025,y=0.54+Math.cos(t*1.8)*0.17;current.motion.add(x,y,current.elapsed);cursors=[{x,y}];}
    }
    if(current.elapsed>=14000&&!endedInput){endedInput=true;voice?.stop(SPEECH_WAIT_MS);cursors=[];diag?.log('入力の受付を終了',{points:current.motion.raw.length});}
    // 声の最後の文字が届いたら、待たずにJevへ送る。届かないときだけ15.4秒まで待つ。
    if(!requested&&current.elapsed>=14100&&(!voice||voice.settled||current.elapsed>=SPEECH_LIMIT_MS)){
      requested=true;const state=current.freeze();voice?.disconnect();requestAbort=new AbortController();const abort=requestAbort;
      const record=diag;record?.log('入力を確定',{atMs:Math.round(current.elapsed),speechStatus:state.speech.status,transcript:state.speech.rawTranscript,usedFallback:current.speech.usedFallback,speechSettled:voice?.settled??null,corrections:current.corrections,jevConfigured:status.jev});
      const timeout=setTimeout(()=>abort.abort(),Math.max(0,REPLY_LIMIT_MS-current.elapsed));
      void fetch('/api/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state),signal:abort.signal})
        .then(r=>{if(!r.ok)throw new Error('接続失敗');return r.json();}).then(reply=>{const accepted=session===current&&current.receive(reply);record?.log('Jevの返事',{status:reply.status,model:reply.model??null,accepted,answers:reply.answers?Object.keys(reply.answers).length:0});})
        .catch(error=>{record?.log('Jevの返事なし',{reason:abort.signal.aborted?'15.9秒までに届かず打ち切り':error instanceof Error?error.message:'失敗'});/* 確定のときにPC内の規則を使用します。 */})
        .finally(()=>clearTimeout(timeout));
    }
    if(current.locked&&current.recipe&&!lockLogged){lockLogged=true;diag?.log('魔法を確定',{name:current.recipe.name,source:current.recipe.source,element:current.recipe.element,purpose:current.recipe.purpose,form:current.recipe.form,count:current.recipe.count});}
    if(current.elapsed>=24000&&!resultShown)finish();
    if(now-lastUi>80){updateUi();lastUi=now;}
  }
  const ms=session?Math.min(24000,session.elapsed):countingDown?0:now;
  if(session&&!resultShown)sound.update(ms,session.recipe,magic.preset);
  // 描いている間の言葉と動きを、確定前から演出へ渡す。
  const live=session&&!resultShown?liveInput(session.motion.raw,session.speech.live(),voice?.level??0):emptyLive;
  stage.render(session?.motion.display??[],ms,session?.recipe??null,voice?.level??0,cursors,!session&&!countingDown,live);
  // 閃光、ビネット、グレイン、暗転、背景の彩度はHTMLの層で出す。
  overlay.update(magic.screen,magic.preset.palettes[session?.recipe?.element??'neutral'],calmMode);
  if(session&&!resultShown)healthBar.update(ms,session.recipe);
}
requestAnimationFrame(animate);
void Promise.all([stage.ready,document.fonts.ready]).then(()=>show('loading',false)).catch(()=>{el('loading').textContent='背景と光を読み込めませんでした。再読み込みしてください。';});
