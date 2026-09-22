import type { InheritedNode } from '../game/voice-growth';
import { drawVoiceGrowth } from './effects/voice-growth';
import { FLOW } from '../game/rounds';
import { clamp, getNodes } from '../game/motion';
import type { Point, Recipe, Element } from '../game/types';
import { fitSpell, smoothStroke } from './spell-layout';
import { getPreset, intensityOf, type EffectPreset } from './effects/presets';
import { GlowSprites } from './effects/sprites';
import { ParticlePool } from './effects/particles';
import { screenState, effectTime, hitStopOf, type ScreenState } from './effects/screen';
import { drawParticles, type Box, type Frame, type XY } from './effects/frame';
import { drawCharge } from './effects/charge';
import { drawRelease, drawTravel } from './effects/release';
import { drawImpact } from './effects/impact';
import { drawWordReactions } from './effects/words';
import { drawStrokeReactions, newStrokeMemory, type StrokeMemory } from './effects/strokes';
import { drawGuard } from './effects/guard';
import { drawFinish, finishBoost, holdTime, FINISH_SETTLE } from './effects/finish';
import { emptyLive, type LiveInput } from '../game/live-input';
import { AIM, type GuardPlan } from '../game/guard';
import { BEATS, beatAt, type Beat } from '../game/rounds';

/** 属性ごとの主色。術式の線と結果の縮小図が使う。 */
export const colors: Record<Element, string> = Object.fromEntries(Object.entries(getPreset(null).palettes).map(([k, v]) => [k, v.main])) as Record<Element, string>;
/** canvas内の色ずれを出す長さ（秒）。命中からこの時間だけ。 */
const CHROMATIC_WINDOW = .2;
/**
 * とどめの余韻で粒と術式が消えきる時刻を、余韻の始まりから何秒後にするか（秒）。
 * 回の表の「余韻の始まり」から「回の終わり」までの長さで、世界の時刻で90.0秒に0になる。
 * 術式の光が抜けきる長さ（FINISH_SETTLE）と同じ値を使う。二か所で別々に書かない。
 */
const FINISH_FADE_TAIL = FINISH_SETTLE.seconds;
/** 余韻の濃さが0へ落ちきる時刻（秒）。一回目と防御は命中の4.5秒後（実際）、とどめは回の終わり（世界）。 */
export const afterglowEnd = (beat: Beat) => beat.finish ? beat.handoff + FINISH_FADE_TAIL : beat.impact + 4.5;
/**
 * 粒と術式の消え際の濃さ（0〜1）。落ちきる2秒前から下がる。
 * t は実際の時刻、te は世界の時刻。とどめだけ世界の時刻で数えるので、スローの分だけ長く残る。
 */
export function afterglowFade(t: number, te: number, beat: Beat) {
  const end = afterglowEnd(beat);
  return 1 - clamp(((beat.finish ? te : t) - (end - 2)) / 2);
}
/**
 * 演出を描くのをやめる実際の時刻（秒）。ここを過ぎたら粒も術式も消す。
 * とどめだけは、余韻を回の終わり（実際の90.0秒）まで残して、結果画面へそのまま渡す。
 * 世界の時計は命中のゆがみのぶんだけ遅れているので、切り替わる瞬間もまだ光がわずかに残る。
 * 動かない絵のまま結果画面を待つ間を作らないため、ここは短くしない。
 */
export const stopAtOf = (beat: Beat) => beat.finish ? beat.end : Math.max(beat.end - .5, beat.impact + 4.5);
/**
 * 粒の乱数の種。作り始めと作り直しで同じ値にして、1回目と2回目の散り方をそろえる。
 * 放出と命中では、その先頭のコマで種を戻す。コマ落ちして乱数の使う順が変わっても、同じ入力なら同じ火花になる。
 */
const POOL_SEED = 7, RELEASE_SEED = 1013, IMPACT_SEED = 2027;
/**
 * 表示している術式の範囲（画素）。点が無いときは中心のまわりの小さな箱。
 * 弾の出どころの散らばりや、光線の太さ、床の明るさの広さに使う。
 */
