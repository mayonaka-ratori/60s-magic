import type { Element, Form, Purpose } from './types';

/**
 * 唱えた言葉から魔法を読み取るための語彙表。
 *
 * 即時の反応（live-words.ts）と確定の判定（recipe.ts）は、必ずこの表だけを見る。
 * 前は二か所に別々の語が並んでいて、「光線を撃て」「かみなりよ」「燃やせ」のように
 * 途中の反応と確定の結果が食い違っていた。
 *
 * 一つの語が二つ以上の意味を持つことがある。たとえば「光線」は形が光線で属性は光、
 * 「壁」は形が壁で用途は守り。長い語を先に取り出しても短い語の意味が落ちないように、
 * 重なる意味はその語自身に書いておく。
 */

/** 言葉の種類。演出はこれを見て反応を選ぶ。 */
export type WordKind = 'element' | 'form' | 'purpose' | 'count' | 'change' | 'other';

export type SpellTerm = {
  /** 文字そのまま。この並びで探す。 */
  word: string;
  /** 主な種類。演出の見た目はこれで決まる。 */
  kind: WordKind;
  element?: Element;
  form?: Form;
  purpose?: Purpose;
};

/** 属性を見る順。先に言った属性が主属性、次に言った別の属性が飾り色になる。 */
const ELEMENT_ORDER: readonly Element[] = ['fire', 'ice', 'lightning', 'wind', 'light', 'dark'];
/** 用途を見る順。上から先に当たったものを使う。 */
export const PURPOSE_ORDER: readonly Purpose[] = ['defend', 'bind', 'enhance', 'attack'];
/** 形を見る順。上から先に当たったものを使う。 */
export const FORM_ORDER: readonly Form[] = ['wall', 'dome', 'wave', 'beam', 'orb', 'swarm'];

/** 個数に添える言葉。「三つ」「4本」など。 */
const COUNT_UNITS = ['つ', '本', '個', '発', '体', '枚'] as const;
/** 漢数字の読み替え。 */
export const KANJI_NUMBERS: Record<string, number> =
  { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };

