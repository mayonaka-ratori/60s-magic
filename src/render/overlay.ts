import type { ScreenState } from './effects/screen';
import type { Palette } from './effects/presets';

/**
 * 画面全体にかかる効果のうち、HTMLの層で足りるもの（閃光、ビネット、グレイン、放出直前の暗転、背景の彩度）。
 * 演出canvasの塗りをやめ、全層の上のdivの透明度だけを毎コマ変える。
 *
 * このファイルの前半は画面を使わない計算だけにしてある（tests/overlay.test.ts で確かめる）。
 */

/** 閃光の立ち上がり（秒）。約2コマで最大まで上がる。 */
export const FLASH_RISE = .035;
/** 閃光の戻り（秒）。約10コマかけて0へ。 */
export const FLASH_FALL = .17;
/** 閃光の濃さの上限。これ以上白くしない。 */
export const FLASH_MAX = .7;
/** 新しい閃光を始められる間隔（秒）。1秒に3回を超えないようにする。 */
export const FLASH_GAP = .34;
/** ビネットの常時の濃さ。 */
export const VIGNETTE_BASE = .25;
/** ビネットの一番濃いとき。 */
export const VIGNETTE_PEAK = .6;
/** ビネットが一番濃くなる darken の値。 */
const VIGNETTE_FULL_AT = .35;
/** グレインの濃さ。 */
export const GRAIN_OPACITY = .03;

/** 閃光の今の濃さと、前に光り始めた時刻を覚えておく入れ物。 */
export type FlashMemory = {
  /** 今の濃さ */
  value: number;
  /** 前に光り始めた時刻（秒） */
  startedAt: number;
  /** 今光っている最中かどうか */
  lit: boolean;
};

export function newFlashMemory(): FlashMemory { return { value: 0, startedAt: -99, lit: false }; }

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * 閃光の目標の濃さ。上限0.7で頭打ちにする。
 * 控えめモードでは上限そのものを3分の1に下げる。screen.ts 側でも濃さを3分の1にしているので、
 * ここで割り算をするとさらに薄くなってしまう。上限だけを下げれば、どちらの場合も3分の1に収まる。
 */
export function flashTarget(flash: number, calm: boolean) {
  return Math.min(Math.max(flash, 0), calm ? FLASH_MAX / 3 : FLASH_MAX);
}

/**
 * 閃光を一コマ進める。上がるのは速く、戻るのは遅い。
 * 消えている所から新しく光るときだけ、前の閃光からの間隔を見て、近すぎれば光らせない。
 * dt は前のコマからの秒数、now は今の時刻（秒）。
 */
export function stepFlash(memory: FlashMemory, flash: number, calm: boolean, dt: number, now: number) {
  const target = flashTarget(flash, calm), step = Math.min(Math.max(dt, 0), .1);
  if (target > memory.value) {
    if (!memory.lit) {
      if (now - memory.startedAt < FLASH_GAP) return memory.value;
      memory.startedAt = now; memory.lit = true;
    }
    memory.value = Math.min(target, memory.value + step / FLASH_RISE * FLASH_MAX);
  } else {
    memory.value = Math.max(target, memory.value - step / FLASH_FALL * FLASH_MAX);
    if (memory.value <= .001) { memory.value = 0; memory.lit = false; }
  }
  return memory.value;
}

/** ビネットの濃さ。常時0.25で、溜めの後半と命中で0.6まで。控えめモードでは常時の値のまま。 */
export function vignetteOpacity(darken: number, calm: boolean) {
  if (calm) return VIGNETTE_BASE;
  return VIGNETTE_BASE + (VIGNETTE_PEAK - VIGNETTE_BASE) * clamp01(Math.max(darken, 0) / VIGNETTE_FULL_AT);
}

/** グレインの濃さ。控えめモードでは出さない。 */
export function grainOpacity(calm: boolean) { return calm ? 0 : GRAIN_OPACITY; }

