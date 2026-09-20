import './look.css';
import { CompletedSpell } from './render/completed-spell';
import { Knight } from './render/knight';
import { completedSpellFrame, fitSpell } from './render/spell-layout';
import type { Point } from './game/types';

document.title = '背景・騎士・術式の確認 | はじまりの魔法';
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="look-page">
    <nav class="look-tools" aria-label="画面の確認"><a href="/">ゲームへ戻る</a><h1>見た目の確認</h1>
      <div class="look-actions"><button id="compare" aria-pressed="false">見本と並べる</button><button id="draw">自分の線で試す</button><button id="restore">見本の線に戻す</button></div>
      <div class="look-poses" role="group" aria-label="騎士の姿勢"><button data-pose="idle" aria-pressed="true">待機</button><button data-pose="hit" aria-pressed="false">被弾</button><button data-pose="recover" aria-pressed="false">構えを戻す</button></div>
    </nav>
    <div class="look-layout" id="layout">
      <section class="look-frame" id="frame" aria-label="背景と騎士と完成した術式">
        <img class="look-backdrop" id="backdrop" src="/art/ruins-empty-v1.png" alt="石の柱と城が見える遺跡">
        <canvas id="knight" aria-label="剣と盾を持つ遺跡の騎士"></canvas>
        <div class="look-shade"></div>
        <div class="look-health"><span>遺跡の騎士</span><div><i></i></div></div>
        <div class="look-aim" id="aim" aria-hidden="true"></div>
        <div class="look-reflection" id="reflection" aria-hidden="true"></div>
        <canvas id="spell" aria-label="術式（「自分の線で試す」を押すと描けます）"></canvas>
        <div class="look-caption"><span class="look-caption-kicker" id="kicker">術式完成</span><h2 id="caption">描いた形に、力が集まる</h2><p id="detail">核 <span>✓</span>　構造 <span>✓</span>　属性 <span>光</span></p></div>
        <div class="look-loading" id="loading" role="status">画面を準備しています…</div>
      </section>
      <aside class="look-reference" id="reference" hidden aria-label="指定された見本の3画面目">
        <div class="look-reference-image" role="img" aria-label="指定された見本（曇り空、遺跡の騎士、青白い術式）"></div>
        <a href="/art/visual-reference.png" target="_blank" rel="noopener">元の8画面を開く ↗</a>
      </aside>
    </div>
    <footer class="look-footer"><p id="note" role="status">背景は確認用の静止画です。騎士と術式はアプリで表示しています。</p><label>光の強さ <input id="glow" type="range" min="0" max="1.8" step="0.05" value="0.95"><output id="glow-value">標準</output></label></footer>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('spell');
let renderer: CompletedSpell;
let knight: Knight;
try { renderer = new CompletedSpell(canvas); knight = new Knight(el<HTMLCanvasElement>('knight')); }
catch { el('loading').textContent = '光の表示を準備できませんでした。ブラウザーの画像処理の設定を確認してください。'; throw new Error('確認画面のWebGL初期化に失敗'); }

// 本編と同じ時刻で姿勢を切り替える。被弾は18.5秒、構えを戻すのは19.1秒ごろ。
const poseTimes: Record<string, number> = { idle: 0, hit: 18700, recover: 19900 };
let pose = 'idle';
let animation = requestAnimationFrame(function frame(now: number) {
  animation = requestAnimationFrame(frame);
  knight.render(pose === 'idle' ? now : poseTimes[pose], pose !== 'idle', null);
  // 照準は決め打ちの位置ではなく、その時の騎士の胸に合わせる。
  el('aim').style.left = `${knight.target.x * 100}%`; el('aim').style.top = `${knight.target.y * 100}%`;
});
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(button => button.addEventListener('click', () => {
  pose = button.dataset.pose!;
  document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  el('note').textContent = pose === 'idle' ? '待機の姿勢で、ゆっくり上下しています' : pose === 'hit' ? '魔法が届いた瞬間の姿勢（18.5秒）で止めています' : '構えを戻す途中の姿勢（19.1秒ごろ）です';
}));

