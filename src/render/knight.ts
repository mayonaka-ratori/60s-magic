import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { clamp } from '../game/motion';
import { colors } from './magic';
import { getPreset, type EffectPreset } from './effects/presets';
import { smooth } from './effects/frame';
import { FADE_OUT_AT, IMPACT_AT } from './effects/screen';
import type { Recipe } from '../game/types';

/** 演出が消え終わる時刻（ミリ秒）。画面全体の効果と同じ値を使う。 */
const FADE_OUT_MS = FADE_OUT_AT * 1000;
/** 反応の強さの基準にする設定（派手）。この設定のときの強さは今まで通りにする。 */
const BASE_PRESET = getPreset(null);

const mix=(a:string,b:string,r:number)=>{
  const read=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [ar,ag,ab]=read(a),[br,bg,bb]=read(b);
  return `rgb(${Math.round(ar+(br-ar)*r)},${Math.round(ag+(bg-ag)*r)},${Math.round(ab+(bb-ab)*r)})`;
};

/**
 * 魔法から反応の強さ（0〜1）を出す。個数、範囲、収束が大きいほど大きく崩れる。
 * 入力の量（たくさん描き、たくさん唱えたか）で最大0.3ほど強くなる。量の効き方は設定で変わらない。
 * 見た目の設定でも変わる。派手を1とした倍率を掛けるので、最大では大きく、控えめでは小さく崩れる。
 * 派手のときの値は今まで通り。
 */
export function reactionPower(recipe:Recipe|null|undefined,amount=0,preset:EffectPreset=getPreset(null)) {
  const gain=preset.gain/BASE_PRESET.gain;
  const fromInput=clamp(amount)*.3;
  if(!recipe)return clamp(.45*gain+fromInput);
  const many=clamp((recipe.count-1)/5),wide=clamp((recipe.area-.2)/.8),focus=clamp(recipe.concentration);
  return clamp((.16+many*.42+wide*.22+focus*.26)*gain+fromInput);
}

export function knightPose(ms:number,active:boolean,reduced=false,purpose:Recipe['purpose']='attack',power=.45,calm=false) {
  const t=(ms-18500)/1000;
  const hit=active?smooth(t/.09)*(1-smooth((t-.62)/.2)):0;
  const recover=active?smooth((t-.62)/.2)*(1-smooth((t-1.65)/.65)):0;
  const force=purpose==='bind'?.35:purpose==='enhance'?.5:1;
  // 反応の強さ。弱いと怯むだけ、中でよろめき、強いと転倒に近い崩れになる。
  const strength=clamp(power)*force,struck=active&&t>=0;
  // 奥へ押されて戻る。強いほど戻りが遅い。
  const push=struck?(t<.15?smooth(t/.15):1-smooth((t-.15)/(.35+strength*.85))):0;
  // 転倒に近い沈み込みは強いときだけ。0.6秒で沈み、1.2秒で戻る。
  const fall=clamp((strength-.55)/.45);
  const collapse=struck?fall*(t<.6?smooth(t/.6):1-smooth((t-.6)/1.2)):0;
  // 白飛びは白、属性色、白の三段で合計0.15秒。
  const step=struck&&t<.15?Math.floor(t/.05):-1;
  return {weights:[1-hit-recover,hit,recover],lean:reduced?0:hit*force,
    breath:reduced?0:Math.sin(ms*.0016)*.003,flash:active?Math.max(0,1-t/.24)*(t>=0?1:0):0,
    state:hit>.1?'hit':recover>.1?'recover':'idle',
    strength,push:reduced?0:push,collapse:reduced?0:collapse,
    // 打撃の向きに合わせ、右へのけぞる。単位は度。
    spin:reduced?0:push*(1.4+strength*2.6)+collapse*3.4,
    // 控えめモードでは白飛びを出さず、残像と輪郭の発光を3分の1にする。
    flashAlpha:calm||step<0?0:(.85-step*.2)*(.5+strength*.5),flashTint:step===1?1:0,
    ghost:(struck&&t<.3?1-t/.3:0)*(calm?1/3:1),rim:(struck&&t<.6?1-smooth(t/.6):0)*(calm?1/3:1)};
}

