import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { presets, getPreset, intensityOf, increase, mixHue, lighten } from '../src/render/effects/presets';
import { hitDelay } from '../src/render/effects/release';
import { screenState, effectTime, hitStopOf, shockAt, wobble, HIT_STOPS, IMPACT_AT, RELEASE_AT } from '../src/render/effects/screen';
import { ParticlePool } from '../src/render/effects/particles';
import { drawImpact } from '../src/render/effects/impact';
import { type Frame } from '../src/render/effects/frame';
import { MagicCanvas } from '../src/render/magic';
import { ELEMENTS, type Recipe } from '../src/game/types';

/**
 * 描く命令を受け流すだけの仮のcanvas。どの命令も自分を返すので、gradient も使える。
 * 記録用の配列を渡すと、描いた命令と数の指定を書き出す。node には本物のcanvasがないため。
 */
const digits = (v: number) => Math.round(v * 1000) / 1000;
const stubContext = (log?: string[]) => {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => {
      log?.push(key + ':' + args.filter(a => typeof a === 'number').map(a => digits(a as number)).join(','));
      return fake;
    }),
    set: (target, key: string, value) => {
      if (typeof value === 'number') log?.push(key + '=' + digits(value));
      target[key] = value; return true;
    },
  });
  return fake as CanvasRenderingContext2D;
};

