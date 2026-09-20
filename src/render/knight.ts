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
import { BATTLE_END, ROUNDS } from '../game/rounds';
import { colors } from './magic';
import { getPreset } from './effects/presets';
import type { Recipe } from '../game/types';

const smooth=(x:number)=>{const p=clamp(x);return p*p*(3-2*p);};
const mix=(a:string,b:string,r:number)=>{
  const read=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [ar,ag,ab]=read(a),[br,bg,bb]=read(b);
  return `rgb(${Math.round(ar+(br-ar)*r)},${Math.round(ag+(bg-ag)*r)},${Math.round(ab+(bb-ab)*r)})`;
};

/** 入力の量から反応の強さ（0〜1）を出す。個数、範囲、収束が大きいほど大きく崩れる。 */
export function reactionPower(recipe:Recipe|null|undefined) {
  if(!recipe)return .45;
  const many=clamp((recipe.count-1)/5),wide=clamp((recipe.area-.2)/.8),focus=clamp(recipe.concentration);
  return clamp(.16+many*.42+wide*.22+focus*.26);
}

export function knightPose(ms:number,active:boolean,reduced=false,purpose:Recipe['purpose']='attack',power=.45,impactMs=18500) {
  const t=(ms-impactMs)/1000;
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
  return {weights:pad([1-hit-recover,hit,recover]),lean:reduced?0:hit*force,
    breath:reduced?0:Math.sin(ms*.0016)*.003,flash:active?Math.max(0,1-t/.24)*(t>=0?1:0)*(reduced?1/3:1):0,
    state:hit>.1?'hit':recover>.1?'recover':'idle',
    strength,push:reduced?0:push,collapse:reduced?0:collapse,
    // 打撃の向きに合わせ、右へのけぞる。単位は度。
    spin:reduced?0:push*(1.4+strength*2.6)+collapse*3.4,
    flashAlpha:step<0?0:(.85-step*.2)*(.5+strength*.5)*(reduced?1/3:1),flashTint:step===1?1:0,
    ghost:reduced?0:struck&&t<.3?1-t/.3:0,rim:struck&&t<.6?1-smooth(t/.6):0};
}

// 姿勢の表。角度だけを並べ、weightsで混ぜる。body と head は、正の値で後ろへ反る。
// 0〜2 は一回目で使う待機・ひるむ・構えを戻す。3〜7 は防御の回で使う。
type Pose={body:number;head:number;swordSwing:number;swordOut:number;shieldSwing:number;shieldOut:number;crouch:number};
const POSES:Pose[]=[
  {body:.04,head:0,swordSwing:.16,swordOut:.1,shieldSwing:-.12,shieldOut:.14,crouch:0},
  {body:.3,head:.24,swordSwing:-.5,swordOut:.55,shieldSwing:-.8,shieldOut:.5,crouch:-.11},
  {body:-.1,head:-.04,swordSwing:-.12,swordOut:-.04,shieldSwing:.16,shieldOut:-.2,crouch:-.03},
  // 構え。剣を引き、腰を落とし、盾を前へ出す。
  {body:-.06,head:-.04,swordSwing:-.55,swordOut:.34,shieldSwing:.55,shieldOut:.5,crouch:-.16},
  // 溜め。剣を頭上まで上げ、体を反らす。
  {body:.2,head:.12,swordSwing:-2.3,swordOut:.5,shieldSwing:.25,shieldOut:.28,crouch:-.04},
  // 振り下ろし。踏み込んで前へ斬る。
  {body:-.4,head:-.22,swordSwing:.95,swordOut:.12,shieldSwing:-.35,shieldOut:.22,crouch:-.24},
  // 弾かれる。腕ごと押し戻され、上半身が反る。
  {body:.5,head:.32,swordSwing:-1.15,swordOut:.85,shieldSwing:-.55,shieldOut:.72,crouch:-.02},
  // 前屈。胸当てが割れて弱点が見える姿勢。
  {body:-.5,head:-.34,swordSwing:-.12,swordOut:.04,shieldSwing:-.2,shieldOut:.08,crouch:-.32},
];
/** 姿勢の重みを、表の長さにそろえる。足りない分は0。 */
const pad=(weights:number[])=>{const full=new Array(POSES.length).fill(0);for(let i=0;i<weights.length;i++)full[i]=weights[i];return full;};

