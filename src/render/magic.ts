import { clamp, getNodes } from '../game/motion';
import type { Point, Recipe, Element } from '../game/types';
import { fitSpell, smoothStroke } from './spell-layout';
import { getPreset, intensityOf, type EffectPreset } from './effects/presets';
import { GlowSprites } from './effects/sprites';
import { ParticlePool } from './effects/particles';
import { screenState, effectTime, hitStopOf, RELEASE_AT, IMPACT_AT, type ScreenState } from './effects/screen';
import { drawParticles, type Frame, type XY } from './effects/frame';
import { drawCharge } from './effects/charge';
import { drawRelease, drawTravel } from './effects/release';
import { drawImpact } from './effects/impact';
import { drawWordReactions } from './effects/words';
import { drawStrokeReactions } from './effects/strokes';
import { emptyLive, type LiveInput } from '../game/live-input';

/** 属性ごとの主色。術式の線と結果の縮小図が使う。 */
export const colors: Record<Element, string> = Object.fromEntries(Object.entries(getPreset(null).palettes).map(([k, v]) => [k, v.main])) as Record<Element, string>;
/** canvas内の色ずれを出す長さ（秒）。命中からこの時間だけ。 */
const CHROMATIC_WINDOW = .2;
const still: ScreenState = { shakeX: 0, shakeY: 0, flash: 0, darken: 0, chromatic: 0, hitStop: 0, rotate: 0, zoom: 1, blackout: 0, saturate: 1 };
/** 魔法が確定する前に部品へ渡す仮のレシピ。無属性の球。 */
const pending: Recipe = { version: 'recipe-1', element: 'neutral', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .5, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null };

/**
 * 光、蓄積、放出、命中、余韻を一つの時刻で描く差配役。
 * 段階ごとの描き方は effects/ の部品、色と派手さは設定（preset）が持つ。
 */