/** 背景の彩度。1に近ければ指定しない（filterを空にする）。 */
export function saturateFilter(saturate: number) {
  const v = Math.max(0, Math.min(saturate, 2));
  return v > .995 ? '' : `saturate(${v.toFixed(3)})`;
}

/** 書き換えが要るかどうか。見た目に出ない差なら書き換えない。 */
export function shouldWrite(prev: number | null, next: number) {
  return prev === null || Math.abs(prev - next) >= .002;
}

/** 透明度の文字。無駄な桁を持たせない。 */
export function opacityText(v: number) { return (Math.round(v * 1000) / 1000).toString(); }

/** 小さなノイズ画像を作ってdata URLにする。起動時に一度だけ呼ぶ。 */
function makeNoiseUrl(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return '';
  const image = c.createImageData(size, size), data = image.data;
  // overlay合成では128が「何もしない」灰色。そこから少しだけ上下させる。
  let seed = 1103515245;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = 128 + ((seed >>> 16) % 51) - 25;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

type Layers = { world: HTMLElement };
/** 画面に今出している透明度。まだ一度も書いていないものは null。 */
type Shown = { flash: number | null; vignette: number | null; grain: number | null; black: number | null };

export class ScreenOverlay {
  private flash: HTMLDivElement;
  private vignette: HTMLDivElement;
  private grain: HTMLDivElement;
  private black: HTMLDivElement;
  private memory = newFlashMemory();
  private shown: Shown = { flash: null, vignette: null, grain: null, black: null };
  private core = '';
  private filter = '';
  private last = -1;

  constructor(root: HTMLElement, private layers: Layers) {
    const make = (cls: string) => { const d = document.createElement('div'); d.className = `fx ${cls}`; d.setAttribute('aria-hidden', 'true'); return d; };
    this.black = make('fx-black');
    this.vignette = make('fx-vignette');
    this.grain = make('fx-grain');
    this.flash = make('fx-flash');
    const url = makeNoiseUrl();
    if (url) this.grain.style.backgroundImage = `url(${url})`;
    // 演出canvasより上、HUDや見出しより下に入れる。
    const before = root.querySelector('header');
    for (const layer of [this.black, this.vignette, this.grain, this.flash]) root.insertBefore(layer, before);
    this.write();
  }

  /** 毎コマ呼ぶ。palette は今の属性の色。calm は控えめモード。 */
  update(state: ScreenState, palette: Palette, calm: boolean) {
    const now = performance.now() / 1000, dt = this.last < 0 ? 0 : now - this.last;
    this.last = now;
    if (palette.core !== this.core) { this.core = palette.core; this.flash.style.setProperty('--fx-core', `${palette.core}80`); }
    this.value('flash', this.flash, stepFlash(this.memory, state.flash, calm, dt, now));
    this.value('vignette', this.vignette, vignetteOpacity(state.darken, calm));
    this.value('grain', this.grain, grainOpacity(calm));
    this.value('black', this.black, clamp01(state.blackout));
    this.saturate(state.saturate);
  }

  private write() { this.grain.style.opacity = opacityText(GRAIN_OPACITY); this.shown.grain = GRAIN_OPACITY; }

  private value(key: keyof Shown, node: HTMLDivElement, next: number) {
    if (!shouldWrite(this.shown[key], next)) return;
    this.shown[key] = next; node.style.opacity = opacityText(next);
  }

  /** 背景の彩度。終了時のぼかしがかかっている間は上書きしない。 */
  private saturate(value: number) {
    const world = this.layers.world;
    const next = world.classList.contains('spell-finished') ? '' : saturateFilter(value);
    if (next === this.filter) return;
    this.filter = next; world.style.filter = next;
  }

  dispose() {
    for (const layer of [this.black, this.vignette, this.grain, this.flash]) layer.remove();
    if (this.filter) { this.layers.world.style.filter = ''; this.filter = ''; }
  }
}
