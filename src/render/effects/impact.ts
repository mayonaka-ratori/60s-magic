import { clamp } from '../../game/motion';
import type { Beat } from '../../game/rounds';
import { increase } from './presets';
import { hitDelay } from './release';
import { few, glow, noise, ease, mixOf, type Frame } from './frame';

/** 命中の白い火花の線の本数。派手さで増える。 */
const SPARK_LINES = 22;
/** 命中の後に残る帯電の、枝の本数と一本あたりの節の数。枝の本数だけ派手さで増える。 */
const BOLT_BRANCHES = 9, BOLT_JOINTS = 9;
/** 明滅の段、枝、節を別々の桁に置くための幅。足し合わせて同じ番号にならないよう、段の幅を大きくとる。 */
const BOLT_STEP_SPAN = 1009, BOLT_BRANCH_SPAN = 17;
/** 炎の余韻で昇る火の粉の数。派手さで増える。 */
const FIRE_EMBERS = 8;
/** 地面の跡が薄れ始める、受け渡しからさかのぼる秒数。跡は回の終わりまで残し、次の場面へ渡す直前に消す。 */
const GROUND_MARK_FADE = 1.5;
/** とどめの回で、余韻の始まりから跡が薄れきるまでの秒数。 */
const FINISH_MARK_FADE = 2;

/**
 * 単発の命中の三段（命中からの秒）。芯が当たる（0）、破裂（0.08）、衝撃波が抜ける（0.2）。
 * 画面の側（screen.ts）が同じ時刻で世界を短く止めるので、ここの数字はそれと合わせてある。
 * 連弾は弾ごとに届く流れのままなので三段にせず、攻撃でない魔法も今までどおり命中と同時に全部出す。
 */
export const HIT_STAGES = { blast: .08, wave: .2 };
const NO_STAGES = { blast: 0, wave: 0 };
/** 単発の攻撃だけ三段にする。それ以外は破裂も衝撃波も命中と同時。 */
export function stagesOf(count: number, purpose: string) { return count === 1 && purpose === 'attack' ? HIT_STAGES : NO_STAGES; }
/** 芯の破裂の大きさ（今の破裂に対する割合）と、破裂が始まったあとも芯が残る長さ（秒）。 */
const CORE_SHARE = .4, CORE_LINGER = .06;

/**
 * 画面の横幅を超えて抜ける衝撃波の輪。半径は画面幅の0.6倍まで広げ、外側ほど細く薄くする。
 * 命中が騎士の胸の一点で終わらず、画面の左右まで届いたと分かるようにするための輪。攻撃のときだけ。
 */
export const WIDE_RING = { reach: .6, seconds: .9, alpha: .6, width: 3.4 };
/** 横幅を超える輪の、その時刻の半径、濃さ、太さ。since は衝撃波の段からの秒。範囲の外は null。始まりの半径は破裂の輪の少し外。 */
export function wideRingAt(since: number, w: number, radius: number) {
  const u = since / WIDE_RING.seconds;
  if (u < 0 || u >= 1) return null;
  const from = radius * 1.2;
  return { size: from + (w * WIDE_RING.reach - from) * ease(u), alpha: Math.pow(1 - u, 1.6) * WIDE_RING.alpha, width: WIDE_RING.width * (1 - u * .75) };
}

/**
 * 左右の柱。画面の左右の端の近く（横位置7%と93%、幅は画面幅の8%、縦は高さの10%から75%）に立っているとみなし、命中の光で照らす。
 * 帯の濃さは最大0.35。破片は帯の上端から、破裂の少し後に始めて1.5秒ほど、数回に分けて落とす。
 */