// 待機・ひるむ・構えを戻すの3姿勢。角度だけを並べ、weightsで混ぜる。
type Pose={body:number;head:number;swordSwing:number;swordOut:number;shieldSwing:number;shieldOut:number;crouch:number};
const POSES:Pose[]=[
  {body:.04,head:0,swordSwing:.16,swordOut:.1,shieldSwing:-.12,shieldOut:.14,crouch:0},
  {body:.3,head:.24,swordSwing:-.5,swordOut:.55,shieldSwing:-.8,shieldOut:.5,crouch:-.11},
  {body:-.1,head:-.04,swordSwing:-.12,swordOut:-.04,shieldSwing:.16,shieldOut:-.2,crouch:-.03},
];
const POSE_KEYS=Object.keys(POSES[0]) as Array<keyof Pose>;
const blendPose=(weights:number[]):Pose=>{
  const result={} as Pose;
  for(const key of POSE_KEYS)result[key]=POSES.reduce((sum,pose,i)=>sum+pose[key]*weights[i],0);
  return result;
};

// 一枚絵の騎士と同じ位置に立たせる。角の先まで2.91mとし、足元を画面の高さの71.4%、頭の先を5.2%へ置く。
const HEIGHT=2.91,FOOT=.714,CROWN=.052,TAN=.3205,BACKDROP_RATIO=1672/941;
const DEPTH=HEIGHT/((FOOT-.5)*2+(.5-CROWN)*2),CAMERA_Y=(FOOT-.5)*2*DEPTH,CAMERA_Z=-DEPTH/TAN;

/** 騎士をどこへどう置くか。足元の位置、吹き飛びのずれ、縮み、回りを一つにまとめたもの。 */
export type KnightTransform={x:number;y:number;scale:number;rot:number;footX:number;footY:number};

/**
 * 姿勢から騎士の置き方を出す。純粋な計算で、描く絵も命中の位置もこの一つだけを見る。
 * 奥へ（上へ）押されて少し縮み、崩れるときは沈む。回りの軸は足元。
 * width と height は描く面の大きさ（点の数）、unit は画面1pxあたりの点の数。
 */
export function knightTransform(pose:{push:number;collapse:number;strength:number;spin:number},width:number,height:number,unit=1):KnightTransform {
  return {x:0,y:(-pose.push*(4+pose.strength*7)+pose.collapse*11)*unit,
    scale:1-pose.push*.03-pose.collapse*.02,rot:pose.spin*Math.PI/180,
    footX:width/2,footY:height*FOOT};
}

/** 置き方をcanvasの行列にする。足元を軸に回して縮め、吹き飛びの分だけずらす。 */
export function knightMatrix(t:KnightTransform) {
  const cos=Math.cos(t.rot),sin=Math.sin(t.rot);
  const a=cos*t.scale,b=sin*t.scale,c=-sin*t.scale,d=cos*t.scale;
  return {a,b,c,d,e:t.footX+t.x-(a*t.footX+c*t.footY),f:t.footY+t.y-(b*t.footX+d*t.footY)};
}

/** 同じ行列を点へ当てる。胸の核（命中の位置）を動かすのに使う。 */
export function knightPoint(t:KnightTransform,x:number,y:number) {
  const m=knightMatrix(t);
  return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};
}

