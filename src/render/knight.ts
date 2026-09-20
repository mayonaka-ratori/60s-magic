import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { clamp } from '../game/motion';
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

// 一枚絵の騎士と同じ位置に立たせる。身長2.72mの足元を画面の高さの71.4%、兜の先を5.2%へ置く。
const HEIGHT=2.72,FOOT=.714,CROWN=.052,TAN=.3205,BACKDROP_RATIO=1672/941;
const DEPTH=HEIGHT/((FOOT-.5)*2+(.5-CROWN)*2),CAMERA_Y=(FOOT-.5)*2*DEPTH,CAMERA_Z=-DEPTH/TAN;

/** 遺跡の敵。箱と六角柱だけで組んだ立体で、姿勢の読みやすさだけを作る。 */
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
    sky.intensity=1;sky.diffuse=new Color3(.58,.67,.78);sky.groundColor=new Color3(.13,.17,.23);sky.specular=new Color3(.2,.24,.3);
    // 背景は空が明るく騎士は逆光。上と奥の面を強く起こし、手前は弱い光だけで形を見せる。
    const back=new DirectionalLight('奥からの光',new Vector3(-.3,-.7,-1),this.scene);
    back.intensity=1.3;back.diffuse=new Color3(.82,.87,.96);
    const fill=new DirectionalLight('床からの照り返し',new Vector3(.45,-.35,1),this.scene);
    fill.intensity=.42;fill.diffuse=new Color3(.5,.58,.7);fill.specular=new Color3(.1,.12,.15);

    const material=(name:string,color:string,specular=.22)=>{
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(specular,specular*1.08,specular*1.16);m.specularPower=42;
      return m;
    };
    this.armor=material('鎧','#2f3a4a');
    const dark=material('関節と布','#1d2631',.08);
    const steel=material('刃と鍔','#8d959e',.5);
    const shield=material('盾','#4d5765',.3);
    this.coreMaterial=material('胸の光','#2a2418',.1);this.coreMaterial.emissiveColor=Color3.FromHexString('#6f542e');

    this.root=new TransformNode('遺跡の騎士',this.scene);
    const box=(name:string,parent:TransformNode,x:number,y:number,z:number,w:number,h:number,d:number,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };
    // 頭の大きさ、肩幅、脚の長さの比だけを見本に合わせ、鎧の模様は作らない。
    for(const side of [-1,1]) {
      box('脚',this.root,side*.19,.74,0,.24,1.2,.28,dark);
      box('具足',this.root,side*.19,.09,-.06,.29,.18,.42);
    }
    const skirt=MeshBuilder.CreateCylinder('腰布',{diameterTop:.62,diameterBottom:1.04,height:1.12,tessellation:6},this.scene);
    skirt.parent=this.root;skirt.position.y=1.16;skirt.rotation.y=Math.PI/6;skirt.material=this.armor;

    this.body=new TransformNode('上半身',this.scene);this.body.parent=this.root;this.body.position.y=1.5;
    box('胴',this.body,0,.31,0,.6,.62,.4);
    box('胸当て',this.body,0,.36,-.21,.34,.32,.05,dark);
    this.core=MeshBuilder.CreateSphere('胸の核',{diameter:.13,segments:10},this.scene);
    this.core.parent=this.body;this.core.position.set(0,.42,-.23);this.core.material=this.coreMaterial;

    this.head=new TransformNode('首',this.scene);this.head.parent=this.body;this.head.position.y=.56;
    box('首',this.head,0,-.02,0,.26,.24,.26,dark);
    const helmet=MeshBuilder.CreateCylinder('兜',{diameterTop:.32,diameterBottom:.46,height:.48,tessellation:6},this.scene);
    helmet.parent=this.head;helmet.position.y=.3;helmet.rotation.y=Math.PI/6;helmet.material=this.armor;
    box('面の隙間',this.head,0,.3,-.19,.24,.045,.04,dark);
    // 兜の先。遠目に騎士と分かる輪郭をこれだけで作る。
    const crest=MeshBuilder.CreateCylinder('兜の先',{diameterTop:0,diameterBottom:.32,height:.16,tessellation:6},this.scene);
    crest.parent=this.head;crest.position.y=.58;crest.rotation.y=Math.PI/6;crest.material=this.armor;

    const arm=(name:string,side:number)=>{
      const node=new TransformNode(name,this.scene);
      node.parent=this.body;node.position.set(side*.34,.47,0);
      box('肩',node,0,.03,0,.3,.26,.4);
      box('腕',node,side*.02,-.36,0,.19,.66,.23,dark);
      return node;
    };
    this.swordArm=arm('剣を持つ腕',-1);
    const sword=new TransformNode('剣',this.scene);sword.parent=this.swordArm;sword.position.y=-.68;sword.rotation.z=-.22;
    box('刃',sword,0,-.62,-.05,.08,1.12,.04,steel);
    box('鍔',sword,0,-.03,-.05,.3,.07,.09,steel);
    this.shieldArm=arm('盾を持つ腕',1);
    box('盾',this.shieldArm,.16,-.44,-.26,.56,1.02,.08,shield);

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
    const shadow=MeshBuilder.CreateGround('影',{width:2.2,height:3.2},this.scene);
    shadow.parent=this.root;shadow.position.set(0,.02,-.5);shadow.material=shadowMaterial;

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
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7);
    this.root.position.y=p.crouch+pose.breath*4;
    this.body.rotation.x=p.body;
    this.head.rotation.x=p.head;
    this.swordArm.rotation.set(p.swordSwing,0,-p.swordOut);
    this.shieldArm.rotation.set(p.shieldSwing,0,p.shieldOut);
    const glow=.25+pose.flash*.9,charge=clamp((ms-14000)/4500)*(active?1:0);
    this.armor.emissiveColor.set(pose.flash*.5,pose.flash*.52+charge*.03,pose.flash*.55+charge*.06);
    this.coreMaterial.emissiveColor.set(.44+glow,.33+glow*.9,.18+glow*.8);
    this.scene.render();
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const projected=Vector3.Project(this.core.getAbsolutePosition(),Matrix.Identity(),this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(w,h));
    this.target={x:projected.x/w,y:projected.y/h};
    this.canvas.dataset.state=pose.state;
    this.canvas.classList.toggle('spell-finished',active&&ms>=23500);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
