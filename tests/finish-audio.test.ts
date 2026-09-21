import { describe, it, expect } from 'vitest';
import { FINISH_COLLAPSE_MS, FINISH_FALL_FROM_MS, FINISH_SWORD_DROP_MS, ROUNDS, beatOf } from '../src/game/rounds';
import { calmSoundCues, dueSounds, hushAt, soundCues } from '../src/audio/cues';
import { HIT_STOPS, warpOf, warpReal, warpTime } from '../src/render/effects/screen';

const first = ROUNDS[0], finish = ROUNDS[2], finishBeat = beatOf(finish);
/** 崩れ落ちの世界の時刻（秒）。剣、膝、倒れ始め。 */
const 剣 = FINISH_SWORD_DROP_MS / 1000, 膝 = FINISH_COLLAPSE_MS / 1000, 倒れ = FINISH_FALL_FROM_MS / 1000;

const 世界から実際へ = (world: number) => warpReal(world, warpOf(finishBeat, HIT_STOPS.strong));
const names = (from: number, to: number) => dueSounds(from, to, false).map(cue => cue.name);
/** その並びの中で、その音が鳴る時刻（ms）。 */
const 至 = (cues: typeof soundCues, name: string) => cues.find(cue => cue.name === name)!.at;

describe('世界の時刻から実際の時刻を出す', () => {
  it('ゆがみを行き来しても同じ時刻に戻る', () => {
    const warp = warpOf(finishBeat, HIT_STOPS.strong);
    for (let ms = finish.start; ms <= finish.end - 750; ms += 5) {
      const world = ms / 1000;
      expect(warpTime(世界から実際へ(world), warp)).toBeCloseTo(world, 6);
    }
  });
  it('崩れ落ちの世界の時刻が、遅れのぶんだけ後ろの実際の時刻に直る', () => {
    // 止め2回とスローでたまる遅れは0.725秒。剣、膝、倒れ始めが同じだけ後ろへずれる。
    const 遅れ = .725;
    expect(世界から実際へ(剣)).toBeCloseTo(剣 + 遅れ, 6);
    expect(世界から実際へ(膝)).toBeCloseTo(膝 + 遅れ, 6);
    expect(世界から実際へ(倒れ)).toBeCloseTo(倒れ + 遅れ, 6);
    expect(世界から実際へ(finish.end / 1000 - 遅れ)).toBeCloseTo(finish.end / 1000, 6);
  });
  it('一回目と防御はゆがみが小さく、命中の前は実際の時刻と同じ', () => {
    const warp = warpOf(beatOf(first), HIT_STOPS.weak);
    const 命中 = first.impact / 1000;
    expect(warpReal(10, warp)).toBe(10);
    expect(warpReal(命中, warp)).toBeCloseTo(命中, 6);
    expect(warpReal(命中 + 1.5, warp)).toBeCloseTo(命中 + 1.5 + HIT_STOPS.weak, 6);
  });
});