export const PILLAR = {
  x: [.07, .93], width: .08, top: .10, bottom: .75,
  /** 帯を出す長さ（秒）と濃さの上限 */ seconds: .25, alpha: .35,
  /** 破片が落ち始める、破裂からの秒。落とし続ける長さ（秒）。その間に落とす回数。一回に一本の柱から落とす数（派手さで増える） */
  shardFrom: .04, shardSpan: 1.5, shardWaves: 6, shards: 3,
};
/** 柱の破片の石の色。 */
export const PILLAR_STONE = ['#9a9aa6', '#7f7f8b', '#b4b4be'];
/**
 * 破裂の粒のうち、画面の左右の端まで抜けるもの。5つに1つを、画面幅に対する割合の速さでほぼ水平に飛ばす。
 * 空気の抵抗を弱め（1秒で0.75残る）、寿命を長くして、端まで届く前に消えないようにする。
 */
const FAR_EVERY = 5, FAR_SPEED = { min: .9, spread: .5 }, FAR_LIFE = { min: 1, spread: .4 }, FAR_DRAG = .75;

/**
 * 地面の跡の残り具合（0〜1）。t は世界の時刻。
 * ふだんは受け渡しの1.5秒前から薄れ始めて受け渡しで消える。命中から2秒で消していたころは、回の後半で床が元に戻って手応えが残らなかった。
 * とどめの回だけは余韻まで残し、余韻の始まりから2秒かけて薄れさせる（今までどおり）。
 */
export function groundMarkLife(t: number, beat: Beat) {
  if (beat.finish) return 1 - clamp((t - beat.handoff) / FINISH_MARK_FADE);
  return 1 - clamp((t - (beat.handoff - GROUND_MARK_FADE)) / GROUND_MARK_FADE);
}

/**
 * 地面の跡。命中の真下に属性ごとの跡を出し、回の終わりまで残す。since は破裂からの秒で、負の間はまだ出さない。
 * 光を足す描き方では暗い色が出せないので、ここだけ普通の重ね方に切り替える。
 */
function drawGroundMark(f: Frame, since: number, radius: number, y: number) {
  if (since < 0) return;
  const { c, target: g } = f, element = f.recipe.element;
  const life = groundMarkLife(f.t, f.beat);
  if (life <= 0) return;
  const grow = ease(clamp(since / .14));
  const rx = radius * (1 + since * .12) * grow, ry = Math.max(1, rx * .3);
  const before = c.globalCompositeOperation;
  c.globalCompositeOperation = 'source-over';
  const oval = (sx: number, sy: number) => { c.beginPath(); c.ellipse(g.x, y, Math.max(1, rx * sx), Math.max(1, ry * sy), 0, 0, Math.PI * 2); };
  if (element === 'fire') {
    // 焦げ。暗い楕円の縁だけが赤く残る。
    c.globalAlpha = life * .6; c.fillStyle = '#150a04'; oval(1, 1); c.fill();
    c.globalAlpha = life * .5; c.strokeStyle = '#ff4d12'; c.lineWidth = 2.5; oval(1, 1); c.stroke();
    c.globalAlpha = life * .25; c.fillStyle = '#2a1408'; oval(1.35, 1.3); c.fill();
  } else if (element === 'ice') {
    // 霜。白い楕円の上に細い結晶を伸ばす。
    c.globalAlpha = life * .4; c.fillStyle = '#dff4ff'; oval(1, 1); c.fill();
    c.globalAlpha = life * .7; c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, len = rx * (.6 + noise(i, 21) * .7);
      c.moveTo(g.x, y); c.lineTo(g.x + Math.cos(a) * len, y + Math.sin(a) * len * .3);
    }
    c.stroke();
  } else if (element === 'lightning') {
    // 焼けた筋。中心から外へ黒く走る。
    c.globalAlpha = life * .55; c.strokeStyle = '#0b0a14'; c.lineWidth = 2.2; c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + noise(i, 22) * .4;
      let x = g.x, yy = y; c.moveTo(x, yy);
      for (let k = 1; k <= 3; k++) { const d = rx * 1.2 * k / 3, w = (noise(i * 3 + k, 23) - .5) * rx * .3; x = g.x + Math.cos(a) * d - Math.sin(a) * w; yy = y + (Math.sin(a) * d + Math.cos(a) * w) * .3; c.lineTo(x, yy); }
    }
    c.stroke();
  } else if (element === 'wind') {
    // 薄い輪だけが残る。
    c.globalAlpha = life * .3; c.strokeStyle = '#cdf4e2'; c.lineWidth = 1.6;
    oval(1, 1); c.stroke(); oval(1.3, 1.3); c.globalAlpha = life * .16; c.stroke();
  } else if (element === 'light') {
    // 淡い円。
    c.globalAlpha = life * .28; c.fillStyle = '#fff4cf'; oval(1, 1); c.fill();
  } else if (element === 'dark') {
    // 暗い染みが広がる。
    c.globalAlpha = life * .6; c.fillStyle = '#080310'; oval(1, 1); c.fill();
    c.globalAlpha = life * .25; c.fillStyle = '#140626'; oval(1.4, 1.35); c.fill();
  } else {
    c.globalAlpha = life * .22; c.strokeStyle = '#b9ccff'; c.lineWidth = 1.5; oval(1, 1); c.stroke();
  }
  c.globalCompositeOperation = before;
}

