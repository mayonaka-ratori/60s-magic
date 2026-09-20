import type { Recipe } from '../game/types';
import { ROUNDS } from '../game/rounds';

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 防御で弾き返したときに減る量。入力では変わらない。 */
export const GUARD_DAMAGE=10;
/** 命中で減る量。派手さ（個数、範囲、収束）で20〜45%にする。 */
function damage(recipe: Recipe | null) {
  if (!recipe) return 24;
  const many = clamp((recipe.count - 1) / 5), wide = clamp((recipe.area - .2) / .8), focus = clamp(recipe.concentration);
  return 20 + (many * .45 + wide * .3 + focus * .25) * 25;
}

/**
 * 騎士の体力の表示。すぐ減る本体と、0.3秒待ってから0.5秒かけて追いつく薄い赤の残りの二層。
 * 体力は演出上の数値で、勝敗の計算には使わない。残りが少なくても点滅させない。
 */
export class HealthBar {
  private trail: HTMLElement;
  private steps: Array<{ at: number; from: number; left: number }> = [];
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
  /** 毎コマ呼ぶ。ms は本編の時刻。 */
  update(ms: number, recipe: Recipe | null) {
    const key = recipe ? `${recipe.count}:${recipe.area.toFixed(2)}:${recipe.concentration.toFixed(2)}` : '';
    if (key !== this.key) { this.key = key; this.steps = this.plan(recipe); }
    let left = 100, trail = 100;
    for (const step of this.steps) {
      if (ms >= step.at) left = step.left;
      // 残りは0.3秒遅れてから0.5秒かけて追いつく。
      const progress = clamp((ms - step.at - 300) / 500);
      if (progress > 0) trail = step.from + (step.left - step.from) * progress;
    }
    this.show(left, trail);
  }
  /**
   * 一回目の命中で減らし、防御で弾き返したときにもう一度減らす。多段なら80msごとに分ける。
   * 体力は演出上の数値で、勝敗の計算には使わない。とどめの回を作るときに0までの段を足す。
   */
  private plan(recipe: Recipe | null) {
    const total = damage(recipe), count = Math.max(1, Math.min(5, recipe && recipe.count > 1 ? recipe.count : 1));
    const steps: Array<{ at: number; from: number; left: number }> = [];
    for (let i = 0; i < count; i++) steps.push({ at: ROUNDS[0].impact + i * 80, from: 100 - total * i / count, left: 100 - total * (i + 1) / count });
    const after = 100 - total;
    steps.push({ at: 37500, from: after, left: Math.max(0, after - GUARD_DAMAGE) });
    return steps;
  }
  private show(left: number, trail: number) {
    if (Math.abs(left - this.shown) > .05) { this.shown = left; this.bar.style.width = `${Math.max(0, left).toFixed(2)}%`; }
    if (Math.abs(trail - this.shownTrail) > .05) { this.shownTrail = trail; this.trail.style.width = `${Math.max(0, trail).toFixed(2)}%`; }
  }
}
