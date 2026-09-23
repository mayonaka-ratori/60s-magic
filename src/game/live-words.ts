import type { SpeechEntry, Element, Form, Purpose } from './types';
import { affirmativeText, explicitCount } from './recipe';
import { readChant } from './chant-dictionary';
import { COUNT_HEAD, FORM_ORDER, PURPOSE_ORDER, TERMS_BY_LENGTH, type WordKind } from './spell-words';

/** 認識の途中結果も含めて、いま聞こえている言葉。蓄積の演出が即時に反応するために使う。 */
export type LiveWord = {
  id: number; text: string;
  /** 属性の言葉なら属性、それ以外は null */
  element: Element | null;
  kind: WordKind;
  count: number | null;
  atMs: number; final: boolean;
  /** 形の言葉なら形、用途の言葉なら用途。演出が反応を選ぶために使う */
  form?: Form | null; purpose?: Purpose | null;
};

/**
 * 同じ語なら並び順が変わっても変わらない番号。
 * 発話の番号、種類、語そのもの、その発話の中で何度目かだけで決める。
 * 認識が前に語を足しても後ろの語の番号は動かないので、同じ言葉の粒が二度出ない。
 * 言い直して語が変われば別の番号になり、演出はもう一度出せる。
 */
function wordId(entryId: number, key: string, repeat: number) {
  const text = `${key}#${repeat}`;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return entryId * 1000000 + Math.abs(h) % 1000000;
}

/**
 * 言葉ごとの「初めて現れた時刻」。認識の途中結果は同じ発話が何度も伸びて届き、
 * そのたびに発話の終わり時刻が後ろへ動く。そのまま使うと前に出た言葉の反応がやり直されるので、
 * 番号ごとに最初の時刻を覚えてずっと使う。
 * 鍵に回の開始時刻も入れる。発話の番号は回ごとに数え直すので、入れないと防御の回の言葉が
 * 一回目の時刻を拾ってしまう。
 */
const firstHeardAt = new Map<string, number>();

/** 覚え書きを消す。新しい一戦を始めるときに呼ぶ。 */
export function resetLiveWords() { firstHeardAt.clear(); }

function firstHeard(key: string, heard: number) {
  const known = firstHeardAt.get(key);
  if (known !== undefined) return known;
  firstHeardAt.set(key, heard);
  return heard;
}

/**
 * 音声の記録から、演出が反応すべき言葉を取り出す。語彙は spell-words.ts の表だけを見る。
 * offsetMs は、その回が始まった時刻。声の時刻は回ごとに0から数え直すので、
 * 演出が見る戦いの時刻へそろえるために足す。足さないと、防御の回は言葉への反応が
 * すべて「その回の始まりの分だけ前の言葉」になり、反応の窓から外れて一つも出なくなる。
 */
export function liveWords(entries: readonly SpeechEntry[], offsetMs = 0): LiveWord[] {
  // まだ何も聞こえていない間は、この回の覚え書きを捨てる。
  if (!entries.length) for (const key of [...firstHeardAt.keys()]) if (key.startsWith(`${offsetMs}:`)) firstHeardAt.delete(key);
  const found: LiveWord[] = [];
  for (const entry of [...entries].sort((a, b) => a.startMs - b.startMs)) {
    // 詠唱辞書で意味に直してから、否定と言い直しの前半を落とす。「炎ではなく氷」は氷だけが残る。
    const text = affirmativeText(readChant(entry.text ?? '').effects);
    const heard = (Number.isFinite(entry.endMs) && entry.endMs >= entry.startMs ? entry.endMs : entry.startMs) + offsetMs;
    // 同じ発話の中で同じ語が何度目に出たか。番号を分けるために数える。
    const seen = new Map<string, number>();
    const take = (key: string) => { const n = seen.get(key) ?? 0; seen.set(key, n + 1); return wordId(entry.id, key, n); };
    for (let at = 0; at < text.length;) {
      const digits = COUNT_HEAD.exec(text.slice(at));
      const count = digits ? explicitCount(digits[0]) : null;
      if (digits && count !== null) {
        const id = take(`count:${count}`);
        found.push({ id, text: digits[0], element: null, kind: 'count', count, atMs: firstHeard(`${offsetMs}:${id}`, heard), final: entry.final, form: null, purpose: null });
        at += digits[0].length; continue;
      }
      // 長い語から順に当てる。重なる意味（「光線」は形と属性）は表の行が持っている。
      const hit = TERMS_BY_LENGTH.find(term => text.startsWith(term.word, at));
      if (hit) {
        const id = take(`${hit.kind}:${hit.word}`);
        found.push({ id, text: hit.word, element: hit.element ?? null, kind: hit.kind, count: null, atMs: firstHeard(`${offsetMs}:${id}`, heard), final: entry.final, form: hit.form ?? null, purpose: hit.purpose ?? null });
        at += hit.word.length; continue;
      }
      at++;
    }
  }
  // 時刻の早い順に。時刻が同じなら言った順のまま残す（並べ替えは安定する）。
  return found.sort((a, b) => a.atMs - b.atMs);
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

/** 用途。確定側と同じく、守り・縛り・強化・攻めの順に先に当たったものを使う。 */
export function spokenPurpose(words: readonly LiveWord[]): Purpose | null {
  return PURPOSE_ORDER.find(purpose => words.some(w => w.purpose === purpose)) ?? null;
}

/** 形。確定側と同じ順で選び、二つ以上の個数を言っていれば連弾になる。 */
export function spokenForm(words: readonly LiveWord[]): Form | null {
  const count = words.find(w => w.kind === 'count')?.count ?? null;
  if (count !== null && count > 1) return 'swarm';
  return FORM_ORDER.find(form => words.some(w => w.form === form)) ?? null;
}
