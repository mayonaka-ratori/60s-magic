import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import type { ScreenState } from './effects/screen';
import { IMPACT_AT, RELEASE_AT } from './effects/screen';
import { LAYER_FRAGMENT, LAYER_VERTEX, SHOCKWAVE_SHADER, registerCompositeShaders } from './composite-shaders';

/**
 * 段階4：合成専用のBabylonシーン。
 *
 * 背景、騎士、術式、演出の四枚を板に貼って一台の正射影カメラで並べ、まとめて後処理をかける。
 * 元のHTMLの層は見えなくするだけで、描くのは今まで通り続ける（板に貼る絵がそこにあるため）。
 * WebGLを用意できないときは合成を使わず、今までのHTMLの層のまま遊べる。
 *
 * このファイルの前半は画面を使わない計算だけにしてある（tests/composite.test.ts で確かめる）。
 */

// ------------------------------------------------------------------
// 画面を使わない計算
// ------------------------------------------------------------------

/** 重い後処理を有効にする時間帯（秒）。命中の前後だけ。 */
export const POST_FROM = 16.9, POST_TO = 21;
/** 衝撃波の輪が出ている長さ（秒）。命中から0.3〜0.6秒の範囲に収める。 */
export const RIPPLE_SECONDS = .45;
/** ブルームの常時の強さと、放出や命中で上げるときの倍率。 */
export const BLOOM_BASE = .18, BLOOM_PEAK = 5, BLOOM_RELEASE = 3;
/** 控えめモードのときの倍率の上限。全画面の白飛びを抑えるため、放出も命中もここまでに留める。 */
export const BLOOM_CALM_PEAK = 1.6;
/** ブルームを切る目安のfpsと、戻す目安のfps。 */
export const FPS_DROP = 55, FPS_BACK = 58;

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/** 重い後処理（ブルーム、色収差、歪み）を出す時間帯かどうか。 */
export function postHeavyActive(t: number) { return t >= POST_FROM && t < POST_TO; }

/** 衝撃波の輪。命中からの時間で半径が広がり、幅と強さが細く弱くなる。外にいる間は null。 */
export type Ripple = { radius: number; width: number; strength: number };
export function rippleAt(t: number, impactAt = IMPACT_AT, life = RIPPLE_SECONDS): Ripple | null {
  const age = t - impactAt;
  if (age < 0 || age >= life) return null;
  const p = age / life;
  return { radius: .06 + p * .82, width: .18 * (1 - p * .62), strength: .028 * (1 - p) * (1 - p) };
}

/** ブルームの強さ。放出で3倍、命中で5倍まで上がり、0.4秒ほどで元へ戻る。控えめモードでは1.6倍までに抑える。 */
export function bloomWeightAt(t: number, calm = false) {
  const peak = calm ? BLOOM_CALM_PEAK : BLOOM_PEAK, release = calm ? BLOOM_CALM_PEAK : BLOOM_RELEASE;
  let boost = 1;
  if (t >= RELEASE_AT) boost = Math.max(boost, 1 + (release - 1) * Math.max(0, 1 - (t - RELEASE_AT) / .4));
  if (t >= IMPACT_AT) boost = Math.max(boost, 1 + (peak - 1) * Math.max(0, 1 - (t - IMPACT_AT) / .4));
  return BLOOM_BASE * boost;
}

/** 合成そのものを諦める目安。最初の90コマは慣らし、その後24fps未満が60コマ続いたら止めて元の層へ戻す。 */
export const GIVE_UP_FPS = 24, GIVE_UP_WARMUP = 90, GIVE_UP_FRAMES = 60;
export function giveUpDecision(fps: number, lowFrames: number, frames: number) {
  if (frames <= GIVE_UP_WARMUP || !Number.isFinite(fps) || fps <= 0) return { lowFrames: 0, giveUp: false };
  const next = fps < GIVE_UP_FPS ? lowFrames + 1 : 0;
  return { lowFrames: next, giveUp: next >= GIVE_UP_FRAMES };
}

/** fpsを見てブルームを出すかどうか決める。55を下回ったら切り、58まで戻れば出す。 */
export function bloomDecision(on: boolean, fps: number) {
  if (!Number.isFinite(fps) || fps <= 0) return on;
  if (on && fps < FPS_DROP) return false;
  if (!on && fps > FPS_BACK) return true;
  return on;
}

/** 騎士の板を貼り直すかどうか。姿勢が変わった時と、動きのある時間帯は毎コマ。それ以外は4コマに1回。 */
export function shouldUploadKnight(state: string, previous: string, t: number, frame: number) {
  if (state !== previous) return true;
  if (t >= 13.5) return true;
  return frame % 4 === 0;
}

