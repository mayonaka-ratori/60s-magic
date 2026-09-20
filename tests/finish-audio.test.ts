import { describe, it, expect } from 'vitest';
import { ROUNDS, beatOf } from '../src/game/rounds';
import { dueSounds, hushAt, soundCues } from '../src/audio/cues';
import { HIT_STOPS, warpOf, warpReal, warpTime } from '../src/render/effects/screen';

const finish = ROUNDS[2], finishBeat = beatOf(finish);
const 世界から実際へ = (world: number) => warpReal(world, warpOf(finishBeat, HIT_STOPS.strong));
const names = (from: number, to: number) => dueSounds(from, to, false).map(cue => cue.name);

describe('世界の時刻から実際の時刻を出す', () => {
  it('ゆがみを行き来しても同じ時刻に戻る', () => {
    const warp = warpOf(finishBeat, HIT_STOPS.strong);
    for (let ms = 40000; ms <= 59250; ms += 5) {
      const world = ms / 1000;
      expect(warpTime(世界から実際へ(world), warp)).toBeCloseTo(world, 6);
    }
  });
  it('設計3章の表どおりに直る', () => {
    expect(世界から実際へ(54.925)).toBeCloseTo(55.65, 6);
    expect(世界から実際へ(55.40)).toBeCloseTo(56.125, 6);
    expect(世界から実際へ(56.20)).toBeCloseTo(56.925, 6);
    expect(世界から実際へ(59.275)).toBeCloseTo(60, 6);
  });
  it('一回目と防御はゆがみが小さく、命中の前は実際の時刻と同じ', () => {
    const warp = warpOf(beatOf(ROUNDS[0]), HIT_STOPS.weak);
    expect(warpReal(10, warp)).toBe(10);
    expect(warpReal(18.5, warp)).toBeCloseTo(18.5, 6);
    expect(warpReal(20, warp)).toBeCloseTo(20 + HIT_STOPS.weak, 6);
  });
});

describe('とどめの回の音の合図', () => {
  it('とどめの一撃は命中と別の合図で、余韻と魔導書の音まで並ぶ', () => {
    expect(names(51990, 52010)).toEqual(['release']);
    expect(names(53590, 53610)).toEqual(['impact']);
    expect(names(54490, 54510)).toEqual(['finish']);
    expect(names(56990, 57010)).toEqual(['settle']);
    expect(names(59990, 60010)).toEqual(['book']);
    // 一回目と防御には、とどめの音も崩れの音も混ざらない。
    const 前半 = soundCues.filter(cue => cue.round !== 'finish').map(cue => cue.name);
    for (const name of ['finish', 'collapse-sword', 'collapse-knee', 'collapse-fall', 'book']) expect(前半).not.toContain(name);
  });
  it('崩れる音は、世界の時刻を実際の時刻に直した位置で鳴る', () => {
    expect(names(55640, 55660)).toEqual(['collapse-sword']);
    expect(names(56120, 56140)).toEqual(['collapse-knee']);
    expect(names(56920, 56940)).toEqual(['collapse-fall']);
    // 設計3章の「実際」の列（55.65、56.13、56.93秒）と合う。
    const at = (name: string) => soundCues.find(cue => cue.name === name)!.at;
    expect(at('collapse-sword')).toBe(Math.round(世界から実際へ(54.925) * 1000));
    expect(at('collapse-knee')).toBe(56125);
    expect(at('collapse-fall')).toBe(56925);
  });
  it('合図は時刻の順に並び、とどめの回は9つ', () => {
    const finishCues = soundCues.filter(cue => cue.round === 'finish');
    expect(finishCues.map(cue => cue.name)).toEqual([
      'chant', 'build', 'complete', 'release', 'impact', 'finish',
      'collapse-sword', 'collapse-knee', 'collapse-fall', 'settle', 'book']);
    for (let i = 1; i < soundCues.length; i++) expect(soundCues[i].at).toBeGreaterThanOrEqual(soundCues[i - 1].at);
  });
  it('マイクを使う回は、録音の終わりを待つまで鳴らさない', () => {
    expect(dueSounds(44000, 44100, true)).toEqual([]);
    expect(dueSounds(49700, 49740, true)).toEqual([]);
    expect(dueSounds(49740, 49760, true).map(cue => cue.name)).toEqual(['build']);
    // 録音していなければ詠唱の案内も鳴る。
    expect(names(43990, 44010)).toEqual(['chant']);
  });
});

describe('音を抜く間', () => {
  it('発動の0.4秒前から抜き、暗転の間は無音、発動で戻る', () => {
    expect(hushAt(51500)).toBe(1);
    expect(hushAt(51600)).toBeCloseTo(1, 6);
    expect(hushAt(51760)).toBeCloseTo(.5, 6);
    expect(hushAt(51920)).toBe(0);
    expect(hushAt(51999)).toBe(0);
    expect(hushAt(52000)).toBe(1);
  });
  it('直撃の直前だけ短く弱める', () => {
    expect(hushAt(54290)).toBe(1);
    expect(hushAt(54300)).toBeLessThan(.5);
    expect(hushAt(54499)).toBeLessThan(.5);
    expect(hushAt(54500)).toBe(1);
  });
  it('一回目と防御では音を抜かない', () => {
    for (let ms = 0; ms < 40000; ms += 20) expect(hushAt(ms)).toBe(1);
  });
});
