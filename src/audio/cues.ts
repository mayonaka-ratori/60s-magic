import { ROUNDS, type Round } from '../game/rounds';

export type SoundCue='trace'|'chant'|'build'|'complete'|'release'|'impact'|'settle'|'block'|'ring';
export type Cue={name:SoundCue;at:number;quietUntil:number;round:Round['id']};

/** 録音を止めてから効果音を鳴らし始めるまでの余裕（ms）。 */
const QUIET_TAIL=750;

/** 一回分の音の時刻。回の表から作るので、回を足しても書き足さなくてよい。 */
function cuesOf(round:Round):Cue[] {
  const quietUntil=round.inputEnd+QUIET_TAIL;
  const list:Array<[SoundCue,number]>=[];
  if(round.build!==null)list.push(['trace',round.build]);
  list.push(['chant',round.chant],['build',quietUntil],['complete',round.lock],['release',round.release],
    [round.id==='defend'?'block':'impact',round.impact],['settle',round.impact+3500]);
  return list.map(([name,at])=>({name,at,quietUntil,round:round.id}));
}
const soundCues:Cue[]=ROUNDS.flatMap(cuesOf);

export function dueSounds(previous:number,now:number,microphone:boolean) {
  // 録音終了と最後の文字を待つ間は鳴らさない。遅れた音をまとめて鳴らさない。
  return soundCues.filter(cue=>cue.at>previous&&cue.at<=now&&now-cue.at<300&&(!microphone||cue.at>=cue.quietUntil));
}
/** その時刻に録音していて、曲を下げておくべきか。回ごとの受付の間だけ下げる。 */
export function shouldDuck(ms:number) {
  return ROUNDS.some(round=>ms>=round.start&&ms<round.inputEnd+QUIET_TAIL);
}
