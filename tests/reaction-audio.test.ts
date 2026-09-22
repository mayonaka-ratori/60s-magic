import { describe,it,expect } from 'vitest';
import { knightPose } from '../src/render/knight';
import { dueSounds } from '../src/audio/cues';
import { ROUNDS } from '../src/game/rounds';

const first=ROUNDS[0],命中=first.impact;

describe('騎士の反応',()=>{
  it('命中前にひるまず、命中後に構えを戻す',()=>{
    expect(knightPose(命中-1,true).state).toBe('idle');
    expect(knightPose(命中+200,true).state).toBe('hit');
    expect(knightPose(命中+1300,true).state).toBe('recover');
    expect(knightPose(命中+4500,true).state).toBe('idle');
    for(let ms=0;ms<=first.end;ms+=20){const p=knightPose(ms,true);expect(p.weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);expect(Math.min(...p.weights)).toBeGreaterThanOrEqual(-.00001);}
  });
  it('開始画面では被弾せず、動きを減らす設定では揺らさない',()=>{
    expect(knightPose(命中+200,false).state).toBe('idle');
    expect(knightPose(命中+200,true,true).lean).toBe(0);expect(knightPose(1000,true,true).breath).toBe(0);
    // 命中の震えも止まるが、胸の光の強さは残す。
    expect(knightPose(命中+50,true,true).shake).toBe(0);expect(knightPose(命中+50,true,true).flash).toBeGreaterThan(0);
    expect(knightPose(命中+50,true).shake).toBeGreaterThan(0);
  });
});
describe('音の時刻',()=>{
  it('録音中も合図が鳴り、締め切りで集まる音が鳴る',()=>{
    const quiet=first.inputEnd;
    expect(dueSounds(first.build!-100,first.build!+10,true).map(c=>c.name)).toEqual(['trace']);
    expect(dueSounds(first.chant!-100,first.chant!+10,true).map(c=>c.name)).toEqual(['chant']);
    expect(dueSounds(quiet-50,quiet-10,true)).toEqual([]);
    expect(dueSounds(quiet-10,quiet+10,true).map(c=>c.name)).toEqual(['build']);
  });
  it('同じ音を二度鳴らさず、遅れた音をまとめて鳴らさない',()=>{
    expect(dueSounds(first.release-10,first.release+10,false).map(c=>c.name)).toEqual(['release']);
    expect(dueSounds(first.release+10,first.release+20,false)).toEqual([]);
    expect(dueSounds(0,first.end,false)).toEqual([]);
    expect(dueSounds(命中-100,命中+10,false).map(c=>c.name)).toEqual(['impact']);
  });
});
