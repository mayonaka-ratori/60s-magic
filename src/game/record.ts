import { chantDictionary } from './chant-dictionary';
import { GUARD_LABELS, type GuardStyle } from './guard';
import type { Element, Point, Recipe } from './types';

/**
 * 遊んだ一回分を、このPCのブラウザーの中（IndexedDB）へ残す仕組み。
 *
 * 残すのは、確認番号、開始時刻、三件のレシピ、術式の点列（本人の線と表示用の線）、
 * 詠唱の文字、引き継いだ形、時刻付きの手のひらの位置（点列が時刻を持っている）。
 * カメラの映像と声そのものは残さない。この決まりは変えない。
 *
 * 公開ページはまだ無いので、ここで作った記録はこのPCの中だけにある。
 * 結果画面はこの記録から組み立てられるようにしてあり、回線が無くても出せる。
 */

/** 確認番号の桁数。係員が読み上げられる長さにしてある。 */
export const CODE_DIGITS = 6;

/** 保存の状態。今は公開ページが無いので、いつも local-only になる。 */
export type DeliveryState = 'delivered' | 'sending' | 'not-sent' | 'local-only';
/** 結果画面に出す一行。届いていないものを「登録しました」と書かないための表。 */
export const DELIVERY_MESSAGES: Record<DeliveryState, string> = {
  delivered: '持ち帰れます',
  sending: '保存中。QRの先でお待ちください',
  'not-sent': 'まだ届いていません',
  'local-only': 'この画面でだけ見られます',
};
/** QRの場所に出す言葉。公開ページができるまでは、嘘のQRを出さずにこれを出す。 */
export const QR_PLACEHOLDER = '持ち帰りの準備中';

export type RoundId = 'first' | 'defend' | 'finish';
/** 回の名前。結果画面の三件の一行目に出す。 */
export const ROUND_TITLES: Record<RoundId, string> = { first: '一回目', defend: '防御', finish: 'とどめ' };

/** 防御の回の盾。形は本人が描いた線そのもの。 */
export type StoredGuard = {
  enclosed: boolean; rings: number; layers: number; moved: boolean; style: GuardStyle;
  outline: Array<{ x: number; y: number }>;
};
export type StoredRound = {
  round: RoundId; castId: string; recipe: Recipe | null; transcript: string;
  /** 本人の線の生の点列。時刻付きなので、手のひらがいつどこにあったかもここに残る。 */
  rawPoints: Point[];
  /** 表示用に揺れを抑えた点列。結果画面の絵はこちらから描く。 */
  displayPoints: Point[];
  guard: StoredGuard | null;
};
export type StoredPlay = {
  version: 'play-1'; code: string; sessionId: string; startedAt: string;
  inherited: Point[]; rounds: StoredRound[];
};

/**
 * 保存のもとになる戦い。Battle をそのまま渡せるが、型はここで必要な形だけを書いてある。
 * こうしておくと、この仕組みだけを取り出して試験できる。
 */
export type CastLike = {
  round: { id: string; castId: string };
  recipe: Recipe | null;
  motion: { raw: readonly Point[]; display: readonly Point[] };
  state: { speech: { rawTranscript: string } } | null;
  guard: { shield: { enclosed: boolean; rings: number; layers: number; moved: boolean; outline: ReadonlyArray<{ x: number; y: number }> }; style: GuardStyle } | null;
};
export type BattleLike = { id: string; casts: readonly CastLike[]; inherited: readonly Point[] };

/** 戦いの今の中身を、保存できる形に写し取る。あとから書き換わらないよう点は複製する。 */
export function playOf(battle: BattleLike, code: string, startedAt: string): StoredPlay {
  return {
    version: 'play-1', code, sessionId: battle.id, startedAt,
    inherited: battle.inherited.map(p => ({ ...p })),
    rounds: battle.casts.map(cast => ({
      round: cast.round.id as RoundId, castId: cast.round.castId,
      recipe: cast.recipe ? { ...cast.recipe } : null,
      transcript: cast.state?.speech.rawTranscript ?? '',
      rawPoints: cast.motion.raw.map(p => ({ ...p })),
      displayPoints: cast.motion.display.map(p => ({ ...p })),
      guard: cast.guard ? {
        enclosed: cast.guard.shield.enclosed, rings: cast.guard.shield.rings,
        layers: cast.guard.shield.layers, moved: cast.guard.shield.moved, style: cast.guard.style,
        outline: cast.guard.shield.outline.map(p => ({ x: p.x, y: p.y })),
      } : null,
    })),
  };
}