/** 語彙の表。行の並びは意味ごとにまとめてある。 */
const SPELL_TERMS: readonly SpellTerm[] = [
  // 属性の言葉
  { word: '炎', kind: 'element', element: 'fire' },
  { word: '火', kind: 'element', element: 'fire' },
  { word: '紅蓮', kind: 'element', element: 'fire' },
  { word: '燃', kind: 'element', element: 'fire' },
  // 「燃やせ」は火であり、同時に攻める言葉でもある。
  { word: '燃や', kind: 'element', element: 'fire', purpose: 'attack' },
  { word: '氷', kind: 'element', element: 'ice' },
  { word: '氷晶', kind: 'element', element: 'ice' },
  { word: '凍', kind: 'element', element: 'ice' },
  { word: '雷', kind: 'element', element: 'lightning' },
  { word: '稲妻', kind: 'element', element: 'lightning' },
  // 「電撃」は雷であり、同時に攻める言葉でもある。
  { word: '電撃', kind: 'element', element: 'lightning', purpose: 'attack' },
  // 聞き取りで崩れやすい「かみなり」の書き方も拾う。
  { word: 'かみなり', kind: 'element', element: 'lightning' },
  { word: 'カミナリ', kind: 'element', element: 'lightning' },
  { word: 'カメナリ', kind: 'element', element: 'lightning' },
  { word: '亀なり', kind: 'element', element: 'lightning' },
  { word: '神鳴', kind: 'element', element: 'lightning' },
  { word: '風', kind: 'element', element: 'wind' },
  { word: '嵐', kind: 'element', element: 'wind' },
  { word: '気流', kind: 'element', element: 'wind' },
  { word: '光', kind: 'element', element: 'light' },
  { word: '輝', kind: 'element', element: 'light' },
  { word: '照ら', kind: 'element', element: 'light' },
  { word: '闇', kind: 'element', element: 'dark' },
  { word: '影', kind: 'element', element: 'dark' },
  { word: '冥府', kind: 'element', element: 'dark' },

  // 形の言葉
  // 「壁」「障壁」「結界」は形であると同時に守る意味を持つ。
  { word: '壁', kind: 'form', form: 'wall', purpose: 'defend' },
  { word: '障壁', kind: 'form', form: 'wall', purpose: 'defend' },
  { word: '結界', kind: 'form', form: 'dome', purpose: 'defend' },
  { word: '包め', kind: 'form', form: 'dome' },
  { word: '覆え', kind: 'form', form: 'dome' },
  { word: '波', kind: 'form', form: 'wave' },
  { word: '押し流', kind: 'form', form: 'wave' },
  { word: '線', kind: 'form', form: 'beam' },
  // 「光線」は形が光線で、属性は光。
  { word: '光線', kind: 'form', form: 'beam', element: 'light' },
  // 「貫け」「穿て」は光線の形であり、攻める言葉でもある。
  { word: '貫', kind: 'form', form: 'beam', purpose: 'attack' },
  { word: '穿', kind: 'form', form: 'beam', purpose: 'attack' },
  { word: '球', kind: 'form', form: 'orb' },
  { word: '玉', kind: 'form', form: 'orb' },
  { word: '群', kind: 'form', form: 'swarm' },
  { word: '分かれ', kind: 'form', form: 'swarm' },
  { word: '連弾', kind: 'form', form: 'swarm' },

  // 用途の言葉
  { word: '守', kind: 'purpose', purpose: 'defend' },
  { word: '守れ', kind: 'purpose', purpose: 'defend' },
  { word: '守る', kind: 'purpose', purpose: 'defend' },
  { word: '防げ', kind: 'purpose', purpose: 'defend' },
  { word: '縛', kind: 'purpose', purpose: 'bind' },
  { word: '縛れ', kind: 'purpose', purpose: 'bind' },
  { word: '捕ら', kind: 'purpose', purpose: 'bind' },
  { word: '閉じ込', kind: 'purpose', purpose: 'bind' },
  { word: '拘束', kind: 'purpose', purpose: 'bind' },
  { word: '動くな', kind: 'purpose', purpose: 'bind' },
  { word: '我に力', kind: 'purpose', purpose: 'enhance' },
  { word: '強化', kind: 'purpose', purpose: 'enhance' },
  { word: '力を貸', kind: 'purpose', purpose: 'enhance' },
  { word: '強くな', kind: 'purpose', purpose: 'enhance' },
  { word: '撃', kind: 'purpose', purpose: 'attack' },
  { word: '撃て', kind: 'purpose', purpose: 'attack' },
  { word: '倒', kind: 'purpose', purpose: 'attack' },
  { word: '倒せ', kind: 'purpose', purpose: 'attack' },
  { word: '切', kind: 'purpose', purpose: 'attack' },
  { word: '裂', kind: 'purpose', purpose: 'attack' },
  { word: '裂け', kind: 'purpose', purpose: 'attack' },

  // 変化の言葉
  { word: '追尾', kind: 'change' },
  { word: '追え', kind: 'change' },
  { word: '螺旋', kind: 'change' },
  { word: '分裂', kind: 'change' },
];

/** 長い語から先に当てるための並び。即時の反応はこれを順に見る。 */
export const TERMS_BY_LENGTH: readonly SpellTerm[] =
  [...SPELL_TERMS].sort((a, b) => b.word.length - a.word.length);

/** 表から、ある意味を持つ語をすべて集めて一つの見つけ方にする。 */
function patternOf(words: string[]) { return new RegExp(words.join('|')); }
function patternsFor<T extends string>(order: readonly T[], pick: (term: SpellTerm) => T | undefined): Array<[T, RegExp]> {
  return order.map(value => [value, patternOf(SPELL_TERMS.filter(term => pick(term) === value).map(term => term.word))] as [T, RegExp]);
}

/** 属性の見つけ方。確定の判定はこれを使う。 */
export const ELEMENT_PATTERNS = patternsFor(ELEMENT_ORDER, t => t.element);
/** 用途の見つけ方。上から順に見る。 */
export const PURPOSE_PATTERNS = patternsFor(PURPOSE_ORDER, t => t.purpose);
/** 形の見つけ方。上から順に見る。 */
export const FORM_PATTERNS = patternsFor(FORM_ORDER, t => t.form);

const units = COUNT_UNITS.join('|');
/** 数字で言った個数。「4本」「12個」など。 */
export const DIGIT_COUNT = new RegExp(`(\\d{1,3})\\s*(?:${units})`);
/** 漢数字で言った個数。「七つ」など。 */
export const KANJI_COUNT = new RegExp(`([${Object.keys(KANJI_NUMBERS).join('')}])(?:${units})`);
/** 文の先頭がそのまま個数の言い方かどうか。即時の反応が語を切り出すのに使う。 */
export const COUNT_HEAD = new RegExp(`^(?:\\d{1,3}|[${Object.keys(KANJI_NUMBERS).join('')}])\\s*(?:${units})`);
