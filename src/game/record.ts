import { chantDictionary } from './chant-dictionary';
import { GUARD_LABELS, type GuardStyle } from './guard';
import type { Element, Point, Recipe } from './types';
import { FLOW, type Flow } from './rounds';
import type { InheritedPoint } from './voice-growth';

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

/**
 * 保存の状態。今は公開ページが無いので、うまくいけば local-only になる。
 * このPCの中にも一件も残せなかったときは not-stored にする。
 */
export type DeliveryState = 'delivered' | 'sending' | 'not-sent' | 'local-only' | 'not-stored';
/** 結果画面に出す一行。届いていないものを「登録しました」と書かないための表。 */
export const DELIVERY_MESSAGES: Record<DeliveryState, string> = {
  delivered: '持ち帰れます',
  sending: '保存中。QRの先でお待ちください',
  'not-sent': 'まだ届いていません',
  'local-only': 'この画面でだけ見られます',
  'not-stored': '保存できませんでした。この画面を閉じると消えます',
};

/** このPCの中に残しておく記録の数。これを超えたら古いものから消す。 */
export const KEEP_PLAYS = 200;
/** 生の点列を間引くときの、1秒あたりの点の数（設計仕様4.2）。 */
export const RAW_POINTS_PER_SECOND = 30;
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
  /** 声だけの回の絵に残す属性の色。無い記録は本人の線を使う。 */
  voiceColors?: Element[];
  /** 表示用に揺れを抑えた点列。結果画面の絵はこちらから描く。 */
  displayPoints: Point[];
  guard: StoredGuard | null;
};
/** 点列の読み方など、あとから見る人のための付帯情報（設計仕様4.2）。 */
export type PlayContext = {
  /** 手の位置の測り方。画面の横幅と高さを1とした値。 */
  coordinates: 'normalized-0-1';
  /** 左右を裏返して記録しているか。分からないときは null。 */
  mirrored: boolean | null;
  /** そのとき遊んでいた画面の大きさ。 */
  viewport: { width: number; height: number };
  /** 描き方。カメラの手、マウス、見本の自動再生。 */
  inputMode: 'camera' | 'pointer' | 'demo';
};
export type StoredPlay = PlayContext & {
  version: 'play-1'; code: string; sessionId: string; startedAt: string;
  /** 古い記録では無いことがある。その場合は一回目の声の円の有無から読む。 */
  flow?: Flow;
  /** 最後まで遊ばずに中止したか。 */
  cancelled: boolean;
  /** 魔法が確定した回の数。 */
  completedRounds: number;
  inherited: InheritedPoint[]; rounds: StoredRound[];
};

/** 名前の追加前にも声だけの回はあった。円の記録があれば「順番に」、それ以前は「同時に」。 */
export const storedFlow=(play:Pick<StoredPlay,'flow'|'rounds'>):Flow=>play.flow??
  (play.rounds.some(round=>round.round==='first'&&round.voiceColors!==undefined)?'sequential':'together');

/** 付帯情報が分からないときの既定。試験や、画面の大きさを取れない場所で使う。 */
export const UNKNOWN_CONTEXT: PlayContext = {
  coordinates: 'normalized-0-1', mirrored: null, viewport: { width: 0, height: 0 }, inputMode: 'pointer',
};

/**
 * 生の点列を1秒あたり RAW_POINTS_PER_SECOND 点まで間引く。
 * 線の始まりと終わり、線が変わったところは必ず残すので、形は崩れない。
 */
export function thinPoints(points: readonly Point[], perSecond = RAW_POINTS_PER_SECOND): Point[] {
  // 手ごとに数える。両手で描いていても、片方の手が1秒30点を超えないようにする。
  const last = new Map<number, { slot: number; stroke: number }>();
  const kept: Point[] = [];
  points.forEach((point, index) => {
    const slot = Math.floor(point.t * perSecond / 1000);
    const seen = last.get(point.hand);
    if (!seen || seen.stroke !== point.stroke || seen.slot !== slot || index === points.length - 1) {
      kept.push({ ...point }); last.set(point.hand, { slot, stroke: point.stroke });
    }
  });
  return kept;
}

/**
 * 保存のもとになる戦い。Battle をそのまま渡せるが、型はここで必要な形だけを書いてある。
 * こうしておくと、この仕組みだけを取り出して試験できる。
 */
export type CastLike = {
  round: { id: string; castId: string };
  recipe: Recipe | null;
  motion: { raw: readonly Point[]; display: readonly Point[] };
  state: { speech: { rawTranscript: string }; inputWindow?: {drawEndSessionMs: number | null} } | null;
  growth?: { snapshot(): Array<{element:Element|null;active:boolean}> };
  guard: { shield: { enclosed: boolean; rings: number; layers: number; moved: boolean; outline: ReadonlyArray<{ x: number; y: number }> }; style: GuardStyle } | null;
};
export type BattleLike = { id: string; casts: readonly CastLike[]; inherited: readonly Point[] };

