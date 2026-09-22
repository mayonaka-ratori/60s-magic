import { ANNOUNCEMENT_HOLD_MS, ANNOUNCEMENT_FADE_MS, ANNOUNCEMENT_MS, TOGETHER_ANNOUNCEMENT_MS, FLOW, type Round } from './rounds';

/** 描く時間を数え終えたら、唱える締め切りへ数え直す。 */
export function inputDeadline(round: Round, ms: number) {
  return round.drawEnd !== null && ms < round.drawEnd ? round.drawEnd : round.inputEnd;
}

/** 合図は受付を止めない。時刻が戻ったときも同じ表示にする。 */
export function announcementAt(round: Round, ms: number) {
  if(FLOW==='together') {
    const text=round.id==='first'?'':`第${'一二三'[round.index-1]}幕　${round.id==='defend'?'防御':'とどめ'}`;
    return {text:ms>=round.start&&ms<round.start+TOGETHER_ANNOUNCEMENT_MS?text:'',opacity:1};
  }
  const switching=round.id==='finish'&&round.drawEnd!==null&&round.drawEnd<round.inputEnd&&ms>=round.drawEnd;
  const start=switching?round.drawEnd!:round.start, elapsed=ms-start;
  const text=switching?'手を止めて、詠唱を始めよう！':`第${'一二三'[round.index-1]}幕　${round.id==='first'?'詠唱を始めよう！':'魔法陣を描こう！'}`;
  return {text:elapsed>=0&&elapsed<ANNOUNCEMENT_MS?text:'',opacity:Math.max(0,Math.min(1,1-(elapsed-ANNOUNCEMENT_HOLD_MS)/ANNOUNCEMENT_FADE_MS))};
}
