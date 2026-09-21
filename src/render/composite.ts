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
import { BEATS, ENEMY_SLAM_MS, type Beat } from '../game/rounds';
import { LAYER_FRAGMENT, LAYER_VERTEX, SHOCKWAVE_SHADER, registerCompositeShaders } from './composite-shaders';

/**
 * 段階4：合成専用のBabylonシーン。
 *
 * 背景、騎士、術式、演出の四枚を板に貼って一台の正射影カメラで並べ、まとめて後処理をかける。
 * 元のHTMLの層は見えなくするだけで、描くのは今まで通り続ける（板に貼る絵がそこにあるため）。
 * WebGLを用意できないときは合成を使わず、今までのHTMLの層のまま遊べる。
 *
 * 見せるのは魔法の山場だけ。最初の150コマだけ隠したまま描いてシェーダーを用意し速さを測り、
 * そのあとは一回目の確定の0.5秒後（21.5秒。発動の0.5秒前）まで板への転送も描画もしない（線を描いている間を軽くするため）。
 * そこから0.3秒かけて重ね、重なりきってから元のHTMLの層を消す。`?composite=always` なら0秒から見せる。
 *
 * 時刻はすべて render に渡される t（命中の停止を含む演出の時刻）だけで判断する。
 * このファイルの前半は画面を使わない計算だけにしてある（tests/composite.test.ts で確かめる）。
 */

// ------------------------------------------------------------------
// 画面を使わない計算
// ------------------------------------------------------------------

/** 重い後処理を有効にする時間帯（秒）。命中の前後だけ。一回目の発動の0.1秒前から、命中の2.5秒後まで。 */
export const POST_FROM = RELEASE_AT - .1, POST_TO = IMPACT_AT + 2.5;
/** 合成を見せ始める時刻（秒）。一回目の確定の0.5秒後で、発動の0.5秒前。ここまではHTMLの層をそのまま見せ、板への転送も描画もしない。 */
export const SHOW_FROM = BEATS[0].lock + .5;
/** 見せ始めと切り際にかける時間（秒）。この間に合成の濃さとブルームの強さを0と1の間で動かす。 */
export const FADE_SECONDS = .3;
/** 衝撃波の輪が出ている長さ（秒）。命中から0.3〜0.6秒の範囲に収める。 */
export const RIPPLE_SECONDS = .45;
/** ブルームの常時の強さと、放出や命中で上げるときの倍率。 */
export const BLOOM_BASE = .18;
const BLOOM_PEAK = 5, BLOOM_RELEASE = 3;
/** 控えめモードのときの倍率の上限。全画面の白飛びを抑えるため、放出も命中もここまでに留める。 */
export const BLOOM_CALM_PEAK = 1.6;
/** ブルームを切る目安のfpsと、戻す目安のfps。 */
export const FPS_DROP = 55, FPS_BACK = 58;

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * とどめの回で重い後処理を切る時刻を、余韻の始まりから何秒後にするか（秒）。
 * 魔法名が引くところ（余韻の始まりの1.5秒後）まで残し、そこで切る。
 * この時刻は世界の時刻で比べる。スローはもう終わっているので長さは変わらないが、実際の時刻は
 * 命中の止めとスローのぶんだけ後ろへずれる（世界の85.5秒が実際の86.225秒、控えめでは85.875秒）。
 */
export const POST_FINISH_TAIL = 1.5;

/** 敵が振り下ろした剣が床を打つ時刻（秒）。防御の回だけ。衝撃波の歪みと、重い後処理の始まりがここに揃う。 */
export const SLAM_AT = ENEMY_SLAM_MS / 1000;
/** 床を打つ衝撃波の中心の高さ（画面の上を0とした0〜1）。騎士の足元のあたり。横は命中の位置と同じ x を使う。 */
export const SLAM_RIPPLE_Y = .72;

/**
 * その回で重い後処理を入れる時刻と切る時刻（秒）。一回目は 21.9 と 26 になる。
 * 防御の回は、発動より先に敵の一撃が床を打つ（確定の0.55秒後）ので、その0.1秒前から入れる。
 */
export const postFromOf = (beat: Beat = BEATS[0]) => (beat.defend ? Math.min(beat.release, SLAM_AT) : beat.release) - (RELEASE_AT - POST_FROM);
/** とどめの回だけは命中の2.5秒後では余韻の途中で切れてしまうので、余韻の始まりから測る。 */
export const postToOf = (beat: Beat = BEATS[0]) => beat.finish ? beat.handoff + POST_FINISH_TAIL : beat.impact + (POST_TO - IMPACT_AT);

