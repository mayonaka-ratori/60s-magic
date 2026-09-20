import { ROUNDS, beatOf, type Round } from '../game/rounds';
import { HIT_STOPS, warpOf, warpReal } from '../render/effects/screen';

export type SoundCue='trace'|'chant'|'build'|'complete'|'release'|'impact'|'finish'|'collapse-sword'|'collapse-knee'|'collapse-fall'|'settle'|'book'|'block'|'ring';
export type Cue={name:SoundCue;at:number;quietUntil:number;round:Round['id']};

/** 録音を止めてから効果音を鳴らし始めるまでの余裕（ms）。 */
const QUIET_TAIL=750;

/**
 * 崩れ落ちる音。設計3章の世界の時刻（ms）。剣が落ちる、膝をつく、倒れる。
 * 音は実際の時計で鳴らすので、世界の時計のゆがみで実際の時刻へ直してから並べる。
 */
const COLLAPSE_WORLD:Array<[SoundCue,number]>=[['collapse-sword',54925],['collapse-knee',55400],['collapse-fall',56200]];

/** 世界の時刻（ms）を実際の時刻（ms）に直す。控えめモードでも音の並びは変えない。 */
function realMsOf(worldMs:number,round:Round) {
  return Math.round(warpReal(worldMs/1000,warpOf(beatOf(round),HIT_STOPS.strong))*1000);
}

/** 一回分の音の時刻。回の表から作るので、回を足しても書き足さなくてよい。 */
function cuesOf(round:Round):Cue[] {
  const quietUntil=round.inputEnd+QUIET_TAIL;
  const list:Array<[SoundCue,number]>=[];
  if(round.build!==null)list.push(['trace',round.build]);
  list.push(['chant',round.chant],['build',quietUntil],['complete',round.lock],['release',round.release],
    [round.id==='defend'?'block':'impact',round.impact]);
  // とどめの一撃と、そのあとの崩れ落ちる音。持たない回は飛ばす。
  if(round.finalBlow!==null) {
    list.push(['finish',round.finalBlow]);
    for(const [name,world] of COLLAPSE_WORLD)list.push([name,realMsOf(world,round)]);
  }
  // 静かな音への切り替え。一回目と防御は今までどおり命中の3.5秒後、とどめは余韻の始まり（57秒）。
  list.push(['settle',round.finalBlow!==null?round.handoff:round.impact+3500]);
  // 魔導書の静かな一音。戦いの終わりに一度だけ。
  if(round.finalBlow!==null)list.push(['book',round.end]);
  return list.map(([name,at])=>({name,at,quietUntil,round:round.id})).sort((a,b)=>a.at-b.at);
}
/** 一回の遊びで鳴る音の並び。時刻の順。試験や画面の確認からも読む。 */
export const soundCues:Cue[]=ROUNDS.flatMap(cuesOf);

export function dueSounds(previous:number,now:number,microphone:boolean) {
  // 録音終了と最後の文字を待つ間は鳴らさない。遅れた音をまとめて鳴らさない。
  return soundCues.filter(cue=>cue.at>previous&&cue.at<=now&&now-cue.at<300&&(!microphone||cue.at>=cue.quietUntil));
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
};

/**
 * その時刻の音量の倍率（0〜1）。とどめの回だけ1より小さくなる。
 * 51.6秒から抜き始め、51.92〜52.0秒は無音、直撃の直前（実際の54.4〜54.6秒）は短く弱める。
 */
export function hushAt(ms:number) {
  let level=1;
  for(const round of ROUNDS) {
    if(round.finalBlow===null)continue;
    const from=round.release-FINISH_HUSH.before,silent=round.release-FINISH_HUSH.silent;
    if(ms>=from&&ms<silent)level=Math.min(level,1-(ms-from)/(silent-from));
    if(ms>=silent&&ms<round.release)level=0;
    // 直撃の直前（54.3〜54.5秒）だけ短く弱める。直撃の合図と同じ目盛りで置く。
    if(ms>=round.finalBlow-FINISH_HUSH.duckMs&&ms<round.finalBlow)level=Math.min(level,FINISH_HUSH.duckLevel);
  }
  return level;
}
