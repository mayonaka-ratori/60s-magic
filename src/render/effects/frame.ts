import type { Recipe } from '../../game/types';
import type { EffectPreset, Palette } from './presets';
import type { GlowSprites } from './sprites';
import type { ParticlePool } from './particles';
import type { LiveInput } from '../../game/live-input';
import type { InheritedNode } from '../../game/voice-growth';
import type { Point } from '../../game/types';
import type { Beat } from '../../game/rounds';
import type { GuardPlan, XY as AimPoint } from '../../game/guard';
import { blendOf } from '../../game/recipe';
import { mixHue, lighten } from './presets';

/** 火花の線（線の粒）の長さ（画素）。止まっていてもこの長さはあり、速さに比例して伸びる。 */
const SPARK_LENGTH_BASE = 2, SPARK_LENGTH_PER_SPEED = .03;
/** 火花の線の長さの上限（画素）。速い粒でもこれより長くは伸ばさない。 */
export const SPARK_MAX_LENGTH = 18;

export type XY = { x: number; y: number };
/** 画面の上の四角（画素）。左上の位置と大きさ。 */
export type Box = { x: number; y: number; width: number; height: number };
/** 各部品が受け取る、そのコマの道具と値。部品は属性名ではなく色と派手さだけを見る。 */
export type Frame = {
  c: CanvasRenderingContext2D; w: number; h: number;
  /** 演出の時刻（秒）。命中の停止を含む */
  t: number;
  /** 前のコマからの経過（秒） */
  dt: number;
  sprites: GlowSprites; pool: ParticlePool; preset: EffectPreset; palette: Palette; intensity: number;
  /** 確定した魔法。未確定の間は無属性の仮の値 */
  recipe: Recipe; locked: boolean; origin: XY; target: XY;
  /**
   * 弾の出どころ（画素）。術式の光点で、最初の一つは中心。
   * 無いときは origin だけとみなす（originsOf を通して読む）。
   */
  origins?: XY[];
  /** 表示している術式の範囲（画素）。無いときは中心のまわりの小さな箱とみなす（extentOf を通して読む）。 */
  extent?: Box;
  /** 二つ目の属性の色。なければ null */
  accent: Palette | null;
  /** いまの入力（言葉、量、声）と、表示用の点列、手の位置 */
  live: LiveInput; points: Point[]; cursors: XY[];
  /** この回の時刻の表（秒）。部品はここからの相対で描き、秒数を埋め込まない */
  beat: Beat;
  /** 防御の回で確定した盾と止め方。確定前と他の回は null */
  guard: GuardPlan | null;
  /** 狙いの印の位置（正規化）。防御の回だけ使う */
  aim: AimPoint;
  /** 前の回から引き継いだ光点（正規化）。防御の回の間ずっと薄く残す */
  inherited: InheritedNode[];
  /** 一度だけ実行する。粒の発生などに使う */
  once: (key: string, run: () => void) => void;
  /** 控えめモード。粒と火花を3分の1にし、脈動をゆっくりにする */
  calm: boolean;
};

/** 弾の出どころ。術式の光点があればそれを、無ければ中心だけを返す。最初の一つはいつも中心。 */
export function originsOf(f: Frame): XY[] { return f.origins && f.origins.length ? f.origins : [f.origin]; }
/** 表示している術式の範囲。点が無いときは中心のまわりの小さな箱。 */
export function extentOf(f: Frame): Box { return f.extent ?? { x: f.origin.x - 60, y: f.origin.y - 30, width: 120, height: 60 }; }
/** 控えめモードのときだけ数を3分の1にする。粒や火花の個数の式に掛けて使う。 */
export function few(f: Frame, n: number) { return f.calm ? n / 3 : n; }
/** 控えめモードのときだけ脈動の速さを半分にする。 */
export function slow(f: Frame, speed: number) { return f.calm ? speed / 2 : speed; }

/** 同じ番号と種で同じ値を返す、0〜1の決まった乱数。 */
export function noise(i: number, seed = 0) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
/**
 * 二属性の合わせ方と、それに応じた色。
 * 増幅は主属性の色のまま明るくし、爆発は二色の色相の中間色を使い、持続は二色を交互に出す。
 */
export function mixOf(f: Frame) {
  const r = f.recipe;
  const blend = !f.accent || !r.accent ? null : (r.blend ?? blendOf(r.element, r.accent));
  return {
    blend,
    /** 交互に使う二色目。持続型のときだけ入る */
    alt: blend === 'sustain' ? f.accent : null,
    /** 明るさの倍率。増幅型だけ1.5倍 */
    boost: blend === 'amplify' ? 1.5 : 1,
    /** 本体に使う色。増幅型は主属性の色のまま明るさを1.5倍にし、火花を白くする */
    pal: blend === 'amplify' ? { ...f.palette, main: lighten(f.palette.main, 1.5), spark: '#ffffff' } : f.palette,
    /** 爆発型の中間色。ほかの型では null */
    mid: blend === 'burst' && f.accent ? mixHue(f.palette.main, f.accent.main) : null,
  };
}