/** 重い後処理（ブルーム、色収差、歪み）を出す時間帯かどうか。回ごとに、発動の直前から余韻までだけ。 */
export function postHeavyActive(t: number, beat: Beat = BEATS[0]) {
  return t >= postFromOf(beat) && t < postToOf(beat);
}

/** 衝撃波の輪。命中からの時間で半径が広がり、幅と強さが細く弱くなる。外にいる間は null。 */
export type Ripple = { radius: number; width: number; strength: number };
export function rippleAt(t: number, impactAt = IMPACT_AT, life = RIPPLE_SECONDS): Ripple | null {
  const age = t - impactAt;
  if (age < 0 || age >= life) return null;
  const p = age / life;
  return { radius: .06 + p * .82, width: .18 * (1 - p * .62), strength: .028 * (1 - p) * (1 - p) };
}

/**
 * その時刻に出す衝撃波の輪と、その中心。命中の輪は命中の位置から、防御の回で敵の一撃が床を打つ輪は
 * 騎士の足元（横は命中の位置と同じ、縦は SLAM_RIPPLE_Y）から広がる。二つは時刻が離れているので同時には出ない。
 */
export function shockRippleAt(t: number, beat: Beat = BEATS[0], target: { x: number; y: number } = { x: .5, y: .5 }): { ripple: Ripple; center: { x: number; y: number } } | null {
  const hit = rippleAt(t, beat.impact);
  if (hit) return { ripple: hit, center: target };
  if (!beat.defend) return null;
  const slam = rippleAt(t, SLAM_AT);
  return slam ? { ripple: slam, center: { x: target.x, y: SLAM_RIPPLE_Y } } : null;
}

/**
 * 見せ始めの重なり具合。見せ始めた時刻で0、FADE_SECONDS 秒後に1。
 * 合成のcanvasの濃さとブルームの強さの両方に使う。切り替えの1コマで絵が跳ばないようにするため。
 */
export function showFadeAt(t: number, shownAt: number) { return clamp01((t - shownAt) / FADE_SECONDS); }

/** 後処理を切る手前の落とし具合。切る時刻の FADE_SECONDS 秒前から下がり始め、切る時刻で0になる。 */
export function postFadeAt(t: number, beat: Beat = BEATS[0]) { return clamp01((postToOf(beat) - t) / FADE_SECONDS); }

/**
 * ブルームの強さ。放出で3倍、命中で5倍まで上がり、0.4秒ほどで元へ戻る。控えめモードでは1.6倍までに抑える。
 * 見せ始めの0.3秒は0から上げ、後処理を切る手前0.3秒では0へ落とす。どちらも明るさが1コマで変わらないように。
 */
export function bloomWeightAt(t: number, calm = false, shownAt = 0, beat: Beat = BEATS[0]) {
  const peak = calm ? BLOOM_CALM_PEAK : BLOOM_PEAK, release = calm ? BLOOM_CALM_PEAK : BLOOM_RELEASE;
  let boost = 1;
  if (t >= beat.release) boost = Math.max(boost, 1 + (release - 1) * Math.max(0, 1 - (t - beat.release) / .4));
  if (t >= beat.impact) boost = Math.max(boost, 1 + (peak - 1) * Math.max(0, 1 - (t - beat.impact) / .4));
  return BLOOM_BASE * boost * Math.min(showFadeAt(t, shownAt), postFadeAt(t, beat));
}

/** 合成そのものを諦める目安。最初の90コマは慣らし、その後24fps未満が60コマ続いたら止めて元の層へ戻す。 */
const GIVE_UP_FPS = 24;
export const GIVE_UP_WARMUP = 90, GIVE_UP_FRAMES = 60;
/**
 * 隠したまま描くコマ数。90コマでシェーダーを用意し、続く60コマで速さを見る。
 * 遅いPCでは見せ始める前に諦められるよう、giveUpDecision が数え終わるまでの長さにしてある。
 */