// 見本用の入力点。描き直した場合は、この線を使わず本人の線だけで完成形を作る。
function samplePoints(): Point[] {
  const result: Point[] = [];
  const paths = [
    [[.29,.69],[.57,.44],[.73,.8],[.29,.69]],
    [[.29,.69],[.32,.79],[.4,.86],[.53,.89],[.66,.86],[.73,.8]],
    [[.4,.86],[.46,.62],[.73,.8]],
  ];
  for (const [stroke, path] of paths.entries()) {
    path.slice(1).forEach((b, i) => {
      const a = path[i];
      for (let j = 0; j < 12; j++) result.push({ x: a[0] + (b[0] - a[0]) * j / 12, y: a[1] + (b[1] - a[1]) * j / 12, t: result.length * 20, hand: 0, stroke });
    });
    const last = path.at(-1)!; result.push({ x: last[0], y: last[1], t: result.length * 20, hand: 0, stroke });
  }
  return result;
}
let points = samplePoints(), drawing = false, pointerId: number | null = null, stroke = 10;
// 元の画面の比率も保存し、比較表示や画面サイズの変更で図形を横長にしない。
let sourceWidth = 1320, sourceHeight = 1000;
function redraw() {
  renderer.resize(); knight.resize();
  const { width, height } = canvas.getBoundingClientRect();
  const normalized = points.map(p => ({ ...p, x: p.x * sourceWidth / width, y: p.y * sourceHeight / height }));
  const shown = drawing ? normalized : fitSpell(normalized, width, height, completedSpellFrame(width, height));
  renderer.setShape(shown, !drawing);
  el('reflection').hidden = drawing || !points.length;
  canvas.dataset.points = String(points.length);
  canvas.dataset.state = drawing ? 'drawing' : 'complete';
}
const observer = new ResizeObserver(redraw); observer.observe(el('frame'));
el('compare').addEventListener('click', () => {
  const reference = el('reference'); reference.hidden = !reference.hidden;
  el('layout').classList.toggle('comparing', !reference.hidden);
  el('compare').setAttribute('aria-pressed', String(!reference.hidden));
  el('compare').textContent = reference.hidden ? '見本と並べる' : '一画面に戻す';
});
function setDrawing(value: boolean) {
  drawing = value; pointerId = null; canvas.classList.toggle('drawing', value);
  el('draw').textContent = value ? '完成形を見る' : '自分の線で試す';
  el('kicker').textContent = value ? '自由に描く' : '術式完成';
  el('caption').textContent = value ? '押したまま、線を描いてください' : '描いた形に、力が集まる';
  el('detail').textContent = value ? '描き終えたら「完成形を見る」' : '核 ✓　構造 ✓　属性 光';
  redraw();
}
el('draw').addEventListener('click', () => {
  if (!drawing) {
    points = []; const rect = canvas.getBoundingClientRect(); sourceWidth = rect.width; sourceHeight = rect.height;
    el('note').textContent = '描き終えると、形と線の切れ目を保ったまま術式を画面内に収めます';
    setDrawing(true);
  } else if (points.length) setDrawing(false);
  else el('note').textContent = '画面を押したまま、線をひとつ描いてください';
});
el('restore').addEventListener('click', () => {
  points = samplePoints(); sourceWidth = 1320; sourceHeight = 1000; setDrawing(false);
  el('note').textContent = '背景は確認用の静止画です。騎士と術式はアプリで表示しています。';
});
function addPoint(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  const p: Point = { x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)) / sourceWidth, y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)) / sourceHeight, t: points.length, hand: 0, stroke };
  const last = points.at(-1);
  if (last?.stroke === stroke && Math.hypot((p.x-last.x)*sourceWidth, (p.y-last.y)*sourceHeight) < 2) return;
  // 確認用画面でも際限なく増やさない。元のゲームの記録とは独立。
  if (points.length >= 1024) { el('note').textContent = '線がいっぱいになりました。「完成形を見る」で確認できます。'; return; }
  points.push(p); redraw();
}
canvas.addEventListener('pointerdown', event => {
  if (!drawing || pointerId !== null) return;
  pointerId = event.pointerId; stroke++; canvas.setPointerCapture(pointerId); addPoint(event);
});
canvas.addEventListener('pointermove', event => { if (drawing && event.pointerId === pointerId) addPoint(event); });
for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, () => { pointerId = null; });
el<HTMLInputElement>('glow').addEventListener('input', event => {
  const value = Number((event.target as HTMLInputElement).value); renderer.setGlow(value);
  el('glow-value').textContent = value === .95 ? '標準' : value.toFixed(2);
  el('reflection').style.opacity = String(value * .32);
});
const backdrop = el<HTMLImageElement>('backdrop');
void backdrop.decode().then(async () => {
  await document.fonts.ready;
  redraw(); await Promise.all([renderer.ready(), knight.ready]);
  el('loading').hidden = true;
}).catch(() => { el('loading').textContent = '画面を読み込めませんでした。再読み込みしてください。'; });
window.addEventListener('pagehide', event => { if (!event.persisted) { observer.disconnect(); cancelAnimationFrame(animation); renderer.dispose(); knight.dispose(); } });