export function spellExtent(points: readonly Point[], w: number, h: number, center: XY): Box {
  if (!points.length) return { x: center.x - 60, y: center.y - 30, width: 120, height: 60 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { const x = p.x * w, y = p.y * h; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
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
  /** 描く動きへの反応の覚え書き。画面ごとに持ち、作り直しで消す。 */
  private strokeMemory: StrokeMemory = newStrokeMemory();
  /** 背景を暗くする放射グラデーションの作り置きと、その中心と広がり。 */
  private darkGradient: CanvasGradient | null = null;
  private darkKey = '';
  private lastRaw = -1; private lastEffect = -1; private lastEffectMs = 0;
  private state: ScreenState = still;
  /** 控えめモード。揺れと閃光と停止を抑える。 */
  calm = false;
  /** 合成（後処理）が動いているか。動いている間はcanvas内の色ずれを飛ばす。 */
  private compositeActive = false;
  preset: EffectPreset;
  constructor(readonly canvas: HTMLCanvasElement, preset?: EffectPreset | string | null) {
    this.ctx = canvas.getContext('2d')!;
    this.preset = typeof preset === 'string' || preset == null ? getPreset(preset) : preset;
    this.pool = new ParticlePool(this.preset.maxParticles);
    this.pool.reseed(POOL_SEED);
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
  effectMsOf(ms: number, recipe: Recipe | null, amount = 0, beat: Beat = BEATS[0]) {
    const t = ms / 1000;
    // とどめの発動前の「間」は、騎士も術式も体力も同じ時刻で止める。演出だけを止めると騎士が動いてしまう。
    const held = holdTime(t, beat);
    if (held !== null) return held * 1000;
    if (t < beat.release) return ms;
    return effectTime(t, hitStopOf(this.preset, intensityOf(recipe, this.preset, amount), this.calm, beat), beat) * 1000;
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
  /** とどめで単発として描くためのレシピ。もとのレシピが変わるまで作り直さない。 */
  private single: { from: Recipe; one: Recipe } | null = null;
  private singleShot(recipe: Recipe) {
    if (this.single?.from !== recipe) this.single = { from: recipe, one: { ...recipe, count: 1 } };
    return this.single.one;
  }
  private reset() { this.pool.clear(); this.pool.reseed(POOL_SEED); this.strokeMemory = newStrokeMemory(); this.fired.clear(); this.lastRaw = -1; this.lastEffect = -1; this.lastEffectMs = 0; this.state = still; }

  /** 一コマ分の演出。時刻と確定した内容だけで決まるようにしてある。 */
  renderEffects(input: {
    points: Point[]; ms: number; recipe: Recipe | null; voice: number; cursors: XY[]; ready: boolean;
    target: XY; origin: XY; live?: LiveInput; beat?: Beat; guard?: GuardPlan | null; inherited?: InheritedNode[];
  }) {
    const { points, ms, recipe, voice, ready, target, origin } = input;
    const live = input.live ?? emptyLive, guard = input.guard ?? null, inherited = input.inherited ?? [];
    const c = this.ctx, w = this.width, h = this.height, t = ms / 1000;
    const beat = input.beat ?? beatAt(t);
    const drawEnd=beat.drawEnd??beat.inputEnd,cursors=t<drawEnd?input.cursors:[];
    c.clearRect(0, 0, w, h);
    // 余韻（命中から4.5秒）が消えきるまでは切らない。一回目は回の終わりの0.5秒前（29.5秒）で変わらない。
    const stopAt = stopAtOf(beat);
    if (ready || t >= stopAt) { if (this.fired.size || this.pool.count) this.reset(); this.state = still; return; }
    // 時刻が戻ったら（確認画面のつまみなど）粒と一度きりの発生をやり直す。
    if (t < this.lastRaw - .05) this.reset();
    this.lastRaw = t;
    const preset = this.preset, palette = preset.palettes[recipe?.element ?? 'neutral'], intensity = intensityOf(recipe, preset, live.amount), accent = recipe?.accent ? preset.palettes[recipe.accent] : null;
    // 入力の量は派手さ（intensityOf）の中だけで効かせる。画面の効果には派手さだけを渡す。
    this.state = screenState(t, intensity, preset, recipe?.purpose ?? null, 0, 0, this.calm, beat);
    // とどめの回は、発動の0.4秒前から0.32秒だけ「描く値」を止める。世界の時計は進めたまま、見た目だけそのままにする。
    const held = holdTime(t, beat);
    const te = held ?? effectTime(t, this.state.hitStop, beat), dt = this.lastEffect < 0 ? 0 : clamp(te - this.lastEffect, 0, .05);
    this.lastEffect = te; this.lastEffectMs = te * 1000;
    // 放出直前の暗転の間は、粒も光も見せない。
    const lit = 1 - this.state.blackout;
    const fade = afterglowFade(t, te, beat) * lit, hit = { x: target.x * w, y: target.y * h };

    // 揺れ、傾き、寄りをまとめて演出の面にもかける。中心を軸に回して拡大する。
    c.save();
    c.translate(w / 2 + this.state.shakeX, h / 2 + this.state.shakeY);
    if (this.state.rotate) c.rotate(this.state.rotate * Math.PI / 180);
    if (this.state.zoom !== 1) c.scale(this.state.zoom, this.state.zoom);
    c.translate(-w / 2, -h / 2);
    // 背景を暗くする。術式の周りは明るいまま残す。濃さは毎コマ変わるので、色は固定にして globalAlpha で掛ける。
    if (this.state.darken > .003) {
      c.globalAlpha = lit * this.state.darken;
      c.fillStyle = this.darkenGradient(origin.x, origin.y, Math.max(w, h) * .8);
      c.fillRect(-40, -40, w + 80, h + 80);
    }
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    const nodes = getNodes(points, 5);
    // 描いている間の光。線の節が光り、光が線の上を巡る。声で大きくなる。
    if (t >= beat.build && t < beat.release) {
      for (const p of nodes) this.sprites.draw(c, p.x * w, p.y * h, 2 + voice * 3, palette.core, palette.main, .5);
      const runners = t >= drawEnd ? 14 : 8;
      for (let i = 0; i < Math.min(runners, points.length); i++) {
        const index = Math.floor(((t * .16 + i / runners) % 1) * points.length), p = points[index];
        this.sprites.draw(c, p.x * w, p.y * h, 1.8, palette.core, palette.main, .7);
      }
    }
    if (t >= beat.inputEnd && t < beat.release) {
      // 線の節から中心へ光が流れ込む。
      const charge = clamp((t - beat.inputEnd) / (beat.release - beat.inputEnd));
      for (let i = 0; i < nodes.length; i++) {
        const p = (t * (.8 + charge * .6) + i / nodes.length) % 1, a = nodes[i];
        this.sprites.draw(c, a.x * w + (origin.x - a.x * w) * p, a.y * h + (origin.y - a.y * h) * p, 2, palette.core, palette.main, p * .7);
      }
    }
    if (t < drawEnd) for (const p of cursors) {
      this.sprites.draw(c, p.x * w, p.y * h, 4 + voice * 2, palette.core, palette.main, 1);
      // 手の跡に小さな光を残す。
      if (dt > 0 && this.pool.random() < .6) this.pool.spawn({ x: p.x * w, y: p.y * h, vx: (this.pool.random() - .5) * 20, vy: -10 - this.pool.random() * 20, life: .5 + this.pool.random() * .5, size: 1 + this.pool.random() * 1.2, drag: .5, color: palette.main, core: palette.core, kind: 0 });
    }
    // 弾の出どころと術式の範囲。表示している点列（画素）から作る。点が無ければ中心だけ。
    const launch = getNodes(points, 12).map(p => ({ x: p.x * w, y: p.y * h }));
    const origins: XY[] = [origin, ...launch];
    const extent = spellExtent(points, w, h, origin);
    const frame: Frame = { c, w, h, t: te, dt, sprites: this.sprites, pool: this.pool, preset, palette, intensity, recipe: recipe ?? pending, locked: !!recipe, origin, origins, extent, target: hit, accent, live, points, cursors,
      beat, guard, aim: AIM, inherited, calm: this.calm,
      once: (key, run) => { if (!this.fired.has(key)) { this.fired.add(key); run(); } } };
    // 放出と命中に入る先頭のコマで、粒の乱数の種を戻す。コマ落ちしても同じ火花になる。
    if (te >= beat.release) frame.once('seed-release', () => this.pool.reseed(RELEASE_SEED));
    if (te >= beat.impact) frame.once('seed-impact', () => this.pool.reseed(IMPACT_SEED));
    c.globalAlpha = fade;
    // 描いている間の即時反応。動きと言葉に、その場で光が応える。save と restore で濃さと重ね方は元に戻る。
    if (t < beat.release) { c.save(); drawStrokeReactions(frame, this.strokeMemory); drawWordReactions(frame); c.restore(); }
    if(FLOW==='sequential'&&!beat.defend){c.save();drawVoiceGrowth(frame);c.restore();}
    // 防御の回は、狙いの印と盾と敵の一撃。魔法が確定する前から印を出す。
    if (beat.defend) { c.save(); drawGuard(frame); c.restore(); }
    if (recipe) {
      drawCharge(frame);
      if (!beat.defend && te >= beat.release) {
        c.save(); drawRelease(frame); drawTravel(frame, beat.finish ? finishBoost(frame) : undefined);
        // とどめの回は当たる時刻を4回に固定して finish.ts が受け持つので、もとの命中は単発として一度だけ出す。
        // 毎コマ作り直さないよう、単発のレシピは作り置きし、frame のレシピを一時的に差し替えて戻す。
        if (beat.finish && frame.recipe.count > 1) {
          const all = frame.recipe;
          frame.recipe = this.singleShot(all); drawImpact(frame); frame.recipe = all;
        } else drawImpact(frame);
        c.restore();
      }
      c.globalCompositeOperation = 'lighter';
    } else if (t >= beat.inputEnd) {
      // 魔法が未確定でも蓄積の光は見せる。無属性の色で中心だけ。
      const charge = clamp((t - beat.inputEnd) / (beat.release - beat.inputEnd));
      this.sprites.draw(c, origin.x, origin.y, 5 + charge * 11, palette.core, palette.main, .4 + charge * .3);
    }
    // とどめの回だけの見せ方。引き継いだ光点は魔法が決まる前から出すので、確定の有無によらず呼ぶ。
    if (beat.finish) { c.save(); drawFinish(frame); c.restore(); }
    this.pool.update(dt);
    drawParticles(frame, fade);
    c.restore();
    // 色のずれ。命中の直後だけ、自分の絵を左右にずらして薄く重ねる。
    // 合成が動いている間は後処理側に任せて飛ばす。合成なしでも命中から CHROMATIC_WINDOW 秒だけに絞る。
    if (!this.compositeActive && this.state.chromatic >= .5 && t >= beat.impact && t - beat.impact <= CHROMATIC_WINDOW) {
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

  /**
   * 背景を暗くする放射グラデーション。中心と広がりが同じ間は作り直さない。
   * 色は一番濃い状態で持ち、そのコマの濃さは globalAlpha で掛ける。
   */
  private darkenGradient(x: number, y: number, radius: number) {
    const key = `${x}|${y}|${radius}`;
    if (!this.darkGradient || this.darkKey !== key) {
      const g = this.ctx.createRadialGradient(x, y, 40, x, y, radius);
      g.addColorStop(0, 'rgba(4,6,14,0)'); g.addColorStop(1, 'rgba(4,6,14,1)');
      this.darkGradient = g; this.darkKey = key;
    }
    return this.darkGradient;
  }

  /** 声だけの回は、土台の円と残った属性の色を描く。 */
  voiceThumbnail(elements: readonly Element[]) {
    this.resize();const c=this.ctx,w=this.width,h=this.height,r=Math.min(w,h)*.3;
    c.clearRect(0,0,w,h);c.save();c.globalCompositeOperation='lighter';
    c.strokeStyle=colors[elements[0]??'neutral'];c.lineWidth=2;c.beginPath();c.ellipse(w/2,h/2,r,r*.7,0,0,Math.PI*2);c.stroke();
    elements.forEach((element,i)=>{const a=i*2.4,p=this.preset.palettes[element];this.sprites.draw(c,w/2+Math.cos(a)*r,h/2+Math.sin(a)*r*.7,5,p.core,p.main,.85);});
    c.restore();
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
