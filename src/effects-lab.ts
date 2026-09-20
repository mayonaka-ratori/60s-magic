import './effects-lab.css';
import { MagicCanvas } from './render/magic';
import { layerTransform } from './render/cast-scene';
import { Knight } from './render/knight';
import { presets, defaultPresetName } from './render/effects/presets';
import { spellPose } from './render/spell-layout';
import type { LiveInput } from './game/live-input';
import { liveWords } from './game/live-words';
import { ELEMENTS, FORMS, PURPOSES, TRAJECTORIES, ELEMENT_LABELS, FORM_LABELS, PURPOSE_LABELS, type Recipe, type Point } from './game/types';

/** 演出だけを見比べる画面。本編を遊ばずに、放出から命中までを繰り返し見られる。カメラ、マイク、通信は使わない。 */
const params = new URLSearchParams(location.search);
const trajectoryLabels: Record<string, string> = { straight: '直進', spiral: '螺旋', radial: '放射', orbit: '周回', homing: '追尾' };
const options = (list: readonly string[], labels: Record<string, string>, selected: string) => list.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${labels[v] ?? v}</option>`).join('');
const presetOptions = (selected: string) => Object.values(presets).map(p => `<option value="${p.name}"${p.name === selected ? ' selected' : ''}>${p.label}</option>`).join('');

document.title = '演出の見比べ | はじまりの魔法';
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="lab-page">
    <nav class="lab-tools"><a href="/">ゲームへ戻る</a><h1>演出の見比べ</h1>
      <div class="lab-actions"><button id="play" aria-pressed="true">止める</button><button id="loop-release">放出だけ繰り返す</button><button id="single" aria-pressed="false">一画面にする</button></div>
    </nav>
    <div class="lab-layout" id="layout">
      ${['a', 'b'].map((side, i) => `
      <section class="lab-frame" data-side="${side}">
        <img class="lab-backdrop" src="/art/ruins-empty-v1.png" alt="">
        <canvas class="lab-knight" id="knight-${side}"></canvas>
        <canvas class="lab-magic" id="magic-${side}" aria-label="演出${side === 'a' ? '左' : '右'}"></canvas>
        <label class="lab-preset">設定 <select id="preset-${side}">${presetOptions(params.get(side === 'a' ? 'preset' : 'preset2') ?? (i ? 'max' : defaultPresetName))}</select></label>
        <output class="lab-meter" id="meter-${side}"></output>
      </section>`).join('')}
    </div>
    <footer class="lab-footer">
      <label>時刻 <input id="time" type="range" min="13.5" max="23.5" step="0.01" value="13.5"><output id="time-value">13.5秒</output></label>
      <label>属性 <select id="element">${options(ELEMENTS, ELEMENT_LABELS, params.get('element') ?? 'fire')}</select></label>
      <label>形 <select id="form">${options(FORMS, FORM_LABELS, params.get('form') ?? 'orb')}</select></label>
      <label>用途 <select id="purpose">${options(PURPOSES, PURPOSE_LABELS, params.get('purpose') ?? 'attack')}</select></label>
      <label>軌道 <select id="trajectory">${options(TRAJECTORIES, trajectoryLabels, params.get('trajectory') ?? 'straight')}</select></label>
      <label>個数 <input id="count" type="number" min="1" max="8" value="${params.get('count') ?? 1}"></label>
      <label>範囲 <input id="area" type="range" min="0.2" max="1" step="0.05" value="${params.get('area') ?? 0.5}"></label>
      <label>収束 <input id="concentration" type="range" min="0" max="1" step="0.05" value="${params.get('concentration') ?? 0.5}"></label>
      <label>言葉 <input id="words" type="text" placeholder="炎よ、七つに分かれろ" value="${params.get('words') ?? ''}"></label>
      <label><input id="unlocked" type="checkbox"${params.get('unlocked') ? ' checked' : ''}> 確定前の状態にする（候補の色）</label>
      <p id="note" role="status">左右で設定を変えて見比べられます。時刻のつまみを動かすと、その瞬間で止まります。</p>
    </footer>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => el<HTMLInputElement | HTMLSelectElement>(id).value;

function samplePoints(): Point[] {
  const result: Point[] = [];
  const paths = [[[.36, .64], [.5, .42], [.64, .64], [.36, .64]], [[.36, .64], [.5, .78], [.64, .64]]];
  for (const [stroke, path] of paths.entries()) path.slice(1).forEach((b, i) => { const a = path[i]; for (let j = 0; j <= 12; j++) result.push({ x: a[0] + (b[0] - a[0]) * j / 12, y: a[1] + (b[1] - a[1]) * j / 12, t: result.length * 20, hand: 0, stroke }); });
  return result;
}
const points = samplePoints();

function recipe(): Recipe {
  const purpose = value('purpose') as Recipe['purpose'], form = value('form') as Recipe['form'];
  return { version: 'recipe-1', element: value('element') as Recipe['element'], purpose, form, trajectory: value('trajectory') as Recipe['trajectory'],
    count: Math.min(8, Math.max(1, Number(value('count')) || 1)), explicitCount: null, defense: purpose === 'defend' ? .8 : .3, area: Number(value('area')), duration: .5,
    concentration: Number(value('concentration')), enclosure: purpose === 'bind' || form === 'dome', split: false, developsPrevious: null, motionSpeechAligned: null,
    noAttack: false, name: '', source: 'local', decisions: {}, assistance: [], model: null };
}

// 控えめモードは ?calm=1 で渡す。揺れ、傾き、寄り、停止がなくなり、閃光が3分の1になる。
const calmMode = params.get('calm') === '1';
type Side = { magic: MagicCanvas; knight: Knight; layers: HTMLElement[]; meter: HTMLOutputElement; frames: number[]; lastShake: string[] };
const sides: Side[] = ['a', 'b'].map(side => {
  const frame = document.querySelector<HTMLElement>(`[data-side="${side}"]`)!;
  const magic = new MagicCanvas(el<HTMLCanvasElement>(`magic-${side}`), value(`preset-${side}`));
  magic.setCalm(calmMode);
  const knight = new Knight(el<HTMLCanvasElement>(`knight-${side}`));
  el(`preset-${side}`).addEventListener('change', () => { magic.setPreset(value(`preset-${side}`)); ms = Math.min(ms, 13500); });
  return { magic, knight, layers: [frame.querySelector('.lab-backdrop')!, el(`knight-${side}`)], meter: el<HTMLOutputElement>(`meter-${side}`), frames: [], lastShake: ['', ''] };
});

let ms = 13500, playing = true, loopStart = 13500, last = performance.now();
const clock = el<HTMLInputElement>('time');
function setPlaying(next: boolean) { playing = next; el('play').textContent = next ? '止める' : '動かす'; el('play').setAttribute('aria-pressed', String(next)); }
el('play').addEventListener('click', () => setPlaying(!playing));
el('loop-release').addEventListener('click', () => { loopStart = loopStart === 13500 ? 16800 : 13500; el('loop-release').textContent = loopStart === 13500 ? '放出だけ繰り返す' : '蓄積から繰り返す'; ms = loopStart; setPlaying(true); });
el('single').addEventListener('click', () => { const single = el('layout').classList.toggle('single'); el('single').setAttribute('aria-pressed', String(single)); el('single').textContent = single ? '二画面にする' : '一画面にする'; resize(); });
// つまみで先へ飛ばすときは、途中のコマを速く描いて粒の動きを追いつかせる。戻すときは最初から。
function seek(target: number) {
  if (target < ms) { ms = 13500; for (const s of sides) s.magic.renderEffects([], 24000, null, 0, [], true, { x: .5, y: .3 }, { x: 0, y: 0 }); }
  while (ms + 1000 / 60 < target) { ms += 1000 / 60; renderSides(); }
  ms = target;
}
clock.addEventListener('input', () => { setPlaying(false); seek(Number(clock.value) * 1000); });
for (const id of ['element', 'form', 'purpose', 'trajectory', 'count', 'area', 'concentration']) el(id).addEventListener('change', () => { ms = Math.min(ms, Math.max(loopStart, 13500)); });

// 入力した言葉は、入れ直した瞬間に唱えたものとして扱う。
let spokenAt = 0;
el('words').addEventListener('input', () => { spokenAt = ms; });
function liveWordsNow() {
  const text = value('words');
  if (!text.trim()) return [];
  return liveWords([{ id: 1, revision: 1, startMs: Math.max(0, spokenAt - 500), endMs: spokenAt, text, final: true, stability: 1, source: 'typed' }]);
}

function resize() { for (const s of sides) { s.magic.resize(); s.knight.resize(); } }
new ResizeObserver(resize).observe(el('layout'));

function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(50, now - last); last = now;
  if (playing) { ms += dt; if (ms >= 23500) ms = loopStart; clock.value = (ms / 1000).toFixed(2); }
  el('time-value').textContent = `${(ms / 1000).toFixed(1)}秒`;
  renderSides(dt);
  if (Math.floor(now / 250) !== Math.floor((now - dt) / 250)) for (const s of sides) {
    const average = s.frames.reduce((a, b) => a + b, 0) / Math.max(1, s.frames.length);
    s.meter.textContent = `${s.magic.preset.label}　粒 ${s.magic.particleCount}　${(1000 / average).toFixed(0)}fps`;
  }
}
const unlockedNow = () => el<HTMLInputElement>('unlocked').checked;
function renderSides(dt = 0) {
  const current = recipe();
  for (const s of sides) {
    const w = s.magic.canvas.clientWidth, h = s.magic.canvas.clientHeight; if (!w || !h) continue;
    // 見比べ画面でも世界の時計は一つ。命中の停止は騎士にも効く。
    const worldMs = s.magic.effectMsOf(ms, unlockedNow() ? null : current, Number(params.get('amount') ?? .5));
    const pose = spellPose(points, w, h, worldMs);
    const displayed = points.map(p => ({ ...p, x: ((p.x - .5) * w * pose.scale + pose.dx + w / 2) / w, y: ((p.y - .5) * h * pose.scale + pose.dy + h / 2) / h }));
    s.knight.render(worldMs, true, current);
    // 見比べ画面では入力の量を URL の amount= で仮に与える。言葉は空。
    const live: LiveInput = { words: liveWordsNow(), amount: Number(params.get('amount') ?? .5), voice: 0 };
    const unlocked = unlockedNow();
    s.magic.renderEffects(displayed, ms, unlocked ? null : current, 0, [], false, s.knight.target, pose.center, live);
    // 背景と騎士に揺れ、傾き、寄りを当てる。騎士は背景より1.3倍大きく動かす。
    const screen = s.magic.screen, moves = [1, 1.3];
    for (let i = 0; i < s.layers.length; i++) {
      const transform = layerTransform(screen, moves[i], 1.03);
      if (transform !== s.lastShake[i]) { s.layers[i].style.transform = transform; s.lastShake[i] = transform; }
    }
    if (dt) { s.frames.push(dt); if (s.frames.length > 90) s.frames.shift(); }
  }
}
void Promise.all(sides.map(s => s.knight.ready)).then(() => { resize(); requestAnimationFrame(animate); });
