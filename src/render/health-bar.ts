import type { Recipe } from '../game/types';
import { hitDelay } from './effects/release';
import { FINAL_BLOW_MS as FINISH_BLOW_MS, FINISH_COLLAPSE_MS, FINISH_HIT_MS, ROUNDS } from '../game/rounds';

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 防御で一撃を受け止めきったときに減る量。止め方や入力では変わらない。 */
export const GUARD_DAMAGE=10;
/** 騎士がよろめいて体力が減る時刻（ms）。一撃が盾に当たってから2.1秒後。 */
export const GUARD_STEP_MS=ROUNDS[1].impact+2100;
/** とどめの一撃の時刻（ms）。ここで体力を直に0にする。回の表から作る。 */
export const FINAL_BLOW_MS=FINISH_BLOW_MS;
/** とどめの多段命中で減らす割合。そのとき残っている量の9割を4回に等分する。 */
export const FINISH_DAMAGE_RATIO=.9;
/** 体力の枠を消し始める時刻（ms、世界の時刻）。とどめの一撃の0.9秒後。騎士の崩れ落ちと同じ値を使う。 */
export const HEALTH_HIDE_MS=FINISH_COLLAPSE_MS;
/** 命中で減る量。派手さ（個数、範囲、収束）で20〜45%にする。 */
function damage(recipe: Recipe | null) {
  if (!recipe) return 24;
  const many = clamp((recipe.count - 1) / 5), wide = clamp((recipe.area - .2) / .8), focus = clamp(recipe.concentration);
  return 20 + (many * .45 + wide * .3 + focus * .25) * 25;
}

/** 体力が減る一段。at はその段が減り始める本編の時刻（ミリ秒）。 */
export type HealthStep = { at: number; from: number; left: number };

/**
 * 体力が減る段を作る。命中の18.5秒から、弾が届く時刻に合わせて一段ずつ減らす。
 * 段の時刻は弾と同じ `hitDelay` から作るので、最後の特大の1発でもきちんと減る。
 * 単発は18.5秒ちょうどの一段だけ。
 */
export function planHealthSteps(recipe: Recipe | null): HealthStep[] {
  const total = damage(recipe);
  const count = Math.max(1, Math.min(8, recipe && recipe.count > 1 ? recipe.count : 1));
  const steps: HealthStep[] = [];
  for (let i = 0; i < count; i++) {
    steps.push({ at: ROUNDS[0].impact + hitDelay(i, count) * 1000, from: 100 - total * i / count, left: 100 - total * (i + 1) / count });
  }
  return steps;
}

/** 時刻から体力の割合を出す。left はすぐ減る本体、trail は0.3秒遅れて0.5秒かけて追いつく薄い赤。 */
export function healthAt(ms: number, steps: HealthStep[]) {
  let left = 100, trail = 100;
  for (const step of steps) {
    if (ms >= step.at) left = step.left;
    const progress = clamp((ms - step.at - 300) / 500);
    if (progress > 0) trail = step.from + (step.left - step.from) * progress;
  }
  return { left, trail };
}

/**
 * 一戦を通した体力の段。一回目の命中の段に、防御で一撃を受け止めきったときの一段と、
 * とどめの回の段を足す。とどめの多段命中では、そのとき残っている量の9割を4回に等分して減らし、
 * 最後のとどめの一撃では「残りを全部」ではなく 0 と直に書く。
 * 前の二回でどれだけ減っていても、54.5秒には必ず0になる。
 */
export function healthSteps(recipe: Recipe | null): HealthStep[] {
  const steps = planHealthSteps(recipe);
  const after = steps.at(-1)!.left;
  steps.push({ at: GUARD_STEP_MS, from: after, left: Math.max(0, after - GUARD_DAMAGE) });
  // とどめの多段命中。減らす量は4回とも同じで、弾の数や属性では変えない。
  const before = steps.at(-1)!.left, each = before * FINISH_DAMAGE_RATIO / FINISH_HIT_MS.length;
  for (let i = 0; i < FINISH_HIT_MS.length; i++)
    steps.push({ at: FINISH_HIT_MS[i], from: Math.max(0, before - each * i), left: Math.max(0, before - each * (i + 1)) });
  steps.push({ at: FINAL_BLOW_MS, from: steps.at(-1)!.left, left: 0 });
  return steps;
}

/**
 * 騎士の体力の表示。すぐ減る本体と、0.3秒待ってから0.5秒かけて追いつく薄い赤の残りの二層。
 * 体力は演出上の数値で、勝敗の計算には使わない。残りが少なくても点滅させない。
 */
export class HealthBar {
  private trail: HTMLElement;
  private steps: HealthStep[] = [];
  private key = '';
  private shown = -1;
  private shownTrail = -1;
  constructor(private bar: HTMLElement) {
    // 残りの層は本体の下に敷く。並び順で本体が上に来る。
    this.trail = document.createElement('b');
    this.trail.className = 'health-trail';
    this.bar.parentElement?.insertBefore(this.trail, this.bar);
  }
  reset() { this.steps = []; this.key = ''; this.show(100, 100); }
  /** 毎コマ呼ぶ。ms は演出と同じ世界の時刻（命中の停止を含む）で、本編の時刻ではない。 */
  update(ms: number, recipe: Recipe | null) {
    const key = recipe ? `${recipe.count}:${recipe.area.toFixed(2)}:${recipe.concentration.toFixed(2)}` : '';
    if (key !== this.key) { this.key = key; this.steps = healthSteps(recipe); }
    const { left, trail } = healthAt(ms, this.steps);
    this.show(left, trail);
  }
  private show(left: number, trail: number) {
    if (Math.abs(left - this.shown) > .05) { this.shown = left; this.bar.style.width = `${Math.max(0, left).toFixed(2)}%`; }
    if (Math.abs(trail - this.shownTrail) > .05) { this.shownTrail = trail; this.trail.style.width = `${Math.max(0, trail).toFixed(2)}%`; }
  }
}