/** 結果画面の下の帯に並べる一件分。 */
export type ResultRow = {
  round: RoundId; title: string; name: string; note: string;
  element: Element | null;
  /** 絵に使う点列。防御の回は盾の形を使う。 */
  points: Point[];
  /** 代表の魔法（とどめ）か。 */
  main: boolean;
};

const outlinePoints = (outline: ReadonlyArray<{ x: number; y: number }>): Point[] =>
  outline.map((p, i) => ({ x: p.x, y: p.y, t: i, hand: 0, stroke: 0 }));

/** その回のひとこと。文字が小さくなるときは結果画面の側で省く。 */
function noteOf(round: StoredRound): string {
  if (round.round === 'defend' && round.guard) {
    const shape = round.guard.enclosed ? `印を${round.guard.rings}重に囲み` : '印の前へ運び';
    return `${shape}、騎士の一撃を${GUARD_LABELS[round.guard.style]}`;
  }
  if (round.transcript) return `「${round.transcript}」`;
  return '線だけで作った';
}

/**
 * 保存した記録から、結果画面に並べる三件を作る。
 * 画面に出るものと実際に確定した魔法が必ず同じになるよう、ここ一か所で決める。
 */
export function resultRows(play: StoredPlay): ResultRow[] {
  return play.rounds.map(round => ({
    round: round.round, title: ROUND_TITLES[round.round],
    name: round.recipe?.name ?? '（作れませんでした）',
    note: noteOf(round), element: round.recipe?.element ?? null,
    points: round.round === 'defend' && round.guard?.outline.length ? outlinePoints(round.guard.outline) : round.displayPoints,
    main: round.round === 'finish',
  }));
}

/**
 * 確認番号を作る。乱数で6桁を作り、保存済みの番号と同じなら作り直す。
 * 日付や通し番号は入れない。順番から人数が分かってしまうため。
 */
export function makeCode(taken: Iterable<string> = [], random: () => number = Math.random): string {
  const used = new Set(taken), limit = 10 ** CODE_DIGITS;
  const format = (value: number) => String(value).padStart(CODE_DIGITS, '0');
  for (let i = 0; i < 200; i++) {
    const value = Math.floor(Math.min(0.999999999, Math.max(0, random())) * limit);
    const code = format(value);
    if (!used.has(code)) return code;
  }
  // 乱数が何度も重なったときだけ、空いている番号を順に探す。
  for (let value = 0; value < limit; value++) { const code = format(value); if (!used.has(code)) return code; }
  throw new Error('確認番号の空きがありません');
}

/** 記録の置き場所。試験では覚えておくだけの置き場所に差し替える。 */
export type RecordStore = {
  list(): Promise<string[]>;
  save(play: StoredPlay): Promise<void>;
  load(code: string): Promise<StoredPlay | null>;
};

/** 覚えておくだけの置き場所。IndexedDBを使えないときと、試験で使う。 */
export function memoryStore(seed: readonly StoredPlay[] = []): RecordStore {
  // 書き込んだ後に元の値をいじっても記録が変わらないよう、出し入れのたびに写し取る。
  const copy = (play: StoredPlay) => JSON.parse(JSON.stringify(play)) as StoredPlay;
  const kept = new Map<string, StoredPlay>(seed.map(play => [play.code, copy(play)]));
  return {
    list: async () => [...kept.keys()],
    save: async play => { kept.set(play.code, copy(play)); },
    load: async code => { const found = kept.get(code); return found ? copy(found) : null; },
  };
}

const DB_NAME = 'magic60s-plays', TABLE = 'plays';

/**
 * このPCのブラウザーの中への置き場所。使えない環境（試験、プライベートモード）では null を返す。
 * 呼ぶ側は例外を受け取らず、保存できなかったことを状態として持つ。
 */
