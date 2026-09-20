import { describe, it, expect } from 'vitest';
import { liveWords, latestElement } from '../src/game/live-words';
import { SpeechBook } from '../src/game/speech-book';
import type { SpeechEntry } from '../src/game/types';

const say = (text: string, over: Partial<SpeechEntry> = {}): SpeechEntry =>
  ({ id: 1, revision: 1, startMs: 1000, endMs: 2000, text, final: true, stability: 1, source: 'typed', ...over });

describe('言葉への即時反応：言葉の取り出し', () => {
  it('属性、形、用途、個数を種類分けし、言った時刻と最終かどうかを持つ', () => {
    const words = liveWords([say('炎よ、三つの球で撃て')]);
    const kinds = words.map(w => w.kind);
    expect(kinds).toContain('element'); expect(kinds).toContain('count'); expect(kinds).toContain('form'); expect(kinds).toContain('purpose');
    expect(words.find(w => w.kind === 'element')?.element).toBe('fire');
    expect(words.find(w => w.kind === 'count')?.count).toBe(3);
    expect(words.find(w => w.kind === 'form')?.form).toBe('orb');
    expect(words.find(w => w.kind === 'purpose')?.purpose).toBe('attack');
    for (const w of words) { expect(w.atMs).toBe(2000); expect(w.final).toBe(true); }
  });
  it('個数は数字でも漢数字でも読め、8を超えない', () => {
    expect(liveWords([say('七つに分かれろ')]).find(w => w.kind === 'count')?.count).toBe(7);
    expect(liveWords([say('4本の光線')]).find(w => w.kind === 'count')?.count).toBe(4);
    expect(liveWords([say('百発撃て')]).find(w => w.kind === 'count')?.count).toBe(8);
  });
  it('属性ごとに色の手がかりが取れ、氷や闇も拾える', () => {
    expect(liveWords([say('氷の壁')]).find(w => w.kind === 'element')?.element).toBe('ice');
    expect(liveWords([say('闇よ')]).find(w => w.kind === 'element')?.element).toBe('dark');
    expect(liveWords([say('雷よ')]).find(w => w.kind === 'element')?.element).toBe('lightning');
  });
  it('詠唱辞書の言葉も意味に直してから拾う', () => {
    const words = liveWords([say('灼熱')]);
    expect(words.some(w => w.element === 'fire')).toBe(true);
  });
  it('途中結果は final が false のまま渡る', () => {
    expect(liveWords([say('炎よ', { final: false, stability: .2 })])[0].final).toBe(false);
  });
  it('言葉がないときは何も返さない', () => {
    expect(liveWords([])).toEqual([]);
    expect(liveWords([say('こんにちは')])).toEqual([]);
  });
});

describe('言葉への即時反応：言い直し', () => {
  it('「炎ではなく氷」は後半の氷だけを残す', () => {
    const words = liveWords([say('炎ではなく氷')]);
    expect(words.map(w => w.element)).toEqual(['ice']);
    expect(latestElement(words)?.element).toBe('ice');
  });
  it('否定した用途は拾わない', () => {
    expect(liveWords([say('守らないで')]).some(w => w.purpose === 'defend')).toBe(false);
  });
  it('言い直しは後から言った方が直近の色になる', () => {
    const words = liveWords([say('炎よ', { id: 1, endMs: 2000 }), say('やっぱり氷', { id: 2, startMs: 3000, endMs: 4000 })]);
    expect(latestElement(words)?.element).toBe('ice');
  });
});

describe('言葉への即時反応：番号の安定', () => {
  it('途中結果が伸びても、前に出た言葉の番号は変わらない', () => {
    const first = liveWords([say('炎よ', { final: false, revision: 1 })]);
    const second = liveWords([say('炎よ、三つの球で撃て', { final: false, revision: 2 })]);
    expect(second[0].id).toBe(first[0].id);
    expect(new Set(second.map(w => w.id)).size).toBe(second.length);
  });
  it('同じ文なら何度取り出しても同じ番号になる', () => {
    expect(liveWords([say('氷よ壁となれ')]).map(w => w.id)).toEqual(liveWords([say('氷よ壁となれ')]).map(w => w.id));
  });
  it('言い直して語が変われば別の番号になり、演出がもう一度出せる', () => {
    const before = liveWords([say('炎', { final: false })]);
    const after = liveWords([say('炎ではなく氷', { final: false, revision: 2 })]);
    expect(after[0].element).toBe('ice');
    expect(after[0].id).not.toBe(before[0].id);
  });
  it('別の発言なら同じ語でも番号が分かれる', () => {
    const words = liveWords([say('炎', { id: 1 }), say('炎', { id: 2, startMs: 3000, endMs: 3500 })]);
    expect(words).toHaveLength(2);
    expect(words[0].id).not.toBe(words[1].id);
  });
});

describe('音声の記録の途中結果', () => {
  it('live() は確定度の低い途中結果も返し、snapshot() は今までどおり', () => {
    const book = new SpeechBook();
    book.add({ id: 1, revision: 1, startMs: 0, endMs: 900, text: '炎よ', final: false, stability: .2, source: 'google' });
    expect(book.live()).toHaveLength(1);
    expect(book.snapshot()).toHaveLength(0);
    expect(liveWords(book.live()).map(w => w.element)).toEqual(['fire']);
  });
});