export const WARMUP_FRAMES = GIVE_UP_WARMUP + GIVE_UP_FRAMES;
/**
 * 合成をやめるかどうか。時刻とブルームの状態も見る（画面には触らない計算だけ）。
 * - 山場（一回目は21.9〜26秒、回ごとに発動の直前から余韻まで）の間は判定を止める。命中の途中で合成が消えると絵が一瞬で変わってしまうため。
 * - 先にブルームを切る段を挟む。ブルームが付いている間はやめず、切れてもなお遅いときだけやめる。
 */
export function giveUpDecision(fps: number, lowFrames: number, frames: number, t: number, bloomOn: boolean, beat: Beat = BEATS[0]) {
  if (postHeavyActive(t, beat)) return { lowFrames, giveUp: false };
  if (frames <= GIVE_UP_WARMUP || !Number.isFinite(fps) || fps <= 0) return { lowFrames: 0, giveUp: false };
  if (bloomOn) return { lowFrames: 0, giveUp: false };
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

/**
 * 騎士の板を貼り直すかどうか。
 * 見せている間は毎コマ貼る（間引くと呼吸が毎秒15コマに見えてしまうため）。
 * 隠したまま描く慣らしの間だけ、姿勢が変わった時と4コマに1回に減らす。見えていないので絵には出ない。
 */
export function shouldUploadKnight(state: string, previous: string, shown: boolean, frame: number) {
  if (state !== previous) return true;
  if (shown) return true;
  return frame % 4 === 0;
}

/** 板のテクスチャの片辺の上限（画素）。大きすぎるテクスチャで詰まらないように。 */
export const BOARD_MAX_PIXELS = 4096;
/**
 * 板を作る細かさ（画素）。表示の大きさ（CSSの画素）を合成の粗さで割ると、実際に描く解像度になる。
 * 既定の粗さは 1/min(devicePixelRatio,1.5) なので、細かい画面では表示の1.5倍の画素で作る。
 * これをしないと背景だけ表示の大きさのまま引き伸ばされてぼける。
 */
export function boardPixels(cssSize: number, scaleLevel: number) {
  const level = Number.isFinite(scaleLevel) && scaleLevel > 0 ? scaleLevel : 1;
  return Math.min(BOARD_MAX_PIXELS, Math.max(2, Math.round(cssSize / level)));
}

/** 層ひとつ分の動き。揺れる量（move）と常時の余白（pad）を掛けて作る。 */
export type LayerMotion = { x: number; y: number; rotate: number; scale: number };
export function layerMotion(screen: { shakeX: number; shakeY: number; rotate: number; zoom: number }, move: number, pad: number): LayerMotion {
  return { x: Math.round(screen.shakeX * move), y: Math.round(screen.shakeY * move), rotate: screen.rotate * move, scale: screen.zoom * pad };
}

/**
 * 合成の設定。URLの指定から作る。
 * `?composite=0` は合成そのものを使わない。`?composite=always` は0秒から見せる（今までとの見比べ用）。
 * `?bloom=1` は速さに関わらずブルームを出し続ける（見え方の確認用）。
 */
export type CompositeSettings = { enabled: boolean; scale: number | null; keepBloom: boolean; showFrom: number };
/** ?scale= で受け付ける粗さの範囲。小さすぎると解像度が跳ね上がって固まるので下限を置く。 */
export const SCALE_MIN = .5, SCALE_MAX = 4;
export function compositeSettings(search: string): CompositeSettings {
  const params = new URLSearchParams(search);
  const composite = params.get('composite');
  const scale = Number(params.get('scale'));
  const level = Number.isFinite(scale) && scale > 0 ? Math.min(Math.max(scale, SCALE_MIN), SCALE_MAX) : null;
  return { enabled: composite !== '0', scale: level, keepBloom: params.get('bloom') === '1', showFrom: composite === 'always' ? 0 : SHOW_FROM };
}

// ------------------------------------------------------------------
// ここから先は画面を使う
// ------------------------------------------------------------------

export type CompositeSources = {
  world: HTMLImageElement; knight: HTMLCanvasElement; spell: HTMLCanvasElement; magic: HTMLCanvasElement;
};

export type CompositeFrame = {
  /**
   * 画面全体の効果（揺れ、傾き、寄り、彩度、色収差の量）。magic.ts が計算した値をそのまま受け取る。
   * 注意：この値だけは magic.ts が生の時刻で計算している。このファイルの中は下の t（停止を含む時刻）に
   * 一本化してあるので、二つを完全に揃えるには magic.ts 側で揺れも停止を含む時刻から計算する必要がある。
   */
  screen: ScreenState;
  /** 演出の時刻（秒）。命中の停止を含む。このファイルの時間の判断はすべてこの値だけを見る。 */
  t: number;
  /** 命中の位置（画面の左上を0とした0〜1） */
  target: { x: number; y: number };
  /** 控えめモード。色収差と歪みを切り、ブルームの倍率も抑える。 */
  calm: boolean;
  /** この回の時刻の表（秒）。後処理を出す時間帯を決めるのに使う。 */
  beat?: Beat;
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
  /** cast-scene から「合成を使ってよい」と言われている（描いてよい）。 */
  private allowed = false;
  /** 実際に合成のcanvasを見せている。重ねている途中も含む。 */
  private shown = false;
  /** 見せ始めた時刻（秒）。重なり具合とブルームの上げ始めをここから測る。 */
  private shownAt = 0;
  /** 今の重なり具合（0〜1）。1になったら元のHTMLの層を消す。 */
  private fade = 0;
  /** 元のHTMLの層を消してある。 */
  private layersHidden = false;
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
  /** 合成を見せ始める時刻（秒）。既定は16.5、`?composite=always` なら0。 */
  readonly showFrom: number;
  readonly scaleLevel: number;

  /** 作れなかったら null を返す。呼ぶ側は今まで通りのHTMLの層で続ける。 */
  static create(canvas: HTMLCanvasElement, sources: CompositeSources, settings: CompositeSettings): Composite | null {
    if (!settings.enabled) return null;
    try { return new Composite(canvas, sources, settings); } catch { return null; }
  }

  /** WebGLの文脈が失われたときの受け口。復帰は狙わず、そのまま元のHTMLの層へ戻す。 */
  /** WebGLの文脈が失われた。こちらは戻せないので、遊びごとの立て直しでも戻さない。 */
  private contextLost = false;
  private onContextLost = () => { this.contextLost = true; this.stop(); };

  private constructor(private canvas: HTMLCanvasElement, private sources: CompositeSources, settings: CompositeSettings) {
    registerCompositeShaders();
    this.keepBloom = settings.keepBloom;
    this.showFrom = settings.showFrom;
    const engine = new Engine(canvas, false, { alpha: false, stencil: false, antialias: false, preserveDrawingBuffer: false });
    this.engine = engine;
    try {
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
      // 後処理の列が組み直されるたび、歪みを最後へ入れ直す。ブルームの入り切りで順番が前後しないように。
      this.pipeline.onBuildObservable.add(() => this.restackShock());
      this.setPost(false);
      this.resize();
      this.hide();
      // 文脈が失われたら静止画が最前面に残ってしまうので、やめる経路へつなぐ。
      canvas.addEventListener('webglcontextlost', this.onContextLost);
    } catch (error) {
      // 作りかけで投げると文脈が居座るので、ここで捨ててから投げ直す。
      try { engine.dispose(); } catch { /* 片付けの失敗は気にしない */ }
      throw error;
    }
  }

  /** 合成をやめて元のHTMLの層へ戻す。遅すぎたときと、WebGLの文脈が失われたときの両方から呼ぶ。 */
  private stop() {
    if (this.gaveUp) return;
    this.gaveUp = true;
    this.allowed = false;
    this.hide();
    this.canvas.dataset.gaveUp = 'true';
  }

  /**
   * 遊びを始めるたびに、速さの測りと「諦めた」印を戻す。
   * 前の人の回で重かっただけで、次の人まで合成なしにならないようにする。文脈が失われたときは戻さない。
   */
  resetForPlay() {
    this.frames = 0; this.lastFrameAt = 0; this.fps = 60; this.lowFrames = 0; this.bloomOn = true;
    if (this.contextLost || !this.gaveUp) return;
    this.gaveUp = false;
    delete this.canvas.dataset.gaveUp;
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

  /**
   * 背景は動かないので一度だけ貼る。表示の形に合わせて切り取る（CSSの cover と同じ）。
   * 板は表示の大きさではなく実際に描く解像度で作る。表示の大きさで作ると細かい画面でぼけるため。
   */
  private drawWorld() {
    const image = this.sources.world;
    if (!image.complete || !image.naturalWidth) return;
    const w = boardPixels(this.width, this.scaleLevel), h = boardPixels(this.height, this.scaleLevel);
    this.fit(this.boards.world, w, h);
    const context = this.boards.world.texture.getContext() as CanvasRenderingContext2D;
    const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * cover, dh = image.naturalHeight * cover;
    context.clearRect(0, 0, w, h);
    context.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    this.boards.world.texture.update(true);
    this.worldDrawn = true;
  }

  /**
   * 合成を使ってよいかどうか。cast-scene が毎コマ渡す。
   * ここで決まるのは「描いてよいか」だけで、実際に見せ始めるのは showFrom（既定は21.5秒）から。
   */
  setActive(on: boolean) {
    if (this.gaveUp) on = false;
    if (on === this.allowed) return;
    this.allowed = on;
    if (!on) this.hide();
  }

  /** 元のHTMLの四枚。透明にするだけで場所も当たり判定もそのままなので、線を描く指も試験もこれまで通り。 */
  private get layerNodes(): HTMLElement[] {
    return [this.sources.world, this.sources.knight, this.sources.spell, this.sources.magic];
  }

  /**
   * 見せ始める。切り替えの瞬間に絵が跳ばないよう、0.3秒かけて濃くしていき、
   * その間は元のHTMLの層も見せたままにする。濃さが1になってから元の層を消す。
   */
  private reveal(t: number) {
    if (!this.shown) {
      this.shown = true;
      this.shownAt = t;
      this.fade = -1;
      this.canvas.style.visibility = 'visible';
      this.canvas.dataset.on = 'true';
    }
    const fade = showFadeAt(t, this.shownAt);
    if (fade === this.fade) return;
    this.fade = fade;
    this.canvas.style.opacity = fade >= 1 ? '' : fade.toFixed(3);
    const hide = fade >= 1;
    if (hide === this.layersHidden) return;
    this.layersHidden = hide;
    for (const node of this.layerNodes) node.style.opacity = hide ? '0' : '';
  }

  /** 合成を隠して元のHTMLの層へ戻す。作った直後、やめた時、遊びが終わった時に呼ぶ。 */
  private hide() {
    this.shown = false;
    this.fade = 0;
    this.canvas.style.visibility = 'hidden';
    this.canvas.style.opacity = '';
    this.canvas.dataset.on = 'false';
    if (!this.layersHidden) return;
    this.layersHidden = false;
    for (const node of this.layerNodes) node.style.opacity = '';
  }

  /** 今このコマで合成を見せているか。演出canvas内の色ずれを飛ばすかどうかの判断に使う。 */
  get on() { return this.shown; }

  /** 重い後処理（ブルーム、色収差、歪み）の入り切り。 */
  private setPost(on: boolean) {
    if (on === this.heavy) return;
    this.heavy = on;
    // 外の時間帯は後処理を一つも通さない（1コマぶんの塗りをまるごと省く）。
    this.pipeline.imageProcessingEnabled = on;
    this.pipeline.bloomEnabled = on && (this.keepBloom || this.bloomOn);
    this.pipeline.chromaticAberrationEnabled = on;
    // 確認用。後処理が効いている間だけ on にする。
    this.canvas.dataset.post = on ? 'on' : 'off';
    if (!on) this.canvas.dataset.ripple = '';
    if (on && !this.shockAttached) { this.camera.attachPostProcess(this.shockwave); this.shockAttached = true; }
    if (!on && this.shockAttached) { this.camera.detachPostProcess(this.shockwave); this.shockAttached = false; }
    this.restackShock();
  }

  /** ブルームの入り切り。入れ切りのたびに後処理の列が組み直されるので、歪みの位置も直す。 */
  private setBloom(on: boolean) {
    if (this.pipeline.bloomEnabled === on) return;
    this.pipeline.bloomEnabled = on;
    this.restackShock();
  }

  /**
   * 歪み（衝撃波）を後処理の列の最後へ入れ直す。
   * ブルームなどを入り切りすると列が組み直され、入れた順で歪みが前にも後ろにもなるので、常に最後に固定する。
   */
  private restackShock() {
    if (!this.shockAttached) return;
    this.camera.detachPostProcess(this.shockwave);
    this.camera.attachPostProcess(this.shockwave);
  }

  /**
   * 毎コマ呼ぶ。元のcanvasを板へ送り、後処理の値を決めて一回描く。
   * 描くのは、隠したままの慣らし（最初の150コマ）と、見せる時間帯（showFrom 以降）だけ。
   * その間の時間は板への転送も描画もしないので、線を描いている間は合成のぶんの負荷がかからない。
   */
  render(frame: CompositeFrame) {
    if (!this.allowed || this.gaveUp) return;
    const show = frame.t >= this.showFrom;
    const warming = this.frames < WARMUP_FRAMES;
    // 描かない間は速さの計測も数えもやめる。古い間隔や古い数で、見せ始めた直後に諦めないようにする。
    if (!show && !warming) { this.lastFrameAt = 0; this.lowFrames = 0; return; }
    const now = performance.now();
    if (this.lastFrameAt) {
      const dt = now - this.lastFrameAt;
      if (dt > 0 && dt < 500) this.fps += (1000 / dt - this.fps) * .05;
    }
    this.lastFrameAt = now;
    this.frames++;
    // ブルームの入り切りは毎コマ決める。遅いときはまずブルームが切れ、それでも追いつかないときだけ合成をやめる。
    this.bloomOn = bloomDecision(this.bloomOn, this.fps);
    // 遅すぎるPCでは合成を止めて、段階1〜3の状態（HTMLの層）へ戻す。山場の間は止めない。
    const slow = giveUpDecision(this.fps, this.lowFrames, this.frames, frame.t, this.bloomOn, frame.beat);
    this.lowFrames = slow.lowFrames;
    if (slow.giveUp) { this.stop(); return; }
    // 見せ始めと、重ねている途中の濃さ。慣らしの間は隠したまま描く。
    if (show) this.reveal(frame.t);
    if (!this.worldDrawn) this.drawWorld();
    const state = this.sources.knight.dataset.state ?? '';
    if (shouldUploadKnight(state, this.knightState, this.shown, this.frames)) this.upload(this.boards.knight, this.sources.knight);
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

    // 慣らしの間も後処理を通しておく。隠れているうちにシェーダーを用意し、重さも込みで速さを測るため。
    const heavy = this.shown ? postHeavyActive(frame.t, frame.beat) : true;
    this.setPost(heavy);
    if (heavy) {
      // ?bloom=1 のときは速さに関わらず出し続ける（見え方の確認用）。
      this.setBloom(this.keepBloom || this.bloomOn);
      this.pipeline.bloomWeight = bloomWeightAt(frame.t, frame.calm, this.shownAt, frame.beat);
      // 色収差は命中後0.5秒だけ。値は画面全体の効果から受け取る。控えめモードでは出さない。
      const chromatic = frame.calm ? 0 : frame.screen.chromatic;
      this.pipeline.chromaticAberration.aberrationAmount = chromatic * 6;
      this.pipeline.chromaticAberration.radialIntensity = 1.4;
      // 歪みの中心は輪ごとに違う。命中の輪は命中の位置、敵の一撃が床を打つ輪は騎士の足元。
      const shock = frame.calm ? null : shockRippleAt(frame.t, frame.beat, frame.target);
      this.center = shock?.center ?? frame.target;
      this.ripple = shock?.ripple ?? null;
      this.canvas.dataset.ripple = this.ripple ? `${this.ripple.radius.toFixed(3)}:${this.shockwave.isReady() ? '出ている' : '準備中'}` : '';
    } else {
      this.ripple = null;
    }
    this.scene.render();
    // 慣らしが終わって見せない時間に入るときは、ここで後処理を切っておく。次に描き始める時の組み直しを減らす。
    if (!this.shown && this.frames >= WARMUP_FRAMES) this.setPost(false);
  }

  /**
   * 記録に残す設定と、今の状態。
   * - used：合成を使えている（遅すぎて諦めていない）。
   * - gaveUp：遅すぎて合成を諦めた。
   * - showing：今この瞬間、合成のcanvasを見せている。
   * - showFrom：合成を見せ始める時刻（秒）。
   * - scale：後処理の粗さ。大きいほど粗い。
   * - bloomOn：今ブルームを付けている（fpsが落ちると切れる）。
   * - postWindow：重い後処理をかける時間帯（秒）。
   * - fps：合成が描いたコマから測った速さ。
   */
  get report() {
    return { used: !this.gaveUp, gaveUp: this.gaveUp, showing: this.shown, showFrom: this.showFrom,
      scale: Number(this.scaleLevel.toFixed(3)), bloomOn: this.bloomOn, postWindow: [POST_FROM, POST_TO], fps: Math.round(this.fps) };
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.allowed = false;
    this.hide();
    this.shockwave.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
