import { describe, it, expect, beforeEach } from 'vitest';
import { inputAmount, resetInputAmount } from '../src/game/input-amount';
import { BEATS, ROUNDS } from '../src/game/rounds';
import { intensityOf, presets } from '../src/render/effects/presets';
import { screenState } from '../src/render/effects/screen';
import type { Point, SpeechEntry } from '../src/game/types';

/** まっすぐな一筆。長さ len の線を stroke 番の筆として作る。 */
const stroke = (n: number, len: number, id: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: .1 + len * i / (n - 1), y: .5, t: i * 16, hand: 0, stroke: id }));
const say = (text: string, id: number): SpeechEntry => ({ id, revision: 1, startMs: 0, endMs: 1000, text, final: true, stability: 1, source: 'typed' });
// 試験用の魔法は tests/helpers.ts にまとめてある。
import { testRecipe as recipe } from './helpers';

describe('入力の量', () => {
  // 覚え書きは一戦ごとに消すので、試験も一つずつ消してから始める。
  beforeEach(() => resetInputAmount());
  it('何も入れなければ0', () => {
    expect(inputAmount([], [])).toBe(0);
  });
  it('前の回の言葉は次の回の量に足さない', () => {
    // 回の分け方には、その回が始まった時刻を使う（一回目は0、防御は30000）。
    const 一回目 = inputAmount([], [say('ほのおよあつまれおおきなたまになれもえさかれ', 1)], ROUNDS[0].start);
    const 防御 = inputAmount([], [say('こおり', 1)], ROUNDS[1].start);
    // 防御の回だけをまっさらな状態で数えたときと同じになる。
    resetInputAmount();
    const 防御だけ = inputAmount([], [say('こおり', 1)], ROUNDS[1].start);
    expect(防御).toBeCloseTo(防御だけ, 10);
    expect(防御).toBeLessThan(一回目);
  });
  it('文字入力は回ごとに数え直す（どの回も同じ発話idを使うため）', () => {
    // 画面の文字入力は回が変わっても id 10000 のままなので、回で分けていないと混ざる。
    const 一回目 = inputAmount([], [say('ながいながいえいしょうのことば', 10000)], ROUNDS[0].start);
    const 防御 = inputAmount([], [say('あ', 10000)], ROUNDS[1].start);
    expect(防御).toBeLessThan(一回目);
  });
  it('同じ回の中では、途中結果が短くなっても量は下がらない', () => {
    const 長い = inputAmount([], [say('ほのおよあつまれ', 1)], ROUNDS[1].start);
    const 短く = inputAmount([], [{ ...say('ほの', 1), revision: 2 }], ROUNDS[1].start);
    expect(短く).toBeCloseTo(長い, 10);
  });
  it('とどめの回も、前の二回の言葉を足さない', () => {
    inputAmount([], [say('ほのおよあつまれおおきなたまになれ', 1)], ROUNDS[0].start);
    inputAmount([], [say('こおりよかべとなれはじきかえせ', 1)], ROUNDS[1].start);
    const とどめ = inputAmount([], [say('つらぬけ', 1)], ROUNDS[2].start);
    resetInputAmount();
    expect(とどめ).toBeCloseTo(inputAmount([], [say('つらぬけ', 1)], ROUNDS[2].start), 10);
  });
  it('一筆と一言でだいたい0.4', () => {
    const a = inputAmount(stroke(20, .8, 1), [say('もえろ', 1)]);
    expect(a).toBeGreaterThan(.25); expect(a).toBeLessThan(.6);
  });
  it('線が長いほど、筆が多いほど、言葉が多いほど上がる', () => {
    const short = inputAmount(stroke(20, .2, 1), []);
    const long = inputAmount(stroke(20, .9, 1), []);
    expect(long).toBeGreaterThan(short);
    const oneStroke = inputAmount(stroke(20, .5, 1), []);
    const threeStrokes = inputAmount([...stroke(20, .5, 1), ...stroke(20, .5, 2), ...stroke(20, .5, 3)], []);
    expect(threeStrokes).toBeGreaterThan(oneStroke);
    const few = inputAmount(stroke(20, .5, 1), [say('ほのお', 1)]);
    const many = inputAmount(stroke(20, .5, 1), [say('ほのおよあつまれおおきなたまになれ', 1), say('もえさかれ', 2)]);
    expect(many).toBeGreaterThan(few);
  });
  it('たくさん描いてたくさん唱えると1に近づくが、1は超えない', () => {
    const points = Array.from({ length: 12 }, (_, k) => stroke(30, .9, k + 1)).flat();
    const entries = Array.from({ length: 8 }, (_, k) => say('ほのおよあつまれおおきなたまになれ', k + 1));
    const a = inputAmount(points, entries);
    expect(a).toBeGreaterThan(.9); expect(a).toBeLessThanOrEqual(1);
  });
  it('言い直しは長い方だけを数える', () => {
    const one = inputAmount(stroke(20, .5, 1), [say('ほのお', 1)]);
    const revised = inputAmount(stroke(20, .5, 1), [say('ほ', 1), { ...say('ほのお', 1), revision: 2 }]);
    expect(revised).toBeCloseTo(one, 5);
  });
  it('途中結果が短くなっても量は下がらない', () => {
    const points = stroke(20, .5, 1);
    const long = inputAmount(points, [say('ほのおよあつまれ', 1)]);
    // 同じ発話が短い途中結果に置き換わっても、長かったときの量を保つ。
    const shrunk = inputAmount(points, [{ ...say('ほの', 1), revision: 2 }]);
    expect(shrunk).toBeCloseTo(long, 5);
    // 新しい発話が増えた後でも、前の発話が短くなった分は減らない。
    const added = inputAmount(points, [{ ...say('ほの', 1), revision: 3 }, say('つらぬけ', 2)]);
    expect(added).toBeGreaterThan(long);
  });
  it('前の発話が伸びたら量が上がる', () => {
    const points = stroke(20, .5, 1);
    const before = inputAmount(points, [say('ほのお', 1), say('つらぬけ', 2)]);
    // 最後ではなく、前の発話だけが長くなった場合。
    const after = inputAmount(points, [{ ...say('ほのおよあつまれおおきなたまに', 1), revision: 2 }, say('つらぬけ', 2)]);
    expect(after).toBeGreaterThan(before);
  });
  it('一戦の始めに消すと0へ戻る', () => {
    inputAmount(stroke(20, .5, 1), [say('ほのお', 1)]);
    resetInputAmount();
    expect(inputAmount([], [])).toBe(0);
  });
});

