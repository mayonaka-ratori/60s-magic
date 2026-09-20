import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Point } from '../game/types';
import { smoothStroke } from './spell-layout';

/** 完成形を描く部品。画像に焼き込まず、実際の入力点から発光する線を作る。 */
export class CompletedSpell {
  private engine: Engine;
  private scene: Scene;
  private camera: FreeCamera;
  private glow: GlowLayer;
  private meshes: Mesh[] = [];
  private core: StandardMaterial;
  private line: StandardMaterial;
  private guide: StandardMaterial;
  private band: StandardMaterial;
  private halo: ShaderMaterial;
  private width = 1;
  private height = 1;
  private root: TransformNode;
  private strength = .95;
  private opacity = 1;

  constructor(private canvas: HTMLCanvasElement, autoRender = true) {
    this.engine = new Engine(canvas, true, { alpha: true, stencil: true, premultipliedAlpha: false });
    this.engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
    this.scene = new Scene(this.engine);
    this.root = new TransformNode('本人の術式', this.scene);
    // 加算した光をCSSのscreenで背景に重ねる。透明な描画面では光の周囲が消える。
    this.scene.clearColor = new Color4(0, 0, 0, 1);
    this.camera = new FreeCamera('術式の固定視点', new Vector3(0, 0, -100), this.scene);
    this.camera.setTarget(Vector3.Zero()); this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    const material = (name: string, color: Color3, alpha = 1) => {
      const m = new StandardMaterial(name, this.scene);
      m.disableLighting = true; m.emissiveColor = color; m.alpha = alpha;
      return m;
    };
    this.core = material('光点の白い中心', new Color3(1.8, 2.1, 2.8));
    this.line = material('青白い主線', new Color3(.36, .66, 1.8));
    this.guide = material('細い補助線', new Color3(.27, .52, .95), .58);
    this.band = material('主線の外側の帯', new Color3(.36, .66, 1.8), .22);
    this.halo = new ShaderMaterial('光点の青いにじみ', this.scene, {
      vertexSource: 'precision highp float; attribute vec3 position; attribute vec2 uv; uniform mat4 worldViewProjection; varying vec2 vUV; void main(){ vUV=uv; gl_Position=worldViewProjection*vec4(position,1.0); }',
      fragmentSource: 'precision highp float; varying vec2 vUV; uniform float strength; uniform vec3 tint; void main(){ float r=length(vUV-0.5)*2.0; float glow=exp(-r*r*6.0)*(1.0-smoothstep(0.6,1.0,r)); vec3 color=mix(tint,vec3(0.72,0.9,1.0),exp(-r*r*80.0)); gl_FragColor=vec4(color,glow*0.85*strength); }',
    }, { attributes: ['position','uv'], uniforms: ['worldViewProjection','strength','tint'], needAlphaBlending: true });
    this.halo.backFaceCulling = false; this.halo.alphaMode = Engine.ALPHA_ADD;
    this.halo.setFloat('strength', 1);
    this.halo.setColor3('tint',new Color3(.1,.32,1));
    this.glow = new GlowLayer('術式の青い光', this.scene, { blurKernelSize: 48, mainTextureRatio: .75 });
    this.glow.intensity = 1.25;
    this.resize();
    // 材質の準備が終わった後も描き直し、最初の表示で線が消えるのを防ぐ。
    if(autoRender)this.engine.runRenderLoop(() => { if (!document.hidden) this.scene.render(); });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.engine.resize();
    this.camera.orthoLeft = -this.width / 2; this.camera.orthoRight = this.width / 2;
    this.camera.orthoTop = this.height / 2; this.camera.orthoBottom = -this.height / 2;
  }

  setGlow(value: number) { this.strength=value;this.glow.intensity = value; this.halo.setFloat('strength', value / .95*this.opacity); }

  present(scale:number,dx:number,dy:number,opacity:number,color:string,details=1) {
    this.root.scaling.set(scale,scale,1);this.root.position.set(dx,-dy,0);
    this.opacity=opacity;this.root.setEnabled(opacity>.001);
    const tint=Color3.FromHexString(color);
    this.core.emissiveColor.set(1.8*opacity,2.1*opacity,2.8*opacity);
    this.line.emissiveColor=tint.scale(2.0*opacity);this.band.emissiveColor=tint.scale(.9*opacity);this.guide.emissiveColor=tint.scale(.65*opacity);
    this.halo.setColor3('tint',tint);this.halo.setFloat('strength',this.strength/.95*opacity);
    for(const mesh of this.meshes)mesh.visibility=opacity*(mesh.metadata?.detail?details:1);
  }

