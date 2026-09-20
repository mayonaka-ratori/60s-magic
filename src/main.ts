import './style.css';
import { Battle } from './game/battle';
import type { CastSession } from './game/session';
import { BATTLE_END, ROUNDS, SPEECH_WAIT_MS, replyLimitOf, speechLimitOf, type Round } from './game/rounds';
import { GUARD_LABELS } from './game/guard';
import { ELEMENT_LABELS, PURPOSE_LABELS, FORM_LABELS, type Phase } from './game/types';
import { HandCamera } from './input/camera';
import { VoiceInput } from './input/voice';
import { CastScene } from './render/cast-scene';
import { MagicCanvas, colors } from './render/magic';
import { chantDictionary } from './game/chant-dictionary';
import { CastAudio } from './audio/cast-audio';
import { Diagnostics } from './game/diagnostics';
import { liveInput, emptyLive, wordless, type LiveInput } from './game/live-input';
import { resetLiveWords } from './game/live-words';
import { resetInputAmount, speechKey } from './game/input-amount';
import { ScreenOverlay } from './render/overlay';
import { GUARD_STEP_MS, HEALTH_HIDE_MS, HealthBar } from './render/health-bar';
import { DELIVERY_MESSAGES, PlayRecorder, nameParts, playOf, resultRows, type ResultRow } from './game/record';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <img id="world" src="/art/ruins-empty-v1.png" alt="石の柱と城が見える遺跡"><canvas id="knight" aria-label="剣と盾を持つ遺跡の騎士"></canvas><canvas id="spell" aria-hidden="true"></canvas><canvas id="magic" aria-label="手やマウスの動きで術式を描く場所"></canvas><canvas id="composite" aria-hidden="true"></canvas>
  <div class="vignette"></div>
  <header><div class="brand"><span class="sigil" aria-hidden="true"></span><div><div class="brand-name">はじまりの魔法</div><p class="eyebrow">描いて、唱えて、解き放つ</p></div></div><div class="top-right"><span class="trial dev-only">60秒・試作</span><div class="timer" id="timer" hidden><small>のこり</small><b>24</b><small>秒</small></div></div></header>
  <section class="welcome" id="welcome"><div class="chapter">第一幕 / 最初の魔法</div><h1><span>その手で描く</span><span>その言葉で放つ</span></h1><p class="intro">自由に描いた線が、ひとつの魔法になる。<br>手を動かしながら、好きな言葉を唱えよう。<br>二回目は、赤い印を囲めば盾になります</p>
    <fieldset class="mode-options"><legend>描き方を選ぶ</legend><label class="mode-option"><input type="radio" name="mode" value="camera"><strong>手で描く</strong><small>カメラに手を映す（片手でも大丈夫）</small></label><label class="mode-option"><input type="radio" name="mode" value="pointer" checked><strong>マウスで試す</strong><small>画面を押したまま動かす</small></label></fieldset>
    <label class="voice-option"><input type="checkbox" id="use-voice">マイクで唱える <span id="voice-availability"></span></label>
    <details class="sound-settings"><summary>音と演出の設定</summary><div class="sound-options"><label><input id="use-sound" type="checkbox" checked>効果音</label><label for="sound-volume">音量</label><input id="sound-volume" type="range" min="0" max="100" value="25" aria-label="効果音の音量"><output id="sound-volume-value">25%</output><button id="test-sound" type="button">音を試す</button></div></details>
    <button class="primary" id="start">魔法をつくる <span class="arrow" aria-hidden="true">↗</span></button><div class="welcome-actions"><button class="text-button" id="demo">見本の動きを見る</button><button class="text-button" id="chant-words">詠唱の言葉を見る</button><button class="text-button dev-only" id="settings">接続の確認</button><button class="text-button" id="last-record" hidden>前回の記録を保存する</button></div>
    <p class="dev-only"><a class="text-button" href="/?view=look">新しい背景・騎士・術式を見る ↗</a></p>
    <p class="notice" id="notice" role="status"></p><p class="privacy" id="privacy">カメラの映像はこのPC内で処理します。音声認識の設定を確認しています。</p>
  </section>
  <section class="hud" id="hud" hidden><div class="top-progress"><i id="progress"></i></div><div class="enemy-health">遺跡の騎士<i><b id="health"></b></i></div><button class="exit" id="cancel">中止する</button><div class="demo-tag" id="demo-tag" hidden>見本を再生中</div><div class="act-title" id="act-title" hidden aria-hidden="true"></div>
    <div class="countdown" id="countdown" hidden role="status"><p class="countdown-title">詠唱の準備を始めよ</p><div class="countdown-number" id="countdown-number">3</div><p class="countdown-hint" id="countdown-hint"></p></div>
    <div class="recognized" id="recognized" hidden></div><div class="voice-meter" id="meter" aria-hidden="true">${'<i></i>'.repeat(22)}</div><div class="voice-label" id="voice-label" hidden>声を受け付けています</div><p class="service-notice" id="service-notice" role="status"></p>
    <div class="input-panel" id="input-panel"><label for="chant">声の代わりに、文字で試す</label><input id="chant" type="text" maxlength="160" autocomplete="off" placeholder="例：雷よ、七つに分かれろ"><p>締め切りまで書き直せます<br>何も入れず、線だけでも遊べます</p></div>
    <div class="deadline" id="deadline" aria-hidden="true"></div><div class="reveal" id="reveal" hidden><span id="reveal-name"></span></div>
    <div class="bottom-hud" id="bottom-hud"><h2 class="instruction" id="instruction">手を動かしてみよう</h2><div class="hint" id="hint"></div><div class="steps"><span id="step-input" class="active"><b>1</b><em id="step-1-label">線を描く</em></span><i></i><span id="step-complete"><b>2</b><em id="step-2-label">形になる</em></span><i></i><span id="step-release"><b>3</b><em id="step-3-label">放つ</em></span></div></div>
  </section>
  <section class="result grimoire" id="result" hidden><div class="chapter">三つの魔法を放った</div>
    <div class="grimoire-main"><div class="spell-frame" id="spell-frame"></div>
      <div class="spell-side"><h2 id="spell-name"></h2><p class="spell-description" id="spell-description"></p><p class="transcript" id="transcript"></p>
        <div class="keepsake"><div class="qr-slot" id="qr-slot">持ち帰りの準備中</div><p class="confirm-code"><small>確認番号</small><b id="confirm-number">------</b></p><p class="save-state" id="save-state"></p></div>
      </div>
    </div>
    <ul class="spell-list" id="spell-list"></ul>
    <div class="grimoire-foot"><div class="result-actions"><button class="primary" id="again">もう一度つくる</button><button class="secondary" id="back">最初へ戻る</button></div><div class="feedback dev-only" id="feedback"><span>自分の魔法を放ったと感じましたか？</span><button data-feedback="yes">そう感じた</button><button data-feedback="unclear">まだ分かりにくい</button></div><div class="report-actions dev-only"><button class="text-button" id="record">確認用の記録を見る</button><button class="text-button" id="download">記録を保存する</button></div><p class="credits" id="credits" hidden></p></div>
  </section>
  <div class="status-sheet" id="sheet" hidden><section class="status-content" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="secondary" id="sheet-close">閉じる</button></div><div id="sheet-body"></div></section></div>
  <div class="loading" id="loading">魔法の準備をしています…</div>`;

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const params=new URLSearchParams(location.search);
// 会場で待ち時間を変えられるよう、秒数をURLでも指定できる。5秒から10分の間に収める。
const seconds=(name:string,fallback:number)=>{
  const value=Number(params.get(name));
  return Number.isFinite(value)&&value>0?Math.min(600,Math.max(5,value))*1000:fallback;
};
// 誰も触らない時間が続いたら見本を自動で流す。
const ATTRACT_AFTER_MS=seconds('attract',30000);
// 結果は次の人の開始操作まで残す。ただし誰も居なくなった場合に備え、長く待ったらタイトルへ戻す。
const RESULT_IDLE_MS=seconds('resultIdle',180000);
// 確認用の表示。遊ぶ人には出さず、?dev=1 を付けたときだけ出す。
const devView=params.has('dev');
if(devView)document.body.dataset.dev='1';
const show=(id:string,visible:boolean)=>{el(id).hidden=!visible;};
el('app').dataset.screen='ready';
// 見た目の設定は ?preset=calm|vivid|max で選べる。指定がなければ派手な設定。
const presetName=new URLSearchParams(location.search).get('preset');
const magic=new MagicCanvas(el<HTMLCanvasElement>('magic'),presetName);
// のこり秒の数字だけを書き換える。毎コマHTMLを作り直さない。
const timerValue=el('timer').querySelector('b')!;
// 控えめモード。?calm=1 と「動きを減らす」設定が一番強く、次に画面のボタン（前回の選択を覚えている）。
const CALM_KEY='calm-mode';
const calmForced=new URLSearchParams(location.search).get('calm')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const calmSaved=(()=>{try{return localStorage.getItem(CALM_KEY)==='1';}catch{return false;}})();
let calmMode=calmForced||calmSaved;
const overlay=new ScreenOverlay(el('app'),{world:el('world')});
const healthBar=new HealthBar(el('health'));
// 体力の枠（名前とバー）。とどめの一撃のあとに薄くして消すので、消したかどうかを覚えておく。
const healthWrapEl=document.querySelector<HTMLElement>('.enemy-health')!;
let healthGone=false;
function showHealthFrame(){healthGone=false;delete healthWrapEl.dataset.gone;}
const sound=new CastAudio();
const soundToggle=document.createElement('button');soundToggle.id='sound-toggle';soundToggle.className='sound-toggle';soundToggle.textContent='音を消す';el('hud').append(soundToggle);
// 演出を控えめにする切り替え。開始画面は音の設定の隣、プレイ中は「音を消す」の隣に置く。
const calmToggle=document.createElement('button');calmToggle.id='calm-toggle';calmToggle.className='calm-toggle';calmToggle.type='button';el('hud').append(calmToggle);
const calmOption=document.createElement('button');calmOption.id='calm-option';calmOption.className='calm-option';calmOption.type='button';document.querySelector('.sound-options')?.append(calmOption);
// 合成のシーンにも控えめモードを伝える。作られる前に呼ばれることがあるので、作れてから入れる。
let calmTarget:{setCalm(on:boolean):void}|null=null;
function setCalm(on:boolean,remember=true){
  // ?calm=1 と「動きを減らす」設定のときは、ボタンで派手にはできない。
  calmMode=calmForced||on;
  magic.setCalm(calmMode);
  calmTarget?.setCalm(calmMode);
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
try {stage=new CastScene(el<HTMLCanvasElement>('spell'),el<HTMLImageElement>('world'),magic,el<HTMLCanvasElement>('knight'),el<HTMLCanvasElement>('composite'));}catch {el('loading').textContent='光の表示を準備できませんでした。Chromeの画像処理の設定を確認してください。';throw new Error('WebGL初期化に失敗');}
calmTarget=stage;stage.setCalm(calmMode);
const resultCanvas=document.createElement('canvas');resultCanvas.id='result-spell';resultCanvas.setAttribute('aria-label','最後に描いた術式');el('spell-frame').append(resultCanvas);
const resultMagic=new MagicCanvas(resultCanvas);
// 結果の下の帯に並べる三件の絵。使い回すので、最初に一度だけ作る。線を描くだけなので控えめの設定でよい。
const ROW_LABELS=['一回目の術式','防御の盾の形','とどめの術式'];
const rowCanvases=ROW_LABELS.map(label=>{const canvas=document.createElement('canvas');canvas.className='spell-thumb';canvas.setAttribute('aria-label',label);return canvas;});
const rowMagic=rowCanvases.map(canvas=>new MagicCanvas(canvas,'calm'));
/** 今の結果画面に並べている三件。画面の大きさが変わったときに描き直すため覚えておく。 */
let shownRows:ResultRow[]=[];
let session:Battle|null=null,camera:HandCamera|null=null,voice:VoiceInput|null=null;
let cursors:Array<{x:number;y:number}>=[],lastHandAt=0,mode='pointer',demo=false,preparing=false;
let resultShown=false,lastUi=0,feedback:string|null=null,lastCameraLatency=0;
// 回ごとに一度だけ行うことの覚え書き。魔法名の表示と体力の揺れもここで数える。
const begun=new Set<string>(),ended=new Set<string>(),requested=new Set<string>(),lockLog=new Set<string>(),revealed=new Set<string>(),damaged=new Set<number>();
// 声をいま受け付けている回。回が変わるたびに接続し直す。
let voiceRound:Round['id']|null=null,voiceLost=false,lastRings=0,actShown='';
// 声をつなぎ直した回と、つなぎ終わってこれから録音できる回。
const voicePrepared=new Set<string>();let voiceReadyFor:Round['id']|null=null;
let requestAbort:AbortController|null=null;
let idleSince=performance.now(),attract=false,attractReturn:ReturnType<typeof setTimeout>|undefined;
let status:{jev:boolean;speech:boolean;handModel:boolean;model:string;speechProvider:'local'|'google'|'off';localSpeech:{state:string;message:string;model:string;device:string}|null}={jev:false,speech:false,handModel:false,model:'',speechProvider:'local',localSpeech:null};
let serviceNotice='',prepareVersion=0;
// 入力から描き終わるまでの手応えも測る。pendingInputAt は、まだ描画で受け止めていない入力の時刻。
const frameIntervals:number[]=[],inputLags:number[]=[];let lastFrame=performance.now(),pendingInputAt=0;
let diag:Diagnostics|null=null,lastReport:ReturnType<typeof report>|null=null;
// このPCの中への保存係。開始のときに作り、確認番号を先に決めておく。
let recorder:PlayRecorder|null=null,savedRounds=0;
/** 回が始まる何ミリ秒前に、声の受付をつなぎ直すか。 */
const VOICE_RECONNECT_MS=2500;
/** 24秒の前に置く準備の秒数。手や声の位置を決める時間で、24秒にも60秒にも含めない。 */
const COUNTDOWN_SECONDS=3;let countingDown=false;

async function readStatus(){try{status=await fetch('/api/status').then(r=>r.json());}catch{serviceNotice='接続を確認できません。このPCの中だけで魔法を決めます。';status.speech=false;}
  el('voice-availability').textContent=status.speech?(status.speechProvider==='local'?'（このPCで聞き取ります）':'（Googleで聞き取ります）'):status.localSpeech?.state==='loading'?'（準備中です）':'（いまは使えません）';
  el<HTMLInputElement>('use-voice').disabled=!status.speech;
  if(!status.speech)el<HTMLInputElement>('use-voice').checked=false;
  el('privacy').textContent=`${status.speechProvider==='google'?'カメラの映像はこのPCの中だけで扱います。声はGoogleへ送って文字に変えます。':'カメラの映像も声も、このPCの中だけで扱い、外へ送りません。'}${status.jev?'文字にした言葉と動きの形だけ、魔法を決める処理へ送ります。':''}記録は保存しません。`;}
void readStatus();
const statusTimer=setInterval(()=>{if(!session&&!preparing)void readStatus();},3000);

function markActive(){idleSince=performance.now();}
for(const name of ['pointerdown','pointermove','keydown','wheel'])window.addEventListener(name,markActive,{passive:true});
// 見本の再生中に誰かが触ったら、すぐ止めてタイトルへ戻す。
window.addEventListener('pointerdown',()=>{if(attract&&session&&demo)toReady();});

function cleanup(){sound.stop();camera?.dispose();camera=null;voice?.dispose();voice=null;requestAbort?.abort();requestAbort=null;cursors=[];pointerDown=false;
  begun.clear();ended.clear();requested.clear();lockLog.clear();revealed.clear();damaged.clear();voiceRound=null;voicePrepared.clear();voiceReadyFor=null;voiceLost=false;lastRings=0;actShown='';show('act-title',false);}
function toReady(message='') {
  el('app').dataset.screen='ready';attract=false;clearTimeout(attractReturn);markActive();
  if(session&&!resultShown){diag?.log('中止');lastReport=report();}
  prepareVersion++;session?.cancel();cleanup();session=null;preparing=false;countingDown=false;show('countdown',false);
  show('last-record',!!lastReport);
  show('welcome',true);show('hud',false);show('result',false);show('timer',false);show('sheet',false);show('reveal',false);
  revealed.clear();el('reveal').classList.remove('in');el('deadline').style.opacity='0';el('app').dataset.deadline='';el('result').classList.remove('name-only');
  showHealthFrame();
  el<HTMLButtonElement>('start').disabled=false;el<HTMLButtonElement>('demo').disabled=false;el('notice').textContent=message;
}
async function begin(isDemo=false) {
  if(preparing)return;preparing=true;markActive();clearTimeout(attractReturn);const version=++prepareVersion;
  void sound.prepare();
  cleanup();session=null;demo=isDemo;mode=(document.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value??'pointer');
  diag=new Diagnostics(performance.now());diag.log('準備を開始',{mode,voice:el<HTMLInputElement>('use-voice').checked,speechProvider:status.speechProvider,localSpeech:status.localSpeech});
  el<HTMLButtonElement>('start').disabled=true;el<HTMLButtonElement>('demo').disabled=true;el('notice').textContent='準備しています…';
  const id=crypto.randomUUID();
  try {
    if(mode==='camera'&&!demo) {
      if(!status.handModel)throw new Error(devView?'手の認識ファイルがありません。接続の確認から準備方法をご覧ください。':'いまは手で描けません。「マウスで試す」で遊べます。');
      const record=diag;
      const input=new HandCamera((hands,timestamp)=>{
        if(version!==prepareVersion)return;
        cursors=hands;if(hands.length){lastHandAt=timestamp;if(!pendingInputAt)pendingInputAt=performance.now();}
        if(session?.accepting)for(const hand of hands)session.active.motion.add(hand.x,hand.y,timestamp-session.startMs,hand.id);
      },message=>{serviceNotice=message;},{
        frame:(detectMs,latencyMs)=>{lastCameraLatency=latencyMs;record?.camera(detectMs,latencyMs);},
        event:(kind,detail)=>{record?.log(kind,detail);if(record&&typeof detail?.delegate==='string')record.cameraDelegate=detail.delegate;},
      });camera=input;await input.prepare();
      if(record)record.cameraDelegate=input.delegate;
      if(version!==prepareVersion){input.dispose();return;}
    }
    if(el<HTMLInputElement>('use-voice').checked&&!demo) {
      const record=diag;
      const input=new VoiceInput(entry=>{if(version!==prepareVersion)return;record?.transcript(entry);session?.active.speech.add(entry);},message=>{serviceNotice=message;record?.log('音声の知らせ',{message});},{audio:(bytes,startMs)=>record?.audio(bytes,startMs),event:(kind,detail)=>record?.log(kind,detail)});voice=input;
      await input.prepare();await input.connect(id,ROUNDS[0].inputEnd-ROUNDS[0].start);
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
    diag?.log('準備の合図を開始',{seconds:COUNTDOWN_SECONDS});
    for(let remaining=COUNTDOWN_SECONDS;remaining>0;remaining--) {
      el('countdown-number').textContent=String(remaining);
      await new Promise(resolve=>setTimeout(resolve,1000));
      if(version!==prepareVersion)return;
    }
    countingDown=false;show('countdown',false);
  }
  resetLiveWords();resetInputAmount();liveKey='';liveBase=emptyLive;
  session=new Battle(undefined,id);diag?.rebase(session.startMs);diag?.log('60秒を開始');
  // 確認番号を先に決める。保存済みの番号を読むので少し待つが、使うのは60秒後なので間に合う。
  recorder=null;savedRounds=0;
  {const battle=session;void PlayRecorder.open().then(made=>{if(session===battle){recorder=made;diag?.log('確認番号を用意',{code:made.code,storage:made.available?'このPCの中に保存する':'保存先を使えない'});}});}
  voice?.start(Math.max(0,performance.now()-session.startMs));if(voice)voiceRound='first';
  sound.start(!!voice);
  el('app').dataset.screen='playing';
  begun.clear();ended.clear();requested.clear();lockLog.clear();revealed.clear();damaged.clear();lastRings=0;actShown='';resultShown=false;preparing=false;feedback=null;serviceNotice='';lastHandAt=performance.now();lastCameraLatency=0;frameIntervals.length=0;
  inputLags.length=0;pendingInputAt=0;
  el('reveal').classList.remove('in');show('reveal',false);el('deadline').style.opacity='0';el('app').dataset.deadline='';
  healthWrapEl.classList.remove('hit');delete healthWrapEl.dataset.hit;showHealthFrame();
  show('welcome',false);show('result',false);show('hud',true);show('timer',true);show('bottom-hud',true);show('demo-tag',demo);show('recognized',false);
  show('input-panel',!voice&&!demo);show('meter',!!voice);show('voice-label',!!voice&&!demo);
  el('service-notice').textContent='';
  el<HTMLInputElement>('chant').value='';el<HTMLInputElement>('chant').disabled=false;healthBar.reset();
  document.querySelectorAll('[data-feedback]').forEach(button=>button.classList.remove('selected'));
  if(demo) {
    session.first.speech.add({id:0,revision:1,startMs:11000,endMs:13500,text:'雷よ、七つに分かれろ',final:true,stability:1,source:'typed'});
    session.defend.speech.add({id:0,revision:1,startMs:4000,endMs:6500,text:'氷よ、壁となれ、弾き返せ',final:true,stability:1,source:'typed'});
    session.finish.speech.add({id:0,revision:1,startMs:4000,endMs:8500,text:'光よ、集まれ、貫け',final:true,stability:1,source:'typed'});
  }
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
  session.active.motion.add(x,y,performance.now()-session.startMs);cursors=[{x,y}];diag?.pointer();
  if(!pendingInputAt)pendingInputAt=event.timeStamp||performance.now();
};
magic.canvas.addEventListener('pointerdown',event=>{pointerDown=true;magic.canvas.setPointerCapture(event.pointerId);pointer(event);});
magic.canvas.addEventListener('pointermove',pointer);
for(const name of ['pointerup','pointercancel','lostpointercapture'])magic.canvas.addEventListener(name,()=>{pointerDown=false;session?.active.motion.break(0);cursors=[];});
function addTypedChant() {
  const cast=session?.active;if(!cast?.accepting)return;
  // 声の時刻は回ごとに0から数える。回の長さを超えない位置に置く。
  const local=Math.min(cast.round.inputEnd-cast.round.start-1,Math.max(0,session!.elapsed-cast.round.start));
  cast.speech.add({id:10000,revision:Math.ceil(performance.now()*1000),startMs:0,endMs:local,text:el<HTMLInputElement>('chant').value,final:true,stability:1,source:'typed'});
}
el('chant').addEventListener('input',()=>{diag?.log('文字を入力',{length:el<HTMLInputElement>('chant').value.length});addTypedChant();});

/** 回の始まりに出す幕の名前。一回目は出さない。 */
const ACT_NAMES:Record<string,string>={defend:'防御',finish:'とどめ'};

/** 回ごとの、画面下の文と三段の見出し。 */
const ROUND_STEPS:Record<string,[string,string,string]>={first:['線を描く','形になる','放つ'],defend:['印を囲む','盾になる','受け止める'],finish:['弱点へ描く','形になる','とどめ']};

function updateUi() {
  // 結果を出したあとは触らない。下の案内や残り時間を出し直してしまうため。
  if(!session||resultShown)return;
  const battle=session,cast=battle.active,round=cast.round,recipe=cast.recipe;
  const t=battle.elapsed/1000,phase=battle.phase,limit=BATTLE_END/1000;
  // のこり秒は、その回で描いて唱えられる時刻までを数える。過ぎたら消して、画面を魔法に渡す。
  const toDeadline=round.inputEnd/1000-t,left=Math.max(0,Math.ceil(toDeadline));
  if(timerValue.textContent!==String(left))timerValue.textContent=String(left);
  show('timer',toDeadline>0);
  const urgency=toDeadline>0&&toDeadline<=5?1-toDeadline/5:0;
  el('timer').dataset.left=toDeadline<=0?'':toDeadline<=2.5?'urgent':toDeadline<=5?'soon':'';
  el('app').dataset.deadline=el('timer').dataset.left;
  // 残り3秒からは、秒が変わるたびに一度だけ強く光らせる。光りっぱなしにはしない。
  const pulse=toDeadline<=3?.74+.26*(1-(toDeadline-Math.floor(toDeadline))):.7;
  el('deadline').style.opacity=String(urgency?urgency*pulse:0);
  if(urgency)el('deadline').style.setProperty('--ring',`${64-urgency*18}%`);
  el('progress').style.width=`${Math.min(100,t/limit*100)}%`;
  const rings=lastRings,guard=battle.defend.guard;
  const first:Partial<Record<Phase,[string,string]>>={
    draw:[mode==='pointer'?'押したまま、自由に描こう':'手を動かしてみよう','止まっても、また描き足せます'],
    build:['そのまま、描き足して','好きな言葉を、いつ唱え始めても大丈夫'],
    chant:[voice?'描きながら、詠唱せよ':'描きながら、言葉を添えて','声や文字がなくても、魔法は完成します'],
    complete:[t<round.lock/1000?'描いた線に、力が集まる':'あなたの魔法が、完成する','もう手を止めても大丈夫'],
    release:[recipe?.name??'魔法を解き放つ',recipe?.purpose==='defend'?'あなたの壁が、騎士の前へ広がる':recipe?.purpose==='bind'?'あなたの魔法が、騎士を囲む':recipe?.purpose==='enhance'?'描いた形から出た力が、騎士へ届く':'あなたの描いた形から、騎士へ放たれる'],
    handoff:['騎士が、剣を構えた','赤い印のところへ、一撃が来ます'],
  };
  const defend:Partial<Record<Phase,[string,string]>>={
    draw:['赤い印を囲って、守る形を描け',rings?`囲えた。${rings>1?`${rings}重の盾になります`:'そのまま唱えてもいい'}`:'囲えなくても大丈夫。一番近い線が印の前へ動きます'],
    chant:[voice?'描きながら、詠唱せよ':'描きながら、言葉を添えて','「氷よ」で色が、「弾き返せ」「かき消せ」で止め方が変わります'],
    complete:[t<round.lock/1000?'描いた線が、盾になる':'あなたの盾が、印の前に立つ',guard?.shield.moved?'描いた線を、印の前へ運びました':'囲った線が、そのまま盾の縁になります'],
    release:[t<round.impact/1000?'騎士の一撃が来る':GUARD_LABELS[guard?.style??'block'],'あなたの魔法が、一撃を受け止めます'],
    handoff:['騎士の胸が開いた','弱点が現れました。ここまでが今回の試作です'],
  };
  const lastRound:Partial<Record<Phase,[string,string]>>={
    draw:['弱点へ、最後の術式を描け','前の二回の光が、あなたの手元へ集まります'],
    chant:['全力で詠唱せよ','言葉を重ねるほど、最後の魔法が大きくなります'],
    complete:['最後の魔法が満ちていく','もう手を止めても大丈夫'],
    release:['放て','あなたの一番大きい魔法が、騎士の核へ届きます'],
    handoff:['',''],
  };
  const label=(round.id==='finish'?lastRound:round.id==='defend'?defend:first)[phase];
  if(label){el('instruction').textContent=label[0];el('hint').textContent=label[1];}
  const drawing=t<round.inputEnd/1000;
  // 描き始めの4秒で線が動いていなければ、描き方をもう一度伝える。
  if(t>=round.start/1000+2&&t<round.start/1000+6&&drawing&&!cast.motion.hasMovement)el('hint').textContent=mode==='pointer'?'画面を押したまま、少し動かそう':'片手を少し動かそう';
  // まだ何も唱えていない人には、唱える時間になったところで例をひとつ出す。
  if(phase==='chant'&&!cast.speech.snapshot().length)el('hint').textContent=round.id==='defend'?'たとえば「氷よ、弾き返せ」':'たとえば「雷よ、七つに分かれろ」';
  // 手が見つからないことは、描けていない状態そのものなので一番強く出す。
  if(mode==='camera'&&drawing&&!cursors.length&&performance.now()-lastHandAt>800)el('hint').textContent='手を画面の前に戻そう。描いた線は消えません';
  // 幕の表示。回の切り替わりで0.8秒だけ大きく出す。
  const actName=ACT_NAMES[round.id]??'';
  const act=actName&&t>=round.start/1000&&t<round.start/1000+.8?`第${'一二三'[round.index-1]}幕　${actName}`:'';
  if(act!==actShown){actShown=act;el('act-title').textContent=act;show('act-title',!!act);}
  const steps=ROUND_STEPS[round.id];
  for(let i=0;i<3;i++)el(`step-${i+1}-label`).textContent=steps[i];
  const heard=voice?cast.speech.latest():null;
  if(heard&&heard.source!=='typed'&&t<round.lock/1000)el('voice-label').textContent=`聞き取り：「${heard.text.slice(-40)}」${heard.final?'':'（途中）'}`;
  el('service-notice').textContent=serviceNotice;
  show('voice-label',!!voice&&!demo&&voiceRound===round.id&&t<round.lock/1000&&(!!heard||drawing));
  el('step-input').classList.toggle('active',drawing);
  el('step-complete').classList.toggle('active',!drawing&&t<round.release/1000);
  el('step-release').classList.toggle('active',t>=round.release/1000);
  // 声を使えない回（マイクなし、またはつなぎ直せなかったとき）は、文字で入れられるようにする。
  const typing=(!voice||voiceLost)&&!demo;
  el<HTMLInputElement>('chant').disabled=!drawing;show('input-panel',typing&&drawing);
  show('meter',!!voice&&!voiceLost);
  // 当たった瞬間だけ体力バーを揺らす。減る量と速さは HealthBar が受け持つ。
  // とどめは一発目（53.6秒）と直撃（54.5秒）の2回だけで、間の3回ではゆらさない。
  for(const at of [ROUNDS[0].impact,GUARD_STEP_MS,ROUNDS[2].impact,ROUNDS[2].finalBlow!]) {
    if(battle.elapsed<at||damaged.has(at))continue;
    damaged.add(at);
    healthWrapEl.classList.add('hit');healthWrapEl.dataset.hit='1';
    setTimeout(()=>healthWrapEl.classList.remove('hit'),700);
  }
  showReveal(t,round,recipe);
  if(cast.locked&&recipe&&t>=round.lock/1000&&t<round.release/1000){show('recognized',true);el('recognized').textContent=[ELEMENT_LABELS[recipe.element],recipe.count>1?`${recipe.count}つ`:PURPOSE_LABELS[recipe.purpose]].join('　・　');}
  else show('recognized',false);
  const level=voice?.level??0;
  el('meter').querySelectorAll<HTMLElement>('i').forEach((bar,i)=>{bar.style.height=`${3+level*23*(0.3+Math.abs(Math.sin(i*1.73+t*4))*0.7)}px`;});
}

/**
 * 発動で下の案内を閉じ、魔法名を画面の中央へゆっくり出す。回の終わりの1.5秒前に引く。
 * 時刻はその回のものを使うので、防御の回でも同じ見せ方になる。
 * とどめの回だけは、出す時刻を余韻の始まりへ遅らせ、下の案内も戻さない。
 */
function showReveal(t:number,round:Round,recipe:{name:string}|null) {
  const name=recipe?.name,release=round.release/1000;
  // とどめの回だけ、魔法名を余韻の始まり（57秒）に出して58.5秒で引く。
  // 発動の直後に出すと、視界を通り抜ける術式や輪をくぐる魔法に文字が重なるため。
  const lastRound=round.id==='finish';
  const from=lastRound?round.handoff/1000:release+.6;
  const out=lastRound?round.handoff/1000+1.5:round.end/1000-1.5;
  const gone=lastRound?out+.3:round.end/1000-.8;
  // 発動から余韻の間は下の案内を閉じる。次の回へ渡す間（23秒から）はまた出して、騎士の構えを知らせる。
  // とどめの回は次へ渡すものがないので、閉じたまま戻さない。
  show('bottom-hud',t<release||(!lastRound&&t>=round.handoff/1000));
  if(t>=from&&t<gone&&name) {
    if(!revealed.has(round.id)){revealed.add(round.id);el('reveal-name').textContent=name;show('reveal',true);
      requestAnimationFrame(()=>requestAnimationFrame(()=>el('reveal').classList.add('in')));}
    if(t>=out)el('reveal').classList.remove('in');
  } else if(revealed.has(round.id)&&t>=gone){show('reveal',false);}
}

/** 回ごとの締め切り、Jevへの送信、確定の記録。回の数だけ同じことをする。 */
function driveRound(battle:Battle,cast:CastSession) {
  const round=cast.round,ms=battle.elapsed;
  if(ms<round.start)return;
  if(!begun.has(round.id)) {
    begun.add(round.id);
    // 回が変わったら、前の回に書いた言葉も、前の回の聞き取りの文も残さない。
    if(round.index>1)el<HTMLInputElement>('chant').value='';
    el('voice-label').textContent='声を受け付けています';
  }
  if(ms>=round.inputEnd&&!ended.has(round.id)) {
    ended.add(round.id);
    if(voiceRound===round.id)voice?.stop(SPEECH_WAIT_MS);
    cursors=[];diag?.log('入力の受付を終了',{round:round.id,points:cast.motion.raw.length});
  }
  // 声の最後の文字が届いたら、待たずにJevへ送る。届かないときだけ決めた時刻まで待つ。
  if(!requested.has(round.id)&&ms>=round.inputEnd+100&&(voiceRound!==round.id||voice?.settled||ms>=speechLimitOf(round))) {
    requested.add(round.id);const state=cast.freeze();
    if(voiceRound===round.id){voice?.disconnect();voiceRound=null;}
    const abort=new AbortController();requestAbort=abort;
    const record=diag;
    record?.log('入力を確定',{round:round.id,atMs:Math.round(ms),speechStatus:state.speech.status,transcript:state.speech.rawTranscript,usedFallback:cast.speech.usedFallback,speechSettled:voice?.settled??null,corrections:cast.corrections,jevConfigured:status.jev,guard:cast.guard?{style:cast.guard.style,enclosed:cast.guard.shield.enclosed,rings:cast.guard.shield.rings,kind:cast.guard.shield.kind,layers:cast.guard.shield.layers}:null});
    const timeout=setTimeout(()=>abort.abort(),Math.max(0,replyLimitOf(round)-ms));
    void fetch('/api/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state),signal:abort.signal})
      .then(r=>{if(!r.ok)throw new Error('接続失敗');return r.json();}).then(reply=>{const accepted=session===battle&&cast.receive(reply);record?.log('Jevの返事',{round:round.id,status:reply.status,model:reply.model??null,accepted,answers:reply.answers?Object.keys(reply.answers).length:0});})
      .catch(error=>{record?.log('Jevの返事なし',{round:round.id,reason:abort.signal.aborted?'確定の手前で打ち切り':error instanceof Error?error.message:'失敗'});/* 確定のときにPC内の規則を使用します。 */})
      .finally(()=>clearTimeout(timeout));
  }
  if(cast.locked&&cast.recipe&&!lockLog.has(round.id)) {
    lockLog.add(round.id);
    diag?.log('魔法を確定',{round:round.id,name:cast.recipe.name,source:cast.recipe.source,element:cast.recipe.element,purpose:cast.recipe.purpose,form:cast.recipe.form,count:cast.recipe.count});
  }
}

/**
 * 二回目からの回のために、声の受付を作り直す。前の回の接続は確定のときに閉じている。
 * つなぐのは回の始まりより前（防御は21.5秒、とどめは37.5秒）だが、録音を始めるのは回が始まってから。
 * 声の時刻は回ごとに0から数えるので、早く始めるとその分だけ時刻がずれ、受付の長さをはみ出して捨てられる。
 */
function prepareRoundVoice(battle:Battle,round:Round) {
  if(voice&&!demo&&!voicePrepared.has(round.id)&&voiceRound===null) {
    voicePrepared.add(round.id);
    const input=voice;
    void input.connect(`${battle.id}-${round.id}`,round.inputEnd-round.start)
      .then(()=>{if(session===battle&&voice===input)voiceReadyFor=round.id;})
      .catch(()=>{if(session===battle){voiceLost=true;serviceNotice='声の受付を再開できませんでした。文字で入れるか、描いた線で続けられます。';diag?.log('声を受付できず',{round:round.id});}});
  }
  // つながっていて回が始まっていれば、そこから録音する。遅れてつながったときは、その遅れを offset で渡す。
  if(voice&&voiceReadyFor===round.id&&voiceRound===null&&battle.elapsed>=round.start&&battle.elapsed<round.inputEnd) {
    voice.start(battle.elapsed-round.start);voiceRound=round.id;voiceReadyFor=null;
    diag?.log('声を受付',{round:round.id,atMs:Math.round(battle.elapsed)});
  }
}

/** 見本の動き。一回目は自由な線、防御ととどめは印を囲む輪。本人の記録には数えない。 */
function demoInput(battle:Battle) {
  if(!battle.accepting)return;
  const t=battle.elapsed/1000;
  if(battle.round.id==='first') {
    if(t>4.2&&t<5.1)return;
    const x=0.49+Math.sin(t*0.9)*0.18+Math.sin(t*1.8)*0.025,y=0.54+Math.cos(t*1.8)*0.17;
    battle.active.motion.add(x,y,battle.elapsed);cursors=[{x,y}];
    return;
  }
  // 回ごとに、始まりの0.2秒後から輪を描き始める。
  const a=(t-battle.round.start/1000-.2)/6*Math.PI*2*1.15;
  if(a<0)return;
  const x=battle.aim.x+Math.cos(a)*.17,y=battle.aim.y+Math.sin(a)*.2;
  battle.active.motion.add(x,y,battle.elapsed);cursors=[{x,y}];
}

/** 魔法名にふりがなを振った中身を作る。読みが引けない語にはふりがなを付けない。 */
function rubyName(name:string) {
  const box=document.createDocumentFragment();
  for(const part of nameParts(name)) {
    if(!part.reading){box.append(part.text);continue;}
    const ruby=document.createElement('ruby');ruby.append(part.text);
    const reading=document.createElement('rt');reading.textContent=part.reading;ruby.append(reading);
    box.append(ruby);
  }
  return box;
}

/** 結果画面の下の帯。三件それぞれに、術式の小さい絵と三行の文字を並べる。 */
function fillSpellList(rows:ResultRow[]) {
  const list=el('spell-list');list.replaceChildren();
  rows.forEach((row,index)=>{
    const item=document.createElement('li');
    if(row.main)item.dataset.main='true';
    item.append(rowCanvases[index]);
    const text=document.createElement('div');text.className='row-text';
    const title=document.createElement('b');title.textContent=row.title;
    const name=document.createElement('span');name.append(rubyName(row.name));
    const note=document.createElement('small');note.textContent=row.note;
    text.append(title,name,note);item.append(text);list.append(item);
  });
}

function finish() {
  const battle=session;if(!battle)return;
  const last=battle.finish.recipe?battle.finish:battle.defend.recipe?battle.defend:battle.first;
  const main=last.recipe;if(!main)return;
  resultShown=true;sound.stop();voice?.dispose();voice=null;camera?.dispose();camera=null;cursors=[];
  show('bottom-hud',false);show('input-panel',false);show('meter',false);show('voice-label',false);show('act-title',false);show('reveal',false);
  // はじめの0.9秒は魔法名だけを見せ、そのあとに残りを出す。
  el('result').classList.add('name-only');show('result',true);show('feedback',!demo);
  setTimeout(()=>el('result').classList.remove('name-only'),900);
  el('spell-name').replaceChildren(rubyName(main.name));
  // 属性と用途の札。Jevの確信度、開発用の評価値、内部の番号は出さない。
  const tags=[ELEMENT_LABELS[main.element],PURPOSE_LABELS[main.purpose],`${main.count>1?`${main.count}つの`:''}${FORM_LABELS[main.form]}`];
  el('spell-description').replaceChildren(...tags.map(label=>{const chip=document.createElement('i');chip.textContent=label;return chip;}));
  const spoken=last.state?.speech.rawTranscript||battle.defend.state?.speech.rawTranscript||battle.first.state?.speech.rawTranscript||'';
  el('transcript').textContent=spoken?`「${spoken}」${last.state?.speech.status==='typed'?'（文字で入力）':last.speech.usedFallback?'（確定が間に合わず、途中の聞き取りを使用）':''}`:'詠唱はなく、描いた線だけで魔法をつくりました';
  // 並べる三件は、保存する形（記録）から作る。画面に出るものと保存したものを同じにするため。
  shownRows=resultRows(playOf(battle,recorder?.code??'',recorder?.startedAt??new Date().toISOString()));
  fillSpellList(shownRows);
  // 持ち帰りの場所。公開ページがまだ無いので、嘘のQRは出さず、確認番号と一行だけを出す。
  el('confirm-number').textContent=recorder?.code??'------';
  el('save-state').textContent=recorder?recorder.message:DELIVERY_MESSAGES['local-only'];
  diag?.log('結果を表示',{transcript:spoken,usedFallback:last.speech.usedFallback,code:recorder?.code??null,stored:recorder?.stored??false});
  const credits=sound.snapshot.credits;el('credits').textContent=credits.join('　');show('credits',credits.length>0);
  el('app').dataset.screen='result';show('hud',false);show('timer',false);drawResult();
  // 結果が出た時点から数え直す。ここから誰も触らなければ、いずれタイトルへ戻る。
  markActive();
  // 自動で流した見本は、余韻を見せてからタイトルへ戻す。本人が遊んだ結果は消さない。
  if(attract){clearTimeout(attractReturn);attractReturn=setTimeout(()=>{if(attract)toReady();},8000);}
}

function drawResult() {
  const battle=session;if(!battle)return;
  // 縮小の絵は、遊んでいるときの画面の縦横に合わせてから枠に収める。
  const source={width:magic.canvas.clientWidth,height:magic.canvas.clientHeight};
  const last=battle.finish.recipe?battle.finish:battle.defend.recipe?battle.defend:battle.first;
  if(last.recipe)resultMagic.thumbnail(last.motion.display,colors[last.recipe.element],source);
  shownRows.forEach((row,index)=>{
    if(row.points.length>1&&row.element)rowMagic[index].thumbnail(row.points,colors[row.element],source);
  });
}

function report() {
  const sorted=[...frameIntervals].sort((a,b)=>a-b),lags=[...inputLags].sort((a,b)=>a-b);
  const at=(list:number[],ratio:number)=>list.length?list[Math.min(list.length-1,Math.floor(list.length*ratio))]:null;
  return {...session?.report(),mode:demo?'demo':mode,feedback,calmMode,audio:sound.snapshot,composite:stage.composite?stage.composite.report:{used:false,reason:new URLSearchParams(location.search).get('composite')==='0'?'?composite=0 で切っている':'WebGLを用意できず、HTMLの層のまま'},speechFallback:session?session.casts.some(cast=>cast.speech.usedFallback):false,measurement:{averageFps:sorted.length?1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length):null,p99FrameMs:at(sorted,0.99),cameraProcessingMs:lastCameraLatency||null,
    inputToDrawMs:{median:at(lags,0.5),p95:at(lags,0.95),samples:lags.length},
    note:'inputToDrawMsは、入力を受け取った時刻から、その入力を含む描画を終えるまでの時間。0.1秒以内を目安にする。カメラ処理時間とは別。'},
    // 確認番号は、あとから記録どうしを突き合わせるために入れる。個人を指す値は入れない。
    confirmCode:recorder?.code??null,storedLocally:recorder?.stored??false,storeAvailable:recorder?.available??false,
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
el('settings').addEventListener('click',async()=>{await readStatus();sheet('接続の確認',`Jev：${status.jev?'設定済み（通信はプレイ中に行います）':'未設定（このPCの中だけで魔法を決めます）'}\n音声認識：${status.speechProvider==='local'?status.localSpeech?.message??'このPCでの認識を準備してください':status.speechProvider==='google'?'Google Cloudで認識':'使わない設定'}\n${status.speechProvider==='local'?`認識モデル：Kotoba-Whisper v2.0 / このPCの${status.localSpeech?.device==='cpu'?'CPU（遅れることがあります）':'GPU'}\n`:''}手の認識：${status.handModel?'ファイルを準備済み':'npm run setup:assets で準備してください'}\n\nローカル音声認識の準備は npm run setup:speech です。GoogleのAPIキーや課金設定は不要です。変更後はアプリを起動し直します。\n\n${el('privacy').textContent}\n\n詳しくは README.md をご覧ください。これは60秒の試作です。三つの魔法まで遊べます。魔導書とQRは作っている途中です。`);});
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

/** 前のコマで計算した、いまの入力。発話と点の数が同じなら作り直さない。 */
let liveKey='',liveBase:LiveInput=emptyLive;
function animate(now:number) {
  requestAnimationFrame(animate);
  if(!preparing&&el('sheet').hidden&&el('loading').hidden) {
    const screen=el('app').dataset.screen,idle=now-idleSince;
    if(screen==='ready'&&idle>ATTRACT_AFTER_MS){attract=true;markActive();void begin(true);}
    else if(screen==='result'&&idle>RESULT_IDLE_MS)toReady();
  }
  if(session&&!resultShown){frameIntervals.push(now-lastFrame);if(frameIntervals.length>4000)frameIntervals.shift();diag?.frame(now-lastFrame);}
  lastFrame=now;
  if(session) {
    const battle=session;battle.tick();
    if(demo)demoInput(battle);
    for(const cast of battle.casts)driveRound(battle,cast);
    // 魔法が確定するたび（16、33、51秒）に、このPCの中へ保存し直す。増えたときだけ書く。
    const locked=battle.casts.filter(cast=>cast.locked&&cast.recipe).length;
    if(recorder&&locked>savedRounds){savedRounds=locked;void recorder.save(battle);}
    // 二回目からの回は、その少し前に声の受付を作り直す。
    for(const round of ROUNDS.slice(1))
      if(battle.elapsed>=round.start-VOICE_RECONNECT_MS&&battle.elapsed<round.inputEnd)prepareRoundVoice(battle,round);
    if(battle.elapsed>=BATTLE_END&&!resultShown)finish();
    if(now-lastUi>80){updateUi();lastUi=now;}
  }
  const ms=session?Math.min(BATTLE_END,session.elapsed):countingDown?0:now;
  const cast=session&&!resultShown?session.active:null;
  // 描いている間の言葉と動きを、確定前から演出へ渡す。防御の回だけ、印を囲めているかも数える。
  // 言葉の読み直しは重いので、発話と点の数が変わった時だけ計算し、それ以外は前の結果を使う。
  let live=emptyLive;
  if(cast) {
    const defending=cast.round.id==='defend';
    const entries=cast.speech.live(),key=`${cast.round.id}:${cast.motion.raw.length}:${speechKey(entries)}`;
    // 声の時刻は回ごとに0から数えるので、回の始まりを足して戦いの時刻へそろえる。
    if(key!==liveKey){liveKey=key;liveBase=liveInput(cast.motion.raw,entries,0,defending&&cast.accepting?session!.aim:null,cast.speechOffset);}
    // 発動より後は言葉を使わないので空にする。入力の量はそのまま残す。声の大きさは毎コマ入れ直す。
    const base=ms>=cast.round.release?wordless(liveBase):liveBase;
    live={...base,voice:voice?.level??0};
  }
  // 囲えた瞬間に音で返す。数が増えるたびに一度だけ鳴らす。
  if(live.rings!==lastRings){if(live.rings>lastRings)sound.ring(live.rings);lastRings=live.rings;}
  if(cast)sound.update(ms,cast.recipe??session!.first.recipe,magic.preset,live.amount);
  stage.render(cast?.motion.display??[],ms,cast?.recipe??null,voice?.level??0,cursors,!session&&!countingDown,live,session?.defend.guard??null,session?.inherited??[]);
  // 閃光、ビネット、グレイン、暗転、背景の彩度はHTMLの層で出す。
  overlay.update(magic.screen,magic.preset.palettes[cast?.recipe?.element??'neutral'],calmMode);
  // 体力も世界の時計で減らす。命中で止めている間は先へ進まない（stage.render の後に読む）。
  if(cast)healthBar.update(stage.effectMs,session!.first.recipe);
  // とどめの一撃の0.9秒後から、体力の枠を名前ごと薄くして消す。消したら戻さない。
  if(cast&&!healthGone&&stage.effectMs>=HEALTH_HIDE_MS){healthGone=true;healthWrapEl.dataset.gone='1';}
  // 受け取った入力を描き終えた時刻との差を、手応えの記録に足す。
  if(pendingInputAt){inputLags.push(performance.now()-pendingInputAt);if(inputLags.length>3000)inputLags.shift();pendingInputAt=0;}
}
requestAnimationFrame(animate);
void Promise.all([stage.ready,document.fonts.ready]).then(()=>show('loading',false)).catch(()=>{el('loading').textContent='背景と光を読み込めませんでした。再読み込みしてください。';});
