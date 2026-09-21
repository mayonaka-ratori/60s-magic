import { BATTLE_END, ENEMY_MOVES, ENEMY_SLAM_MS, FINISH_COLLAPSE_MS, FINISH_FALL_FROM_MS, FINISH_SWORD_DROP_MS, ROUNDS, beatOf, type Round } from '../game/rounds';
import { HIT_STOPS, warpOf, warpReal } from '../render/effects/screen';

/**
 * 音の合図の名前。自分の魔法の音のほかに、敵（騎士）の側の音を持つ。
 * step：足を踏み替える。clang：盾を打ち鳴らす。swing：剣を振り下ろす風切り。slam：振り下ろした剣が床を打つ。
 */
export type SoundCue='trace'|'chant'|'build'|'complete'|'release'|'impact'|'finish'|'collapse-sword'|'collapse-knee'|'collapse-fall'|'settle'|'book'|'block'|'ring'
  |'step'|'clang'|'swing'|'slam';
/** 敵の側の音。素材の表で受け付ける名前の確認や、鳴らし方の分岐に使う。 */
export const ENEMY_CUES:ReadonlyArray<SoundCue>=['step','clang','swing','slam'];
export type Cue={name:SoundCue;at:number;quietUntil:number;round:Round['id']};

/** 録音を止めてから効果音を鳴らし始めるまでの余裕（ms）。 */
const QUIET_TAIL=750;

/**
 * 崩れ落ちる音。剣が落ちる、膝をつく、倒れる。時刻は回の表から作る世界の時刻（ms）で、
 * 騎士の動きと同じ値を見る。音は実際の時計で鳴らすので、世界の時計のゆがみで実際の時刻へ直してから並べる。
 */
const COLLAPSE_WORLD:Array<[SoundCue,number]>=[['collapse-sword',FINISH_SWORD_DROP_MS],['collapse-knee',FINISH_COLLAPSE_MS],['collapse-fall',FINISH_FALL_FROM_MS]];

/**
 * 世界の時刻（ms）を実際の時刻（ms）に直す。
 * 控えめモードは命中で世界を止めないので、同じ世界の時刻でも実際の時刻が早くなる。
 * そのため通常と控えめで別々に直す。
 */
function realMsOf(worldMs:number,round:Round,calm:boolean) {
  return Math.round(warpReal(worldMs/1000,warpOf(beatOf(round),calm?0:HIT_STOPS.strong))*1000);
}

/** 魔導書の枠が浮かび始める時刻を、回の終わりの何ミリ秒前にするか。設計3章の89.4秒。 */
const BOOK_BEFORE=600;

/** 一回分の音の時刻。回の表から作るので、回を足しても書き足さなくてよい。 */
function cuesOf(round:Round,calm:boolean):Cue[] {
  const quietUntil=round.inputEnd+QUIET_TAIL;
  const list:Array<[SoundCue,number]>=[];
  if(round.build!==null)list.push(['trace',round.build]);
  list.push(['chant',round.chant],['build',quietUntil],['complete',round.lock],['release',round.release],
    [round.id==='defend'?'block':'impact',round.impact]);
  // とどめの一撃と、そのあとの崩れ落ちる音。持たない回は飛ばす。
  if(round.finalBlow!==null) {
    // とどめの一撃も世界の時刻（78.5秒）で置いてあるので、実際の時刻へ直してから鳴らす。
    list.push(['finish',realMsOf(round.finalBlow,round,calm)]);
    for(const [name,world] of COLLAPSE_WORLD)list.push([name,realMsOf(world,round,calm)]);
  }
  // 静かな音への切り替え。一回目と防御は今までどおり命中の3.5秒後、とどめは余韻の始まり（84秒）。
  list.push(['settle',round.finalBlow!==null?round.handoff:round.impact+3500]);
  // 敵の側の音。時刻は回の表（rounds.ts）が持ち、画面の揺れと騎士の動きも同じ表を見る。
  // 一回目の足音と盾の音は受付中なので、マイクを使う回では quietUntil の決まりでそのまま鳴らない（マウスで遊ぶときだけ鳴る）。
  if(round.id==='first')for(const move of ENEMY_MOVES)list.push([move.kind,move.at]);
  // 防御の回は、確定の時刻に剣を振り下ろし（swing）、その0.55秒後に床を打つ（slam）。どちらも録音の後なので必ず鳴る。
  if(round.id==='defend')list.push(['swing',round.lock],['slam',ENEMY_SLAM_MS]);
  // 魔導書の静かな一音。魔導書の枠が浮かび始める89.4秒に鳴らす。
  // 90秒ちょうどに置くと、そのコマでは結果画面へ移っていて永遠に鳴らない。
  if(round.finalBlow!==null)list.push(['book',round.end-BOOK_BEFORE]);
  return list.map(([name,at])=>({name,at,quietUntil,round:round.id})).sort((a,b)=>a.at-b.at);
}
/** 一回の遊びで鳴る音の並び。時刻の順。試験や画面の確認からも読む。 */
export const soundCues:Cue[]=ROUNDS.flatMap(round=>cuesOf(round,false));
/** 控えめモードの音の並び。崩れの音ととどめの一撃だけ、世界の時刻の直し方が変わる。 */
export const calmSoundCues:Cue[]=ROUNDS.flatMap(round=>cuesOf(round,true));