/** 遺跡の敵。外部の素材を読み込まず、角柱・円錐・半球だけで鎧の形を組む。 */
export class Knight {
  private engine:Engine;
  private scene:Scene;
  private camera:FreeCamera;
  private root:TransformNode;
  private body:TransformNode;
  private head:TransformNode;
  private swordArm:TransformNode;
  private shieldArm:TransformNode;
  private core:Mesh;
  private armor:StandardMaterial;
  private coreMaterial:StandardMaterial;
  private burst:PointLight;
  readonly ready:Promise<void>;
  private motion=matchMedia('(prefers-reduced-motion: reduce)');
  // 立体の騎士は画面に出さないcanvasへ描き、その絵を表に出すcanvasへ重ねて仕上げる。
  private source=document.createElement('canvas');
  private view:CanvasRenderingContext2D|null;
  // 白いシルエットと属性色の影を作る使い回しの小さなcanvas。毎コマ作り直さない。
  private stencil=document.createElement('canvas');
  private stencilContext:CanvasRenderingContext2D|null;
  private trail:KnightTransform[]=[];
  private cssSize='';
  target={x:.5,y:.32};
  private calm=false;
  /** 見た目の設定（控えめ・派手・最大）。演出canvasと同じものを外から渡す。 */
  private preset:EffectPreset=getPreset(null);
  constructor(private canvas:HTMLCanvasElement) {
    this.source.width=this.source.height=16;
    this.view=canvas.getContext('2d');
    this.stencilContext=this.stencil.getContext('2d');
    // 描いた絵をそのまま取り出すため、描画面を残す設定にする。
    this.engine=new Engine(this.source,true,{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    this.scene=new Scene(this.engine);
    // 背景の一枚絵を透かすため、描画面は透明のままにする。
    this.scene.clearColor=new Color4(0,0,0,0);
    this.camera=new FreeCamera('固定視点',new Vector3(0,CAMERA_Y,CAMERA_Z),this.scene);
    this.camera.setTarget(new Vector3(0,CAMERA_Y,0));

    const sky=new HemisphericLight('空の光',new Vector3(.15,1,-.4),this.scene);
    sky.intensity=.95;sky.diffuse=new Color3(.56,.65,.77);sky.groundColor=new Color3(.11,.15,.21);sky.specular=new Color3(.22,.26,.32);
    // 背景は空が明るく騎士は逆光。上と奥の面を強く起こし、手前は弱い光だけで形を見せる。
    const back=new DirectionalLight('奥からの光',new Vector3(-.3,-.7,-1),this.scene);
    back.intensity=1.35;back.diffuse=new Color3(.84,.89,.98);
    const fill=new DirectionalLight('床からの照り返し',new Vector3(.45,-.35,1),this.scene);
    fill.intensity=.4;fill.diffuse=new Color3(.48,.56,.68);fill.specular=new Color3(.12,.14,.18);
    // 蓄積と命中のときだけ胸の前から照らす。色は魔法の属性に合わせる。
    this.burst=new PointLight('魔法の光',new Vector3(0,2,-1.5),this.scene);this.burst.intensity=0;this.burst.range=5;

    const material=(name:string,color:string,specular=.24,rim=0)=>{
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(specular,specular*1.06,specular*1.14);m.specularPower=46;
      // 逆光の縁だけを明るくする。暗い鎧のまま輪郭を見せるための設定。
      if(rim){m.emissiveColor=new Color3(.23*rim,.34*rim,.48*rim);m.emissiveFresnelParameters=new FresnelParameters({bias:.1,power:2.6,leftColor:Color3.White(),rightColor:Color3.Black()});}
      return m;
    };
    this.armor=material('鎧','#28313e',.3,1);
    const plate=material('当て板','#1e2732',.22,.8);
    const cloth=material('布','#1a2130',.05,.45);cloth.backFaceCulling=false;
    const hollow=material('隙間','#0b0f16',.02);hollow.emissiveColor=new Color3(.52,.23,.07);
    const trim=material('金の縁','#8f7b46',.55,.7);
    const steel=material('刃と縁','#9aa3ae',.7,1.2);
    this.coreMaterial=material('胸の核','#2a2418',.1);this.coreMaterial.emissiveColor=Color3.FromHexString('#6f542e');

    this.root=new TransformNode('遺跡の騎士',this.scene);
    // 真正面だと板に見えるため、体をわずかに振っておく。
    this.root.rotation.y=.14;
    const box=(name:string,parent:TransformNode,x:number,y:number,z:number,w:number,h:number,d:number,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };
    // 角柱。上下の太さを変えて鎧のすぼまりを作る。上を0にすると角や棘になる。
    const cone=(name:string,parent:TransformNode,x:number,y:number,z:number,top:number,bottom:number,h:number,sides=6,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height:h,tessellation:sides},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.rotation.y=Math.PI/sides;mesh.material=mat;return mesh;
    };

    // 脚。腿、膝当て、脛当て、具足の4つで、腰布の下から見える部分だけを作る。
    for(const side of [-1,1]) {
      cone('腿',this.root,side*.2,.98,0,.32,.26,.78);
      cone('膝当て',this.root,side*.2,.57,-.02,.3,.27,.13,6,plate);
      cone('脛当て',this.root,side*.2,.32,0,.26,.2,.44);
      box('具足',this.root,side*.2,.09,-.08,.28,.18,.48,plate);
    }
    // 腰布と帯。脚の付け根を隠し、上半身との境を金の帯で切る。
    const skirt=cone('腰布',this.root,0,1.15,0,.58,.98,.94,8,cloth);skirt.rotation.y=Math.PI/8;
    const hem=cone('裾の縁',this.root,0,.7,0,.96,1.02,.06,8,trim);hem.rotation.y=Math.PI/8;
    cone('帯',this.root,0,1.56,0,.56,.6,.12,8,trim);
    cone('腹',this.root,0,1.7,0,.5,.54,.2,6,plate);

    this.body=new TransformNode('上半身',this.scene);this.body.parent=this.root;this.body.position.y=1.72;
    cone('胸',this.body,0,.3,0,.78,.5,.64);
    // 胸当てと金の線。核を頂点にしたV字で、狙う場所を分かりやすくする。
    cone('胸当て',this.body,0,.34,-.2,.5,.34,.5,6,plate);
    for(const side of [-1,1]) {
      const line=box('胸の線',this.body,side*.11,.4,-.31,.035,.42,.03,trim);line.rotation.z=side*.42;
    }
    this.core=MeshBuilder.CreateSphere('胸の核',{diameter:.15,segments:12},this.scene);
    this.core.parent=this.body;this.core.position.set(0,.22,-.31);this.core.material=this.coreMaterial;
    cone('喉当て',this.body,0,.68,-.01,.3,.38,.2,6,plate);

    // 背中のマント。半分だけの角柱を後ろへ回し、肩から裾へ広げる。
    const cape=MeshBuilder.CreateCylinder('マント',{diameterTop:.72,diameterBottom:1.26,height:1.34,tessellation:10,arc:.5},this.scene);
    // 半円は手前から時計回りに作られるため、半回転させて背中側へ回す。
    cape.parent=this.body;cape.position.set(0,-.04,.08);cape.rotation.y=Math.PI;cape.material=cloth;

    this.head=new TransformNode('首',this.scene);this.head.parent=this.body;this.head.position.y=.78;
    cone('兜',this.head,0,.17,0,.42,.52,.46);
    for(const side of [-1,1])box('兜の目',this.head,side*.07,.13,-.25,.1,.055,.04,hollow);
    cone('面覆い',this.head,0,.07,-.14,.34,.18,.18,6,plate);
    // 兜の角。遠目に騎士と分かる輪郭を、この2本と頭頂の小さな先で作る。
    for(const side of [-1,1]) {
      const horn=cone('兜の角',this.head,side*.15,.28,.02,0,.14,.26,6,plate);horn.rotation.z=-side*.6;
    }
    cone('頭頂の先',this.head,0,.34,-.04,0,.13,.14,6,plate);

    const arm=(name:string,side:number)=>{
      const node=new TransformNode(name,this.scene);
      node.parent=this.body;node.position.set(side*.36,.34,0);
      // 肩当ては半球。外側へ小さな棘を付けて、正面から見た幅を出す。
      const pauldron=MeshBuilder.CreateSphere('肩当て',{diameter:.48,segments:8,slice:.6},this.scene);
      pauldron.parent=node;pauldron.position.set(side*.04,.02,0);pauldron.scaling.set(1,.85,1.05);pauldron.material=this.armor;
      const spike=cone('肩の棘',node,side*.2,.06,0,0,.13,.2,6,plate);spike.rotation.z=-side*1.1;
      cone('上腕',node,side*.02,-.24,0,.22,.18,.44,6,plate);
      cone('肘当て',node,side*.03,-.48,0,.21,.2,.1);
      cone('前腕',node,side*.04,-.72,0,.2,.16,.42);
      return node;
    };
    this.swordArm=arm('剣を持つ腕',-1);
    const sword=new TransformNode('剣',this.scene);sword.parent=this.swordArm;sword.position.set(-.06,-.94,-.05);sword.rotation.z=-.3;
    cone('握り',sword,0,.07,0,.07,.075,.2,6,plate);
    cone('柄頭',sword,0,.19,0,.09,.05,.08,6,trim);
    box('鍔',sword,0,-.04,0,.42,.07,.1,trim);
    const blade=cone('刃',sword,0,-.72,0,.15,.02,1.3,4,steel);blade.scaling.z=.32;blade.rotation.y=Math.PI/4;
    this.shieldArm=arm('盾を持つ腕',1);
    // 盾は四角柱を平たくし、縦へ伸ばした凧形。金の縁と中央の飾りを重ねる。
    const mount=new TransformNode('盾の取り付け',this.scene);mount.parent=this.shieldArm;mount.position.set(.19,-.5,-.3);mount.rotation.set(0,-.2,.06);
    const shield=new TransformNode('盾',this.scene);shield.parent=mount;shield.rotation.x=Math.PI/2;
    const face=MeshBuilder.CreateCylinder('盾の面',{diameter:.82,height:.09,tessellation:4},this.scene);
    face.parent=shield;face.scaling.set(.94,1,1.3);face.material=this.armor;
    const edge=MeshBuilder.CreateCylinder('盾の縁',{diameter:.9,height:.05,tessellation:4},this.scene);
    edge.parent=shield;edge.position.y=.012;edge.scaling.set(.94,1,1.3);edge.material=trim;
    const boss=MeshBuilder.CreateCylinder('盾の飾り',{diameterTop:.07,diameterBottom:.17,height:.1,tessellation:6},this.scene);
    boss.parent=shield;boss.position.y=-.07;boss.rotation.x=Math.PI;boss.material=trim;

    // 影は一枚の面に濃淡を描いて置く。光源の影計算は使わない。
    const texture=new DynamicTexture('影の濃さ',{width:128,height:128},this.scene,false);
    const context=texture.getContext() as CanvasRenderingContext2D;
    const gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.45,'#9a9a9a');gradient.addColorStop(1,'#000000');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);texture.update();texture.getAlphaFromRGB=true;
    const shadowMaterial=new StandardMaterial('影',this.scene);
    shadowMaterial.disableLighting=true;shadowMaterial.diffuseColor=new Color3(0,0,0);shadowMaterial.emissiveColor=new Color3(0,0,0);
    shadowMaterial.opacityTexture=texture;shadowMaterial.alpha=.62;
    // 視点が低いため、足元の面は手前へ長く取らないと影が見えない。
    const shadow=MeshBuilder.CreateGround('影',{width:2.3,height:3.2},this.scene);
    shadow.parent=this.root;shadow.position.set(0,.02,-.5);shadow.material=shadowMaterial;

