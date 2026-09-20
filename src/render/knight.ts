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
  const flash=active?Math.max(0,1-t/.24)*(t>=0?1:0):0;
  // flashは光の強さ、shakeは体の震え。震えは「動きを減らす」設定で止める。
  return {weights:[1-hit-recover,hit,recover],lean:reduced?0:hit*force,
    breath:reduced?0:Math.sin(ms*.0016)*.003,flash,shake:reduced?0:flash*.028,
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
    // 背景の一枚絵より少しだけ粗く描き、拡大で輪郭をなまらせる。描く点が減るので速さにも効く。
    this.engine.setHardwareScalingLevel(1.3/Math.min(devicePixelRatio,1.5));
    this.scene=new Scene(this.engine);
    // 背景の一枚絵を透かすため、描画面は透明のままにする。
    this.scene.clearColor=new Color4(0,0,0,0);
    this.camera=new FreeCamera('固定視点',new Vector3(0,CAMERA_Y,CAMERA_Z),this.scene);
    this.camera.setTarget(new Vector3(0,CAMERA_Y,0));

    const sky=new HemisphericLight('空の光',new Vector3(.15,1,-.4),this.scene);
    sky.intensity=.42;sky.diffuse=new Color3(.54,.62,.74);sky.groundColor=new Color3(.09,.11,.15);sky.specular=new Color3(.15,.17,.21);
    // 背景は空が明るく騎士は逆光。上と奥の面を強く起こし、手前は弱い光だけで形を見せる。
    const back=new DirectionalLight('奥からの光',new Vector3(-.3,-.7,-1),this.scene);
    back.intensity=1.02;back.diffuse=new Color3(.82,.88,.98);
    const fill=new DirectionalLight('床からの照り返し',new Vector3(.45,-.35,1),this.scene);
    fill.intensity=.66;fill.diffuse=new Color3(.44,.49,.57);fill.specular=new Color3(.09,.1,.13);
    fill.position=new Vector3(-2.4,3.4,-3.6);
    // 手前の光だけ影を落とす。剣や盾の影が体に掛かり、厚みが出る。
    const shadows=new ShadowGenerator(1024,fill);
    shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
    shadows.darkness=.24;shadows.bias=.0009;
    // 遠い面ほど空気の色を混ぜる。背中側と裾が背景へ溶け、貼り付けたように見えなくなる。
    this.scene.fogMode=Scene.FOGMODE_LINEAR;this.scene.fogColor=new Color3(.42,.45,.5);
    this.scene.fogStart=6.2;this.scene.fogEnd=13;
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
    const sight=CubeTextureCreateFromImages([side,paint([[0,'#a3adb8'],[1,'#8a939e']]),backdrop,side,paint([[0,'#15181d'],[1,'#0f1216']]),side],this.scene);
    sight.level=.3;

    // 汚れとてかりむらの絵を描く。これも外部のファイルを持たず、起動時にその場で描く。
    // 同じ並びになるよう、乱数は決まった種から作る。
    let seed=20260920;const rnd=()=>(seed=seed*48271%2147483647)/2147483647;
    const SHEET=256;
    // 端と端がつながるよう、大きな図形は上下左右へ回り込ませて9回描く。
    const wrapOn=(c:CanvasRenderingContext2D)=>(f:()=>void)=>{
      for(let x=-1;x<2;x++)for(let y=-1;y<2;y++){c.save();c.translate(x*SHEET,y*SHEET);f();c.restore();}
    };
    const sheet=(name:string,base:string,draw:(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>void)=>{
      const texture=new DynamicTexture(name,{width:SHEET,height:SHEET},this.scene,true);
      const c=texture.getContext() as CanvasRenderingContext2D;
      c.fillStyle=base;c.fillRect(0,0,SHEET,SHEET);
      draw(c,wrapOn(c));texture.update();return texture;
    };
    // でこぼこの絵。白黒で高さを描いてから、隣との差で面の向きに直す。
    // 色を暗くするのではなく光の当たり方を変えるので、遠目でも凹凸が分かる。
    const relief=(name:string,depth:number,draw:(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>void)=>{
      const height=document.createElement('canvas');height.width=height.height=SHEET;
      const hc=height.getContext('2d')!;hc.fillStyle='#808080';hc.fillRect(0,0,SHEET,SHEET);
      draw(hc,wrapOn(hc));
      const src=hc.getImageData(0,0,SHEET,SHEET).data;
      const at=(x:number,y:number)=>src[(((y+SHEET)%SHEET)*SHEET+(x+SHEET)%SHEET)*4];
      const texture=new DynamicTexture(name,{width:SHEET,height:SHEET},this.scene,true);
      const c=texture.getContext() as CanvasRenderingContext2D,out=c.createImageData(SHEET,SHEET);
      for(let y=0;y<SHEET;y++)for(let x=0;x<SHEET;x++) {
        const dx=(at(x+1,y)-at(x-1,y))/255*depth,dy=(at(x,y+1)-at(x,y-1))/255*depth;
        const len=Math.hypot(dx,dy,1),i=(y*SHEET+x)*4;
        // 縦は絵が上下入れ替わって貼られるぶん、符号を逆にする。ここを間違えるとへこみが出っぱりに見える。
        out.data[i]=(-dx/len*.5+.5)*255;out.data[i+1]=(dy/len*.5+.5)*255;out.data[i+2]=(1/len*.5+.5)*255;out.data[i+3]=255;
      }
      c.putImageData(out,0,0);texture.update();return texture;
    };
    const blot=(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number)=>{
      const g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,color.replace('A',String(alpha)));g.addColorStop(1,color.replace('A','0'));
      c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    };
    // 汚れ。しみと細かいざらつきで、広い面のべた塗りを崩す。紋章や飾りの絵でも下地に使う。
    const paintGrime=(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>{
      for(let i=0;i<20;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=26+rnd()*74,a=.34+rnd()*.44;
        wrap(()=>blot(c,x,y,r,'rgba(18,16,14,A)',a));}
      for(let i=0;i<14;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=20+rnd()*46;
        wrap(()=>blot(c,x,y,r,'rgba(255,250,238,A)',.24+rnd()*.34));}
      // 縦に流れた跡。上下は切れ目なくつながる。
      for(let i=0;i<10;i++){const x=rnd()*SHEET,w=3+rnd()*12;
        c.fillStyle=`rgba(24,22,20,${(.14+rnd()*.24).toFixed(3)})`;c.fillRect(x,0,w,SHEET);}
      for(let i=0;i<1400;i++){const v=rnd()<.5?'0,0,0':'255,255,255';
        c.fillStyle=`rgba(${v},${(.06+rnd()*.16).toFixed(3)})`;c.fillRect(rnd()*SHEET,rnd()*SHEET,2+rnd()*4,2+rnd()*4);}
    };
    const grime=sheet('汚れ','#e6e6e6',paintGrime);
    // てかりむら。磨けた所と曇った所を作り、細い擦り傷を走らせる。
    const shine=sheet('てかりむら','#a8a8a8',(c,wrap)=>{
      for(let i=0;i<12;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=30+rnd()*64;
        wrap(()=>blot(c,x,y,r,'rgba(0,0,0,A)',.38+rnd()*.42));}
      for(let i=0;i<10;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=24+rnd()*50;
        wrap(()=>blot(c,x,y,r,'rgba(255,255,255,A)',.32+rnd()*.42));}
      c.lineWidth=2;
      for(let i=0;i<44;i++){
        const x=rnd()*SHEET,y=rnd()*SHEET,a=(rnd()-.5)*.7+(rnd()<.5?0:Math.PI/2),len=40+rnd()*130;
        c.strokeStyle=`rgba(255,255,255,${(.14+rnd()*.32).toFixed(3)})`;
        wrap(()=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();});
      }
    });

    // 打ち傷のへこみ、擦り傷、鋳物のざらつき。
    const paintDents=(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>{
      for(let i=0;i<10;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=18+rnd()*40;
        wrap(()=>blot(c,x,y,r,'rgba(0,0,0,A)',.5+rnd()*.4));}
      for(let i=0;i<18;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=5+rnd()*12;
        wrap(()=>blot(c,x,y,r,rnd()<.6?'rgba(0,0,0,A)':'rgba(255,255,255,A)',.35+rnd()*.45));}
      c.lineWidth=2;
      for(let i=0;i<40;i++) {
        const x=rnd()*SHEET,y=rnd()*SHEET,a=(rnd()-.5)*.5+(rnd()<.5?0:Math.PI/2),len=30+rnd()*120;
        c.strokeStyle=`rgba(0,0,0,${(.3+rnd()*.5).toFixed(3)})`;
        wrap(()=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();});
      }
      for(let i=0;i<2200;i++){const v=rnd()<.5?'0,0,0':'255,255,255';
        c.fillStyle=`rgba(${v},${(.08+rnd()*.16).toFixed(3)})`;c.fillRect(rnd()*SHEET,rnd()*SHEET,1+rnd()*3,1+rnd()*3);}
    };
    const dents=relief('でこぼこ',4,paintDents);
    dents.level=.6;

    // 盾の紋章。術式と同じ丸と三角を彫る。絵の真ん中が盾の面の真ん中に来る。
    // 絵は上下が入れ替わって貼られるので、三角は絵の下向きに描くと盾では上を向く。
    const crest=(c:CanvasRenderingContext2D,color:string,width:number)=>{
      c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';
      for(const r of [76,65]){c.beginPath();c.arc(128,128,r,0,Math.PI*2);c.stroke();}
      c.beginPath();
      for(let i=0;i<3;i++){
        const a=Math.PI/2+i*Math.PI*2/3,x=128+Math.cos(a)*56,y=128+Math.sin(a)*56;
        if(i)c.lineTo(x,y);else c.moveTo(x,y);
      }
      c.closePath();c.stroke();
      c.beginPath();c.arc(128,128,17,0,Math.PI*2);c.stroke();
      // 上下左右の短い印。
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;c.beginPath();
        c.moveTo(128+Math.cos(a)*82,128+Math.sin(a)*82);c.lineTo(128+Math.cos(a)*93,128+Math.sin(a)*93);c.stroke();
      }
    };
    const emblem=sheet('盾の絵','#e6e6e6',(c,wrap)=>{paintGrime(c,wrap);crest(c,'rgba(96,76,38,.5)',7);});
    const emblemDents=relief('盾のでこぼこ',4,(c,wrap)=>{paintDents(c,wrap);crest(c,'rgba(0,0,0,.7)',7);});
    emblemDents.level=.75;

    // 帯の飾り。同じ形を横へ8つ並べる。横は帯を一周する向き。
    const braid=sheet('帯の飾り','#e0e0e0',(c,wrap)=>{
      paintGrime(c,wrap);
      c.fillStyle='rgba(60,46,18,.55)';c.fillRect(0,0,SHEET,26);c.fillRect(0,SHEET-26,SHEET,26);
      c.strokeStyle='rgba(255,246,214,.3)';c.lineWidth=3;
      c.beginPath();c.moveTo(0,28);c.lineTo(SHEET,28);c.moveTo(0,SHEET-28);c.lineTo(SHEET,SHEET-28);c.stroke();
      for(let i=0;i<8;i++) {
        const x=i*SHEET/8+SHEET/16;
        c.fillStyle='rgba(44,32,10,.66)';
        c.beginPath();c.moveTo(x,54);c.lineTo(x+15,128);c.lineTo(x,202);c.lineTo(x-15,128);c.closePath();c.fill();
        c.fillStyle='rgba(255,246,214,.45)';
        c.beginPath();c.arc(x,128,8,0,Math.PI*2);c.fill();
      }
    });

    // 腰布の裾を欠けさせる。絵の左端が裾の先で、縦に並ぶ方向が裾を一周する向き。
    const tatter=sheet('腰布の絵','#e6e6e6',(c,wrap)=>{
      paintGrime(c,wrap);
      c.globalCompositeOperation='destination-out';
      c.fillStyle='#000';
      // 裾全体をゆるく波打たせてから、深さの違う欠けを不ぞろいに入れる。
      c.beginPath();c.moveTo(-2,-2);
      for(let y=0;y<=SHEET;y+=8)c.lineTo(5+Math.sin(y/SHEET*Math.PI*4)*4+Math.sin(y/SHEET*Math.PI*14)*2,y);
      c.lineTo(-2,SHEET+2);c.closePath();c.fill();
      const notch=(at:number,deep:number,half:number)=>{
        c.beginPath();c.moveTo(-2,at-half);c.quadraticCurveTo(deep*.55,at-half*.25,deep,at);
        c.quadraticCurveTo(deep*.55,at+half*.25,-2,at+half);c.closePath();c.fill();
      };
      for(let y=rnd()*10;y<SHEET;y+=5+rnd()*15) {
        const chance=rnd(),deep=chance<.34?10+rnd()*14:chance<.8?22+rnd()*22:44+rnd()*26;
        const half=4+rnd()*(deep<26?6:11);
        // 一周する向き（縦）だけ回り込ませる。横へ回すと腰側の端まで欠ける。
        notch(y,deep,half);
        if(y-half<0)notch(y+SHEET,deep,half);
        if(y+half>SHEET)notch(y-SHEET,deep,half);
      }
      c.globalCompositeOperation='source-over';
    });
    tatter.hasAlpha=true;

    const material=(name:string,color:string,specular=.24,rim=0)=>{
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(specular,specular*1.06,specular*1.14);m.specularPower=46;
      // 逆光の縁だけを明るくする。暗い鎧のまま輪郭を見せるための設定。
      if(rim){m.emissiveColor=new Color3(.26*rim,.32*rim,.4*rim);m.emissiveFresnelParameters=new FresnelParameters({bias:.35,power:1.9,leftColor:Color3.White(),rightColor:Color3.Black()});}
      return m;
    };
    // 汚れとてかりむらを貼る。色は材質の色に掛かり、てかりは場所ごとに強弱が付く。
    const worn=(m:StandardMaterial,shiny=true,paint=grime,relief=dents)=>{
      m.diffuseTexture=paint;m.bumpTexture=relief;
      if(shiny)m.specularTexture=shine;
      return m;
    };
    // 同じ見た目の材質は数値を1か所にまとめ、片方だけ直してしまうのを防ぐ。
    const GOLD=['#8c7749',.36,.7] as const,STEEL=['#8a919d',.48,1.2] as const,FABRIC=['#393c47',.05,.6] as const;
    // 金属には空と床を映り込ませる。正面より縁のほうが強く映る。
    const metal=(m:StandardMaterial,strength=1)=>{
      m.reflectionTexture=sight;
      m.reflectionFresnelParameters=new FresnelParameters({bias:.06,power:2.2,
        leftColor:new Color3(strength,strength,strength),rightColor:new Color3(.13*strength,.15*strength,.18*strength)});
      return m;
    };
    this.armor=worn(metal(material('鎧','#5c6069',.3,1)));
    const plate=worn(metal(material('当て板','#464955',.23,.8),.8));
    const cloth=worn(material('布',...FABRIC),false);cloth.backFaceCulling=false;
    // 腰布は裾を欠かせる。透けさせるのではなく、絵の薄い所を描かない形にして、重なりの順番で困らないようにする。
    const skirt=worn(material('腰布',...FABRIC),false,tatter);skirt.backFaceCulling=false;
    skirt.transparencyMode=StandardMaterial.MATERIAL_ALPHATEST;skirt.alphaCutOff=.45;
    const hollow=material('隙間','#0b0f16',.02);hollow.emissiveColor=new Color3(.52,.23,.07);
    this.eyes=hollow;
    const trim=worn(metal(material('金の縁',...GOLD),.9));
    const beltTrim=worn(metal(material('帯の飾り',...GOLD),.9),true,braid);
    const steel=worn(metal(material('刃と縁',...STEEL),1.3));
    const shieldPlate=worn(metal(material('盾の面',...STEEL),1.3),true,emblem,emblemDents);
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
      cone('具足の先',foot,0,.07,-.36,.1,.3,.24,4,plate).rotation.set(-Math.PI/2,0,0);
    }
    // 腰。輪郭に段を3つ付けて重ね板にし、その下に布を長く垂らす。元絵の裾広がりに合わせる。
    lathe('腰の板',this.root,0,1.35,0,[[.45,-.25],[.42,-.24],[.44,-.19],[.4,-.13],[.37,-.12],[.39,-.07],[.35,-.01],[.33,0],[.34,.05],[.31,.12],[.28,.2],[.27,.25]]);
    lathe('腰布',this.root,0,.85,0,[[.6,-.44],[.57,-.3],[.53,-.12],[.49,.08],[.46,.28],[.44,.44]],skirt,Mesh.NO_CAP);
    cone('帯',this.root,0,1.6,0,.54,.58,.12,16,beltTrim);
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
    const face=cone('面覆い',this.head,0,.08,-.18,0,.3,.26,4,plate);face.rotation.set(-Math.PI/2,0,0);
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
      const spike=cone('肩の棘',node,side*.18,.08,0,0,.11,.19,6,plate);spike.rotation.set(0,0,-side*1.1);
      cone('上腕',node,side*.01,-.27,0,.22,.19,.4,12,plate);
      const elbow=new TransformNode(name+'の肘',this.scene);
      elbow.parent=node;elbow.position.set(side*.02,-.46,0);elbow.rotation.x=.26;
      cone('肘当て',elbow,0,0,0,.22,.21,.1);
      cone('前腕',elbow,side*.01,-.24,0,.21,.17,.42);
      return [node,elbow];
    };
    const [swordShoulder,swordHand]=arm('剣を持つ腕',-1);this.swordArm=swordShoulder;
    const sword=new TransformNode('剣',this.scene);sword.parent=swordHand;sword.position.set(-.04,-.46,-.03);sword.rotation.z=-.26;
    // 柄は両手で握れる長さ。柄頭も大きくして、剣全体の重さを出す。
    cone('握り',sword,0,.11,0,.075,.085,.28,10,plate);
    cone('柄頭',sword,0,.29,0,.13,.07,.1,10,trim);
    box('鍔',sword,0,-.04,0,.54,.08,.12,trim);
    for(const side of [-1,1]) {
      const tip=cone('鍔の先',sword,side*.29,-.04,0,.02,.11,.1,6,trim);tip.rotation.set(0,0,side*Math.PI/2);
    }
    // 刃は幅の広い身と先の三角に分ける。細いと画面の中でただの線に見える。
    const blade=cone('刃',sword,0,-.73,0,.28,.25,1.14,4,steel);blade.scaling.z=.2;
    const point=cone('切っ先',sword,0,-1.45,0,.25,.02,.31,4,steel);point.scaling.z=.2;
    const [shieldShoulder,shieldHand]=arm('盾を持つ腕',1);this.shieldArm=shieldShoulder;
    // 盾は四角柱を平たくし、縦へ伸ばした凧形。金の縁と中央の飾りを重ねる。
    const mount=new TransformNode('盾の取り付け',this.scene);mount.parent=shieldHand;mount.position.set(.3,-.3,-.2);mount.rotation.set(-.24,-.34,.1);
    const shield=new TransformNode('盾',this.scene);shield.parent=mount;shield.rotation.x=Math.PI/2;
    // 縦へ伸ばす拡大と、五角形を回す回転を別の節に分ける。上が広く下が尖った形になる。
    const stretch=new TransformNode('盾の伸ばし',this.scene);stretch.parent=shield;stretch.scaling.set(.96,1,1.26);
    const spin=new TransformNode('盾の向き',this.scene);spin.parent=stretch;spin.rotation.y=-.314;
    // 手前の面を一回り小さくして、縁に斜めの面を作る。平らな板に光の段が付く。
    const shieldFace=MeshBuilder.CreateCylinder('盾の面',{diameterTop:.96,diameterBottom:.86,height:.13,tessellation:5},this.scene);
    shieldFace.parent=spin;shieldFace.material=shieldPlate;
    const edge=MeshBuilder.CreateCylinder('盾の縁',{diameter:1,height:.05,tessellation:5},this.scene);
    edge.parent=spin;edge.position.y=.03;edge.material=trim;
    // 角の鋲。5つ置くと、のっぺりした板に見えなくなる。
    for(let i=0;i<5;i++) {
      const angle=Math.PI*2*i/5;
      const stud=MeshBuilder.CreateCylinder('盾の鋲',{diameterTop:.05,diameterBottom:.09,height:.05,tessellation:8},this.scene);
      stud.parent=spin;stud.position.set(Math.cos(-angle)*.34,-.07,Math.sin(-angle)*.34);
      stud.rotation.x=Math.PI;stud.material=trim;
    }
    // 中央の帯は角を立てた隆起にする。左右で明るさが変わり、面が平らに見えなくなる。
    const band=cone('盾の帯',shield,0,-.05,0,.14,.17,1.02,4,this.armor);band.rotation.set(Math.PI/2,0,0);band.scaling.z=.45;
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
    shadowMaterial.opacityTexture=texture;shadowMaterial.alpha=.62;shadowMaterial.fogEnabled=false;
    // 視点が低いため、足元の面は手前へ長く取らないと影が見えない。
    const shadow=MeshBuilder.CreateGround('影',{width:2.3,height:3.2},this.scene);
    shadow.parent=this.root;shadow.position.set(0,.02,-.5);shadow.material=shadowMaterial;

    // 手前の光が落とす影。作った部品はすべて影を出し、影も受ける。足元の丸い影だけは別で、濃淡を描いた面を置いている。
    for(const mesh of this.scene.meshes) {
      if(mesh===shadow)continue;
      shadows.addShadowCaster(mesh as Mesh);mesh.receiveShadows=true;
    }

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
    const shake=pose.shake;
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7);
    this.root.position.y=p.crouch+pose.breath*4;
    this.root.position.x=Math.sin(t*62)*shake;
    this.root.rotation.z=Math.sin(t*44)*shake;
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
