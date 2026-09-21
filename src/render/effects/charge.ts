import { clamp } from '../../game/motion';
import { increase } from './presets';
import { extentOf, few, glow, line, noise, originsOf, slow, type Frame, type XY } from './frame';

/** 地面から昇る細い光の本数。入力の量が多いほど増える。 */
const RISING_STREAKS = 6, RISING_STREAKS_BY_AMOUNT = 8;
/** 一コマに出す粒の上限。コマ落ちしたときに一度に大量に出さない。 */
const SPAWN_PER_FRAME = 20;
/**
 * 粒の寿命（秒）。生むのをやめる時刻（発動の0.15秒前）から数えて、命中（発動の1.5秒後）より前に消えきる長さ。
 * これより長いと、命中の火花に蓄積の粒が混ざり、コマ数で命中の絵が変わってしまう。
 */
const PARTICLE_LIFE = 1.6;
/** 粒が生まれる場所の、画面の端から外側への余裕（画素）。端の外から入ってくるように見せる。 */
const EDGE_OUTSIDE = 12;
/** 中心ではなく術式の光点へ向かう粒の割合。 */
const TO_SPOT_SHARE = .65;
/**
 * 粒の飛び方。空気の抵抗を強くし（1秒で残る割合は e の -4〜-5 乗）、吸い込みも強くする。
 * 速さは吸い込みと抵抗の釣り合いで決まり（毎秒およそ750〜1080画素）、一番遠い角からでも1〜1.5秒で届く。
 * 抵抗が強いので横向きの速さがすぐ抜け、光点のまわりを回り続けずに6画素以内へ入って消える。
 */
const FLOW = { resist: 4, resistByCharge: 1, pull: 3000, pullByCharge: 2400, speed: .7, speedByCharge: .5, swirl: 50, swirlByCharge: 50 };
/** 床の明かりの濃さの上限。lighter 合成なので、これより濃いと背景が白く飛ぶ。 */
const FLOOR_ALPHA_MAX = .35;
/** 床の明かりの横の広がりの下限（画素）と、術式の範囲の横幅に対する倍率。 */
const FLOOR_MIN_RADIUS = 90, FLOOR_RADIUS_RATE = .62;
/** 床の明かりの縦のつぶれ具合。床に沿って見えるように。 */
const FLOOR_FLATTEN = .28;
/** 魔法陣の半径の上限（画面の高さに対する割合）。横に広い術式でも、陣が画面からはみ出さないように。 */
const CIRCLE_MAX_HEIGHT = .3;
/** 光点ごとの小さな陣を出し始める入力の量。重ねて描き、重ねて唱えた人だけに出る。 */
const SPOT_CIRCLES_FROM = .5;

/** 画面の四辺のどこか一点。周の長さに沿って選ぶので、長い辺ほど多く生まれる。 */
function edgePoint(f: Frame, along: number): XY {
  const s = along * (f.w + f.h) * 2;
  if (s < f.w) return { x: s, y: -EDGE_OUTSIDE };
  if (s < f.w + f.h) return { x: f.w + EDGE_OUTSIDE, y: s - f.w };
  if (s < f.w * 2 + f.h) return { x: s - f.w - f.h, y: f.h + EDGE_OUTSIDE };
  return { x: -EDGE_OUTSIDE, y: s - f.w * 2 - f.h };
}

