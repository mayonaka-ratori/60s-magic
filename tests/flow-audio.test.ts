import { describe,it,expect } from 'vitest';
import { FLOW, ROUNDS } from '../src/game/rounds';
import { dueSounds, shouldDuck, soundCues } from '../src/audio/cues';
import { 鳴る音, 順番に鳴る音 } from './browser/sound-order';

describe('両方の遊び方で録音中も音を鳴らす',()=>{
  it('マイクの有無で音を消さず、同じ音を二度鳴らさない',()=>{
    for(const microphone of [false,true]) {
      const heard:string[]=[];
      for(let ms=0;ms<90000;ms+=10)heard.push(...dueSounds(ms-10,ms,microphone).map(cue=>cue.name));
      expect(heard).toEqual(FLOW==='sequential'?順番に鳴る音:鳴る音);
    }
  });
  it('線が残る瞬間に音を鳴らし、声の受付の境目で音量を戻す',()=>{
    for(const round of ROUNDS) {
      expect(soundCues.find(cue=>cue.round===round.id&&cue.name==='trace')?.at??null).toBe(round.build);
      expect(shouldDuck(round.inputEnd)).toBe(false);
      if(round.voiceStart===null) {
        for(let ms=round.start;ms<round.end;ms+=100)expect(shouldDuck(ms)).toBe(false);
      } else {
        expect(shouldDuck(round.voiceStart-1)).toBe(false);
        expect(shouldDuck(round.voiceStart)).toBe(true);
        expect(shouldDuck(round.inputEnd-1)).toBe(true);
      }
    }
  });
});
