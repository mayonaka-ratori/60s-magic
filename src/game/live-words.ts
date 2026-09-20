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

/**
 * 言葉ごとの「初めて現れた時刻」。認識の途中結果は同じ発話が何度も伸びて届き、
 * そのたびに発話の終わり時刻が後ろへ動く。そのまま使うと前に出た言葉の反応がやり直されるので、
 * 番号ごとに最初の時刻を覚えてずっと使う。
 */
const firstHeardAt = new Map<number, number>();

/** 覚え書きを消す。新しい一戦を始めるときに呼ぶ。 */
export function resetLiveWords() { firstHeardAt.clear(); }

function firstHeard(id: number, heard: number) {
  const known = firstHeardAt.get(id);
  if (known !== undefined) return known;
  firstHeardAt.set(id, heard);
  return heard;
}

/** 音声の記録から、演出が反応すべき言葉を取り出す。 */
export function liveWords(entries: readonly SpeechEntry[]): LiveWord[] {
  // まだ何も聞こえていない間は、前の一戦の覚え書きを捨てる。
  if (!entries.length) firstHeardAt.clear();
  const found: LiveWord[] = [];
  for (const entry of [...entries].sort((a, b) => a.startMs - b.startMs)) {
    // 詠唱辞書で意味に直してから、否定と言い直しの前半を落とす。「炎ではなく氷」は氷だけが残る。
    const text = affirmativeText(readChant(entry.text ?? '').meaning);
    const heard = Number.isFinite(entry.endMs) && entry.endMs >= entry.startMs ? entry.endMs : entry.startMs;
    let order = 0;
    for (let at = 0; at < text.length;) {
      const digits = countHead.exec(text.slice(at));
      const count = digits ? explicitCount(digits[0]) : null;
      if (digits && count !== null) {
        const id = wordId(entry.id, order++, `count:${count}`);
        found.push({ id, text: digits[0], element: null, kind: 'count', count, atMs: firstHeard(id, heard), final: entry.final, form: null, purpose: null });
        at += digits[0].length; continue;
      }
      const hit = terms.find(term => text.startsWith(term.word, at));
      if (hit) {
        const id = wordId(entry.id, order++, `${hit.kind}:${hit.word}`);
        found.push({ id, text: hit.word, element: hit.element ?? null, kind: hit.kind, count: null, atMs: firstHeard(id, heard), final: entry.final, form: hit.form ?? null, purpose: hit.purpose ?? null });
        at += hit.word.length; continue;
      }
      at++;
    }
  }
  return found.sort((a, b) => a.atMs - b.atMs || a.id - b.id);
}

/**
 * 属性の言葉のうち、確定側（recipe.ts）と同じ選び方をしたもの。
 * 先に言った属性が主属性、次に言った別の属性が飾り色になる。
 */
export function spokenElements(words: readonly LiveWord[]): { main: LiveWord | null; accent: LiveWord | null } {
  const main = words.find(w => w.element) ?? null;
  if (!main) return { main: null, accent: null };
  return { main, accent: words.find(w => w.element && w.element !== main.element) ?? null };
}