/**
 * 左右の柱を照らす帯。破裂からの0.25秒だけ、属性の色の柔らかい縦の帯を左右の端の近くに足す。
 * 破裂の光が柱に届いたと見せるためのもので、最初の一コマから最も濃く、そこから薄れる。控えめモードでは出さない。
 */
function drawPillarBands(f: Frame, since: number, color: string) {
  if (f.calm || since < 0 || since >= PILLAR.seconds) return;
  const c = f.c, top = f.h * PILLAR.top, bottom = f.h * PILLAR.bottom, width = f.w * PILLAR.width;
  const left = 1 - since / PILLAR.seconds;
  // 上下は薄くぼかす。色は八桁の色指定で端を透明にする（色は設定の六桁の色だけが来る）。
  const shade = c.createLinearGradient(0, top, 0, bottom);
  shade.addColorStop(0, color + '00'); shade.addColorStop(.2, color); shade.addColorStop(.8, color); shade.addColorStop(1, color + '00');
  c.fillStyle = shade;
  for (const px of PILLAR.x) {
    const x = f.w * px;
    // 幅いっぱいの帯と、その半分の幅の帯を重ねて、真ん中ほど明るくする。二枚の濃さの和が上限（0.35）になる。
    c.globalAlpha = PILLAR.alpha * left * .6; c.fillRect(x - width / 2, top, width, bottom - top);
    c.globalAlpha = PILLAR.alpha * left * .4; c.fillRect(x - width / 4, top, width / 2, bottom - top);
  }
}

/**
 * 柱から落ちる破片。帯の上端から、石の色のかけらを重力で落とし、床で止める。
 * 一度に全部落とすと一瞬で終わるので、1.5秒を数回に分けて落とす。回ごとに一度だけ発生させ、コマ落ちしても数は変わらない。
 */
function spawnPillarShards(f: Frame, since: number, floorY: number) {
  if (since < PILLAR.shardFrom) return;
  const top = f.h * PILLAR.top, width = f.w * PILLAR.width;
  for (let k = 0; k < PILLAR.shardWaves; k++) {
    if (since < PILLAR.shardFrom + k * PILLAR.shardSpan / PILLAR.shardWaves) break;
    f.once('pillar-' + k, () => {
      const n = Math.round(few(f, increase(PILLAR.shards, f.intensity, .4))), rnd = () => f.pool.random();
      for (const px of PILLAR.x) for (let i = 0; i < n; i++) {
        f.pool.spawn({ x: f.w * px + (rnd() - .5) * width, y: top + rnd() * 12, vx: (rnd() - .5) * 40, vy: rnd() * 40,
          life: 2 + rnd() * .8, size: 1.5 + rnd() * 2.5, gravity: 520, drag: .9, floor: floorY + rnd() * 12,
          color: PILLAR_STONE[(i + k) % PILLAR_STONE.length], core: PILLAR_STONE[0], kind: 2 });
      }
    });
  }
}