describe('入力の量が演出に効く', () => {
  it('量が多いほど派手さが上がり、上限3は超えない', () => {
    const none = intensityOf(recipe(), presets.vivid);
    const full = intensityOf(recipe(), presets.vivid, 1);
    expect(full).toBeGreaterThan(none);
    expect(full - none).toBeCloseTo(.6, 5);
    // 設定は倍率なので、最大の設定でも普通のレシピなら上限に張り付かない。
    expect(intensityOf(recipe(), presets.max, 1)).toBeLessThan(3);
    expect(intensityOf(null, presets.calm, 1)).toBeGreaterThan(intensityOf(null, presets.calm));
    expect(intensityOf(recipe(), presets.vivid, 0)).toBe(none);
  });
  it('量は派手さを通してだけ暗転と揺れに効く（画面の効果は量を直接見ない）', () => {
    // 量は intensityOf の一か所で派手さに足す。screenState の6番目の引数はもう何にも効かない。
    const strong = intensityOf(null, presets.vivid, 1), weak = intensityOf(null, presets.vivid, 0);
    expect(strong).toBeGreaterThan(weak);
    expect(screenState(BEATS[0].lock-.5, strong, presets.vivid, 'attack', 0).darken).toBeGreaterThan(screenState(BEATS[0].lock-.5, weak, presets.vivid, 'attack', 0).darken);
    expect(screenState(BEATS[0].lock-.5, 1, presets.vivid, 'attack', 0, 1).darken).toBe(screenState(BEATS[0].lock-.5, 1, presets.vivid, 'attack', 0, 0).darken);
    expect(screenState(BEATS[0].lock-.5, 1, presets.vivid, 'attack', 0).darken).toBe(screenState(BEATS[0].lock-.5, 1, presets.vivid, 'attack').darken);
  });
});