/** 戦いの今の中身を、保存できる形に写し取る。あとから書き換わらないよう点は複製する。 */
export function playOf(battle: BattleLike, code: string, startedAt: string, context: PlayContext = UNKNOWN_CONTEXT, cancelled = false): StoredPlay {
  return {
    version: 'play-1', code, sessionId: battle.id, startedAt, flow:FLOW,
    ...context, cancelled,
    completedRounds: battle.casts.filter(cast => cast.recipe).length,
    inherited: battle.inherited.map(p => ({ ...p })),
    rounds: battle.casts.map(cast => ({
      round: cast.round.id as RoundId, castId: cast.round.castId,
      recipe: cast.recipe ? { ...cast.recipe } : null,
      transcript: cast.state?.speech.rawTranscript ?? '',
      ...(cast.state?.inputWindow?.drawEndSessionMs===null?{voiceColors:[...new Set(cast.growth?.snapshot().filter(p=>p.active&&p.element).map(p=>p.element!)??[])]}:{}),
      rawPoints: thinPoints(cast.motion.raw),
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
  voiceColors?: Element[];
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
  return round.voiceColors?'詠唱を記録できませんでした':'線だけで作った';
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
    ...(round.voiceColors?{voiceColors:[...round.voiceColors]}:{}),
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

/** 確認番号がすでにほかの記録に使われていたときの合図。番号を作り直して保存し直す。 */
export class CodeTakenError extends Error {
  constructor(readonly code: string) { super(`確認番号 ${code} はすでに使われています`); this.name = 'CodeTakenError'; }
}

/** 記録の置き場所。試験では覚えておくだけの置き場所に差し替える。 */
export type RecordStore = {
  list(): Promise<string[]>;
  /** 同じ番号でほかの人の記録があるときは CodeTakenError を投げる。上書きはしない。 */
  save(play: StoredPlay): Promise<void>;
  load(code: string): Promise<StoredPlay | null>;
  /** 古い記録を消して、残す数を limit 件までにする。消した件数を返す。 */
  prune?(limit: number): Promise<number>;
  /** 本当に読み書きできるか、一度開いて確かめる。 */
  probe?(): Promise<boolean>;
};

/** 覚えておくだけの置き場所。IndexedDBを使えないときと、試験で使う。 */
export function memoryStore(seed: readonly StoredPlay[] = []): RecordStore {
  // 書き込んだ後に元の値をいじっても記録が変わらないよう、出し入れのたびに写し取る。
  const copy = (play: StoredPlay) => JSON.parse(JSON.stringify(play)) as StoredPlay;
  const kept = new Map<string, StoredPlay>(seed.map(play => [play.code, copy(play)]));
  return {
    list: async () => [...kept.keys()],
    save: async play => {
      const found = kept.get(play.code);
      if (found && found.sessionId !== play.sessionId) throw new CodeTakenError(play.code);
      kept.set(play.code, copy(play));
    },
    load: async code => { const found = kept.get(code); return found ? copy(found) : null; },
    prune: async limit => {
      const old = [...kept.values()].sort((a, b) => a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0).slice(0, Math.max(0, kept.size - limit));
      for (const play of old) kept.delete(play.code);
      return old.length;
    },
    probe: async () => true,
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
    request.onblocked = () => reject(new Error('記録の置き場所を開けませんでした'));
  });
  // 一つの要求の返事を待つ。失敗しても例外を投げるだけで、まとまりごと止めはしない。
  const ask = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    // preventDefault を呼ばないと、失敗がまとまり全体の取り消しに広がる。番号の重なりは自分で拾いたいので止める。
    request.onerror = failed => { failed.preventDefault(); reject(request.error ?? new Error('記録を読み書きできませんでした')); };
  });
  const run = <T>(mode: IDBTransactionMode, body: (table: IDBObjectStore) => Promise<T>) =>
    open().then(db => body(db.transaction(TABLE, mode).objectStore(TABLE)).finally(() => db.close()));
  return {
    list: () => run('readonly', table => ask<IDBValidKey[]>(table.getAllKeys())).then(keys => keys.map(String)),
    // add で入れる。同じ番号がすでにあるときは、自分の記録なら書き直し、ほかの人のものなら合図を返す。
    save: play => run('readwrite', async table => {
      try { await ask(table.add(play)); return; }
      catch (error) {
        const found = await ask<StoredPlay | undefined>(table.get(play.code));
        if (!found) throw error;
        if (found.sessionId !== play.sessionId) throw new CodeTakenError(play.code);
        await ask(table.put(play));
      }
    }),
    load: code => run('readonly', table => ask<StoredPlay | undefined>(table.get(code))).then(found => found ?? null),
    // 古い記録から消して limit 件までにする。開始時刻の早いものから消す。
    prune: limit => run('readwrite', async table => {
      const all = await ask<StoredPlay[]>(table.getAll());
      if (all.length <= limit) return 0;
      const old = all.sort((a, b) => a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0).slice(0, all.length - limit);
      // 消す要求はまとめて出す。一つずつ待つと、まとまりが先に閉じてしまうことがある。
      await Promise.all(old.map(play => ask(table.delete(play.code))));
      return old.length;
    }),
    // 実際に一度開けたときだけ、使える置き場所と見なす。
    probe: () => open().then(db => { db.close(); return true; }).catch(() => false),
  };
}

/**
 * 一回の遊びの記録係。開始のときに作り、魔法が確定するたびに保存し直す。
 * 保存に失敗しても例外は投げない。失敗したことを stored と failure に残すだけにする。
 */
export class PlayRecorder {
  /** 保存できたか。一度も保存できていないときは false のままになる。 */
  stored = false;
  /** 保存できなかった理由。確認用の記録にだけ出す。 */
  failure: string | null = null;
  /** 確認番号。ほかの記録と重なったときだけ、保存のときに作り直す。 */
  code: string;
  /** ここまでに保存した、確定済みの回の数。 */
  private savedRounds = 0;
  /** 中止の印をもう付けたか。中止の保存は一度だけにする。 */
  private cancelSaved = false;
  /** 付帯情報。開始のときに main 側から渡す。 */
  context: PlayContext = UNKNOWN_CONTEXT;
  private constructor(code: string, readonly startedAt: string, private readonly store: RecordStore, readonly available: boolean, private readonly random: () => number) { this.code = code; }

  /**
   * 開始のときに呼ぶ。置き場所を本当に開けるか確かめ、古い記録を片付けてから、
   * 保存済みの番号と重ならない確認番号を作る。
   */
  static async open(store: RecordStore | null = null, random: () => number = Math.random, now: () => Date = () => new Date(), context: PlayContext = UNKNOWN_CONTEXT): Promise<PlayRecorder> {
    const made = store ?? browserStore();
    // 有る無しだけでなく、一度開いてみて使えるか確かめる。開けないときは覚えておくだけの置き場所にする。
    const usable = made !== null && (made.probe ? await made.probe().catch(() => false) : true);
    const use = usable && made ? made : memoryStore();
    // 古い記録は、番号を作る前に片付ける。ここで失敗しても遊びは止めない。
    try { await use.prune?.(KEEP_PLAYS); } catch { /* 片付けられなくても続ける */ }
    let taken: string[] = [];
    try { taken = await use.list(); } catch { taken = []; }
    const recorder = new PlayRecorder(makeCode(taken, random), now().toISOString(), use, usable, random);
    recorder.context = context;
    return recorder;
  }

  /** 確定済みで、まだ保存していない回があれば保存する。何度呼んでもよい。 */
  async save(battle: BattleLike): Promise<StoredPlay> {
    const play = playOf(battle, this.code, this.startedAt, this.context);
    if (play.completedRounds === 0 || play.completedRounds < this.savedRounds) return play;
    this.savedRounds = play.completedRounds;
    await this.write(play);
    return play;
  }

  /**
   * 途中でやめたときに一度だけ呼ぶ。保存済みの記録に中止の印を付ける。
   * まだ一件も保存していないときは、何も残さない。
   */
  async saveCancelled(battle: BattleLike): Promise<StoredPlay | null> {
    if (this.cancelSaved || this.savedRounds === 0) return null;
    this.cancelSaved = true;
    const play = playOf(battle, this.code, this.startedAt, this.context, true);
    await this.write(play);
    return play;
  }

  /**
   * 実際に書き込む。番号がほかの記録と重なったときは、番号を作り直して入れ直す。
   * 保存に失敗しても例外は投げない。失敗したことを stored と failure に残すだけにする。
   */
  private async write(play: StoredPlay): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await this.store.save(play); this.stored = true; this.failure = null; return; }
      catch (error) {
        if (!(error instanceof CodeTakenError)) {
          this.stored = false; this.failure = error instanceof Error ? error.message : '保存できませんでした'; return;
        }
        let taken: string[] = [];
        try { taken = await this.store.list(); } catch { taken = [this.code]; }
        this.code = makeCode(taken, this.random);
        play.code = this.code;
      }
    }
    this.stored = false; this.failure = '確認番号の空きを見つけられませんでした';
  }

  /** 保存してあるものを読み戻す。結果画面はこれだけで組み立てられる。 */
  load(code: string = this.code): Promise<StoredPlay | null> {
    return this.store.load(code).then(play=>play?{...play,flow:storedFlow(play)}:null).catch(() => null);
  }

  /**
   * 保存の状態。このPCの中に一件も残せていなければ not-stored にする。
   * 公開ページができたら、ここに delivered や not-sent が増える。
   */
  get delivery(): DeliveryState {
    if (!this.available || this.failure) return 'not-stored';
    return this.stored ? 'local-only' : 'not-stored';
  }
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
