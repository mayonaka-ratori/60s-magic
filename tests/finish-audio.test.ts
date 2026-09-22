import { describe, it, expect } from 'vitest';
import { FINISH_COLLAPSE_MS, FINISH_FALL_FROM_MS, FINISH_SWORD_DROP_MS, ROUNDS, beatOf } from '../src/game/rounds';
import { calmSoundCues, dueSounds, hushAt, soundCues } from '../src/audio/cues';
import { HIT_STOPS, warpOf, warpReal, warpTime } from '../src/render/effects/screen';

const finish = ROUNDS[2], finishBeat = beatOf(finish);
const 世界から実際へ = (world: number) => warpReal(world, warpOf(finishBeat, HIT_STOPS.strong));
const names = (from: number, to: number) => dueSounds(from, to, false).map(cue => cue.name);
/** その並びの中で、その音が鳴る時刻（ms）。 */
const 至 = (cues: typeof soundCues, name: string) => cues.find(cue => cue.name === name)!.at;

/**
 * とどめの回で実際に鳴る時刻（ms）。世界の時刻に、止めとスローの遅れを足した位置。
 * とどめの一撃は世界の78.5秒＋命中の止め0.1秒。崩れ落ちは世界の時刻＋遅れ0.725秒（止め2回とスロー）。
 */
const 直撃の実際 = 78600, 剣の実際 = 79825, 膝の実際 = 80525, 倒れの実際 = 81625;
/** 控えめモードの時刻（ms）。止めが無いので、残るのはスローの0.375秒だけ。とどめの一撃は世界の時刻のまま。 */
const 控えめの直撃 = 78500, 控えめの剣 = 79475, 控えめの膝 = 80175, 控えめの倒れ = 81275;

describe('世界の時刻から実際の時刻を出す', () => {
  it('ゆがみを行き来しても同じ時刻に戻る', () => {
    const warp = warpOf(finishBeat, HIT_STOPS.strong);
    // 止めとスローがあるのは、一発目の命中からスローが終わるまで。そこは1ミリ秒ずつ、ほかは0.1秒ずつ見る。
    const 細かく = [finish.impact - 10, (finishBeat.finalBlow! + 1.5) * 1000] as const;
    let ずれ = 0;
    for (let ms = finish.start; ms <= finish.end - 750; ms += ms >= 細かく[0] && ms < 細かく[1] ? 1 : 100) {
      const world = ms / 1000;
      ずれ = Math.max(ずれ, Math.abs(warpTime(世界から実際へ(world), warp) - world));
    }
    expect(ずれ).toBeLessThan(1e-6);
  });
});

describe('とどめの回の音の合図', () => {
  it('崩れる音は、世界の時刻を実際の時刻に直した位置で鳴る', () => {
    // 世界の時刻は剣79.1秒、膝79.8秒、倒れ80.9秒。鳴るのは遅れ0.725秒ぶん後ろ。
    expect(至(soundCues, 'collapse-sword')).toBe(剣の実際);
    expect(至(soundCues, 'collapse-knee')).toBe(膝の実際);
    expect(至(soundCues, 'collapse-fall')).toBe(倒れの実際);
    expect(names(剣の実際 - 10, 剣の実際 + 10)).toEqual(['collapse-sword']);
    expect(names(膝の実際 - 10, 膝の実際 + 10)).toEqual(['collapse-knee']);
    expect(names(倒れの実際 - 10, 倒れの実際 + 10)).toEqual(['collapse-fall']);
    // 三つとも、騎士が動く世界の時刻から同じだけ後ろへずれる。
    expect(剣の実際).toBeGreaterThan(FINISH_SWORD_DROP_MS);
    expect(膝の実際 - FINISH_COLLAPSE_MS).toBe(剣の実際 - FINISH_SWORD_DROP_MS);
    expect(倒れの実際 - FINISH_FALL_FROM_MS).toBe(剣の実際 - FINISH_SWORD_DROP_MS);
    // とどめの一撃のあと、剣、膝、倒れの順で、回の終わりより前に鳴る。
    expect(剣の実際).toBeGreaterThan(直撃の実際);
    expect(膝の実際).toBeGreaterThan(剣の実際);
    expect(倒れの実際).toBeGreaterThan(膝の実際);
    expect(倒れの実際).toBeLessThan(finish.end);
  });
  it('控えめモードは世界を止めないので、崩れる音ととどめの一撃が早く来る', () => {
    // 控えめでは止めが無く、スローだけ残る。とどめの一撃は世界の時刻そのままに鳴る。
    expect(至(calmSoundCues, 'finish')).toBe(控えめの直撃);
    expect(控えめの直撃).toBe(finish.finalBlow!);
    expect(至(calmSoundCues, 'collapse-sword')).toBe(控えめの剣);
    expect(至(calmSoundCues, 'collapse-knee')).toBe(控えめの膝);
    expect(至(calmSoundCues, 'collapse-fall')).toBe(控えめの倒れ);
    // 騎士が動く世界の時刻よりは後ろ（スローの分）で、通常よりは早い（止めの分）。
    for (const [控えめ, 世界, 通常] of [[控えめの剣, FINISH_SWORD_DROP_MS, 剣の実際], [控えめの膝, FINISH_COLLAPSE_MS, 膝の実際], [控えめの倒れ, FINISH_FALL_FROM_MS, 倒れの実際]]) {
      expect(控えめ).toBeGreaterThan(世界);
      expect(控えめ).toBeLessThan(通常);
    }
    expect(控えめの直撃).toBeLessThan(直撃の実際);
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
    // とどめの一撃は、世界の78.5秒に命中の止め0.1秒を足した78.6秒に鳴る。
    expect(至(soundCues, 'finish')).toBe(直撃の実際);
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
    // 直撃の実際の時刻（78.6秒）の0.2秒前から弱める。
    const 直撃 = 直撃の実際;
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
    // 音を抜く間は0.4秒あるので、0.05秒ずつ見れば取りこぼさない。
    const 抜いた: number[] = [];
    for (let ms = 0; ms < finish.start; ms += 50) if (hushAt(ms) !== 1 || hushAt(ms, true) !== 1) 抜いた.push(ms);
    expect(抜いた).toEqual([]);
  });
});