    // にじむ光は胸の核と兜の隙間だけ。鎧の縁まで広げると輪郭がぼやける。
    const glow=new GlowLayer('核のにじみ',this.scene,{blurKernelSize:24,mainTextureRatio:.35});
    glow.intensity=.75;
    for(const mesh of this.scene.meshes)if(mesh!==this.core&&mesh.name!=='兜の目')glow.addExcludedMesh(mesh as Mesh);

    this.resize();
    this.ready=this.scene.whenReadyAsync(true).then(()=>{this.scene.render();});
  }
  resize() {
    const cssWidth=Math.max(1,this.canvas.clientWidth),cssHeight=Math.max(1,this.canvas.clientHeight);
    const ratio=Math.min(devicePixelRatio||1,1.5);
    const width=Math.max(1,Math.round(cssWidth*ratio)),height=Math.max(1,Math.round(cssHeight*ratio));
    this.cssSize=`${cssWidth}x${cssHeight}`;
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    this.engine.setSize(width,height);
    // 残像と輪郭は形しか使わないので、半分の大きさで足りる。
    this.stencil.width=Math.max(1,Math.round(width/2));this.stencil.height=Math.max(1,Math.round(height/2));
    // 背景の一枚絵と同じ拡大率で騎士を見せる。横長の画面では背景が広がる分だけ寄る。
    const cover=Math.max(1,cssWidth/cssHeight/BACKDROP_RATIO);
    this.camera.fov=2*Math.atan(TAN/cover);
  }
  /** 騎士の形だけを一色で塗った絵を作る。使い回しのcanvasに毎回上書きする。 */
  private paintStencil(color:string) {
    const context=this.stencilContext;if(!context)return null;
    const w=this.stencil.width,h=this.stencil.height;
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    context.clearRect(0,0,w,h);context.drawImage(this.source,0,0,w,h);
    context.globalCompositeOperation='source-in';context.fillStyle=color;context.fillRect(0,0,w,h);
    return this.stencil;
  }
  /** 立体の絵を、吹き飛びと回転、白飛び、残像、輪郭の発光と合わせて表の面へ写す。 */
  private compose(pose:ReturnType<typeof knightPose>,recipe:Recipe|null,spot:KnightTransform,unit:number) {
    const context=this.view;if(!context)return;
    const w=this.canvas.width,h=this.canvas.height;if(w<2||h<2)return;
    // 置き方は knightTransform が出した一つだけを使う。命中の位置も同じものを見る。
    const place=(t:KnightTransform)=>{
      const m=knightMatrix(t);context.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
    };
    const main=this.preset.palettes[recipe?.element??'neutral'].main;
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    context.clearRect(0,0,w,h);
    place(spot);context.drawImage(this.source,0,0,w,h);
    context.setTransform(1,0,0,1,0,0);
    // 白飛び。今描いた騎士の形の上だけを塗る。白、属性色、白の三段。
    if(pose.flashAlpha>0) {
      context.globalCompositeOperation='source-atop';context.globalAlpha=Math.min(1,pose.flashAlpha);
      context.fillStyle=pose.flashTint?mix('#ffffff',main,.72):'#ffffff';context.fillRect(0,0,w,h);
    }
    // 輪郭の発光と残像は本体の後ろへ回す。
    context.globalCompositeOperation='destination-over';
    if(pose.rim>0) {
      const glow=this.paintStencil(main),spread=2.6*unit;
      if(glow) {
        // 半分の大きさのcanvasに描いた形を、縁の分だけ広げて1回だけ重ねる。
        // 拡大のぼけがそのままにじみになるので、8方向に重ねなくても光に見える。濃さは薄くする。
        context.globalAlpha=.1*pose.rim;
        place(spot);context.drawImage(glow,-spread,-spread,w+spread*2,h+spread*2);
      }
    }
    if(pose.ghost>0&&this.trail.length) {
      const ghost=this.paintStencil(mix('#ffffff',main,.25));
      if(ghost)for(let i=0;i<3&&i<this.trail.length;i++) {
        context.globalAlpha=(.3-i*.1)*pose.ghost;
        place(this.trail[this.trail.length-1-i]);
        context.drawImage(ghost,0,0,w,h);
      }
    }
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    this.trail.push(spot);if(this.trail.length>4)this.trail.shift();
  }
  /**
   * 当たった場所に魔法の色の傷あとを残す。体力バーを見なくても効いたと分かるようにする。
   * 濃さは命中から0.9秒で薄くなり、その後は0.38のまま残す。
   */
  private paintScar(scar:number,recipe:Recipe|null,x:number,y:number) {
    const c=this.view;if(!c)return;
    const w=this.canvas.width,h=this.canvas.height;
    // 一枚絵の騎士と同じ大きさの比で描く。画面の大きさが変わっても傷あとの比は変えない。
    const color=this.preset.palettes[recipe?.element??'neutral'].main,r=44*Math.max(w/1672,h/941);
    c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='lighter';
    const glow=c.createRadialGradient(x,y,0,x,y,r);
    glow.addColorStop(0,color+'cc');glow.addColorStop(.45,color+'55');glow.addColorStop(1,color+'00');
    c.globalAlpha=Math.min(1,scar);c.fillStyle=glow;
    c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    c.globalAlpha=Math.min(1,scar*.9);c.strokeStyle=color;c.lineWidth=2.4*Math.max(w/1672,h/941);c.lineCap='round';
    c.beginPath();c.moveTo(x-r*.44,y-r*.34);c.lineTo(x+r*.32,y+r*.36);
    c.moveTo(x-r*.12,y+r*.42);c.lineTo(x+r*.4,y-r*.24);c.stroke();
    c.restore();
  }
  /** 控えめモード。白飛びを消し、残像と輪郭の発光を弱める。 */
  setCalm(calm:boolean){this.calm=calm;}
  /** 見た目の設定（控えめ・派手・最大）。演出canvasと同じものを渡す。 */
  setPreset(preset:EffectPreset){this.preset=preset;}
  /** amount は入力の量（0〜1）。同じ魔法でも、たくさん描いて唱えたほど反応が強くなる。 */
  render(ms:number,active:boolean,recipe:Recipe|null,amount=0,power?:number) {
    // 表示の大きさが変わっていたら、描く前に合わせ直す。
    const size=`${Math.max(1,this.canvas.clientWidth)}x${Math.max(1,this.canvas.clientHeight)}`;
    if(size!==this.cssSize)this.resize();
    const pose=knightPose(ms,active,this.motion.matches,recipe?.purpose,power??reactionPower(recipe,amount,this.preset),this.calm);
    const p=blendPose(pose.weights);
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7);
    this.root.position.y=p.crouch+pose.breath*4;
    this.body.rotation.x=p.body;
    this.head.rotation.x=p.head;
    this.swordArm.rotation.set(p.swordSwing,0,-p.swordOut);
    this.shieldArm.rotation.set(p.shieldSwing,0,p.shieldOut);
    // 14秒からの蓄積で核が明るくなり、命中では前から強く照らす。
    const charge=active?clamp((ms-14000)/4500):0,glow=.22+charge*.5+pose.flash*1.5;
    this.coreMaterial.emissiveColor.set(.42+glow,.32+glow*.86,.17+glow*.7);
    // 色は魔法の属性のままだと鎧まで染まるため、白へ寄せて使う。
    this.burst.diffuse=Color3.Lerp(Color3.FromHexString(recipe?colors[recipe.element]:colors.neutral),new Color3(1,1,1),.4);
    this.burst.intensity=charge*.35+pose.flash*4;
    this.scene.render();
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const projected=Vector3.Project(this.core.getAbsolutePosition(),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(w,h));
    const unit=w/Math.max(1,this.canvas.clientWidth||w);
    // 置き方は一度だけ出し、絵と胸の狙い先の両方に同じものを使う。
    const spot=knightTransform(pose,w,h,unit);
    this.compose(pose,recipe,spot,unit);
    const hit=knightPoint(spot,projected.x,projected.y);
    // 命中から0.9秒かけて薄くなり、その後は残り続ける傷あと。
    const scar=active&&ms>=IMPACT_AT*1000?Math.max(.38,1.15-(ms-IMPACT_AT*1000)/900):0;
    if(scar>0)this.paintScar(scar,recipe,hit.x,hit.y);
    this.target={x:hit.x/w,y:hit.y/h};
    this.canvas.dataset.state=pose.state;
    this.canvas.dataset.scar=scar>0?'1':'0';
    this.canvas.classList.toggle('spell-finished',active&&ms>=FADE_OUT_MS);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