export const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
export const smooth = (x: number) => { const p = Math.min(1, Math.max(0, x)); return p * p * (3 - 2 * p); };

export function glow(f: Frame, x: number, y: number, r: number, alpha: number, main = f.palette.main, core = f.palette.core) {
  f.sprites.draw(f.c, x, y, r * f.preset.glowScale, core, main, alpha);
}
/** 直線を引く。coreWidth が0なら一本だけ、0より大きいと縁と芯の二重にする。coreColor で芯の色を替えられる。 */
export function line(f: Frame, a: XY, b: XY, width: number, alpha: number, color = f.palette.main, coreWidth = width * .3, coreColor = f.palette.core) {
  const c = f.c; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
  // 芯を持つ線は、外側のにじみ、属性色の縁、白い芯の順に重ねる。芯なしの指定（coreWidth=0）は今までどおり一本だけ。
  if (coreWidth > 0) { c.globalAlpha = alpha * .3; c.lineWidth = width * 2.1; c.strokeStyle = color; c.stroke(); }
  c.globalAlpha = alpha; c.lineWidth = width; c.strokeStyle = color; c.stroke();
  if (coreWidth > 0) { c.lineWidth = Math.max(1, coreWidth); c.strokeStyle = coreColor; c.stroke(); }
}
/** 同じ道筋を、属性色の縁と白い芯の二重で描く。path は道を組み立てるだけの関数。 */
export function edged(f: Frame, width: number, alpha: number, path: () => void, color = f.palette.main, core = f.palette.core) {
  const c = f.c; c.beginPath(); path();
  c.globalAlpha = alpha * .35; c.lineWidth = width * 2.2; c.strokeStyle = color; c.stroke();
  c.globalAlpha = alpha; c.lineWidth = width; c.strokeStyle = color; c.stroke();
  c.globalAlpha = alpha * .95; c.lineWidth = Math.max(.9, width * .38); c.strokeStyle = core; c.stroke();
}
/** 粒を描く。光の粒、線の火花、かけら、煙の4種類。 */
export function drawParticles(f: Frame, alphaScale = 1) {
  const c = f.c;
  // 煙だけは光を足す描き方では見えないので、先に普通の重ね方で描く。
  let smoke = false;
  for (const p of f.pool.items) if (p.alive && p.kind === 3) { smoke = true; break; }
  if (smoke) {
    const before = c.globalCompositeOperation;
    c.globalCompositeOperation = 'source-over';
    for (const p of f.pool.items) {
      if (!p.alive || p.kind !== 3) continue;
      const u = p.life / p.span, size = p.size * (1.6 - u);
      c.globalAlpha = Math.min(1, u * 1.4) * .26 * alphaScale; c.fillStyle = p.color;
      c.beginPath(); c.ellipse(p.x, p.y, size, size * .85, 0, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = before;
  }
  for (const p of f.pool.items) {
    if (!p.alive || p.kind === 3) continue;
    const u = p.life / p.span, alpha = Math.min(1, u * 1.6) * alphaScale;
    if (p.kind === 1) {
      // 速さに比例して伸ばし、上限で止める。向きは速度の向きのまま。
      const speed = Math.hypot(p.vx, p.vy);
      const len = Math.min(SPARK_MAX_LENGTH, speed * SPARK_LENGTH_PER_SPEED + SPARK_LENGTH_BASE);
      const nx = p.vx / (speed + 1e-6), ny = p.vy / (speed + 1e-6);
      c.globalAlpha = alpha; c.lineWidth = p.size; c.strokeStyle = u > .5 ? p.core : p.color;
      c.beginPath(); c.moveTo(p.x - nx * len, p.y - ny * len); c.lineTo(p.x, p.y); c.stroke();
    } else if (p.kind === 2) {
      c.globalAlpha = alpha; c.fillStyle = p.color;
      const s = p.size * (0.5 + u), a = p.seed * 6.28 + p.life * 5;
      c.beginPath(); c.moveTo(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s); c.lineTo(p.x + Math.cos(a + 2.1) * s * .6, p.y + Math.sin(a + 2.1) * s * .6); c.lineTo(p.x + Math.cos(a + 4.2) * s, p.y + Math.sin(a + 4.2) * s); c.closePath(); c.fill();
    } else f.sprites.draw(c, p.x, p.y, p.size * (0.4 + u * .6) * f.preset.glowScale, p.core, p.color, alpha);
  }
}
