import type { SpeechEntry, Element, Form, Purpose } from './types';
import { affirmativeText, explicitCount } from './recipe';
import { readChant } from './chant-dictionary';

/** 認識の途中結果も含めて、いま聞こえている言葉。蓄積の演出が即時に反応するために使う。 */
export type LiveWord = {
  id: number; text: string;
  /** 属性の言葉なら属性、それ以外は null */
  element: Element | null;
  kind: 'element' | 'form' | 'purpose' | 'count' | 'change' | 'other';
  count: number | null;
  atMs: number; final: boolean;
  /** 形の言葉なら形、用途の言葉なら用途。演出が反応を選ぶために使う */
  form?: Form | null; purpose?: Purpose | null;
};

type Term = { word: string; kind: LiveWord['kind']; element?: Element; form?: Form; purpose?: Purpose };

/** 反応させる語。recipe.ts と同じ語彙を、位置が分かるように文字そのままで並べたもの。 */
const terms: Term[] = [
  ...([['fire', ['炎', '火', '紅蓮', '燃']], ['ice', ['氷晶', '氷', '凍']], ['lightning', ['稲妻', '電撃', '雷']],
    ['wind', ['嵐', '気流', '風']], ['light', ['輝', '照ら', '光']], ['dark', ['冥府', '闇', '影']]] as Array<[Element, string[]]>)
    .flatMap(([element, list]) => list.map(word => ({ word, kind: 'element' as const, element }))),
  ...([['wall', ['障壁', '壁']], ['dome', ['結界', '包め', '覆え']], ['wave', ['波', '押し流']],
    ['beam', ['光線', '貫', '穿', '線']], ['orb', ['球', '玉']], ['swarm', ['連弾', '分かれ', '群']]] as Array<[Form, string[]]>)
    .flatMap(([form, list]) => list.map(word => ({ word, kind: 'form' as const, form }))),
  ...([['defend', ['守れ', '守る', '守', '防げ']], ['bind', ['縛れ', '縛', '捕ら', '閉じ込', '拘束', '動くな']],
    ['enhance', ['我に力', '力を', '強化', '力を貸', '強くな']], ['attack', ['撃て', '撃', '倒せ', '燃や', '裂け']]] as Array<[Purpose, string[]]>)
    .flatMap(([purpose, list]) => list.map(word => ({ word, kind: 'purpose' as const, purpose }))),
  ...['追尾', '追え', '螺旋', '分裂'].map(word => ({ word, kind: 'change' as const })),
].sort((a, b) => b.word.length - a.word.length);

const countHead = /^(?:\d{1,3}|[一二三四五六七八九十百])\s*(?:つ|本|個|発|体|枚)/;

/** 同じ語が同じ場所にある限り変わらない番号。言い直して語が変われば別の番号になる。 */
function wordId(entryId: number, order: number, key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  return entryId * 1000000 + order * 1000 + Math.abs(h) % 1000;
}

/** 音声の記録から、演出が反応すべき言葉を取り出す。 */
/**
 * offsetMs は、その回が始まった時刻。声の時刻は回ごとに0から数え直すので、
 * 演出が見る戦いの時刻へそろえるために足す。足さないと、防御の回は言葉への反応が
 * すべて「24秒前の言葉」になり、反応の窓から外れて一つも出なくなる。
 */
export function liveWords(entries: readonly SpeechEntry[], offsetMs = 0): LiveWord[] {
  const found: LiveWord[] = [];
  for (const entry of [...entries].sort((a, b) => a.startMs - b.startMs)) {
    // 詠唱辞書で意味に直してから、否定と言い直しの前半を落とす。「炎ではなく氷」は氷だけが残る。
    const text = affirmativeText(readChant(entry.text ?? '').meaning);
    const atMs = (Number.isFinite(entry.endMs) && entry.endMs >= entry.startMs ? entry.endMs : entry.startMs) + offsetMs;
    let order = 0;
    for (let at = 0; at < text.length;) {
      const digits = countHead.exec(text.slice(at));
      const count = digits ? explicitCount(digits[0]) : null;
      if (digits && count !== null) {
        found.push({ id: wordId(entry.id, order++, `count:${count}`), text: digits[0], element: null, kind: 'count', count, atMs, final: entry.final, form: null, purpose: null });
        at += digits[0].length; continue;
      }
      const hit = terms.find(term => text.startsWith(term.word, at));
      if (hit) {
        found.push({ id: wordId(entry.id, order++, `${hit.kind}:${hit.word}`), text: hit.word, element: hit.element ?? null, kind: hit.kind, count: null, atMs, final: entry.final, form: hit.form ?? null, purpose: hit.purpose ?? null });
        at += hit.word.length; continue;
      }
      at++;
    }
  }
  return found.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
}

/** 直近の属性の言葉。確定前の「候補の色」に使う。 */
export function latestElement(words: readonly LiveWord[]): LiveWord | null {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].element) return words[i];
  return null;
}
