import type { Element, Recipe } from '../../game/types';
import { clamp } from '../../game/motion';

/** 属性ごとの色。主色、縁の色、一番明るい芯、火花の色。 */
export type Palette = { main: string; edge: string; core: string; spark: string };

/** 見た目の設定。数値はすべて「派手さ0」のときの基準で、派手さに応じて increase() で増える。 */
export type EffectPreset = {
  name: string;
  label: string;
  /** 派手さの下駄。0〜3。レシピから出した値に足す。 */
  baseIntensity: number;
  palettes: Record<Element, Palette>;
  /** 光のにじみの大きさの倍率 */
  glowScale: number;
  /** 蓄積で中心へ吸い込まれる粒の数 */
  chargeParticles: number;
  /** 蓄積の魔法陣を出すか */
  magicCircle: boolean;
  /** 蓄積中に背景を暗くする最大の濃さ。0で暗くしない */
  darken: number;
  /** 放出と命中の閃光の最大の濃さ。0で閃光なし */
  flash: number;
  /** 放出の衝撃波の輪の本数 */
  releaseRings: number;
  /** 放出の放射状の線の本数 */
  radialLines: number;
  /** 画面の揺れの最大px。0で揺らさない */
  shake: number;
  /** 命中で動きを止める秒数 */
  hitStop: number;
  /** 命中で飛び散る粒の数 */
  impactParticles: number;
  /** 命中の輪の本数 */
  impactRings: number;
  /** 命中の亀裂の本数 */
  cracks: number;
  /** 飛翔の尾の長さ（秒） */
  trail: number;
  /** 余韻で落ちる粒の数 */
  afterglowParticles: number;
  /** 命中後の色のずれの最大px。0でなし */
  chromatic: number;
  /** 同時に描く粒の上限。負荷の安全弁。8連弾の命中で出る数（最大の設定で約1400個）を超える値にして、古い粒の横取りを防ぐ */
  maxParticles: number;
};

const palettes: Record<Element, Palette> = {
  fire: { main: '#ff6a1e', edge: '#7a1d00', core: '#fff1c4', spark: '#ffc36b' },
  ice: { main: '#5ecdff', edge: '#123f86', core: '#f2fbff', spark: '#bfefff' },
  lightning: { main: '#ffe45c', edge: '#4b27b5', core: '#ffffff', spark: '#fff8b0' },
  wind: { main: '#7ee3b6', edge: '#1d6b53', core: '#eafff5', spark: '#c9ffe8' },
  light: { main: '#ffe7a0', edge: '#ffab3d', core: '#ffffff', spark: '#fff6d6' },
  dark: { main: '#9b5cf0', edge: '#160426', core: '#e8c6ff', spark: '#c98cff' },
  neutral: { main: '#8fb6ff', edge: '#2b3f72', core: '#ffffff', spark: '#dbe8ff' },
};

const base: Omit<EffectPreset, 'name' | 'label' | 'baseIntensity'> = {
  palettes, glowScale: 1, chargeParticles: 60, magicCircle: true, darken: .35, flash: .55, releaseRings: 3, radialLines: 24,
  shake: 8, hitStop: .07, impactParticles: 120, impactRings: 3, cracks: 6, trail: .22, afterglowParticles: 50, chromatic: 3, maxParticles: 700,
};

export const presets: Record<string, EffectPreset> = {
  calm: { ...base, name: 'calm', label: '控えめ', baseIntensity: 0, glowScale: .85, chargeParticles: 24, magicCircle: false, darken: .12, flash: .2, releaseRings: 1, radialLines: 0,
    shake: 2, hitStop: 0, impactParticles: 40, impactRings: 1, cracks: 0, trail: .1, afterglowParticles: 16, chromatic: 0, maxParticles: 250 },
  vivid: { ...base, name: 'vivid', label: '派手', baseIntensity: 1.2, maxParticles: 900 },
  max: { ...base, name: 'max', label: '最大', baseIntensity: 2.4, glowScale: 1.3, chargeParticles: 140, darken: .6, flash: .85, releaseRings: 4, radialLines: 48,
    shake: 18, hitStop: .14, impactParticles: 220, impactRings: 5, cracks: 10, trail: .35, afterglowParticles: 120, chromatic: 6, maxParticles: 1500 },
};
export const defaultPresetName = 'vivid';
export function getPreset(name: string | null | undefined): EffectPreset { return presets[name ?? ''] ?? presets[defaultPresetName]; }

/** 派手さ。0〜3。レシピの個数、範囲、収束と設定の下駄、それに入力の量（省略可）から決める。 */
export function intensityOf(recipe: Recipe | null, preset: EffectPreset, amount = 0) {
  // 重ねて描き、重ねて唱えるほど派手になる。最大で+0.6。
  const fromInput = clamp(amount) * .6;
  if (!recipe) return clamp(preset.baseIntensity + fromInput, 0, 3);
  const fromRecipe = (recipe.count - 1) / 7 * .7 + recipe.area * .6 + recipe.concentration * .4 + (recipe.purpose === 'attack' ? .2 : 0);
  return clamp(preset.baseIntensity + fromRecipe + fromInput, 0, 3);
}
/** 派手さに応じて数を増やす。派手さ0で1倍、3で最大約2.5倍。 */
export const increase = (value: number, intensity: number, rate = .5) => value * (1 + intensity * rate);

export function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgba = (hex: string, alpha: number) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${clamp(alpha)})`; };

/** 明るさを上げる。増幅型（相反する二属性）で主色をそのまま明るくするのに使う。 */
export function lighten(hex: string, rate: number) {
  const { r, g, b } = hexToRgb(hex);
  const up = (v: number) => Math.round(Math.min(255, v * rate));
  return `#${[up(r), up(g), up(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
/** 色相だけを取り出す。0〜360。灰色に近いときは0を返す。 */
function hueOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
/**
 * 二色の中間色。赤と青を平均すると濁った紫になるので、色相の近い方の回り道で中間を取り、
 * 鮮やかさと明るさだけを平均する。爆発型（二属性の破裂）の色に使う。
 */
export function mixHue(a: string, b: string) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const ha = hueOf(ca.r, ca.g, ca.b), hb = hueOf(cb.r, cb.g, cb.b);
  let diff = hb - ha;
  if (diff > 180) diff -= 360; else if (diff < -180) diff += 360;
  const h = ((ha + diff / 2) % 360 + 360) % 360;
  const sl = (c: { r: number; g: number; b: number }) => {
    const max = Math.max(c.r, c.g, c.b) / 255, min = Math.min(c.r, c.g, c.b) / 255, l = (max + min) / 2, d = max - min;
    return { s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
  };
  const sa = sl(ca), sb = sl(cb), s = (sa.s + sb.s) / 2, l = (sa.l + sb.l) / 2;
  const cc = (1 - Math.abs(2 * l - 1)) * s, x = cc * (1 - Math.abs((h / 60) % 2 - 1)), m = l - cc / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, bb] = [[cc, x, 0], [x, cc, 0], [0, cc, x], [0, x, cc], [x, 0, cc], [cc, 0, x]][seg];
  return `#${[r, g, bb].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
