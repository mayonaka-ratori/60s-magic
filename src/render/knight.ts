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
import { CubeTextureCreateFromImages } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
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

// 一枚絵の騎士と同じ位置に立たせる。角の先まで2.93mとし、足元を画面の高さの71.4%、頭の先を5.2%へ置く。
const HEIGHT=2.93,FOOT=.714,CROWN=.052,TAN=.3205,BACKDROP_RATIO=1672/941;
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
    sky.intensity=.76;sky.diffuse=new Color3(.56,.65,.77);sky.groundColor=new Color3(.11,.15,.21);sky.specular=new Color3(.22,.26,.32);
    // 背景は空が明るく騎士は逆光。上と奥の面を強く起こし、手前は弱い光だけで形を見せる。
    const back=new DirectionalLight('奥からの光',new Vector3(-.3,-.7,-1),this.scene);
    back.intensity=1.35;back.diffuse=new Color3(.84,.89,.98);
    const fill=new DirectionalLight('床からの照り返し',new Vector3(.45,-.35,1),this.scene);
    fill.intensity=.56;fill.diffuse=new Color3(.52,.59,.7);fill.specular=new Color3(.12,.14,.18);
    fill.position=new Vector3(-2.4,3.4,-3.6);
    // 手前の光だけ影を落とす。剣や盾の影が体に掛かり、厚みが出る。
    const shadows=new ShadowGenerator(1024,fill);
    shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
    shadows.darkness=.24;shadows.bias=.0009;
    // 蓄積と命中のときだけ胸の前から照らす。色は魔法の属性に合わせる。
    this.burst=new PointLight('魔法の光',new Vector3(0,2,-1.5),this.scene);this.burst.intensity=0;this.burst.range=5;

    // 空と床を写した小さな絵を6面ぶん作り、金属の映り込みに使う。外部のファイルは使わない。
    const paint=(stops:Array<[number,string]>)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const context=canvas.getContext('2d')!,gradient=context.createLinearGradient(0,0,0,64);
      for(const [at,color] of stops)gradient.addColorStop(at,color);
      context.fillStyle=gradient;context.fillRect(0,0,64,64);return canvas.toDataURL();
    };
    const side=paint([[0,'#cdd6df'],[.42,'#93a0ad'],[.52,'#4e5866'],[1,'#191d23']]);
    const backdrop=paint([[0,'#e8eef4'],[.44,'#a9b6c2'],[.52,'#525d6b'],[1,'#1a1e25']]);
    const sight=CubeTextureCreateFromImages([side,paint([[0,'#dde5ec'],[1,'#c3ccd6']]),backdrop,side,paint([[0,'#15181d'],[1,'#0f1216']]),side],this.scene);
    sight.level=.42;

    const material=(name:string,color:string,specular=.24,rim=0)=>{
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(specular,specular*1.06,specular*1.14);m.specularPower=46;
      // 逆光の縁だけを明るくする。暗い鎧のまま輪郭を見せるための設定。
      if(rim){m.emissiveColor=new Color3(.16*rim,.21*rim,.28*rim);m.emissiveFresnelParameters=new FresnelParameters({bias:.1,power:2.6,leftColor:Color3.White(),rightColor:Color3.Black()});}
      return m;
    };
    // 金属には空と床を映り込ませる。正面より縁のほうが強く映る。
    const metal=(m:StandardMaterial,strength=1)=>{
      m.reflectionTexture=sight;
      m.reflectionFresnelParameters=new FresnelParameters({bias:.06,power:2.2,
        leftColor:new Color3(strength,strength,strength),rightColor:new Color3(.13*strength,.15*strength,.18*strength)});
      return m;
    };
    this.armor=metal(material('鎧','#2e3238',.34,1));
    const plate=metal(material('当て板','#25282e',.26,.8),.8);
    const cloth=material('布','#1e232d',.06,.55);cloth.backFaceCulling=false;
    const hollow=material('隙間','#0b0f16',.02);hollow.emissiveColor=new Color3(.52,.23,.07);
    this.eyes=hollow;
    const trim=metal(material('金の縁','#9b8449',.58,.7),.9);
    const steel=metal(material('刃と縁','#9aa3ae',.7,1.2),1.3);
    this.coreMaterial=material('胸の核','#2a2418',.1);this.coreMaterial.emissiveColor=Color3.FromHexString('#6f542e');

    this.root=new TransformNode('遺跡の騎士',this.scene);
    // 真正面だと板に見えるため、体をわずかに振っておく。
    this.root.rotation.y=.14;
    const box=(name:string,parent:TransformNode,x:number,y:number,z:number,w:number,h:number,d:number,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };
    // 角柱。上下の太さを変えて鎧のすぼまりを作る。上を0にすると角や棘になる。
    const cone=(name:string,parent:TransformNode,x:number,y:number,z:number,top:number,bottom:number,h:number,sides=12,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height:h,tessellation:sides},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.rotation.y=Math.PI/sides;mesh.material=mat;return mesh;
    };
    // 横から見た輪郭の線を回して作る部品。角柱より滑らかになり、線に段を付けると重ね板になる。
    // 数の組は[中心からの距離, 高さ]で、下から上へ並べる。
    const lathe=(name:string,parent:TransformNode,x:number,y:number,z:number,profile:number[][],mat=this.armor,cap=Mesh.CAP_ALL,sides=20)=>{
      const mesh=MeshBuilder.CreateLathe(name,{shape:profile.map(p=>new Vector3(p[0],p[1],0)),tessellation:sides,cap},this.scene);
      // 面ごとに平らに塗る。輪郭は丸いまま、板を張り合わせた鎧に見える。
      mesh.convertToFlatShadedMesh();
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };

    // 脚。左右で前後と開きを変え、まっすぐ立たせない。
    for(const side of [-1,1]) {
      const back=side<0?-.07:.09,open=side*.05;
      const leg=new TransformNode('脚',this.scene);leg.parent=this.root;leg.position.set(side*.22,0,back);leg.rotation.z=open;
      cone('腿',leg,0,.98,0,.32,.26,.78);
      const knee=MeshBuilder.CreateSphere('膝当て',{diameter:.31,segments:12},this.scene);
      knee.parent=leg;knee.position.set(0,.57,-.03);knee.scaling.set(1,.75,1.1);knee.material=plate;
      const shin=cone('脛当て',leg,side*.02,.32,0,.28,.23,.44);shin.rotation.z=-open*1.4;
      const foot=new TransformNode('足',this.scene);foot.parent=leg;foot.position.set(side*.03,0,-.02);foot.rotation.y=-side*.2;
      box('具足',foot,0,.1,-.06,.32,.2,.46,plate);
      cone('具足の先',foot,0,.07,-.36,.1,.3,.24,4,plate).rotation.x=-Math.PI/2;
    }
    // 腰。輪郭に段を3つ付けて重ね板にし、その下に布を長く垂らす。元絵の裾広がりに合わせる。
    lathe('腰の板',this.root,0,1.35,0,[[.45,-.25],[.42,-.24],[.44,-.19],[.4,-.13],[.37,-.12],[.39,-.07],[.35,-.01],[.33,0],[.34,.05],[.31,.12],[.28,.2],[.27,.25]]);
    lathe('腰布',this.root,0,.85,0,[[.6,-.44],[.57,-.3],[.53,-.12],[.49,.08],[.46,.28],[.44,.44]],cloth,Mesh.NO_CAP);
    cone('裾の縁',this.root,0,.41,0,1.17,1.23,.055,16,trim);
    cone('帯',this.root,0,1.6,0,.54,.58,.12,16,trim);
    cone('腹',this.root,0,1.72,0,.48,.52,.2,12,plate);

    this.body=new TransformNode('上半身',this.scene);this.body.parent=this.root;this.body.position.y=1.72;
    // 胸は丸みのある胸当て。前後を薄くして、板ではなく鎧の膨らみに見せる。
    lathe('胸',this.body,0,.3,0,[[.2,-.33],[.26,-.25],[.31,-.12],[.33,.02],[.31,.14],[.33,.15],[.28,.25],[.16,.31],[0,.33]],this.armor,Mesh.CAP_ALL,16).scaling.z=.78;
    // 金の線。核を頂点にしたV字で、狙う場所を分かりやすくする。
    for(const side of [-1,1]) {
      const line=box('胸の線',this.body,side*.1,.38,-.28,.035,.4,.03,trim);line.rotation.set(-.12,0,side*.42);
    }
    this.core=MeshBuilder.CreateSphere('胸の核',{diameter:.15,segments:16},this.scene);
    this.core.parent=this.body;this.core.position.set(0,.2,-.28);this.core.material=this.coreMaterial;
    lathe('喉当て',this.body,0,.66,-.01,[[.13,-.09],[.18,-.04],[.2,.02],[.17,.08],[.14,.1]],plate);

    // 背中のマント。半分だけの角柱を後ろへ回し、肩から裾へ広げる。
    const cape=MeshBuilder.CreateCylinder('マント',{diameterTop:.72,diameterBottom:1.3,height:1.38,tessellation:6,arc:.5},this.scene);
    // 半円は手前から時計回りに作られるため、半回転させて背中側へ回す。
    cape.parent=this.body;cape.position.set(0,-.06,.09);cape.rotation.set(-.05,Math.PI,0);cape.material=cloth;

    this.head=new TransformNode('首',this.scene);this.head.parent=this.body;this.head.position.y=.74;
    lathe('兜',this.head,0,.16,0,[[0,-.13],[.23,-.13],[.25,-.09],[.22,-.05],[.235,.03],[.225,.12],[.19,.21],[.12,.28],[0,.31]],this.armor,Mesh.CAP_ALL,16);
    for(const side of [-1,1])box('兜の目',this.head,side*.07,.13,-.235,.09,.05,.04,hollow);
    // 面。前へ尖らせて、平らな顔に見えないようにする。
    const face=cone('面覆い',this.head,0,.08,-.18,0,.3,.26,4,plate);face.rotation.set(-Math.PI/2,0,Math.PI/4);
    // 兜の角。外へ開きながら後ろへ寝かせる。
    for(const side of [-1,1]) {
      const horn=cone('兜の角',this.head,side*.17,.23,.05,0,.14,.34,6,plate);horn.rotation.set(.45,0,-side*.55);
    }
    cone('頭頂の先',this.head,0,.32,-.02,0,.11,.13,6,plate);

    // 腕は肩と肘の2段。肘を少し前へ曲げ、手の位置から剣と盾を下げる。
    const arm=(name:string,side:number)=>{
      const node=new TransformNode(name,this.scene);
      node.parent=this.body;node.position.set(side*.35,.32,0);
      // 肩当ては丸い肩の下へ板を2枚重ねた輪郭。盾側だけ少し大きくする。
      const big=side>0?1.12:1;
      const pauldron=lathe('肩当て',node,side*.03,.04,0,[[.26,-.21],[.21,-.19],[.2,-.15],[.25,-.13],[.19,-.11],[.185,-.07],[.23,-.05],[.18,-.03],[.19,.02],[.175,.08],[.13,.13],[0,.16]],this.armor,Mesh.CAP_ALL,16);
      pauldron.scaling.set(big,.9*big,1.05*big);
      const spike=cone('肩の棘',node,side*.18,.08,0,0,.11,.19,6,plate);spike.rotation.z=-side*1.1;
      cone('上腕',node,side*.01,-.27,0,.22,.19,.4,12,plate);
      const elbow=new TransformNode(name+'の肘',this.scene);
      elbow.parent=node;elbow.position.set(side*.02,-.46,0);elbow.rotation.x=.26;
      cone('肘当て',elbow,0,0,0,.22,.21,.1);
      cone('前腕',elbow,side*.01,-.24,0,.21,.17,.42);
      return [node,elbow];
    };
    const [swordShoulder,swordHand]=arm('剣を持つ腕',-1);this.swordArm=swordShoulder;
    const sword=new TransformNode('剣',this.scene);sword.parent=swordHand;sword.position.set(-.04,-.46,-.03);sword.rotation.z=-.26;
    cone('握り',sword,0,.07,0,.07,.075,.2,10,plate);
    cone('柄頭',sword,0,.19,0,.09,.05,.08,10,trim);
    box('鍔',sword,0,-.04,0,.46,.075,.11,trim);
    const blade=cone('刃',sword,0,-.8,0,.17,.02,1.46,4,steel);blade.scaling.z=.32;blade.rotation.y=Math.PI/4;
    const [shieldShoulder,shieldHand]=arm('盾を持つ腕',1);this.shieldArm=shieldShoulder;
    // 盾は四角柱を平たくし、縦へ伸ばした凧形。金の縁と中央の飾りを重ねる。
    const mount=new TransformNode('盾の取り付け',this.scene);mount.parent=shieldHand;mount.position.set(.3,-.3,-.2);mount.rotation.set(-.24,-.34,.1);
    const shield=new TransformNode('盾',this.scene);shield.parent=mount;shield.rotation.x=Math.PI/2;
    // 縦へ伸ばす拡大と、五角形を回す回転を別の節に分ける。上が広く下が尖った形になる。
    const stretch=new TransformNode('盾の伸ばし',this.scene);stretch.parent=shield;stretch.scaling.set(.96,1,1.26);
    const spin=new TransformNode('盾の向き',this.scene);spin.parent=stretch;spin.rotation.y=-.314;
    const shieldFace=MeshBuilder.CreateCylinder('盾の面',{diameter:.94,height:.09,tessellation:5},this.scene);
    shieldFace.parent=spin;shieldFace.material=this.armor;
    const edge=MeshBuilder.CreateCylinder('盾の縁',{diameter:1.02,height:.05,tessellation:5},this.scene);
    edge.parent=spin;edge.position.y=.012;edge.material=trim;
    const band=box('盾の帯',shield,0,-.05,0,.08,.03,.98,trim);band.scaling.z=1;
    const boss=MeshBuilder.CreateCylinder('盾の飾り',{diameterTop:.07,diameterBottom:.19,height:.12,tessellation:10},this.scene);
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
