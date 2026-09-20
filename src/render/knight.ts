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
import type { Recipe } from '../game/types';

const smooth=(x:number)=>{const p=clamp(x);return p*p*(3-2*p);};
export function knightPose(ms:number,active:boolean,reduced=false,purpose:Recipe['purpose']='attack') {
  const t=(ms-18500)/1000;
  const hit=active?smooth(t/.09)*(1-smooth((t-.62)/.2)):0;
  const recover=active?smooth((t-.62)/.2)*(1-smooth((t-1.65)/.65)):0;
  const force=purpose==='bind'?.35:purpose==='enhance'?.5:1;
  return {weights:[1-hit-recover,hit,recover],lean:reduced?0:hit*force,
    breath:reduced?0:Math.sin(ms*.0016)*.003,flash:active?Math.max(0,1-t/.24)*(t>=0?1:0):0,
    state:hit>.1?'hit':recover>.1?'recover':'idle'};
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
  private eyes:StandardMaterial;
  private burst:PointLight;
  readonly ready:Promise<void>;
  private motion=matchMedia('(prefers-reduced-motion: reduce)');
  target={x:.5,y:.32};
  constructor(private canvas:HTMLCanvasElement) {
    this.engine=new Engine(canvas,true,{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
    this.engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,1.5));
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
      if(rim){m.emissiveColor=new Color3(.24*rim,.31*rim,.4*rim);m.emissiveFresnelParameters=new FresnelParameters({bias:.1,power:2.6,leftColor:Color3.White(),rightColor:Color3.Black()});}
      return m;
    };
    this.armor=material('鎧','#353c46',.32,1);
    const plate=material('当て板','#272d37',.24,.8);
    const cloth=material('布','#161a22',.05,.4);cloth.backFaceCulling=false;
    const hollow=material('隙間','#0b0f16',.02);hollow.emissiveColor=new Color3(.52,.23,.07);
    this.eyes=hollow;
    const trim=material('金の縁','#94804a',.55,.7);
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

    // 脚。左右で前後と開きを変え、まっすぐ立たせない。
    for(const side of [-1,1]) {
      const back=side<0?-.07:.09,open=side*.05;
      const leg=new TransformNode('脚',this.scene);leg.parent=this.root;leg.position.set(side*.22,0,back);leg.rotation.z=open;
      cone('腿',leg,0,.98,0,.32,.26,.78);
      cone('膝当て',leg,0,.57,-.02,.3,.27,.13,6,plate);
      const shin=cone('脛当て',leg,side*.02,.32,0,.28,.23,.44);shin.rotation.z=-open*1.4;
      const boot=box('具足',leg,side*.03,.09,-.09,.31,.19,.52,plate);boot.rotation.y=-side*.2;
    }
    // 腰布と帯。脚の付け根を隠し、上半身との境を金の帯で切る。
    const skirt=cone('腰布',this.root,0,1.15,0,.58,.98,.94,8,cloth);skirt.rotation.y=Math.PI/8;
    const hem=cone('裾の縁',this.root,0,.7,0,.96,1.02,.06,8,trim);hem.rotation.y=Math.PI/8;
    // 腰布の正面に金の帯を一本。布の傾きに合わせて少しだけ寝かせる。
    const front=box('腰布の帯',this.root,0,1.1,-.38,.12,.94,.025,trim);front.rotation.x=.19;
    cone('帯',this.root,0,1.56,0,.56,.6,.12,8,trim);
    cone('腹',this.root,0,1.7,0,.5,.54,.2,6,plate);

    this.body=new TransformNode('上半身',this.scene);this.body.parent=this.root;this.body.position.y=1.72;
    cone('胸',this.body,0,.3,0,.74,.5,.64);
    // 胸当てと金の線。核を頂点にしたV字で、狙う場所を分かりやすくする。
    cone('胸当て',this.body,0,.34,-.2,.5,.34,.5,6,plate);
    for(const side of [-1,1]) {
      const line=box('胸の線',this.body,side*.11,.4,-.31,.035,.42,.03,trim);line.rotation.z=side*.42;
    }
    this.core=MeshBuilder.CreateSphere('胸の核',{diameter:.15,segments:12},this.scene);
    this.core.parent=this.body;this.core.position.set(0,.22,-.31);this.core.material=this.coreMaterial;
    cone('喉当て',this.body,0,.68,-.01,.3,.38,.2,6,plate);

    // 背中のマント。半分だけの角柱を後ろへ回し、肩から裾へ広げる。
    const cape=MeshBuilder.CreateCylinder('マント',{diameterTop:.72,diameterBottom:1.3,height:1.38,tessellation:6,arc:.5},this.scene);
    // 半円は手前から時計回りに作られるため、半回転させて背中側へ回す。
    cape.parent=this.body;cape.position.set(0,-.06,.09);cape.rotation.set(-.05,Math.PI,0);cape.material=cloth;

    this.head=new TransformNode('首',this.scene);this.head.parent=this.body;this.head.position.y=.78;
    cone('兜',this.head,0,.17,0,.42,.52,.46);
    for(const side of [-1,1])box('兜の目',this.head,side*.07,.13,-.25,.1,.055,.04,hollow);
    cone('面覆い',this.head,0,.07,-.14,.34,.18,.18,6,plate);
    // 兜の角。遠目に騎士と分かる輪郭を、この2本と頭頂の小さな先で作る。
    for(const side of [-1,1]) {
      const horn=cone('兜の角',this.head,side*.15,.28,.02,0,.14,.26,6,plate);horn.rotation.z=-side*.6;
    }
    cone('頭頂の先',this.head,0,.34,-.04,0,.13,.14,6,plate);

    // 腕は肩と肘の2段。肘を少し前へ曲げ、手の位置から剣と盾を下げる。
    const arm=(name:string,side:number)=>{
      const node=new TransformNode(name,this.scene);
      node.parent=this.body;node.position.set(side*.38,.32,0);
      // 肩当ては半球。外側へ小さな棘を付けて、正面から見た幅を出す。
      const pauldron=MeshBuilder.CreateSphere('肩当て',{diameter:.46,segments:6,slice:.6},this.scene);
      pauldron.parent=node;pauldron.position.set(side*.03,.03,0);pauldron.scaling.set(1,.85,1.05);pauldron.material=this.armor;
      const spike=cone('肩の棘',node,side*.19,.07,0,0,.13,.2,6,plate);spike.rotation.z=-side*1.1;
      cone('上腕',node,side*.01,-.23,0,.2,.17,.42,6,plate);
      const elbow=new TransformNode(name+'の肘',this.scene);
      elbow.parent=node;elbow.position.set(side*.02,-.46,0);elbow.rotation.x=.26;
      cone('肘当て',elbow,0,0,0,.2,.19,.1);
      cone('前腕',elbow,side*.01,-.24,0,.19,.15,.42);
      return [node,elbow];
    };
    const [swordShoulder,swordHand]=arm('剣を持つ腕',-1);this.swordArm=swordShoulder;
    const sword=new TransformNode('剣',this.scene);sword.parent=swordHand;sword.position.set(-.04,-.46,-.03);sword.rotation.z=-.26;
    cone('握り',sword,0,.07,0,.07,.075,.2,6,plate);
    cone('柄頭',sword,0,.19,0,.09,.05,.08,6,trim);
    box('鍔',sword,0,-.04,0,.42,.07,.1,trim);
    const blade=cone('刃',sword,0,-.72,0,.15,.02,1.3,4,steel);blade.scaling.z=.32;blade.rotation.y=Math.PI/4;
    const [shieldShoulder,shieldHand]=arm('盾を持つ腕',1);this.shieldArm=shieldShoulder;
    // 盾は四角柱を平たくし、縦へ伸ばした凧形。金の縁と中央の飾りを重ねる。
    const mount=new TransformNode('盾の取り付け',this.scene);mount.parent=shieldHand;mount.position.set(.2,-.22,-.26);mount.rotation.set(-.26,-.2,.06);
    const shield=new TransformNode('盾',this.scene);shield.parent=mount;shield.rotation.x=Math.PI/2;
    const face=MeshBuilder.CreateCylinder('盾の面',{diameter:.82,height:.09,tessellation:4},this.scene);
    face.parent=shield;face.scaling.set(.94,1,1.3);face.material=this.armor;
    const edge=MeshBuilder.CreateCylinder('盾の縁',{diameter:.9,height:.05,tessellation:4},this.scene);
    edge.parent=shield;edge.position.y=.012;edge.scaling.set(.94,1,1.3);edge.material=trim;
    const band=box('盾の帯',shield,0,-.05,0,.1,.03,.96,trim);band.scaling.z=1;
    const boss=MeshBuilder.CreateCylinder('盾の飾り',{diameterTop:.07,diameterBottom:.19,height:.12,tessellation:6},this.scene);
    boss.parent=shield;boss.position.y=-.08;boss.rotation.x=Math.PI;boss.material=trim;

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
    this.engine.resize();
    // 背景の一枚絵と同じ拡大率で騎士を見せる。横長の画面では背景が広がる分だけ寄る。
    const cover=Math.max(1,this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight)/BACKDROP_RATIO);
    this.camera.fov=2*Math.atan(TAN/cover);
  }
  render(ms:number,active:boolean,recipe:Recipe|null) {
    const pose=knightPose(ms,active,this.motion.matches,recipe?.purpose);
    const p=blendPose(pose.weights);
    // 待機の間もわずかに体と腕を動かし、首をゆっくり振る。動きを減らす設定では止める。
    const live=this.motion.matches?0:1,t=ms/1000;
    const shake=pose.flash*.028;
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7);
    this.root.position.y=p.crouch+pose.breath*4;
    this.root.position.x=Math.sin(ms*.13)*shake;
    this.root.rotation.z=Math.sin(ms*.09)*shake;
    this.body.rotation.x=p.body+Math.sin(t*.42+1)*.008*live;
    this.body.rotation.z=Math.sin(t*.55)*.012*live;
    this.head.rotation.x=p.head;
    this.head.rotation.y=Math.sin(t*.31)*.06*live;
    this.swordArm.rotation.set(p.swordSwing+Math.sin(t*.5)*.03*live,0,-p.swordOut);
    this.shieldArm.rotation.set(p.shieldSwing+Math.sin(t*.5+2)*.024*live,0,p.shieldOut);
    // 14秒からの蓄積で核が明るくなり、命中では前から強く照らす。
    const charge=active?clamp((ms-14000)/4500):0,glow=.22+charge*.5+pose.flash*1.5;
    this.coreMaterial.emissiveColor.set(.42+glow,.32+glow*.86,.17+glow*.7);
    const blink=.82+Math.sin(t*1.7)*.18*live+pose.flash*.6;
    this.eyes.emissiveColor.set(.52*blink,.23*blink,.07*blink);
    // 色は魔法の属性のままだと鎧まで染まるため、白へ寄せて使う。
    this.burst.diffuse=Color3.Lerp(Color3.FromHexString(recipe?colors[recipe.element]:colors.neutral),new Color3(1,1,1),.4);
    this.burst.intensity=charge*.35+pose.flash*4;
    this.scene.render();
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const projected=Vector3.Project(this.core.getAbsolutePosition(),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(w,h));
    this.target={x:projected.x/w,y:projected.y/h};
    this.canvas.dataset.state=pose.state;
    this.canvas.classList.toggle('spell-finished',active&&ms>=23500);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
