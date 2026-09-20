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

// 生成画像の3つの姿勢。各姿勢の足元をそろえ、背景の同じ石の上に立たせる。
const frames=[
  {x:0,width:657,pivotX:380,chestX:380,chestY:325},
  {x:657,width:675,pivotX:1040,chestX:974,chestY:290},
  {x:1332,width:549,pivotX:1620,chestX:1610,chestY:314},
];
export class Knight {
  private image=new Image();
  private ctx:CanvasRenderingContext2D;
  readonly ready:Promise<void>;
  private motion=matchMedia('(prefers-reduced-motion: reduce)');
  target={x:.5,y:.32};
  constructor(private canvas:HTMLCanvasElement) {
    this.ctx=canvas.getContext('2d')!;this.image.src='/art/knight-poses-v1.png';this.ready=this.image.decode();this.resize();
  }
  resize(){const dpr=Math.min(devicePixelRatio,1.5);this.canvas.width=this.canvas.clientWidth*dpr;this.canvas.height=this.canvas.clientHeight*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  render(ms:number,active:boolean,recipe:Recipe|null) {
    const c=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;c.clearRect(0,0,w,h);
    if(!this.image.complete||!this.image.naturalWidth)return;
    const plateScale=Math.max(w/1672,h/941),scale=plateScale*.745;
    const floor=h/2+(638-941/2)*plateScale,x=w/2;
    const pose=knightPose(ms,active,this.motion.matches,recipe?.purpose);
    const sx=scale*(1-pose.lean*.012),sy=scale*(1+pose.breath-pose.lean*.025);
    c.save();c.translate(x,floor);c.scale(1,.18);
    // 影用の座標は変形後の原点に合わせる。
    const localShadow=c.createRadialGradient(0,0,0,0,0,148*plateScale);localShadow.addColorStop(0,'#030810b0');localShadow.addColorStop(1,'#03081000');c.fillStyle=localShadow;
    c.fillRect(-160*plateScale,-160*plateScale,320*plateScale,320*plateScale);c.restore();
    let tx=0,ty=0;
    for(let i=0;i<frames.length;i++) {
      const weight=pose.weights[i];if(weight<=.001)continue;
      const f=frames[i],left=x-(f.pivotX-f.x)*sx,top=floor-790*sy;
      c.save();c.globalAlpha=weight;if(pose.flash>.001)c.filter=`brightness(${1+pose.flash*.7})`;
      c.drawImage(this.image,f.x,0,f.width,836,left,top,f.width*sx,836*sy);c.restore();
      tx+=(x+(f.chestX-f.pivotX)*sx)*weight;ty+=(floor+(f.chestY-790)*sy)*weight;
    }
    this.target={x:tx/w,y:ty/h};this.canvas.dataset.state=pose.state;
    this.canvas.classList.toggle('spell-finished',active&&ms>=23500);
  }
}
