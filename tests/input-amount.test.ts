import { describe, it, expect, beforeEach } from 'vitest';
import { inputAmount, resetInputAmount } from '../src/game/input-amount';
import { ROUNDS } from '../src/game/rounds';
import type { Point, SpeechEntry } from '../src/game/types';

/** まっすぐな一筆。長さ len の線を stroke 番の筆として作る。 */
const stroke = (n: number, len: number, id: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({ x: .1 + len * i / (n - 1), y: .5, t: i * 16, hand: 0, stroke: id }));
const say = (text: string, id: number): SpeechEntry => ({ id, revision: 1, startMs: 0, endMs: 1000, text, final: true, stability: 1, source: 'typed' });

describe('入力の量', () => {
  // 覚え書きは一戦ごとに消すので、試験も一つずつ消してから始める。
  beforeEach(() => resetInputAmount());
  it('三回を順に流しても、前の回の言葉は次の回の量に足さない', () => {
    // 回の分け方には、その回が始まった時刻を使う。どの回も同じ発話idで来る（画面の文字入力も、回が変わっても同じidのまま）。
    // 回ごとに言葉を短くしておき、前の回の長さが残っていれば量が下がりきらずに見つかるようにする。
    const 言葉 = ['ほのおよあつまれおおきなたまになれもえさかれ', 'こおりよかべとなれはじきかえせ', 'つらぬけ'];
    const 続けて = ROUNDS.map((round, i) => inputAmount([], [say(言葉[i], 1)], round.start));
    expect(続けて[1]).toBeLessThan(続けて[0]);
    expect(続けて[2]).toBeLessThan(続けて[1]);
    // どの回も、その回だけをまっさらな状態で数えたときと同じになる。
    ROUNDS.forEach((round, i) => {
      resetInputAmount();
      expect(続けて[i], round.id).toBeCloseTo(inputAmount([], [say(言葉[i], 1)], round.start), 10);
    });
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