const recipe = (over: Partial<Recipe> = {}): Recipe => ({ version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight', count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

describe('見た目の設定', () => {
  it('全属性に4色があり、未知の名前は既定の設定になる', () => {
    for (const preset of Object.values(presets)) for (const element of ELEMENTS) {
      const p = preset.palettes[element];
      for (const color of [p.main, p.edge, p.core, p.spark]) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(getPreset('ないもの').name).toBe('vivid');
    expect(getPreset(null).name).toBe('vivid');
  });
  it('派手さは0〜3に収まり、個数と範囲で増え、設定の順に大きくなる', () => {
    const small = intensityOf(recipe({ count: 1, area: .2, concentration: 0, purpose: 'defend' }), presets.calm);
    const large = intensityOf(recipe({ count: 8, area: 1, concentration: 1 }), presets.max, 1);
    expect(small).toBeGreaterThanOrEqual(0); expect(large).toBeLessThanOrEqual(3);
    expect(intensityOf(recipe({ count: 8 }), presets.vivid)).toBeGreaterThan(intensityOf(recipe({ count: 1 }), presets.vivid));
    expect(intensityOf(recipe(), presets.calm)).toBeLessThan(intensityOf(recipe(), presets.vivid));
    expect(intensityOf(recipe(), presets.vivid)).toBeLessThan(intensityOf(recipe(), presets.max));
    expect(increase(100, 0)).toBe(100); expect(increase(100, 2)).toBe(200);
  });
  it('設定は倍率なので、最大の設定でもレシピの違いが派手さに出る', () => {
    const smallest = recipe({ count: 1, area: .2, concentration: 0 }), biggest = recipe({ count: 8, area: 1, concentration: 1 });
    // 最大の設定でも、小さいレシピは上限に張り付かない。量を目一杯足しても3に届かない。
    expect(intensityOf(smallest, presets.max, 1)).toBeLessThan(3);
    // レシピの違いがそのまま差になる。ふつうの魔法は最大の設定でも3に届かない。
    expect(intensityOf(biggest, presets.max) - intensityOf(smallest, presets.max)).toBeGreaterThan(1);
    expect(intensityOf(recipe(), presets.max)).toBeLessThan(3);
    // 3に届くのは、8連弾（範囲と収束も目一杯）に最大の設定か入力の量を重ねたときだけ。派手の設定では量を足さなければ届かない。
    expect(intensityOf(biggest, presets.max, 1)).toBe(3);
    expect(intensityOf(biggest, presets.vivid)).toBeLessThan(3);
    // 派手（既定）のふつうの魔法は1.9のまま。実機で確認した見た目を変えない。
    expect(intensityOf(recipe(), presets.vivid)).toBeCloseTo(1.9, 5);
  });
  it('入力の量は設定によらず同じだけ足され、最大で0.6', () => {
    for (const preset of [presets.calm, presets.vivid, presets.max]) {
      const none = intensityOf(recipe(), preset), full = intensityOf(recipe(), preset, 1);
      expect(full - none).toBeCloseTo(.6, 5);
      expect(intensityOf(recipe(), preset, .5) - none).toBeCloseTo(.3, 5);
    }
  });
});

describe('画面全体の効果', () => {
  it('放出前は揺れも閃光もなく、命中で最大になり、その後収まる', () => {
    const before = screenState(16.9, 2, presets.vivid, 'attack');
    expect(before.shakeX).toBe(0); expect(before.flash).toBe(0);
    const hit = screenState(18.51, 2, presets.vivid, 'attack'), later = screenState(19.4, 2, presets.vivid, 'attack');
    expect(hit.flash).toBeGreaterThan(.3); expect(Math.abs(hit.shakeX) + Math.abs(hit.shakeY)).toBeGreaterThan(0);
    expect(later.flash).toBe(0); expect(later.shakeX).toBe(0); expect(later.shakeY).toBe(0);
  });
  it('防御と強化は揺らさず、控えめの設定は閃光が弱い', () => {
    expect(screenState(18.52, 3, presets.max, 'enhance').shakeX).toBe(0);
    expect(screenState(18.52, 3, presets.max, 'bind').shakeY).toBe(0);
    expect(screenState(18.52, 1, presets.calm, 'attack').flash).toBeLessThan(screenState(18.52, 1, presets.max, 'attack').flash);
    expect(screenState(18.52, 1, presets.calm, 'attack').hitStop).toBe(0);
  });
  it('背景は蓄積で暗くなり、放出で一度抜け、余韻の後に戻る', () => {
    const s = (t: number) => screenState(t, 1, presets.vivid, 'attack').darken;
    expect(s(13.9)).toBe(0); expect(s(16.5)).toBeGreaterThan(.2); expect(s(17.1)).toBeLessThan(s(16.5)); expect(s(23)).toBeLessThan(.01);
  });
  it('命中の停止は演出の時計だけを止める', () => {
    expect(effectTime(18.4, .1)).toBe(18.4);
    expect(effectTime(18.55, .1)).toBe(18.5);
    expect(effectTime(18.7, .1)).toBeCloseTo(18.6);
    expect(effectTime(18.7, 0)).toBe(18.7);
  });
});

describe('粒の置き場', () => {
  it('上限を超えず、寿命が尽きると消え、同じ種で同じ散り方になる', () => {
    const pool = new ParticlePool(10); pool.reseed(3);
    for (let i = 0; i < 25; i++) pool.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: .5 });
    expect(pool.count).toBe(10);
    pool.update(.3); expect(pool.count).toBe(10); expect(pool.items[0].x).toBeCloseTo(3);
    pool.update(.3); expect(pool.count).toBe(0);
    const a = new ParticlePool(2), b = new ParticlePool(2); a.reseed(9); b.reseed(9);
    expect(a.random()).toBe(b.random());
  });
  it('上限ちょうどまでしか出ず、設定ごとの上限は命中の粒より多い', () => {
    const pool = new ParticlePool(presets.max.maxParticles);
    for (let i = 0; i < presets.max.maxParticles + 400; i++) pool.spawn({ life: 1 });
    expect(pool.count).toBe(presets.max.maxParticles);
    // 8連弾の命中で出る約1400個が横取りされずに収まる。控えめは据え置き。
    expect(presets.max.maxParticles).toBe(1500);
    expect(presets.vivid.maxParticles).toBe(900);
    expect(presets.calm.maxParticles).toBe(250);
    const room = new ParticlePool(presets.max.maxParticles);
    for (let i = 0; i < 1394; i++) room.spawn({ life: 1 });
    expect(room.count).toBe(1394);
  });
  it('空いた場所を使い回し、生きている粒は横取りしない', () => {
    const pool = new ParticlePool(3);
    const first = pool.spawn({ x: 1, life: 1 }), short = pool.spawn({ x: 2, life: .1 }), third = pool.spawn({ x: 3, life: 1 });
    expect(pool.count).toBe(3);
    pool.update(.2);
    expect(pool.count).toBe(2); expect(short.alive).toBe(false);
    // 空いたのは2番目の場所。次の粒はそこに入り、1番目と3番目はそのまま残る。
    const next = pool.spawn({ x: 4, life: 1 });
    expect(next).toBe(pool.items[1]); expect(next.x).toBe(4);
    expect(pool.count).toBe(3); expect(first.x).toBe(1); expect(third.x).toBe(3);
  });
  it('消えては出るを繰り返しても、空きがある限り生きた粒は減らない', () => {
    const pool = new ParticlePool(40);
    for (let round = 0; round < 30; round++) {
      for (let i = 0; i < 12; i++) {
        const before = pool.count;
        pool.spawn({ life: .1 + (i % 4) * .1 });
        expect(pool.count).toBe(Math.min(40, before + 1));
      }
      pool.update(.15);
      expect(pool.count).toBe(pool.items.filter(p => p.alive).length);
    }
    pool.update(10); expect(pool.count).toBe(0);
    // 全部消えた後もまた上限ちょうどまで出せる。
    for (let i = 0; i < 60; i++) pool.spawn({ life: 1 });
    expect(pool.count).toBe(40);
  });
  it('出し直しても入れ物を作り直さず、前の値も残さない', () => {
    const pool = new ParticlePool(4);
    const first = [...pool.items];
    for (let turn = 0; turn < 5; turn++) {
      for (let i = 0; i < 4; i++) pool.spawn({ x: i, gravity: 300, life: .1 });
      pool.update(.2);
    }
    // 何度出し直しても、置き場の粒は最初に作ったものと同じまま。
    pool.items.forEach((p, i) => expect(p).toBe(first[i]));
    // 指定しなかった項目は前の値ではなく既定値に戻る。
    const again = pool.spawn({ life: 1 });
    expect(again.gravity).toBe(0); expect(again.x).toBe(0); expect(again.drag).toBe(1); expect(again.color).toBe('#fff');
  });
  it('吸い込み先に届いた粒は消える', () => {
    const pool = new ParticlePool(1); pool.spawn({ x: 100, y: 0, pull: 4000, px: 0, py: 0, life: 5 });
    for (let i = 0; i < 100; i++) pool.update(.03);
    expect(pool.count).toBe(0);
  });
});

describe('揺れ、寄り、暗転', () => {
  const vivid = (t: number, calm = false) => screenState(t, 2, presets.vivid, 'attack', 0, .5, calm);
  it('揺れは命中の直後が一番強く、時間とともに減って止まる', () => {
    const size = (t: number) => Math.hypot(vivid(t).shakeX, vivid(t).shakeY);
    expect(size(18.52)).toBeGreaterThan(size(18.8));
    expect(size(18.8)).toBeGreaterThan(size(19.05));
    expect(size(19.3)).toBe(0);
    // 衝撃の強さは減り続け、同じ時刻なら何度でも同じ値になる。
    expect(shockAt(18.6, .5, 1)).toBeGreaterThan(shockAt(18.9, .5, 1));
    expect(vivid(18.6).shakeX).toBe(vivid(18.6).shakeX);
    expect(wobble(3.42, 1)).toBe(wobble(3.42, 1));
    expect(Math.abs(wobble(7.77, 2))).toBeLessThanOrEqual(1);
  });
  it('傾きは1度までで、寄りは等倍から2割の間に収まり、命中が一番強い', () => {
    const zoomOf = (t: number) => screenState(t, 3, presets.max, 'attack').zoom;
    for (let t = 17; t < 19.5; t += .01) {
      const s = screenState(t, 3, presets.max, 'attack');
      expect(Math.abs(s.rotate)).toBeLessThanOrEqual(1);
      // 引くことはなく、寄りすぎて絵が破綻することもない。
      expect(s.zoom).toBeGreaterThanOrEqual(1);
      expect(s.zoom).toBeLessThan(1.2);
    }
    expect(zoomOf(IMPACT_AT)).toBeGreaterThan(zoomOf(17.6));
    expect(zoomOf(IMPACT_AT)).toBeGreaterThan(zoomOf(19.2));
  });
  it('控えめモードでは揺れも傾きも寄りも停止もなく、閃光は3分の1', () => {
    const calm = vivid(18.52, true);
    expect(calm.shakeX).toBe(0); expect(calm.shakeY).toBe(0);
    expect(calm.rotate).toBe(0); expect(calm.zoom).toBe(1); expect(calm.hitStop).toBe(0);
    expect(calm.chromatic).toBe(0);
    expect(calm.flash).toBeCloseTo(vivid(18.52).flash / 3, 5);
  });
  it('寄りは溜めの後半で1.03倍まで進み、命中で1.1倍から0.3秒で戻る', () => {
    const zoomOf = (t: number) => screenState(t, 1, presets.vivid, 'attack').zoom;
    expect(zoomOf(15.4)).toBeCloseTo(1, 3);
    expect(zoomOf(16.3)).toBeGreaterThan(zoomOf(15.8));
    expect(zoomOf(16.99)).toBeCloseTo(1.03, 3);
    // 命中の瞬間は寄り1.1倍に揺れの拡大が少し乗る。
    expect(zoomOf(18.5)).toBeGreaterThan(1.09); expect(zoomOf(18.5)).toBeLessThan(1.14);
    expect(zoomOf(18.7)).toBeLessThan(zoomOf(18.55));
    expect(zoomOf(18.81)).toBeLessThan(1.03);
  });
  it('放出の直前だけ完全に暗転し、17秒で抜ける', () => {
    const black = (t: number) => screenState(t, 1, presets.vivid, 'attack').blackout;
    expect(black(16.9)).toBe(0);
    expect(black(16.95)).toBeGreaterThan(.5);
    expect(black(16.99)).toBe(1);
    expect(black(17)).toBe(0);
  });
  it('背景の彩度は溜めの後半で0.6まで落ち、命中の後に戻る', () => {
    const sat = (t: number) => screenState(t, 1, presets.vivid, 'attack').saturate;
    expect(sat(15.4)).toBe(1);
    expect(sat(16.2)).toBeLessThan(1);
    expect(sat(17)).toBeCloseTo(.6, 3);
    expect(sat(19.2)).toBeGreaterThan(sat(18.6));
    expect(sat(20.5)).toBeCloseTo(1, 3);
  });
  it('命中の停止は弱60ms、強90ms、とどめ200msの三段で、とどめは派手さが3のときだけ', () => {
    expect(hitStopOf(presets.vivid, .5)).toBeCloseTo(.06);
    expect(hitStopOf(presets.vivid, 2)).toBeCloseTo(.09);
    expect(hitStopOf(presets.vivid, 2.8)).toBeCloseTo(.09);
    expect(hitStopOf(presets.vivid, 3)).toBeCloseTo(.2);
    expect(hitStopOf(presets.calm, 3)).toBe(0);
    expect(hitStopOf(presets.max, 3, true)).toBe(0);
  });
  it('入力の量は派手さだけに効き、停止と暗転と揺れには二重にかからない', () => {
    // 線をたくさん描いただけ（量1、レシピは最小）では、とどめの停止まで届かない。
    const simple = recipe({ count: 1, area: 0, concentration: 0 });
    const full = intensityOf(simple, presets.vivid, 1);
    expect(full).toBeLessThan(3);
    expect(hitStopOf(presets.vivid, full)).toBeLessThan(HIT_STOPS.finish);
    // screenState の6番目の引数（昔の入力の量）は、もう何にも効かない。
    const withAmount = screenState(16.5, 1, presets.vivid, 'attack', 0, 1);
    const without = screenState(16.5, 1, presets.vivid, 'attack', 0, 0);
    expect(withAmount.darken).toBe(without.darken);
    expect(withAmount.hitStop).toBe(without.hitStop);
    const swing = (amount: number) => { const s = screenState(17.05, 1, presets.vivid, 'attack', 0, amount); return Math.abs(s.shakeX) + Math.abs(s.shakeY); };
    expect(swing(1)).toBe(swing(0));
    // 量は派手さを通して停止に効く。派手さが3に届いたときだけとどめになる。
    const biggest = recipe({ count: 8, area: 1, concentration: 1 });
    expect(hitStopOf(presets.max, intensityOf(biggest, presets.max, 1))).toBeCloseTo(HIT_STOPS.finish);
    // 派手の設定では、8連弾でも入力の量を足さなければとどめまでは行かない。
    expect(hitStopOf(presets.vivid, intensityOf(biggest, presets.vivid))).toBeLessThan(HIT_STOPS.finish);
  });
});

describe('二属性の色', () => {
  it('中間色は平均せず色相の中間を取るので、濁らず鮮やかなまま', () => {
    // 赤と青を平均すると暗い紫（#7f007f）になるが、色相の中間は鮮やかな赤紫になる。
    expect(mixHue('#ff0000', '#0000ff')).toBe('#ff00ff');
    expect(mixHue('#0000ff', '#ff0000')).toBe('#ff00ff');
    expect(mixHue(presets.vivid.palettes.fire.main, presets.vivid.palettes.lightning.main)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('明るさを上げても色は同じ向きのまま、255を超えない', () => {
    expect(lighten('#804020', 1.5)).toBe('#c06030');
    expect(lighten('#ff6a1e', 1.5)).toBe('#ff9f2d');
  });
});

describe('連弾のリズム', () => {
  it('単発は遅れず、連弾は80ms間隔で、最後の1発だけ200ms空く', () => {
    expect(hitDelay(0, 1)).toBe(0);
    expect(hitDelay(0, 7)).toBe(0);
    expect(hitDelay(1, 7)).toBeCloseTo(.08);
    expect(hitDelay(5, 7)).toBeCloseTo(.4);
    // 最後は18.5 + 0.08×(7-1) + 0.2 = 19.18秒に届く。
    expect(18.5 + hitDelay(6, 7)).toBeCloseTo(19.18);
    for (let i = 1; i < 7; i++) expect(hitDelay(i, 7)).toBeGreaterThan(hitDelay(i - 1, 7));
  });
});

describe('属性ごとの消え方', () => {
  it('かけらは床で止まり、吸い込まれる粒は中心へ戻る', () => {
    const pool = new ParticlePool(2);
    pool.spawn({ x: 0, y: 0, vy: 100, gravity: 500, floor: 50, life: 5, kind: 2 });
    for (let i = 0; i < 60; i++) pool.update(.03);
    const shard = pool.items[0];
    expect(shard.y).toBeCloseTo(50, 5); expect(shard.vy).toBe(0); expect(Math.abs(shard.vx)).toBeLessThan(.01);
  });
});

describe('控えめモードは部品にも届く', () => {
  /** 命中の部品だけを呼ぶための仮の Frame。光の絵は描かず、粒の数だけを見る。 */
  const frame = (calm: boolean, pool: ParticlePool): Frame => ({
    c: stubContext(), w: 1280, h: 720, t: IMPACT_AT + .01, dt: .016,
    sprites: { draw: () => {} } as unknown as Frame['sprites'], pool,
    preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1.5,
    recipe: recipe(), locked: true, origin: { x: 200, y: 500 }, target: { x: 900, y: 360 },
    accent: null, live: { words: [], amount: 0, voice: 0, rings: 0 }, points: [], cursors: [], beat: BEATS[0], guard: null, aim: AIM, inherited: [], calm,
    once: (_key, run) => run(),
  });
  const impactParticles = (calm: boolean) => {
    const pool = new ParticlePool(2000); pool.reseed(7);
    drawImpact(frame(calm, pool));
    return pool.count;
  };
  it('控えめのとき、命中で出る粒が減る', () => {
    const normal = impactParticles(false), calm = impactParticles(true);
    expect(normal).toBeGreaterThan(0);
    expect(calm).toBeLessThan(normal);
    expect(calm).toBeCloseTo(normal / 3, -1);
  });
  it('控えめでないときの数は変わらない', () => {
    expect(impactParticles(false)).toBe(Math.round(increase(presets.vivid.impactParticles, 1.5, .5)));
  });
});

describe('コマ落ちしても同じ火花', () => {
  /** 仮の画面。描く命令は受け流し、記録用の配列に書き出す。 */
  const screen = (log: string[]) => {
    const canvas = { width: 0, height: 0, getContext: () => stubContext(log), getBoundingClientRect: () => ({ width: 1280, height: 720 }) };
    return new MagicCanvas(canvas as unknown as HTMLCanvasElement, presets.max);
  };
  /**
   * 蓄積（14〜17秒）を step 秒の刻みで進め、放出から命中までは同じ刻みで進める。
   * 蓄積の粒は毎コマ乱数を使うので、刻みが違うと乱数の消費順が変わる。
   * 返すのは命中のコマで描いた命令だけ。
   */
  const untilImpact = (step: number) => {
    const log: string[] = [], magic = screen(log), spell = recipe({ count: 3 });
    const at = (t: number) => magic.renderEffects({ points: [], ms: t * 1000, recipe: spell, voice: 0, cursors: [], ready: false, target: { x: .72, y: .45 }, origin: { x: 320, y: 520 } });
    for (let t = 14; t < RELEASE_AT; t += step) at(t);
    for (let t = RELEASE_AT; t < IMPACT_AT; t += 1 / 60) at(t);
    log.length = 0;
    at(IMPACT_AT);
    return log;
  };
  beforeAll(() => {
    // node には canvas も画面の細かさもないので、仮のものを置く。
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => stubContext() }) });
  });
  afterAll(() => vi.unstubAllGlobals());
  it('蓄積のコマ数が違っても、命中の火花は同じ', () => {
    const steady = untilImpact(1 / 60), dropped = untilImpact(1 / 24);
    expect(steady.length).toBeGreaterThan(300);
    // 粒の入る場所（置き場の添え字）は違うので、描いた命令を並べ替えて突き合わせる。
    expect([...dropped].sort()).toEqual([...steady].sort());
  });
});