export function browserStore(dbName = DB_NAME): RecordStore | null {
  if (typeof indexedDB === 'undefined') return null;
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(TABLE)) request.result.createObjectStore(TABLE, { keyPath: 'code' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('記録の置き場所を開けませんでした'));
  });
  const run = <T>(mode: IDBTransactionMode, body: (table: IDBObjectStore) => IDBRequest<T>) => open().then(db => new Promise<T>((resolve, reject) => {
    const request = body(db.transaction(TABLE, mode).objectStore(TABLE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('記録を読み書きできませんでした'));
  }).finally(() => db.close()));
  return {
    list: () => run<IDBValidKey[]>('readonly', table => table.getAllKeys()).then(keys => keys.map(String)),
    save: play => run('readwrite', table => table.put(play)).then(() => undefined),
    load: code => run<StoredPlay | undefined>('readonly', table => table.get(code)).then(found => found ?? null),
  };
}

/**
 * 一回の遊びの記録係。開始のときに作り、魔法が確定するたびに保存し直す。
 * 保存に失敗しても例外は投げない。失敗したことを stored と failure に残すだけにする。
 */
export class PlayRecorder {
  /** 保存できたか。IndexedDBを使えないときは false のままになる。 */
  stored = false;
  /** 保存できなかった理由。確認用の記録にだけ出す。 */
  failure: string | null = null;
  /** ここまでに保存した、確定済みの回の数。 */
  private savedRounds = 0;
  private constructor(readonly code: string, readonly startedAt: string, private readonly store: RecordStore, readonly available: boolean) {}

  /** 開始のときに呼ぶ。保存済みの番号を見てから、重ならない確認番号を作る。 */
  static async open(store: RecordStore | null = null, random: () => number = Math.random, now: () => Date = () => new Date()): Promise<PlayRecorder> {
    const made = store ?? browserStore();
    const use = made ?? memoryStore();
    let taken: string[] = [];
    try { taken = await use.list(); } catch { taken = []; }
    return new PlayRecorder(makeCode(taken, random), now().toISOString(), use, made !== null);
  }

  /** 確定済みで、まだ保存していない回があれば保存する。何度呼んでもよい。 */
  async save(battle: BattleLike): Promise<StoredPlay> {
    const play = playOf(battle, this.code, this.startedAt);
    const locked = play.rounds.filter(round => round.recipe).length;
    if (locked === 0 || locked < this.savedRounds) return play;
    this.savedRounds = locked;
    try { await this.store.save(play); this.stored = true; this.failure = null; }
    catch (error) { this.stored = false; this.failure = error instanceof Error ? error.message : '保存できませんでした'; }
    return play;
  }

  /** 保存してあるものを読み戻す。結果画面はこれだけで組み立てられる。 */
  load(code: string = this.code): Promise<StoredPlay | null> {
    return this.store.load(code).catch(() => null);
  }

  /** 保存の状態。公開ページができたら、ここが delivered や not-sent に変わる。 */
  get delivery(): DeliveryState { return 'local-only'; }
  /** 結果画面に出す一行。 */
  get message(): string { return DELIVERY_MESSAGES[this.delivery]; }
}

/**
 * 魔法名のふりがな。
 *
 * 読みは詠唱の辞書（chant-dictionary.json）から引ける語にだけ付ける。
 * 引けない語には付けない。読みを当て推量で作ると、嘘のふりがなが出てしまう。
 */
export type NamePart = { text: string; reading?: string };
const READINGS = new Map<string, string>(
  chantDictionary.entries.filter(word => word.reading && word.reading !== word.term).map(word => [word.term, word.reading]),
);
// 長い語から先に当てる。「連弾」を「弾」で切らないため。かなだけの語にはふりがなを付けない。
const RUBY_TERMS = [...READINGS.keys()].filter(term => /[一-鿿]/.test(term)).sort((a, b) => b.length - a.length);

/** 魔法名を、ふりがなを付ける語とそれ以外に切り分ける。 */
export function nameParts(name: string): NamePart[] {
  const parts: NamePart[] = [];
  let plain = '';
  for (let i = 0; i < name.length;) {
    const hit = RUBY_TERMS.find(term => name.startsWith(term, i));
    if (!hit) { plain += name[i]; i++; continue; }
    if (plain) { parts.push({ text: plain }); plain = ''; }
    parts.push({ text: hit, reading: READINGS.get(hit)! });
    i += hit.length;
  }
  if (plain) parts.push({ text: plain });
  return parts;
}
