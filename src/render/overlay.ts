import type { ScreenState } from './effects/screen';
import type { Palette } from './effects/presets';

/**
 * 画面全体にかかる効果のうち、HTMLの層で足りるもの（閃光、ビネット、グレイン、放出直前の暗転、背景の彩度）。
 * 演出canvasの塗りをやめ、全層の上のdivの透明度だけを毎コマ変える。（担当2が実装。今は何もしない）
 */
export class ScreenOverlay {
  constructor(_root: HTMLElement, _layers: { world: HTMLElement; knight: HTMLElement; spell: HTMLElement }) {}
  /** 毎コマ呼ぶ。palette は今の属性の色。calm は控えめモード。 */
  update(_state: ScreenState, _palette: Palette, _calm: boolean) {}
  dispose() {}
}