/**
 * そのコマで鳴らす音。前のコマの時刻から今の時刻までに来た合図を返す。
 * 90秒に届いたコマは結果画面へ移る（main.ts の animate が finish を呼ぶ）ので、そこでは何も鳴らさない。
 * 合図をこの時刻に置いても鳴らないので、魔導書の一音は手前に置いてある。
 */
export function dueSounds(previous:number,now:number,microphone:boolean,calm=false) {
  if(now>=BATTLE_END)return [];
  // 録音終了と最後の文字を待つ間は鳴らさない。遅れた音をまとめて鳴らさない。
  return (calm?calmSoundCues:soundCues).filter(cue=>cue.at>previous&&cue.at<=now&&now-cue.at<300&&(!microphone||cue.at>=cue.quietUntil));
}
/** その時刻に録音していて、曲を下げておくべきか。回ごとの受付の間だけ下げる。 */
export function shouldDuck(ms:number) {
  return ROUNDS.some(round=>ms>=round.start&&ms<round.inputEnd+QUIET_TAIL);
}

/** とどめの回で音を抜く間（実際のms）。発動前の「間」と暗転、直撃の直前。 */
const FINISH_HUSH={
  /** 発動の何ミリ秒前から抜き始めるか（描く値を止める間と同じ） */ before:400,
  /** 完全に無音にする、発動の何ミリ秒前から */ silent:80,
  /** 直撃の直前に弱める長さ（ms）と、そのときの音量 */ duckMs:200,duckLevel:.35,
  /** 発動と直撃の何ミリ秒前から1へ戻し始めるか。出だしが潰れないよう、音より先に戻しておく。 */ back:50,
};

/**
 * その時刻の音量の倍率（0〜1）。とどめの回だけ1より小さくなる。
 * 75.6秒から抜き始め、75.92〜75.95秒は無音、そこから発動の76.0秒までに1へ戻す。
 * 直撃の直前も同じように、実際の78.4〜78.55秒で弱め、直撃の78.6秒までに1へ戻す。
 * 戻しを0.05秒前から始めるのは、発動音と一撃音の出だしが潰れないようにするため。
 */
export function hushAt(ms:number,calm=false) {
  let level=1;
  for(const round of ROUNDS) {
    if(round.finalBlow===null)continue;
    const from=round.release-FINISH_HUSH.before,silent=round.release-FINISH_HUSH.silent;
    const backFrom=round.release-FINISH_HUSH.back;
    if(ms>=from&&ms<silent)level=Math.min(level,1-(ms-from)/(silent-from));
    if(ms>=silent&&ms<backFrom)level=0;
    if(ms>=backFrom&&ms<round.release)level=Math.min(level,(ms-backFrom)/FINISH_HUSH.back);
    // 直撃の直前だけ短く弱める。直撃の合図と同じ実際の時刻で置く。
    const blow=realMsOf(round.finalBlow,round,calm),blowBack=blow-FINISH_HUSH.back;
    if(ms>=blow-FINISH_HUSH.duckMs&&ms<blowBack)level=Math.min(level,FINISH_HUSH.duckLevel);
    if(ms>=blowBack&&ms<blow)level=Math.min(level,FINISH_HUSH.duckLevel+(1-FINISH_HUSH.duckLevel)*(ms-blowBack)/FINISH_HUSH.back);
  }
  return level;
}