export class MagicCanvas {
  private ctx: CanvasRenderingContext2D;
  private width = 0; private height = 0;
  private sprites = new GlowSprites();
  private pool: ParticlePool;
  private fired = new Set<string>();
  private lastRaw = -1; private lastEffect = -1; private lastEffectMs = 0;
  private state: ScreenState = still;
  /** 控えめモード。揺れと閃光と停止を抑える。 */
  calm = false;
  /** 合成（後処理）が動いているか。動いている間はcanvas内の色ずれを飛ばす。 */
  private compositeActive = false;
  /** 背景を暗くする放射グラデーション。中心と濃さと大きさが同じ間は作り直さない。 */
  private darkenGradient: { key: string; gradient: CanvasGradient } | null = null;
  preset: EffectPreset;
  constructor(readonly canvas: HTMLCanvasElement, preset?: EffectPreset | string | null) {
    this.ctx = canvas.getContext('2d')!;
    this.preset = typeof preset === 'string' || preset == null ? getPreset(preset) : preset;
    this.pool = new ParticlePool(this.preset.maxParticles);
    this.resize();
  }
  setPreset(preset: EffectPreset | string) {
    this.preset = typeof preset === 'string' ? getPreset(preset) : preset;
    if (this.pool.max !== this.preset.maxParticles) this.pool = new ParticlePool(this.preset.maxParticles);
    this.reset();
  }
  /** 画面全体にかかる効果。背景や騎士の層を揺らすために外から読む。 */
  get screen() { return this.state; }
  /** 今の演出の時刻（ms）。命中の停止を含む。騎士や術式もこの時刻を見る。 */
  get effectMs() { return this.lastEffectMs; }
  /** 与えた時刻から、停止を含んだ演出の時刻（ms）を出す。時刻だけで決まる純粋な計算。 */
  effectMsOf(ms: number, recipe: Recipe | null, amount = 0) {
    const t = ms / 1000;
    if (t < 17) return ms;
    return effectTime(t, hitStopOf(this.preset, intensityOf(recipe, this.preset, amount), this.calm)) * 1000;
  }
  setCalm(calm: boolean) { this.calm = calm; }
  /**
   * 合成の後処理が動いているかを知らせる。true の間は、この canvas の中では色をずらさない。
   * 後処理側にも色収差があり、二重にかかると輪郭が濁るため。合成を使わない時は false を渡す。
   */
  setCompositeActive(active: boolean) { this.compositeActive = active; }
  get particleCount() { return this.pool.count; }
  resize() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 1.5);
    this.width = rect.width; this.height = rect.height; this.canvas.width = rect.width * dpr; this.canvas.height = rect.height * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  private reset() { this.pool.clear(); this.pool.reseed(7); this.fired.clear(); this.lastRaw = -1; this.lastEffect = -1; this.lastEffectMs = 0; this.state = still; }

  renderEffects(points: Point[], ms: number, recipe: Recipe | null, voice: number, cursors: XY[], ready: boolean, target: XY, origin: XY, live: LiveInput = emptyLive) {
    const c = this.ctx, w = this.width, h = this.height, t = ms / 1000;
    c.clearRect(0, 0, w, h);
    if (ready || t >= 23.5) { if (this.fired.size || this.pool.count) this.reset(); this.state = still; return; }
    // 時刻が戻ったら（確認画面のつまみなど）粒と一度きりの発生をやり直す。
    if (t < this.lastRaw - .05) this.reset();
    this.lastRaw = t;
    const preset = this.preset, palette = preset.palettes[recipe?.element ?? 'neutral'], intensity = intensityOf(recipe, preset, live.amount), accent = recipe?.accent ? preset.palettes[recipe.accent] : null;
    // 入力の量は派手さ（intensityOf）の中だけで効かせる。画面の効果には派手さだけを渡す。
    this.state = screenState(t, intensity, preset, recipe?.purpose ?? null, 0, 0, this.calm);
    const te = effectTime(t, this.state.hitStop), dt = this.lastEffect < 0 ? 0 : clamp(te - this.lastEffect, 0, .05);
    this.lastEffect = te; this.lastEffectMs = te * 1000;
    // 放出直前の暗転の間は、粒も光も見せない。
    const lit = 1 - this.state.blackout;
    const fade = (1 - clamp((t - 21) / 2)) * lit, hit = { x: target.x * w, y: target.y * h };

    // 揺れ、傾き、寄りをまとめて演出の面にもかける。中心を軸に回して拡大する。
    c.save();
    c.translate(w / 2 + this.state.shakeX, h / 2 + this.state.shakeY);
    if (this.state.rotate) c.rotate(this.state.rotate * Math.PI / 180);
    if (this.state.zoom !== 1) c.scale(this.state.zoom, this.state.zoom);
    c.translate(-w / 2, -h / 2);
    c.globalAlpha = lit;
    // 背景を暗くする。術式の周りは明るいまま残す。
    if (this.state.darken > .003) {
      const darken = Math.round(this.state.darken * 100) / 100, key = `${Math.round(origin.x)}:${Math.round(origin.y)}:${darken}:${w}:${h}`;
      if (this.darkenGradient?.key !== key) {
        const g = c.createRadialGradient(origin.x, origin.y, 40, origin.x, origin.y, Math.max(w, h) * .8);
        g.addColorStop(0, 'rgba(4,6,14,0)'); g.addColorStop(1, `rgba(4,6,14,${darken})`);
        this.darkenGradient = { key, gradient: g };
      }
      c.fillStyle = this.darkenGradient.gradient; c.fillRect(-40, -40, w + 80, h + 80);
    }
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    const nodes = getNodes(points, 5);
    // 描いている間の光。線の節が光り、光が線の上を巡る。声で大きくなる。
    if (t >= 6 && t < 17) {
      for (const p of nodes) this.sprites.draw(c, p.x * w, p.y * h, 2 + voice * 3, palette.core, palette.main, .5);
      const runners = t >= 14 ? 14 : 8;
      for (let i = 0; i < Math.min(runners, points.length); i++) {
        const index = Math.floor(((t * .16 + i / runners) % 1) * points.length), p = points[index];
        this.sprites.draw(c, p.x * w, p.y * h, 1.8, palette.core, palette.main, .7);
      }
    }
    if (t >= 14 && t < 17) {
      // 線の節から中心へ光が流れ込む。
      const charge = clamp((t - 14) / 3);
      for (let i = 0; i < nodes.length; i++) {
        const p = (t * (.8 + charge * .6) + i / nodes.length) % 1, a = nodes[i];
        this.sprites.draw(c, a.x * w + (origin.x - a.x * w) * p, a.y * h + (origin.y - a.y * h) * p, 2, palette.core, palette.main, p * .7);
      }
    }
    if (t < 14) for (const p of cursors) {
      this.sprites.draw(c, p.x * w, p.y * h, 4 + voice * 2, palette.core, palette.main, 1);
      // 手の跡に小さな光を残す。
      if (dt > 0 && this.pool.random() < .6) this.pool.spawn({ x: p.x * w, y: p.y * h, vx: (this.pool.random() - .5) * 20, vy: -10 - this.pool.random() * 20, life: .5 + this.pool.random() * .5, size: 1 + this.pool.random() * 1.2, drag: .5, color: palette.main, core: palette.core, kind: 0 });
    }
    const frame: Frame = { c, w, h, t: te, dt, sprites: this.sprites, pool: this.pool, preset, palette, intensity, recipe: recipe ?? pending, locked: !!recipe, origin, target: hit, accent, live, points, cursors, calm: this.calm,
      once: (key, run) => { if (!this.fired.has(key)) { this.fired.add(key); run(); } } };
    c.globalAlpha = fade;
    // 描いている間の即時反応。動きと言葉に、その場で光が応える。
    if (t < 17) { c.save(); drawStrokeReactions(frame); drawWordReactions(frame); c.restore(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fade; }
    if (recipe) {
      drawCharge(frame);
      if (te >= RELEASE_AT) { c.save(); drawRelease(frame); drawTravel(frame); drawImpact(frame); c.restore(); }
      c.globalCompositeOperation = 'lighter';
    } else if (t >= 14) {
      // 魔法が未確定でも蓄積の光は見せる。無属性の色で中心だけ。
      const charge = clamp((t - 14) / 3);
      this.sprites.draw(c, origin.x, origin.y, 5 + charge * 11, palette.core, palette.main, .4 + charge * .3);
    }
    this.pool.update(dt);
    drawParticles({ c, sprites: this.sprites, pool: this.pool, preset, palette, calm: this.calm } as Frame, fade);
    c.restore();
    // 色のずれ。命中の直後だけ、自分の絵を左右にずらして薄く重ねる。
    // 合成が動いている間は後処理側に任せて飛ばす。合成なしでも命中から CHROMATIC_WINDOW 秒だけに絞る。
    if (!this.compositeActive && this.state.chromatic >= .5 && t >= IMPACT_AT && t - IMPACT_AT <= CHROMATIC_WINDOW) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .28;
      const d = this.state.chromatic, cw = this.canvas.width, ch = this.canvas.height;
      c.drawImage(this.canvas, 0, 0, cw, ch, -d, 0, w, h); c.drawImage(this.canvas, 0, 0, cw, ch, d, 0, w, h); c.restore();
    }
    // 放出直前の暗転。部品が自分で濃さを決めても消えるように、最後に演出の面ごと削る。
    if (this.state.blackout > 0) {
      c.save(); c.globalCompositeOperation = 'destination-out';
      c.fillStyle = `rgba(0,0,0,${clamp(this.state.blackout)})`; c.fillRect(0, 0, w, h); c.restore();
    }
    // 閃光と暗転の全画面の塗りは、HTMLの層（src/render/overlay.ts）が担当する。
  }

  /** 結果の枠に、本人の線を縮めて描く。 */
  thumbnail(points: Point[], color: string, source: { width: number; height: number }) {
    this.resize(); const c = this.ctx, w = this.width, h = this.height;
    c.clearRect(0, 0, w, h); c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = color; c.lineWidth = 1.1;
    const normalized = points.map(p => ({ ...p, x: p.x * source.width / w, y: p.y * source.height / h }));
    const shape = fitSpell(normalized, w, h, { x: w / 2, y: h / 2, width: w * .7, height: h * .7 });
    const strokes = new Map<number, Point[]>(); for (const p of shape) { const group = strokes.get(p.stroke) ?? []; group.push(p); strokes.set(p.stroke, group); }
    c.beginPath();
    for (const stroke of strokes.values()) { smoothStroke(stroke).forEach((p, i) => { if (!i) c.moveTo(p.x * w, p.y * h); else c.lineTo(p.x * w, p.y * h); }); }
    c.globalAlpha = .4; c.lineWidth = 6; c.stroke(); c.globalAlpha = 1; c.lineWidth = 2; c.stroke();
    for (const p of getNodes(shape, 5)) this.sprites.draw(c, p.x * w, p.y * h, 2.5, '#fff8e9', color, .9);
    this.sprites.draw(c, w / 2, h / 2, 5, '#fff8e9', color, .9); c.restore();
  }
}