/** 層ひとつ分の動き。揺れる量（move）と常時の余白（pad）を掛けて作る。 */
export type LayerMotion = { x: number; y: number; rotate: number; scale: number };
export function layerMotion(screen: { shakeX: number; shakeY: number; rotate: number; zoom: number }, move: number, pad: number): LayerMotion {
  return { x: Math.round(screen.shakeX * move), y: Math.round(screen.shakeY * move), rotate: screen.rotate * move, scale: screen.zoom * pad };
}

/** 合成の設定。URLの指定から作る。?bloom=1 は速さに関わらずブルームを出し続ける（見え方の確認用）。 */
export type CompositeSettings = { enabled: boolean; scale: number | null; keepBloom: boolean };
export function compositeSettings(search: string): CompositeSettings {
  const params = new URLSearchParams(search);
  const scale = Number(params.get('scale'));
  return { enabled: params.get('composite') !== '0', scale: Number.isFinite(scale) && scale > 0 ? Math.min(scale, 4) : null, keepBloom: params.get('bloom') === '1' };
}

// ------------------------------------------------------------------
// ここから先は画面を使う
// ------------------------------------------------------------------

export type CompositeSources = {
  world: HTMLImageElement; knight: HTMLCanvasElement; spell: HTMLCanvasElement; magic: HTMLCanvasElement;
};

export type CompositeFrame = {
  screen: ScreenState;
  /** 演出の時刻（秒）。命中の停止を含む。 */
  t: number;
  /** 命中の位置（画面の左上を0とした0〜1） */
  target: { x: number; y: number };
  /** 控えめモード。色収差と歪みを切り、ブルームの倍率も抑える。 */
  calm: boolean;
};

/** 板ひとつ分。元のcanvasと、そこへ貼り付けるテクスチャを持つ。 */
type Board = { mesh: Mesh; material: ShaderMaterial; texture: DynamicTexture; width: number; height: number };

export class Composite {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private shake: TransformNode;
  private boards: Record<'world' | 'knight' | 'spell' | 'magic', Board>;
  private pipeline: DefaultRenderingPipeline;
  private shockwave: PostProcess;
  private shockAttached = false;
  private ripple: Ripple | null = null;
  private center = { x: .5, y: .5 };
  private aspect = 16 / 9;
  private width = 1; private height = 1;
  private active = false;
  private heavy = false;
  private bloomOn = true;
  private knightState = '';
  private frames = 0;
  private lastFrameAt = 0;
  private fps = 60;
  private lowFrames = 0;
  /** 遅すぎて合成を諦めた。以後は元のHTMLの層のまま。 */
  gaveUp = false;
  private worldDrawn = false;
  private keepBloom = false;
  readonly scaleLevel: number;

  /** 作れなかったら null を返す。呼ぶ側は今まで通りのHTMLの層で続ける。 */
  static create(canvas: HTMLCanvasElement, sources: CompositeSources, settings: CompositeSettings): Composite | null {
    if (!settings.enabled) return null;
    try { return new Composite(canvas, sources, settings); } catch { return null; }
  }

  private constructor(private canvas: HTMLCanvasElement, private sources: CompositeSources, settings: CompositeSettings) {
    registerCompositeShaders();
    this.keepBloom = settings.keepBloom;
    this.engine = new Engine(canvas, true, { alpha: false, stencil: false, antialias: false, preserveDrawingBuffer: false });
    this.scaleLevel = settings.scale ?? 1 / Math.min(devicePixelRatio || 1, 1.5);
    this.engine.setHardwareScalingLevel(this.scaleLevel);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);
    this.scene.autoClear = true;
    this.camera = new FreeCamera('合成の視点', new Vector3(0, 0, -100), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 1; this.camera.maxZ = 400;
    // 揺れ、傾き、寄りは板ごとではなくこの親にまとめてかける。演出の板だけは外に置いて動かさない。
    this.shake = new TransformNode('画面の揺れ', this.scene);
    this.boards = {
      world: this.board('背景の板', 40, 0),
      knight: this.board('騎士の板', 30, 1),
      spell: this.board('術式の板', 20, 2, Engine.ALPHA_ADD),
      magic: this.board('演出の板', 10, 3, Engine.ALPHA_COMBINE, false),
    };
    this.pipeline = new DefaultRenderingPipeline('合成の後処理', false, this.scene, [this.camera]);
    this.pipeline.samples = 1;
    this.pipeline.fxaaEnabled = false;
    this.pipeline.bloomEnabled = true;
    this.pipeline.bloomScale = .5;
    this.pipeline.bloomThreshold = .72;
    this.pipeline.bloomKernel = 48;
    this.pipeline.bloomWeight = BLOOM_BASE;
    this.pipeline.chromaticAberrationEnabled = false;
    this.pipeline.grainEnabled = false;
    this.pipeline.imageProcessing.vignetteEnabled = false;
    this.shockwave = new PostProcess('衝撃波の歪み', SHOCKWAVE_SHADER,
      ['center', 'radius', 'ringWidth', 'strength', 'aspect'], null, 1, null, Texture.BILINEAR_SAMPLINGMODE, this.engine, false);
    this.shockwave.onApply = effect => {
      const ripple = this.ripple ?? { radius: 0, width: .0001, strength: 0 };
      // 後処理の座標は下が0。命中の位置は上が0なので裏返して渡す。
      effect.setFloat2('center', this.center.x, 1 - this.center.y);
      effect.setFloat('radius', ripple.radius);
      effect.setFloat('ringWidth', ripple.width);
      effect.setFloat('strength', ripple.strength);
      effect.setFloat('aspect', this.aspect);
    };
    this.setPost(false);
    this.resize();
    this.setActive(false);
  }