describe('とどめの回の音の合図', () => {
  it('とどめの一撃は命中と別の合図で、余韻と魔導書の音まで並ぶ', () => {
    const 前後 = (at: number) => names(at - 10, at + 10);
    const 直撃の実際 = Math.round(世界から実際へ(finish.finalBlow! / 1000) * 1000);
    expect(前後(finish.release)).toEqual(['release']);
    expect(前後(finish.impact)).toEqual(['impact']);
    // とどめの一撃も世界の時刻で置いてあるので、鳴るのは止めの分だけ遅れた実際の時刻。
    expect(前後(finish.finalBlow!)).toEqual([]);
    expect(前後(直撃の実際)).toEqual(['finish']);
    expect(前後(finish.handoff)).toEqual(['settle']);
    expect(前後(finish.end - 600)).toEqual(['book']);
    // 一回目と防御には、とどめの音も崩れの音も混ざらない。
    const 前半 = soundCues.filter(cue => cue.round !== 'finish').map(cue => cue.name);
    for (const name of ['finish', 'collapse-sword', 'collapse-knee', 'collapse-fall', 'book']) expect(前半).not.toContain(name);
  });
  it('崩れる音は、世界の時刻を実際の時刻に直した位置で鳴る', () => {
    const 実際 = (world: number) => Math.round(世界から実際へ(world) * 1000);
    expect(names(実際(剣) - 10, 実際(剣) + 10)).toEqual(['collapse-sword']);
    expect(names(実際(膝) - 10, 実際(膝) + 10)).toEqual(['collapse-knee']);
    expect(names(実際(倒れ) - 10, 実際(倒れ) + 10)).toEqual(['collapse-fall']);
    // 音の並びも、騎士の動きと同じ世界の時刻から作る。
    expect(至(soundCues, 'collapse-sword')).toBe(実際(剣));
    expect(至(soundCues, 'collapse-knee')).toBe(実際(膝));
    expect(至(soundCues, 'collapse-fall')).toBe(実際(倒れ));
  });
  it('控えめモードは世界を止めないので、崩れる音ととどめの一撃が早く来る', () => {
    // 控えめでは止めが無く、スローだけ残る。とどめの一撃は世界の時刻そのままに鳴る。
    const 控えめの実際 = (world: number) => Math.round(warpReal(world, warpOf(finishBeat, 0)) * 1000);
    expect(至(calmSoundCues, 'finish')).toBe(finish.finalBlow!);
    expect(至(calmSoundCues, 'collapse-sword')).toBe(控えめの実際(剣));
    expect(至(calmSoundCues, 'collapse-knee')).toBe(控えめの実際(膝));
    expect(至(calmSoundCues, 'collapse-fall')).toBe(控えめの実際(倒れ));
    const 控えめの剣 = Math.round(warpReal(剣, warpOf(finishBeat, 0)) * 1000);
    expect(dueSounds(控えめの剣 - 10, 控えめの剣 + 10, false, true).map(cue => cue.name)).toEqual(['collapse-sword']);
    // 通常の並びでは、その時刻にはまだ鳴らない。
    expect(names(控えめの剣 - 10, 控えめの剣 + 10)).toEqual([]);
    // 世界の時刻で置いていない音は、控えめでも通常と同じ。
    for (const name of ['chant', 'build', 'complete', 'release', 'impact', 'settle', 'book'])
      expect(至(calmSoundCues, name)).toBe(至(soundCues, name));
  });
  it('魔導書の一音は、結果画面へ移る前のコマで鳴る', () => {
    // animate は回の終わりのコマで先に結果画面へ移すので、そのコマでは音を鳴らさない。
    expect(dueSounds(finish.end - 10, finish.end + 10, false)).toEqual([]);
    expect(dueSounds(finish.end - 10, finish.end + 500, false)).toEqual([]);
    // 16ミリ秒ごとのコマを並べると、魔導書の一音は結果画面より前に鳴る。
    const 鳴った: string[] = [];
    let previous = finish.start;
    for (let now = finish.start + 16; now <= finish.end; now += 16) {
      for (const cue of dueSounds(previous, now, false)) 鳴った.push(cue.name);
      previous = now;
    }
    expect(鳴った).toContain('book');
    expect(鳴った).toContain('finish');
    expect(鳴った).toContain('collapse-fall');
  });
  it('合図は時刻の順に並び、とどめの回は11個', () => {
    const finishCues = soundCues.filter(cue => cue.round === 'finish');
    expect(finishCues.map(cue => cue.name)).toEqual([
      'chant', 'build', 'complete', 'release', 'impact', 'finish',
      'collapse-sword', 'collapse-knee', 'collapse-fall', 'settle', 'book']);
    expect(至(soundCues, 'finish')).toBe(Math.round(世界から実際へ(finish.finalBlow! / 1000) * 1000));
    for (let i = 1; i < soundCues.length; i++) expect(soundCues[i].at).toBeGreaterThanOrEqual(soundCues[i - 1].at);
  });
  it('マイクを使う回は、録音の終わりを待つまで鳴らさない', () => {
    const quiet = finish.inputEnd + 750;
    expect(dueSounds(finish.chant, finish.chant + 100, true)).toEqual([]);
    expect(dueSounds(quiet - 50, quiet - 10, true)).toEqual([]);
    expect(dueSounds(quiet - 10, quiet + 10, true).map(cue => cue.name)).toEqual(['build']);
    // 録音していなければ詠唱の案内も鳴る。
    expect(names(finish.chant - 10, finish.chant + 10)).toEqual(['chant']);
  });
});

describe('音を抜く間', () => {
  it('発動の0.4秒前から抜き、暗転の間は無音、発動の0.05秒前から戻し始める', () => {
    const 発動 = finish.release;
    expect(hushAt(発動 - 500)).toBe(1);
    expect(hushAt(発動 - 400)).toBeCloseTo(1, 6);
    expect(hushAt(発動 - 240)).toBeCloseTo(.5, 6);
    expect(hushAt(発動 - 80)).toBe(0);
    expect(hushAt(発動 - 51)).toBe(0);
    // 発動音の出だしが潰れないよう、発動の0.05秒前から戻し始める。
    expect(hushAt(発動 - 25)).toBeCloseTo(.5, 6);
    expect(hushAt(発動)).toBe(1);
  });
  it('直撃の直前だけ短く弱め、直撃の0.05秒前から戻し始める', () => {
    // 直撃の実際の時刻の0.2秒前から弱める。
    const 直撃 = Math.round(世界から実際へ(finish.finalBlow! / 1000) * 1000);
    expect(hushAt(直撃 - 210)).toBe(1);
    expect(hushAt(直撃 - 200)).toBeLessThan(.5);
    expect(hushAt(直撃 - 51)).toBeLessThan(.5);
    expect(hushAt(直撃 - 25)).toBeGreaterThan(.6);
    expect(hushAt(直撃)).toBe(1);
    // 控えめモードでは直撃が世界の時刻のままなので、弱める間もそのぶん早い。
    expect(hushAt(finish.finalBlow! - 200, true)).toBeLessThan(.5);
    expect(hushAt(finish.finalBlow!, true)).toBe(1);
  });
  it('一回目と防御では音を抜かない', () => {
    for (let ms = 0; ms < finish.start; ms += 20) { expect(hushAt(ms)).toBe(1); expect(hushAt(ms, true)).toBe(1); }
  });
});