/** 囲う魔法は、包む輪を残す。命中と同時に出し、三段には関わらない。 */
function drawEnclosure(f: Frame, radius: number, fade: number, impact: number, color: string) {
  const { c, target: g, recipe: r } = f;
  if (!r.enclosure) return;
  c.globalAlpha = fade * .45; c.lineWidth = 1; c.strokeStyle = color; c.beginPath(); c.ellipse(g.x, g.y, radius * .7, radius, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI + impact * .5; c.moveTo(g.x + Math.cos(a) * radius * .7, g.y + Math.sin(a) * radius); c.lineTo(g.x - Math.cos(a) * radius * .7, g.y - Math.sin(a) * radius); } c.globalAlpha = fade * .2; c.stroke();
}

/** 命中（18.5秒）。破裂、火花、輪、亀裂、属性ごとの作用。防御と強化は波紋と包む光にする。 */
export function drawImpact(f: Frame) {
  const { c, t, target: g, preset, intensity, recipe: r } = f;
  const impact = t - f.beat.impact;
  if (impact < 0) return;
  const violent = r.purpose === 'attack', radius = 24 + r.area * 70 + intensity * 10;
  const fade = 1 - clamp((impact - 1.6 - r.duration) / 2.4);
  const element = r.element, mix = mixOf(f), pal0 = mix.pal;
  // many：連弾は弾ごとに少しずつ届き、最後の1発だけ遅れて特大になる。
  // floorY：床の高さ。命中の少し下と画面の下寄りの、低い方に置く。
  const many = r.count > 1, floorY = Math.max(g.y + radius * .9, f.h * .82);
  // 三段の時刻。blast は破裂からの秒、wave は衝撃波の段からの秒。三段にしないときはどちらも impact と同じ。
  const stage = stagesOf(r.count, r.purpose), blast = impact - stage.blast, wave = impact - stage.wave;

  /** 弾1発ぶんの粒。scale で量を変える。連弾もすべて騎士の位置に届くので、出る場所は騎士のところ。 */
  const burst = (scale: number) => {
    const n = Math.round(few(f, increase(preset.impactParticles, intensity, .5) * (violent ? 1 : .45) * scale));
    for (let i = 0; i < n; i++) {
      const a = f.pool.random() * Math.PI * 2, speed = (60 + f.pool.random() * 380) * (1 + intensity * .35) * (violent ? 1 : .5);
      // 持続型は粒の半分を二色目に、増幅型は白い閃光の粒にする。飛び方は属性ごとのまま。
      const pal = mix.alt && i % 2 ? mix.alt : pal0;
      let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed * .75, gravity = 260, life = .5 + f.pool.random() * .9, kind = f.pool.random() < .45 ? 1 : 0, color = pal.spark, floor = 0, drag = 0, pull = 0;
      if (element === 'fire') { gravity = -140; vy -= 60; life += .3; kind = 0; color = f.pool.random() < .5 ? pal.main : pal.spark; }
      if (element === 'ice') { gravity = 420; kind = f.pool.random() < .4 ? 2 : 1; floor = floorY + f.pool.random() * 8; }
      if (element === 'wind') { gravity = -20; vx *= 1.5; life += .4; kind = 1; }
      if (element === 'lightning') { life *= .35; kind = 1; }
      if (element === 'light') { gravity = 0; kind = 0; drag = .06; }
      if (element === 'dark') { gravity = 40; kind = f.pool.random() < .5 ? 2 : 0; color = f.pool.random() < .5 ? pal.main : pal.edge; pull = 120 + f.pool.random() * 120; }
      if (r.purpose === 'enhance') { gravity = -160; vx *= .3; vy = -Math.abs(vy) * .6 - 40; kind = 0; life += .6; floor = 0; pull = 0; }
      // 攻撃のとき、5つに1つは速く長く飛ばして画面の左右の端まで抜けさせる。左右へ交互に、かけらと火花を交互に。
      // 属性ごとの飛び方より後に決めるのは、吸い込みや床で途中に止まらせないため。
      if (violent && i % FAR_EVERY === 0) {
        const side = i % (FAR_EVERY * 2) ? 1 : -1, tilt = (f.pool.random() - .5) * .5, far = f.w * (FAR_SPEED.min + f.pool.random() * FAR_SPEED.spread);
        vx = Math.cos(tilt) * far * side; vy = Math.sin(tilt) * far * .6 - 20; gravity = 90; drag = FAR_DRAG; life = FAR_LIFE.min + f.pool.random() * FAR_LIFE.spread;
        kind = i % 2 ? 1 : 2; floor = 0; pull = 0;
      }
      f.pool.spawn({ x: g.x + (f.pool.random() - .5) * 10, y: g.y + (f.pool.random() - .5) * 10, vx, vy, life, size: 1 + f.pool.random() * 2.6, gravity,
        drag: drag || (kind === 1 ? .1 : .4), floor, pull, px: g.x, py: g.y, color, core: pal.core, kind });
    }
  };

  // 単発は破裂の段で噴き出す。鍵は昔から 'impact' で、乱数の種の戻し（magic.ts）とそろえてある。
  if (!many) { if (blast >= 0) f.once('impact', () => burst(1)); }
  else for (let i = 0; i < r.count; i++) {
    const last = i === r.count - 1;
    if (impact >= hitDelay(i, r.count)) f.once('impact' + i, () => burst(last ? .7 : .9 / r.count));
  }

  // 余韻。命中の少し後に、属性ごとの消え方で粒を足す。出し方より消し方の方が属性が伝わる。
  if (impact >= .3) f.once('afterglow', () => {
    const n = Math.round(few(f, increase(preset.afterglowParticles, intensity, .6)));
    for (let i = 0; i < n; i++) {
      const pal = mix.alt && i % 2 ? mix.alt : pal0, rnd = () => f.pool.random();
      const x = g.x + (rnd() - .5) * radius * 3, y = g.y + (rnd() - .8) * radius * 2;
      const common = { x, y, size: .8 + rnd() * 1.6, color: pal.main, core: pal.core, kind: 0 };
      if (r.purpose === 'enhance') { f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: -20 - rnd() * 30, life: 1.5 + rnd() * 1.8, gravity: -15, drag: .5 }); continue; }
      if (element === 'fire') {
        // 煙が残る。暗い丸がふくらみながら薄くなり、火の粉だけが明るく昇る。
        if (i % 3 === 0) f.pool.spawn({ x, y: y + 10, vx: (rnd() - .5) * 18, vy: -16 - rnd() * 22, life: 1.8 + rnd() * 1.4, size: radius * (.3 + rnd() * .3), gravity: -5, drag: .7, color: '#1b1310', core: '#1b1310', kind: 3 });
        else f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: -22 - rnd() * 30, life: 1.4 + rnd() * 1.4, gravity: -15, drag: .5 });
      } else if (element === 'ice') {
        // 砕けて落ちる。かけらが重力で落ち、床で止まって残る。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 70, vy: -30 - rnd() * 40, life: 1.6 + rnd() * 1.4, size: 1.4 + rnd() * 2.2, gravity: 520, drag: .9, floor: floorY + rnd() * 10, kind: 2 });
      } else if (element === 'lightning') {
        // 瞬断。ほとんど残らず一瞬で消える。残りの帯電は下で描く。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 120, vy: (rnd() - .5) * 100, life: .12 + rnd() * .2, gravity: 0, drag: .08, kind: 1 });
      } else if (element === 'wind') {
        // すっと消える。外へ流れながら薄くなる。
        const a = Math.atan2(y - g.y, x - g.x), speed = 70 + rnd() * 130;
        f.pool.spawn({ ...common, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .5 - 10, life: .8 + rnd() * .6, gravity: -8, drag: .45 });
      } else if (element === 'light') {
        // 減速して消える。動きが止まってから静かに薄くなる。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 90, vy: (rnd() - .5) * 70, life: 1.6 + rnd() * 1.2, gravity: 0, drag: .04 });
      } else if (element === 'dark') {
        // 吸い込まれる。粒が中心へ戻って消える。
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 40, vy: (rnd() - .5) * 30, life: 2 + rnd() * 1.2, gravity: 0, drag: .8, pull: 180 + rnd() * 160, px: g.x, py: g.y });
      } else {
        f.pool.spawn({ ...common, vx: (rnd() - .5) * 30, vy: 10 + rnd() * 30, life: 1.5 + rnd() * 1.8, gravity: 12, drag: .5 });
      }
    }
  });
  // 柱の破片。攻撃のときだけ、破裂の少し後から落ち始める。
  if (violent) spawnPillarShards(f, blast, floorY);

  // 地面の跡は一番下に敷く。
  if (violent || r.purpose === 'bind') drawGroundMark(f, blast, radius, floorY);

  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = pal0.main;
  // 左右の柱を照らす帯。破裂と同時に、光が画面の端まで届いたと見せる。
  if (violent) drawPillarBands(f, blast, pal0.main);
  // 破裂の光。最初の一瞬が一番大きい。連弾は弾ごとに小さく出し、最後の1発で大きくする。
  const mainSize = (violent ? 17 : 12) * (1 + intensity * .15) * (many ? .62 : 1);
  // 三段の一段目。狙いの一点に、小さく白い芯の破裂だけ。破裂が始まってからも一瞬だけ残して、段の継ぎ目を切らない。
  if (stage.blast > 0 && impact < stage.blast + CORE_LINGER) {
    const grow = clamp(impact / stage.blast), left = 1 - clamp(blast / CORE_LINGER);
    glow(f, g.x, g.y, mainSize * CORE_SHARE * (.6 + .4 * grow) + 2, left * .95, '#ffffff', '#ffffff');
  }
  if (blast >= 0) glow(f, g.x, g.y, mainSize * (1 - clamp(blast / 1.1)) + 4, fade * .8 * mix.boost, pal0.main, pal0.core);
  if (many) for (let i = 1; i < r.count; i++) {
    const last = i === r.count - 1, u = impact - hitDelay(i, r.count);
    if (u < 0 || u > 1.1) continue;
    glow(f, g.x, g.y, (last ? mainSize * 2.2 : mainSize * .7) * (1 - clamp(u / (last ? 1.1 : .5))) + 3, fade * (last ? 1 : .55) * mix.boost, pal0.main, pal0.core);
    const size = ease(clamp(u / (last ? .9 : .5))) * radius * (last ? 2.1 : .8);
    c.globalAlpha = (1 - clamp(u / (last ? .9 : .5))) * (last ? .9 : .45); c.lineWidth = last ? 3.4 : 1.6; c.strokeStyle = last ? pal0.core : pal0.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, size), Math.max(1, size * .58), 0, 0, Math.PI * 2); c.stroke();
  }
  // 輪。衝撃波の段から時間差で広がる。防御は波紋を細かく重ねる。
  const rings = Math.round(increase(preset.impactRings, intensity, .3)) * (violent ? 1 : 2);
  for (let i = 0; i < rings; i++) {
    const u = clamp((wave - i * (violent ? .07 : .18)) / 1.1); if (u <= 0 || u >= 1) continue;
    const size = ease(u) * radius * (violent ? 1.7 + i * .25 : 1.2);
    c.globalAlpha = (1 - u) * .8 * (violent ? 1 : .6); c.lineWidth = 3 - u * 2; c.strokeStyle = i % 2 ? (mix.alt ? mix.alt.main : pal0.core) : pal0.main;
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, size), Math.max(1, size * .58), 0, 0, Math.PI * 2); c.stroke();
  }
  // 横幅を超える輪。ほかの輪と同じ段で始め、画面の左右の外まで抜ける。属性の色の線に細い白い芯を重ねる。
  const wide = violent ? wideRingAt(wave, f.w, radius) : null;
  if (wide) {
    c.beginPath(); c.ellipse(g.x, g.y, Math.max(1, wide.size), Math.max(1, wide.size * .58), 0, 0, Math.PI * 2);
    c.globalAlpha = wide.alpha; c.lineWidth = wide.width; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = wide.alpha * .7; c.lineWidth = Math.max(.8, wide.width * .4); c.strokeStyle = pal0.core; c.stroke();
  }
  // 二属性が爆発型のとき、二色の中間色の球状の破裂を足す。
  if (mix.mid && violent && blast >= 0) {
    const u = clamp(blast / .42);
    if (u < 1) {
      const size = ease(u) * radius * 1.5 + 6;
      glow(f, g.x, g.y, size * .5, (1 - u) * .9, mix.mid, pal0.core);
      c.globalAlpha = (1 - u) * .5; c.fillStyle = mix.mid;
      c.beginPath(); c.arc(g.x, g.y, size * (.5 + u * .3), 0, Math.PI * 2); c.fill();
      c.globalAlpha = (1 - u) * .85; c.lineWidth = 2.5; c.strokeStyle = mix.mid;
      c.beginPath(); c.arc(g.x, g.y, size, 0, Math.PI * 2); c.stroke();
    }
  }
  // 白い火花の線。一瞬で外へ。
  if (blast >= 0 && blast < .8 && violent) {
    const n = Math.round(few(f, increase(SPARK_LINES, intensity, .6))), step = mix.alt ? 2 : 1;
    // 持続型のとき、火花の線は一本おきに二色目で描く。
    for (let pass = 0; pass < step; pass++) {
      c.strokeStyle = pass && mix.alt ? mix.alt.main : pal0.core; c.lineWidth = 1.4; c.globalAlpha = (1 - blast / .8) * .85; c.beginPath();
      for (let i = pass; i < n; i += step) { const a = i * 2.399, spread = (25 + (i * 19) % 100) * (1 + intensity * .3) * Math.min(1, blast * 4), len = 8 + 20 * (1 - blast / .8); c.moveTo(g.x + Math.cos(a) * spread, g.y + Math.sin(a) * spread * .7); c.lineTo(g.x + Math.cos(a) * (spread + len), g.y + Math.sin(a) * (spread + len) * .7); }
      c.stroke();
    }
  }
  // 亀裂。すぐ現れ、遅れて光り、ゆっくり消える。
  const cracks = violent ? Math.round(increase(preset.cracks, intensity, .4)) : 0;
  if (cracks && blast >= 0 && blast < 1.4) {
    const grow = clamp(blast / .06), life = 1 - clamp((blast - .3) / 1.1);
    c.lineWidth = 1.6; c.beginPath();
    for (let i = 0; i < cracks; i++) {
      const a = i / cracks * Math.PI * 2 + noise(i, 7) * .5, len = (40 + noise(i, 8) * 70) * (1 + intensity * .3) * grow;
      let x = g.x, y = g.y; c.moveTo(x, y);
      for (let k = 1; k <= 5; k++) { const d = len * k / 5, wob = (noise(i * 5 + k, 9) - .5) * 18; x = g.x + Math.cos(a) * d - Math.sin(a) * wob; y = g.y + Math.sin(a) * d * .7 + Math.cos(a) * wob * .7; c.lineTo(x, y); }
    }
    c.globalAlpha = life * .35; c.lineWidth = 4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = life * .9; c.lineWidth = 1.6; c.strokeStyle = pal0.core; c.stroke();
  }
  // 属性ごとの作用。破裂の段から始める。芯だけの段では包む輪だけを描いて終わる。
  if (blast < 0) { drawEnclosure(f, radius, fade, impact, pal0.main); return; }
  if (element === 'lightning' && blast < 1.6) {
    // 瞬断。0.25秒で本体は消え、残った帯電だけが弱く明滅する。
    // 明滅は毎秒3回まで（光に弱い人への配慮）。そのぶん枝を増やし、長くして派手さを出す。
    const k = Math.floor(t * 3), left = blast < .25 ? 1 - blast / .25 : (1 - clamp((blast - .25) / 1.35)) * .3;
    c.globalAlpha = left * (noise(k, 11) > .3 ? 1 : .3); c.lineWidth = 2; c.strokeStyle = pal0.core; c.beginPath();
    // 段と枝と節は桁を分けて混ぜる。足して同じ番号になる組み合わせが出ると、同じ形の枝が並んでしまう。
    for (let b = 0; b < Math.round(increase(BOLT_BRANCHES, intensity)); b++) {
      let x = g.x, y = g.y; c.moveTo(x, y);
      const a = noise(k * BOLT_STEP_SPAN + b, 12) * Math.PI * 2;
      for (let s = 0; s < BOLT_JOINTS; s++) {
        const j = k * BOLT_STEP_SPAN + b * BOLT_BRANCH_SPAN + s;
        x += Math.cos(a + (noise(j, 13) - .5) * 1.6) * 17;
        y += Math.sin(a + (noise(j, 14) - .5) * 1.6) * 12;
        c.lineTo(x, y);
      }
    }
    c.stroke();
  }
  if (element === 'light' && blast < 1.4) {
    const u = clamp(blast / 1.4); c.globalAlpha = (1 - u) * .7; c.lineWidth = 2; c.strokeStyle = pal0.core; c.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + blast * .6, len = (60 + intensity * 40) * ease(u * 2) + radius; c.moveTo(g.x - Math.cos(a) * len, g.y - Math.sin(a) * len * .8); c.lineTo(g.x + Math.cos(a) * len, g.y + Math.sin(a) * len * .8); }
    c.stroke();
  }
  if (element === 'dark' && blast < 1.6) {
    // 明るくせず、暗い穴を先に描いてから縁だけ光らせる。
    const u = clamp(blast / .4) * (1 - clamp((blast - .9) / .7)), hole = radius * .8 * u;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = u * .85; c.fillStyle = pal0.edge; c.beginPath(); c.ellipse(g.x, g.y, hole, hole * .7, 0, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = u; c.lineWidth = 3; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = u * .9; c.lineWidth = 1.1; c.strokeStyle = pal0.core; c.stroke();
    for (let i = 0; i < 6; i++) { const a = blast * 4 + i; glow(f, g.x + Math.cos(a) * hole, g.y + Math.sin(a) * hole * .7, 3, u * .7, pal0.main, pal0.core); }
  }
  if (element === 'ice' && blast < 1.8) {
    const u = clamp(blast / .3), life = 1 - clamp((blast - .8) / 1);
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 - Math.PI / 2, len = (radius * .9) * u; const ex = g.x + Math.cos(a) * len, ey = g.y + Math.sin(a) * len * .8; c.moveTo(g.x, g.y); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a + .6) * 10, ey + Math.sin(a + .6) * 8); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a - .6) * 10, ey + Math.sin(a - .6) * 8); }
    c.globalAlpha = life * .4; c.lineWidth = 4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = life * .9; c.lineWidth = 1.3; c.strokeStyle = pal0.core; c.stroke();
  }
  if (element === 'wind' && blast < 1.2) {
    c.beginPath();
    for (let i = 0; i < 5; i++) { const a = blast * 6 + i * 1.26, rr = radius * (.5 + blast); c.moveTo(g.x + Math.cos(a) * rr, g.y + Math.sin(a) * rr * .6); c.quadraticCurveTo(g.x + Math.cos(a + .6) * rr * 1.3, g.y + Math.sin(a + .6) * rr * .8, g.x + Math.cos(a + 1.2) * rr, g.y + Math.sin(a + 1.2) * rr * .6); }
    c.globalAlpha = (1 - blast / 1.2) * .5; c.lineWidth = 3.4; c.strokeStyle = pal0.main; c.stroke();
    c.globalAlpha = (1 - blast / 1.2) * .8; c.lineWidth = 1.2; c.strokeStyle = pal0.core; c.stroke();
  }
  if (element === 'fire' && blast < 1.6) for (let i = 0; i < Math.round(increase(FIRE_EMBERS, intensity)); i++) { const u = (blast * .8 + noise(i, 15)) % 1; glow(f, g.x + (noise(i, 16) - .5) * radius * 1.4 + Math.sin(blast * 6 + i) * 6, g.y + 20 - u * (60 + intensity * 30), 4 * (1 - u), (1 - clamp(blast / 1.6)) * Math.sin(u * Math.PI) * .8, pal0.main, pal0.core); }
  drawEnclosure(f, radius, fade, impact, pal0.main);
}