/** 蓄積と完成（締め切りから発動まで）。画面の端から粒が吸い込まれ、床が明るくなり、魔法陣が回り、中心が脈打つ。 */
export function drawCharge(f: Frame) {
  const { c, t, origin: o, preset, intensity } = f;
  const CHARGE_AT = f.beat.inputEnd, CHARGE_END = f.beat.release;
  if (t < CHARGE_AT || t >= CHARGE_END + .3) return;
  const charge = clamp((t - CHARGE_AT) / (CHARGE_END - CHARGE_AT)), out = clamp((t - CHARGE_END) / .3);
  const fade = 1 - out;
  // 入力の量。重ねて描き、重ねて唱えるほど溜まりが濃くなる。0でも今までの見た目は変わらない。
  const amount = clamp(f.live.amount);
  // 弾の出どころ（一つ目は中心）と、表示している術式の範囲。術式が画面のどこにどの大きさで出ていても、それに合わせる。
  const origins = originsOf(f), extent = extentOf(f);

  // 画面の四辺から生まれ、術式の光点と中心へ流れ込む粒。横向きの速さを持たせて渦を巻かせる。時間とともに数と速さが増える。
  if (t < CHARGE_END - .15) {
    const rate = few(f, increase(preset.chargeParticles, intensity, .6) * (0.3 + charge * 1.2) * (1 + amount * .9));
    const expected = rate * f.dt, n = Math.min(SPAWN_PER_FRAME, Math.floor(expected) + (f.pool.random() < expected % 1 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const from = edgePoint(f, f.pool.random());
      const to = origins.length > 1 && f.pool.random() < TO_SPOT_SHARE ? origins[1 + Math.floor(f.pool.random() * (origins.length - 1))] : origins[0];
      const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
      // 遠い端からでも発動までに届くよう、最初の速さは距離に比例させる。渦は左右どちらかに巻く。
      const speed = d * (FLOW.speed + charge * FLOW.speedByCharge), swirl = (FLOW.swirl + charge * FLOW.swirlByCharge) * (f.pool.random() < .5 ? -1 : 1);
      f.pool.spawn({ x: from.x, y: from.y, vx: dx / d * speed - dy / d * swirl, vy: dy / d * speed + dx / d * swirl, life: PARTICLE_LIFE, size: 1.2 + f.pool.random() * 1.6,
        pull: FLOW.pull + charge * FLOW.pullByCharge, px: to.x, py: to.y, drag: Math.exp(-(FLOW.resist + charge * FLOW.resistByCharge)), color: f.palette.main, core: f.palette.core, kind: 0 });
    }
  }
  // 床の明かり。術式の範囲の下端を床とみなし、その横幅いっぱいに属性の色の楕円を敷く。蓄積が進むほど明るくなる。
  const floorX = extent.x + extent.width / 2, floorY = extent.y + extent.height;
  const floorRadius = Math.max(FLOOR_MIN_RADIUS, extent.width * FLOOR_RADIUS_RATE);
  const floorAlpha = Math.min(FLOOR_ALPHA_MAX, (.22 + amount * .13) * charge) * fade;
  if (floorAlpha > .003) {
    // 光の絵は丸なので、縦だけ縮めて楕円にする。芯まで属性の色にして、白く飛ばさない。
    c.save(); c.translate(floorX, floorY); c.scale(1, FLOOR_FLATTEN);
    f.sprites.draw(c, 0, 0, floorRadius / 4, f.palette.main, f.palette.main, floorAlpha);
    c.restore();
  }
  if (preset.magicCircle) {
    // 地面から昇る細い光。術式の範囲の横幅いっぱいに散らし、範囲の下端から範囲の高さぶん昇る。
    const streaks = Math.round(increase(RISING_STREAKS + amount * RISING_STREAKS_BY_AMOUNT, intensity));
    const rise = Math.max(90 + intensity * 40, extent.height * .8);
    for (let i = 0; i < streaks; i++) {
      const u = (t * (0.5 + noise(i, 3) * .5) + noise(i, 4)) % 1, x = extent.x + noise(i, 5) * extent.width, top = floorY + 20 - u * rise;
      line(f, { x, y: top + 30 }, { x, y: top }, 1.2, charge * fade * (1 - u) * .5, f.palette.main, 0);
    }
    // 魔法陣。外の目盛りと内の多角形が逆向きに回り、終わりに向けて速くなる。
    // 半径は術式の範囲の横幅の半分まで広げ、画面の高さの30%を上限にする。小さな術式でも今までの大きさは保つ。
    // 入力の量が多いほど枚数が増える（1〜3枚）。外側ほど大きく、薄く、ゆっくり逆向きに回る。
    const rings = 1 + Math.round(amount * 2);
    const wide = Math.min(extent.width / 2, f.h * CIRCLE_MAX_HEIGHT);
    const base = Math.max(36 + intensity * 12, wide) * (0.6 + charge * .4), spin = t * (1.5 + charge * charge * 8), alpha = charge * fade;
    for (let k = 0; k < rings; k++) {
      // 外側の陣も画面の横幅からはみ出さないところで止める。
      const r = Math.min(base * (1 + k * .42), f.w * .48), turn = k % 2 ? -spin / (1 + k * .8) : spin / (1 + k * .8), a0 = alpha / (1 + k * .9);
      c.save(); c.translate(o.x, o.y); c.scale(1, .42);
      c.globalAlpha = a0 * .8; c.strokeStyle = f.palette.main; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 1.22, 0, Math.PI * 2); c.stroke();
      c.rotate(turn); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, len = i % 3 ? 0.08 : 0.16; c.moveTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22); c.lineTo(Math.cos(a) * r * (1.22 + len), Math.sin(a) * r * (1.22 + len)); }
      c.stroke();
      c.rotate(-turn * 2.3); c.globalAlpha = a0 * .6; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; if (i) c.lineTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); else c.moveTo(Math.cos(a) * r * .8, Math.sin(a) * r * .8); }
      c.stroke(); c.restore();
    }
    // 入力の量が多いときだけ、各光点の足元にも小さな陣を出す。中心の陣と逆向きに回る。
    if (amount >= SPOT_CIRCLES_FROM && origins.length > 1) {
      const show = clamp((amount - SPOT_CIRCLES_FROM) / (1 - SPOT_CIRCLES_FROM)), small = (9 + intensity * 3) * (0.6 + charge * .4);
      for (let k = 1; k < origins.length; k++) {
        const p = origins[k], turn = spin * .7 * (k % 2 ? 1 : -1);
        c.save(); c.translate(p.x, p.y + small * .3); c.scale(1, .42);
        c.globalAlpha = alpha * show * .6; c.strokeStyle = f.palette.main; c.lineWidth = 1.2;
        c.beginPath(); c.arc(0, 0, small, 0, Math.PI * 2); c.stroke();
        c.rotate(turn); c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.moveTo(Math.cos(a) * small, Math.sin(a) * small); c.lineTo(Math.cos(a) * small * 1.3, Math.sin(a) * small * 1.3); }
        c.stroke(); c.restore();
      }
    }
  }
  // 中心の脈動。周期が短くなり、完成の直前で最大になる。
  const beat = 0.5 + 0.5 * Math.sin(t * slow(f, 8 + charge * charge * 26));
  glow(f, o.x, o.y, (5 + charge * 12) * (1 + amount * .5) * (1 + beat * (.3 + amount * .35) * charge), (.35 + charge * .5) * fade + out * .4);
  for (let i = 0; i < 3; i++) { const p = (t * .9 + i / 3) % 1; c.globalAlpha = (1 - p) * charge * fade * .5; c.lineWidth = 1.2; c.strokeStyle = f.palette.core; c.beginPath(); c.ellipse(o.x, o.y, 8 + p * 30, (8 + p * 30) * .5, 0, 0, Math.PI * 2); c.stroke(); }
}
