import type { Recipe } from '../game/types';

/**
 * 騎士の体力の表示。即減る本体と、遅れて追う赤い残りの二層にする。（担当3が実装。今は幅を変えるだけ）
 * 体力は演出上の数値で、勝敗の計算には使わない。
 */
export class HealthBar {
  constructor(private bar: HTMLElement) {}
  reset() { this.bar.style.width = '100%'; }
  /** 毎コマ呼ぶ。ms は本編の時刻。 */
  update(ms: number, _recipe: Recipe | null) { if (ms >= 18500) this.bar.style.width = '70%'; }
}