// 防御の回の時刻は、回の表（rounds.ts）から作る。表を直したら騎士も一緒に動く。
const FIRST=ROUNDS[0],DEFEND=ROUNDS[1];
/** 防御の姿勢へ移り始める時刻（秒）。一回目の受け渡しの始まり。 */
export const GUARD_FROM=FIRST.handoff/1000;
/** 防御の回の姿勢の順。at の時刻から ramp 秒かけて、その姿勢へ移る。 */
const GUARD_STEPS:Array<{at:number;pose:number;ramp:number}>=[
  {at:0,pose:0,ramp:.5},                        // 待機
  {at:GUARD_FROM,pose:3,ramp:1},                // 構え
  {at:DEFEND.start/1000+.2,pose:4,ramp:6},      // 溜め
  {at:DEFEND.lock/1000,pose:5,ramp:.55},        // 振り下ろし
  {at:DEFEND.impact/1000,pose:6,ramp:.22},      // 弾かれる
  {at:DEFEND.impact/1000+2.2,pose:2,ramp:1.1},  // よろめきから構えを戻す
  {at:DEFEND.handoff/1000,pose:7,ramp:1},       // 前屈して弱点を晒す
];
/** 弾き返したとき、騎士が自分の一撃を受ける時刻（秒）。一撃が盾に当たってから0.8秒後。 */
export const REFLECT_BACK_AT=DEFEND.impact/1000+.8;
/** 盾に弾かれて兜の角が折れる時刻（ms）。 */
export const HORN_BREAK_MS=DEFEND.impact+2100;
/** 胸当てが外れて弱点が見え始める時刻（ms）。 */
export const WEAKPOINT_MS=DEFEND.handoff;

/**
 * 防御の回（23秒以降）の姿勢。順に姿勢を移すだけで、入力では変えない。
 * 「返せ」で弾き返したときだけ、騎士が自分の一撃を受けて短くひるむ。
 */
export function guardPose(ms:number,reduced=false,style:'block'|'reflect'|'erase'='block') {
  const t=ms/1000;
  let index=0;
  for(let i=0;i<GUARD_STEPS.length;i++)if(t>=GUARD_STEPS[i].at)index=i;
  const step=GUARD_STEPS[index],previous=GUARD_STEPS[Math.max(0,index-1)];
  const u=smooth((t-step.at)/step.ramp);
  const weights=new Array(POSES.length).fill(0);
  weights[previous.pose]+=1-u;weights[step.pose]+=u;
  // 溜めの間は剣が低く脈打つ。毎秒1回まで。
  const charging=index===2?smooth((t-GUARD_STEPS[2].at)/2):0;
  // 弾かれた瞬間だけ押し戻される。
  const hitAt=DEFEND.impact/1000;
  const repel=t>=hitAt?Math.max(0,1-(t-hitAt)/1.2):0;
  // 弾き返しでは、戻ってきた一撃を受けて白く光る。
  const back=style==='reflect'?t-REFLECT_BACK_AT:-1;
  const struck=back>=0&&back<.7;
  const stepIndex=struck&&back<.15?Math.floor(back/.05):-1;
  // 控えめモードでは、白飛びを3分の1にして残像を出さない。動きはもともと止めてある。
  const soft=reduced?1/3:1,weak=WEAKPOINT_MS/1000;
  return {weights,lean:reduced?0:repel*.35,
    breath:reduced?0:Math.sin(ms*.0016)*.003+charging*Math.sin(t*Math.PI*2)*.004,
    flash:struck?Math.max(0,1-back/.24)*soft:0,
    state:index>=6?'exposed':index===5?'recover':index===4?'repel':index===3?'swing':index===2?'charge':index===1?'guard':'idle',
    strength:.5,push:reduced?0:repel*.5+(struck?Math.max(0,1-back/.3)*.3:0),collapse:0,
    spin:reduced?0:repel*2.2,
    flashAlpha:stepIndex<0?0:(.85-stepIndex*.2)*.75*soft,flashTint:stepIndex===1?1:0,
    ghost:reduced||!struck?0:back<.3?1-back/.3:0,
    // 弱点の輪郭の光は、回の終わりまでに0へ戻す。結果を出したまま待つ間、毎コマ形を塗り直さないため。
    rim:t>=weak?smooth((t-weak)/.5)*(1-smooth((t-weak-.5)/.5))*.5:struck?1-smooth(back/.6):0};
}
const POSE_KEYS=Object.keys(POSES[0]) as Array<keyof Pose>;
const blendPose=(weights:number[]):Pose=>{
  const result={} as Pose;
  for(const key of POSE_KEYS)result[key]=POSES.reduce((sum,pose,i)=>sum+pose[key]*weights[i],0);
  return result;
};

