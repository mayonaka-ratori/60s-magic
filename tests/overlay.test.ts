import { describe, it, expect } from 'vitest';
import { FLASH_FALL, FLASH_GAP, FLASH_MAX, FLASH_RISE, GRAIN_OPACITY, VIGNETTE_BASE, VIGNETTE_PEAK,
  flashTarget, grainOpacity, newFlashMemory, opacityText, saturateFilter, shouldWrite, stepFlash, vignetteOpacity } from '../src/render/overlay';

/** 60分の1秒を一コマとして、閃光を何コマか進める。 */
function run(flash: number[], calm = false, start = 100) {
  const memory = newFlashMemory(), dt = 1 / 60, out: number[] = [];
  for (let i = 0; i < flash.length; i++) out.push(stepFlash(memory, flash[i], calm, dt, start + i * dt));
  return out;
}

describe('閃光の濃さ', () => {
  it('上限は0.7で、それ以上の値が来ても頭打ちになる', () => {
    expect(flashTarget(1, false)).toBe(FLASH_MAX);
    expect(flashTarget(.4, false)).toBeCloseTo(.4, 6);
    expect(flashTarget(-1, false)).toBe(0);
  });
  it('控えめモードでは上限が3分の1まで下がる', () => {
    expect(flashTarget(1, true)).toBeCloseTo(FLASH_MAX / 3, 6);
    expect(flashTarget(1, true)).toBeLessThan(flashTarget(1, false) / 2);
  });

  it('立ち上がりは約2コマ、戻りは約10コマの非対称になる', () => {
    // 立ち上がり。0.7へ上がりきるまでのコマ数。
    const up = run(new Array(20).fill(FLASH_MAX));
    const riseFrames = up.findIndex(v => v >= FLASH_MAX - 1e-6) + 1;
    expect(riseFrames).toBeGreaterThanOrEqual(2);
    expect(riseFrames).toBeLessThanOrEqual(3);
    expect(FLASH_RISE).toBeCloseTo(.035, 6);

    // 戻り。上げきった後に0を入れ続け、0になるまでのコマ数。
    const down = run([...new Array(5).fill(FLASH_MAX), ...new Array(30).fill(0)]);
    const tail = down.slice(5);
    const fallFrames = tail.findIndex(v => v === 0) + 1;
    expect(fallFrames).toBeGreaterThanOrEqual(9);
    expect(fallFrames).toBeLessThanOrEqual(12);
    expect(FLASH_FALL / FLASH_RISE).toBeGreaterThan(4);
    // 戻りの途中は必ず減り続ける。
    for (let i = 1; i < 8; i++) expect(tail[i]).toBeLessThan(tail[i - 1]);
  });

  it('控えめモードでは同じ入力でも薄くなる', () => {
    const normal = run(new Array(20).fill(FLASH_MAX));
    const calm = run(new Array(20).fill(FLASH_MAX), true);
    expect(Math.max(...calm)).toBeCloseTo(FLASH_MAX / 3, 6);
    expect(Math.max(...calm)).toBeLessThan(Math.max(...normal) / 2);
  });

  it('間隔が近すぎる閃光は光らせない（1秒に3回を超えない）', () => {
    const memory = newFlashMemory(), dt = 1 / 60;
    let now = 0, starts = 0, lit = false;
    // 0.1秒ごとに一瞬だけ明るい値を入れる。10回分＝1秒。
    for (let i = 0; i < 60; i++) {
      const bright = i % 6 === 0;
      const v = stepFlash(memory, bright ? FLASH_MAX : 0, false, dt, now);
      if (v > 0 && !lit) { starts++; lit = true; }
      if (v === 0) lit = false;
      now += dt;
    }
    expect(starts).toBeLessThanOrEqual(3);
    expect(FLASH_GAP).toBeGreaterThanOrEqual(1 / 3);
  });

  it('十分に間を空ければ次の閃光は光る', () => {
    const memory = newFlashMemory();
    expect(stepFlash(memory, FLASH_MAX, false, 1 / 60, 0)).toBeGreaterThan(0);
    for (let i = 1; i < 30; i++) stepFlash(memory, 0, false, 1 / 60, i / 60);
    expect(memory.value).toBe(0);
    expect(stepFlash(memory, FLASH_MAX, false, 1 / 60, 2)).toBeGreaterThan(0);
  });
});

describe('ビネットとグレイン', () => {
  it('常時0.25、暗くなるほど0.6まで濃くなる', () => {
    expect(vignetteOpacity(0, false)).toBeCloseTo(VIGNETTE_BASE, 6);
    expect(vignetteOpacity(1, false)).toBeCloseTo(VIGNETTE_PEAK, 6);
    expect(vignetteOpacity(.175, false)).toBeGreaterThan(VIGNETTE_BASE);
    expect(vignetteOpacity(.175, false)).toBeLessThan(VIGNETTE_PEAK);
  });
  it('控えめモードでは常時の値のまま濃くならない', () => {
    expect(vignetteOpacity(0, true)).toBeCloseTo(VIGNETTE_BASE, 6);
    expect(vignetteOpacity(1, true)).toBeCloseTo(VIGNETTE_BASE, 6);
  });
  it('グレインは2〜4%で、控えめモードでは出さない', () => {
    expect(GRAIN_OPACITY).toBeGreaterThanOrEqual(.02);
    expect(GRAIN_OPACITY).toBeLessThanOrEqual(.04);
    expect(grainOpacity(false)).toBe(GRAIN_OPACITY);
    expect(grainOpacity(true)).toBe(0);
  });
});

describe('背景の彩度', () => {
  it('1に近いときは指定しない', () => {
    expect(saturateFilter(1)).toBe('');
    expect(saturateFilter(.999)).toBe('');
  });
  it('色を抜くときだけ filter の文字を作る', () => {
    expect(saturateFilter(.6)).toBe('saturate(0.600)');
    expect(saturateFilter(-1)).toBe('saturate(0.000)');
  });
});

describe('書き換えの判定', () => {
  it('まだ一度も書いていなければ必ず書く', () => {
    expect(shouldWrite(null, 0)).toBe(true);
  });
  it('値が変わらないコマは書き換えない', () => {
    expect(shouldWrite(.25, .25)).toBe(false);
    expect(shouldWrite(.25, .2505)).toBe(false);
  });
  it('目に見える差があれば書き換える', () => {
    expect(shouldWrite(.25, .26)).toBe(true);
    expect(shouldWrite(0, .6)).toBe(true);
  });
  it('透明度の文字に無駄な桁を持たせない', () => {
    expect(opacityText(.25)).toBe('0.25');
    expect(opacityText(1 / 3)).toBe('0.333');
    expect(opacityText(0)).toBe('0');
  });
});