  setShape(points: readonly Point[], complete = true) {
    this.meshes.forEach(mesh => { this.glow.removeExcludedMesh(mesh); mesh.dispose(); }); this.meshes = [];
    const vector = (p: { x: number; y: number }) => new Vector3((p.x - .5) * this.width, (.5 - p.y) * this.height, 0);
    const tube = (name: string, path: Vector3[], radius: number, material = this.line) => {
      // 同じ位置が続く点は管の向きを決められないため、表示するときだけ省く。
      const clean = path.filter((p, i) => !i || Vector3.Distance(p, path[i - 1]) > .08);
      if (clean.length < 2) return;
      const mesh = MeshBuilder.CreateTube(name, { path: clean, radius, tessellation: 6 }, this.scene);
      mesh.material = material;mesh.parent=this.root;mesh.metadata={detail:!name.startsWith('本人が描いた線')}; this.meshes.push(mesh);
    };
    const ring = (center: Vector3, radius: number, material = this.guide, thickness = .38) => {
      tube('光点を囲む線', Array.from({ length: 81 }, (_, i) => center.add(new Vector3(Math.cos(i / 80 * Math.PI * 2) * radius, Math.sin(i / 80 * Math.PI * 2) * radius, 1))), thickness, material);
    };
    const dot = (p: Vector3, radius: number) => {
      const mesh = MeshBuilder.CreateSphere('光の中心', { diameter: radius * 2, segments: 12 }, this.scene);
      mesh.position.copyFrom(p); mesh.material = this.core;mesh.parent=this.root; this.meshes.push(mesh);
      const halo = MeshBuilder.CreatePlane('光点の周囲', { size: radius * 21 }, this.scene);
      halo.position.copyFrom(p); halo.position.z = -4; halo.material = this.halo;halo.parent=this.root;
      this.glow.addExcludedMesh(halo); this.meshes.push(halo);
    };
    const strokes = new Map<number, Point[]>();
    for (const p of points) { const stroke = strokes.get(p.stroke) ?? []; stroke.push(p); strokes.set(p.stroke, stroke); }
    for (const stroke of strokes.values()) {
      // 本人の線は明るい背景の上でもはっきり見えるよう、太い芯と、その外側の淡い帯の二重にする。
      tube('本人が描いた線', smoothStroke(stroke).map(vector), 2.1);
      tube('本人が描いた線の帯', smoothStroke(stroke).map(vector), 5.5, this.band);
      if (stroke.length === 1) dot(vector(stroke[0]), 2.5);
    }
    if (!points.length) { this.render(); return; }
    if (!complete) { dot(vector(points[points.length - 1]), 3.4); this.render(); return; }

    const positions = points.map(vector);
    const minX = Math.min(...positions.map(p => p.x)), maxX = Math.max(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y)), maxY = Math.max(...positions.map(p => p.y));
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, 0);
    const radius = Math.max(28, ...positions.map(p => Vector3.Distance(center, p))) + 12;
    const rx = Math.max(28, (maxX-minX)/2+16), ry = Math.max(28, (maxY-minY)/2+16);
    // 等間隔の点ではなく、筆の端と大きな折れ目を優先して選ぶ。
    const candidates = points.map((p, i) => {
      const a = points[i - 1], b = points[i + 1];
      if (!a || !b || a.stroke !== p.stroke || b.stroke !== p.stroke) return { p: positions[i], score: 2 };
      const left = positions[i].subtract(positions[i - 1]).normalize();
      const right = positions[i + 1].subtract(positions[i]).normalize();
      return { p: positions[i], score: 1 - Vector3.Dot(left, right) };
    }).sort((a,b) => b.score - a.score);
    const nodes: Vector3[] = [];
    for (const candidate of candidates) {
      if (nodes.length >= 5) break;
      if (nodes.every(p => Vector3.Distance(p, candidate.p) > radius * .25)) nodes.push(candidate.p);
    }
    // 外周は補助表示。元の線はそのまま残し、外周に引き寄せない。
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * Math.PI * 2;
      tube('外周の短い目盛り', [a, a + .028].map(t => center.add(new Vector3(Math.cos(t) * rx, Math.sin(t) * ry, 2))), .32, this.guide);
    }
    tube('外周の淡い弧', Array.from({length: 91}, (_,i) => center.add(new Vector3(Math.cos(i/90*Math.PI*1.65+.25)*rx,Math.sin(i/90*Math.PI*1.65+.25)*ry,2))), .42, this.guide);
    for (const [i, p] of nodes.entries()) {
      dot(p, i === 1 ? 4 : 3.1); ring(p, i === 1 ? 12 : 9, this.line, .4);
      tube('中心につながる補助線', [p, center], .28, this.guide);
    }
    dot(center, 5); ring(center, 14, this.line, .6); ring(center, 25); ring(center, 33);
    tube('中心の縦線', [center.add(new Vector3(0, -40, 0)), center.add(new Vector3(0, 40, 0))], .3, this.guide);
    tube('中心の横線', [center.add(new Vector3(-40, 0, 0)), center.add(new Vector3(40, 0, 0))], .3, this.guide);
    this.render();
  }
  render() { this.scene.render(); }
  async ready() { await this.scene.whenReadyAsync(true); this.render(); }
  dispose() { this.scene.dispose(); this.engine.dispose(); }
}