// 一枚絵の騎士と同じ位置に立たせる。角の先まで2.91mとし、足元を画面の高さの71.4%、頭の先を5.2%へ置く。
const HEIGHT=2.91,FOOT=.714,CROWN=.052,TAN=.3205,BACKDROP_RATIO=1672/941;
const DEPTH=HEIGHT/((FOOT-.5)*2+(.5-CROWN)*2),CAMERA_Y=(FOOT-.5)*2*DEPTH,CAMERA_Z=-DEPTH/TAN;

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
  /** 弱点を出すときに動かす胸当てと胸の線、途中で折れる兜の角。 */
  private chestPlate:Mesh|null=null;
  private chestLines:Mesh[]=[];
  private horns:Mesh[]=[];
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
  private trail:Array<{x:number;y:number;scale:number;rot:number}>=[];
  private cssSize='';
  target={x:.5,y:.32};
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
    this.chestPlate=cone('胸当て',this.body,0,.34,-.2,.5,.34,.5,6,plate);
    for(const side of [-1,1]) {
      const line=box('胸の線',this.body,side*.11,.4,-.31,.035,.42,.03,trim);line.rotation.z=side*.42;
      this.chestLines.push(line);
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
      this.horns.push(horn);
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
  private compose(pose:ReturnType<typeof knightPose>,recipe:Recipe|null) {
    const context=this.view;if(!context)return null;
    const w=this.canvas.width,h=this.canvas.height;if(w<2||h<2)return null;
    const unit=w/Math.max(1,this.canvas.clientWidth||w);
    const foot={x:w/2,y:h*FOOT};
    // 奥へ（上へ）押され、少し縮む。崩れるときは沈む。回転は足元を軸にする。
    const spot={x:0,y:(-pose.push*(4+pose.strength*7)+pose.collapse*11)*unit,
      scale:1-pose.push*.03-pose.collapse*.02,rot:pose.spin*Math.PI/180};
    const place=(dx=0,dy=0)=>{
      context.setTransform(1,0,0,1,0,0);
      context.translate(foot.x+spot.x+dx,foot.y+spot.y+dy);context.rotate(spot.rot);
      context.scale(spot.scale,spot.scale);context.translate(-foot.x,-foot.y);
    };
    const main=getPreset(null).palettes[recipe?.element??'neutral'].main;
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    context.clearRect(0,0,w,h);
    place();context.drawImage(this.source,0,0,w,h);
    context.setTransform(1,0,0,1,0,0);
    // 白飛び。今描いた騎士の形の上だけを塗る。白、属性色、白の三段。
    if(pose.flashAlpha>0) {
      context.globalCompositeOperation='source-atop';context.globalAlpha=Math.min(1,pose.flashAlpha);
      context.fillStyle=pose.flashTint?mix('#ffffff',main,.72):'#ffffff';context.fillRect(0,0,w,h);
    }
    // 輪郭の発光と残像は本体の後ろへ回す。
    context.globalCompositeOperation='destination-over';
    if(pose.rim>0) {
      const glow=this.paintStencil(main),step=2.6*unit;
      if(glow) {
        context.globalAlpha=.35*pose.rim;
        for(let i=0;i<8;i++) {
          const angle=i*Math.PI/4;
          place(Math.cos(angle)*step,Math.sin(angle)*step);context.drawImage(glow,0,0,w,h);
        }
      }
    }
    if(pose.ghost>0&&this.trail.length) {
      const ghost=this.paintStencil(mix('#ffffff',main,.25));
      if(ghost)for(let i=0;i<3&&i<this.trail.length;i++) {
        const past=this.trail[this.trail.length-1-i];
        context.globalAlpha=(.3-i*.1)*pose.ghost;
        context.setTransform(1,0,0,1,0,0);
        context.translate(foot.x+past.x,foot.y+past.y);context.rotate(past.rot);
        context.scale(past.scale,past.scale);context.translate(-foot.x,-foot.y);
        context.drawImage(ghost,0,0,w,h);
      }
    }
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    this.trail.push(spot);if(this.trail.length>4)this.trail.shift();
    return spot;
  }
  render(ms:number,active:boolean,recipe:Recipe|null,power?:number,guardStyle:'block'|'reflect'|'erase'|null=null,calm=false) {
    // 表示の大きさが変わっていたら、描く前に合わせ直す。
    const size=`${Math.max(1,this.canvas.clientWidth)}x${Math.max(1,this.canvas.clientHeight)}`;
    if(size!==this.cssSize)this.resize();
    // 一回目の受け渡しからは防御の回の姿勢へ移る。構え、溜め、振り下ろし、弾かれる、前屈の順。
    const reduced=this.motion.matches||calm;
    const guarding=active&&ms>=GUARD_FROM*1000;
    const pose=guarding?guardPose(ms,reduced,guardStyle??'block'):knightPose(ms,active,reduced,recipe?.purpose,power??reactionPower(recipe));
    // 盾に弾かれた勢いで折れる兜の角。止め方によらず、受け止めきった時点で欠ける。
    if(this.horns[0])this.horns[0].setEnabled(!(active&&ms>=HORN_BREAK_MS));
    // 弱点。胸当てが前へ外れ、胸の線が左右へ開き、核が大きくなる。
    const open=active&&ms>=WEAKPOINT_MS?clamp((ms-WEAKPOINT_MS)/700):0;
    if(this.chestPlate){this.chestPlate.position.z=-.2-open*.45;this.chestPlate.position.y=.34-open*.6;this.chestPlate.rotation.x=open*1.3;}
    for(let i=0;i<this.chestLines.length;i++)this.chestLines[i].position.x=(i?1:-1)*.11*(1+open*2.4);
    this.core.scaling.setAll(1+open*1.2);
    const p=blendPose(pose.weights);
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7);
    this.root.position.y=p.crouch+pose.breath*4;
    this.body.rotation.x=p.body;
    this.head.rotation.x=p.head;
    this.swordArm.rotation.set(p.swordSwing,0,-p.swordOut);
    this.shieldArm.rotation.set(p.shieldSwing,0,p.shieldOut);
    // 一回目の締め切りからの蓄積で核が明るくなり、命中では前から強く照らす。弱点が出たら脈打つ。
    const charge=active?clamp((ms-FIRST.inputEnd)/4500):0;
    const glow=.22+charge*.5+pose.flash*1.5+open*(.5+.5*Math.sin(ms*.012))*.7;
    this.coreMaterial.emissiveColor.set(.42+glow,.32+glow*.86,.17+glow*.7);
    // 色は魔法の属性のままだと鎧まで染まるため、白へ寄せて使う。
    this.burst.diffuse=Color3.Lerp(Color3.FromHexString(recipe?colors[recipe.element]:colors.neutral),new Color3(1,1,1),.4);
    this.burst.intensity=charge*.35+pose.flash*4;
    this.scene.render();
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const projected=Vector3.Project(this.core.getAbsolutePosition(),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(w,h));
    const spot=this.compose(pose,recipe);
    let targetX=projected.x,targetY=projected.y;
    // 胸の狙い先も、吹き飛びと回転の分だけ動かす。
    if(spot) {
      const footX=w/2,footY=h*FOOT,cos=Math.cos(spot.rot),sin=Math.sin(spot.rot);
      const dx=(targetX-footX)*spot.scale,dy=(targetY-footY)*spot.scale;
      targetX=footX+spot.x+dx*cos-dy*sin;targetY=footY+spot.y+dx*sin+dy*cos;
    }
    this.target={x:targetX/w,y:targetY/h};
    this.canvas.dataset.state=pose.state;
    this.canvas.classList.toggle('spell-finished',active&&ms>=BATTLE_END-500);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