  /** 板を一枚作る。z が小さいほど手前。order は重ねる順（小さいほど奥）。 */
  private board(name: string, z: number, order: number, mode = Engine.ALPHA_COMBINE, shaken = true): Board {
    const material = new ShaderMaterial(name, this.scene, { vertexSource: LAYER_VERTEX, fragmentSource: LAYER_FRAGMENT },
      { attributes: ['position', 'uv'], uniforms: ['worldViewProjection', 'saturateAmount'], samplers: ['layer'], needAlphaBlending: true });
    material.backFaceCulling = false;
    material.alphaMode = mode;
    material.disableDepthWrite = true;
    material.setFloat('saturateAmount', 1);
    const texture = new DynamicTexture(name, { width: 2, height: 2 }, this.scene, false, Texture.BILINEAR_SAMPLINGMODE);
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    material.setTexture('layer', texture);
    const mesh = MeshBuilder.CreatePlane(name, { width: 2, height: 2 }, this.scene);
    mesh.material = material;
    mesh.position.z = z;
    mesh.alphaIndex = order;
    if (shaken) mesh.parent = this.shake;
    return { mesh, material, texture, width: 0, height: 0 };
  }

  /** 表示の大きさに合わせ直す。板の大きさと、貼り付けるテクスチャの粗さを作り直す。 */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width)); this.height = Math.max(1, Math.round(rect.height));
    this.aspect = this.width / this.height;
    this.engine.resize();
    this.camera.orthoLeft = -this.width / 2; this.camera.orthoRight = this.width / 2;
    this.camera.orthoTop = this.height / 2; this.camera.orthoBottom = -this.height / 2;
    for (const board of Object.values(this.boards)) board.mesh.scaling.set(this.width / 2, this.height / 2, 1);
    this.worldDrawn = false;
  }

  /** テクスチャの粗さを元のcanvasに合わせる。大きさが変わった時だけ作り直す。 */
  private fit(board: Board, width: number, height: number) {
    const w = Math.max(1, width), h = Math.max(1, height);
    if (board.width === w && board.height === h) return false;
    const next = new DynamicTexture(board.texture.name, { width: w, height: h }, this.scene, false, Texture.BILINEAR_SAMPLINGMODE);
    next.wrapU = next.wrapV = Texture.CLAMP_ADDRESSMODE;
    board.texture.dispose();
    board.texture = next; board.width = w; board.height = h;
    board.material.setTexture('layer', next);
    return true;
  }

  /** 元のcanvasの中身を板へ送る。毎コマ呼ぶので、余計な作り直しはしない。 */
  private upload(board: Board, source: HTMLCanvasElement) {
    this.fit(board, source.width, source.height);
    const internal = board.texture.getInternalTexture();
    if (internal) this.engine.updateDynamicTexture(internal, source, true, false);
  }

  /** 背景は動かないので一度だけ貼る。表示の形に合わせて切り取る（CSSの cover と同じ）。 */
  private drawWorld() {
    const image = this.sources.world;
    if (!image.complete || !image.naturalWidth) return;
    const w = Math.max(2, Math.round(this.width)), h = Math.max(2, Math.round(this.height));
    this.fit(this.boards.world, w, h);
    const context = this.boards.world.texture.getContext() as CanvasRenderingContext2D;
    const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * cover, dh = image.naturalHeight * cover;
    context.clearRect(0, 0, w, h);
    context.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    this.boards.world.texture.update(true);
    this.worldDrawn = true;
  }

  /** 合成を使うかどうか。使う間は元のHTMLの層を見えなくする（描くのは続ける）。 */
  setActive(on: boolean) {
    if (this.gaveUp) on = false;
    if (on === this.active) return;
    this.active = on;
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
    this.canvas.dataset.on = String(on);
    // 元の四枚は透明にするだけ。場所も当たり判定もそのままなので、線を描く指も試験もこれまで通り。
    for (const node of [this.sources.world, this.sources.knight, this.sources.spell, this.sources.magic]) node.style.opacity = on ? '0' : '';
  }

  get on() { return this.active; }

  /** 重い後処理（ブルーム、色収差、歪み）の入り切り。 */
  private setPost(on: boolean) {
    if (on === this.heavy) return;
    this.heavy = on;
    // 外の時間帯は後処理を一つも通さない（1コマぶんの塗りをまるごと省く）。
    this.pipeline.imageProcessingEnabled = on;
    this.pipeline.bloomEnabled = on && this.bloomOn;
    this.pipeline.chromaticAberrationEnabled = on;
    // 確認用。後処理が効いている間だけ on にする。
    this.canvas.dataset.post = on ? 'on' : 'off';
    if (!on) this.canvas.dataset.ripple = '';
    if (on && !this.shockAttached) { this.camera.attachPostProcess(this.shockwave); this.shockAttached = true; }
    if (!on && this.shockAttached) { this.camera.detachPostProcess(this.shockwave); this.shockAttached = false; }
  }

  /** 毎コマ呼ぶ。元のcanvasを板へ送り、後処理の値を決めて一回描く。 */
  render(frame: CompositeFrame) {
    if (!this.active) return;
    const now = performance.now();
    if (this.lastFrameAt) {
      const dt = now - this.lastFrameAt;
      if (dt > 0 && dt < 500) this.fps += (1000 / dt - this.fps) * .05;
    }
    this.lastFrameAt = now;
    this.frames++;
    // 遅すぎるPCでは合成を止めて、段階1〜3の状態（HTMLの層）へ戻す。
    const slow = giveUpDecision(this.fps, this.lowFrames, this.frames);
    this.lowFrames = slow.lowFrames;
    if (slow.giveUp) { this.gaveUp = true; this.setActive(false); this.canvas.dataset.gaveUp = 'true'; return; }
    if (!this.worldDrawn) this.drawWorld();
    const state = this.sources.knight.dataset.state ?? '';
    if (shouldUploadKnight(state, this.knightState, frame.t, this.frames)) this.upload(this.boards.knight, this.sources.knight);
    this.knightState = state;
    this.upload(this.boards.spell, this.sources.spell);
    this.upload(this.boards.magic, this.sources.magic);
    // 背景の彩度だけはHTMLの filter が効かないので、板のシェーダーで落とす。
    this.boards.world.material.setFloat('saturateAmount', Math.max(0, Math.min(frame.screen.saturate, 2)));

    // 揺れ、傾き、寄りを親へまとめてかける。騎士だけは1.3倍大きく動かす。
    const base = layerMotion(frame.screen, 1, 1);
    this.shake.position.set(base.x, -base.y, 0);
    this.shake.rotation.z = -base.rotate * Math.PI / 180;
    this.shake.scaling.set(base.scale, base.scale, 1);
    const extra = layerMotion(frame.screen, .3, 1);
    this.boards.knight.mesh.position.set(extra.x, -extra.y, this.boards.knight.mesh.position.z);
    this.boards.knight.mesh.rotation.z = -extra.rotate * Math.PI / 180;
    this.boards.world.mesh.scaling.set(this.width / 2 * 1.03, this.height / 2 * 1.03, 1);
    this.boards.knight.mesh.scaling.set(this.width / 2 * 1.03, this.height / 2 * 1.03, 1);

    const heavy = postHeavyActive(frame.t);
    this.setPost(heavy);
    if (heavy) {
      const bloom = this.keepBloom || bloomDecision(this.bloomOn, this.fps);
      if (bloom !== this.bloomOn) { this.bloomOn = bloom; this.pipeline.bloomEnabled = bloom; }
      this.pipeline.bloomWeight = bloomWeightAt(frame.t, frame.calm);
      // 色収差は命中後0.5秒だけ。値は画面全体の効果から受け取る。控えめモードでは出さない。
      const chromatic = frame.calm ? 0 : frame.screen.chromatic;
      this.pipeline.chromaticAberration.aberrationAmount = chromatic * 6;
      this.pipeline.chromaticAberration.radialIntensity = 1.4;
      this.center = frame.target;
      this.ripple = frame.calm ? null : rippleAt(frame.t);
      this.canvas.dataset.ripple = this.ripple ? `${this.ripple.radius.toFixed(3)}:${this.shockwave.isReady() ? '出ている' : '準備中'}` : '';
    } else {
      this.ripple = null;
    }
    this.scene.render();
  }

  /** 記録に残す設定。 */
  get report() {
    return { used: !this.gaveUp, gaveUp: this.gaveUp, scale: Number(this.scaleLevel.toFixed(3)), bloom: this.bloomOn, postWindow: [POST_FROM, POST_TO], fps: Math.round(this.fps) };
  }

  dispose() {
    this.setActive(false);
    this.shockwave.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
