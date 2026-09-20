import { describe,it,expect } from 'vitest';
import { knightPose } from '../src/render/knight';
import { dueSounds } from '../src/audio/cues';

describe('騎士の反応',()=>{
  it('命中前にひるまず、命中後に構えを戻す',()=>{
    expect(knightPose(18499,true).state).toBe('idle');
    expect(knightPose(18700,true).state).toBe('hit');
    expect(knightPose(19800,true).state).toBe('recover');
    expect(knightPose(23000,true).state).toBe('idle');
    for(let ms=0;ms<=24000;ms+=20){const p=knightPose(ms,true);expect(p.weights.reduce((a,b)=>a+b,0)).toBeCloseTo(1);expect(Math.min(...p.weights)).toBeGreaterThanOrEqual(-.00001);}
  });
  it('開始画面では被弾せず、動きを減らす設定では揺らさない',()=>{
    expect(knightPose(18700,false).state).toBe('idle');
    expect(knightPose(18700,true,true).lean).toBe(0);expect(knightPose(1000,true,true).breath).toBe(0);
    // 命中の震えも止まるが、胸の光の強さは残す。
    expect(knightPose(18550,true,true).shake).toBe(0);expect(knightPose(18550,true,true).flash).toBeGreaterThan(0);
    expect(knightPose(18550,true).shake).toBeGreaterThan(0);
  });
});
describe('音の時刻',()=>{
  it('録音中と認識結果を待つ間は鳴らさない',()=>{
    expect(dueSounds(5900,6010,true)).toEqual([]);
    expect(dueSounds(10900,11010,true)).toEqual([]);
    expect(dueSounds(14700,14740,true)).toEqual([]);
    expect(dueSounds(14740,14760,true).map(c=>c.name)).toEqual(['build']);
  });
  it('同じ音を二度鳴らさず、遅れた音をまとめて鳴らさない',()=>{
    expect(dueSounds(16990,17010,false).map(c=>c.name)).toEqual(['release']);
    expect(dueSounds(17010,17020,false)).toEqual([]);
    expect(dueSounds(0,24000,false)).toEqual([]);
    expect(dueSounds(16900,18510,false).map(c=>c.name)).toEqual(['impact']);
  });
});
