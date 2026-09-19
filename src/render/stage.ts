import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { clamp } from '../game/motion';
import type { Recipe } from '../game/types';

export class Stage {
  readonly engine:Engine;
  readonly scene:Scene;
  private knight:TransformNode;
  private chest:StandardMaterial;
  private light:PointLight;
  constructor(canvas:HTMLCanvasElement) {
    this.engine=new Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,disableWebGL2Support:false});
    this.engine.setHardwareScalingLevel(Math.max(1,canvas.clientWidth/1280,canvas.clientHeight/720));
    this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(0.026,0.043,0.068,1);
    this.scene.fogMode=Scene.FOGMODE_EXP2;this.scene.fogDensity=0.038;this.scene.fogColor=new Color3(0.035,0.057,0.083);
    const camera=new FreeCamera('固定視点',new Vector3(0,3.4,-12),this.scene);camera.setTarget(new Vector3(0,1.8,5));camera.fov=0.65;
    const ambient=new HemisphericLight('空の光',new Vector3(-0.5,1,-0.5),this.scene);ambient.intensity=0.82;ambient.diffuse=new Color3(0.59,0.7,0.78);ambient.groundColor=new Color3(0.06,0.1,0.17);
    this.light=new PointLight('術式の光',new Vector3(0,2,-2),this.scene);this.light.diffuse=new Color3(0.39,0.81,1);this.light.intensity=1.2;
    const material=(name:string,color:string,emission?:string)=>{const m=new StandardMaterial(name,this.scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(0.15,0.2,0.24);if(emission)m.emissiveColor=Color3.FromHexString(emission);return m;};
    const floor=material('石の床','#162532');
    const ground=MeshBuilder.CreateGround('床',{width:70,height:75},this.scene);ground.material=floor;ground.position.z=15;
    const platform=MeshBuilder.CreateCylinder('円形の台',{diameter:7,height:0.16,tessellation:64},this.scene);platform.position.set(0,0.07,5);platform.material=material('台の石','#1c2e3b');
    const seam=material('床の縁','#263e4a','#102733');
    for(const diameter of [6.6,7.1]){const ring=MeshBuilder.CreateTorus('台の縁',{diameter,thickness:0.012,tessellation:96},this.scene);ring.position.set(0,0.16,5);ring.material=seam;}
    for(let x=-16;x<=16;x+=4) {const line=MeshBuilder.CreateLines('床の継ぎ目',{points:[new Vector3(x,0.006,-10),new Vector3(x,0.006,40)]},this.scene);line.color=new Color3(0.06,0.12,0.16);}
    for(let z=-8;z<40;z+=4) {const line=MeshBuilder.CreateLines('床の継ぎ目',{points:[new Vector3(-30,0.006,z),new Vector3(30,0.006,z)]},this.scene);line.color=new Color3(0.06,0.12,0.16);}
    const stone=material('柱の石','#1a2936');
    for(const side of [-1,1])for(const z of [5,14,25]) {
      const column=MeshBuilder.CreateCylinder('柱',{diameter:0.9,height:8,tessellation:8},this.scene);column.position.set(side*6,4,z);column.material=stone;
      for(const y of [0.3,7.8]){const cap=MeshBuilder.CreateBox('柱の端',{width:1.3,height:0.4,depth:1.3},this.scene);cap.position.set(side*6,y,z);cap.material=stone;}
    }
    const arch=MeshBuilder.CreateBox('奥の梁',{width:13,height:1.2,depth:1.5},this.scene);arch.position.set(0,7.5,25);arch.material=stone;
    const armor=material('鎧','#273544'),dark=material('関節','#101822'),edge=material('鎧の縁','#60636a');
    this.chest=material('胸の光','#af9766','#6f542e');
    this.knight=new TransformNode('仮の騎士',this.scene);this.knight.position.z=5;
    const part=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,mat:StandardMaterial=armor)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);mesh.parent=this.knight;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };
    part('胴',0,1.87,0,0.86,0.96,0.5);part('腰',0,1.27,0,0.74,0.36,0.5,dark);
    for(const side of [-1,1]) {
      const shoulder=part('肩',side*0.63,2.22,0,0.5,0.42,0.62);shoulder.rotation.z=side*0.18;
      const arm=part('上腕',side*0.7,1.87,0,0.28,0.55,0.35);arm.rotation.z=side*0.12;
      part('腕',side*0.76,1.36,-0.07,0.3,0.52,0.4);
      part('腿',side*0.26,0.96,0,0.34,0.61,0.44);part('膝',side*0.26,0.62,-0.1,0.38,0.26,0.45,edge);
      part('脚',side*0.26,0.35,0,0.31,0.53,0.39);part('足',side*0.26,0.12,-0.15,0.4,0.22,0.65);
    }
    const head=MeshBuilder.CreateCylinder('兜',{diameterTop:0.42,diameterBottom:0.53,height:0.65,tessellation:6},this.scene);head.parent=this.knight;head.position.y=2.65;head.material=armor;
    part('兜の目',0,2.68,-0.245,0.38,0.045,0.025,this.chest);part('兜の縦線',0,2.53,-0.26,0.055,0.32,0.03,edge);
    const core=MeshBuilder.CreatePolyhedron('胸の印',{type:1,size:0.13},this.scene);core.parent=this.knight;core.position.set(0,1.98,-0.28);core.scaling.y=1.4;core.material=this.chest;
    const sword=part('剣',0.98,0.92,-0.35,0.095,1.6,0.06,edge);sword.rotation.z=-0.12;
    part('剣の鍔',0.88,1.7,-0.35,0.48,0.075,0.1,edge);
    const glow=new GlowLayer('淡い光',this.scene,{blurKernelSize:32,mainTextureRatio:0.5});glow.intensity=0.35;
  }
  render(ms:number,recipe:Recipe|null,ready:boolean) {
    const t=ms/1000;
    const impact=clamp((t-18.4)/0.18)*(1-clamp((t-20.8)/2.1));
    this.knight.position.x=ready?2.2:0;
    this.knight.position.z=5+impact*(recipe?.purpose==='defend'?1.5:0.6);
    this.knight.rotation.x=-impact*0.17;
    this.knight.rotation.z=impact*Math.sin(t*35)*0.035;
    this.knight.position.y=Math.sin(t*1.2)*0.015;
    this.light.intensity=1.2+(t>=14&&t<17?(t-14)*0.8:0)+impact*2;
    this.chest.emissiveColor.set(0.42+impact*0.3,0.29+impact*0.25,0.12+impact*0.22);
    this.scene.render();
  }
  resize(){this.engine.resize();}
  get impactTarget(){
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const projected=Vector3.Project(new Vector3(this.knight.position.x,1.98,this.knight.position.z-0.28),Matrix.Identity(),this.scene.getTransformMatrix(),this.scene.activeCamera!.viewport.toGlobal(w,h));
    return {x:projected.x/w,y:projected.y/h};
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
