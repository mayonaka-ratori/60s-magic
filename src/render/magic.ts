import { clamp, getNodes } from '../game/motion';
import type { Point, Recipe, Element } from '../game/types';
import { fitSpell } from './spell-layout';

export const colors:Record<Element,string>={fire:'#ff994d',ice:'#73ceff',lightning:'#8ea6ff',wind:'#7bdfba',light:'#a7d2ff',dark:'#ad81e9',neutral:'#75aaff'};
const ease=(x:number)=>1-Math.pow(1-clamp(x),3);
export class MagicCanvas {
  private ctx:CanvasRenderingContext2D;
  private width=0;private height=0;
  constructor(readonly canvas:HTMLCanvasElement){this.ctx=canvas.getContext('2d')!;this.resize();}
  resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);this.width=rect.width;this.height=rect.height;this.canvas.width=rect.width*dpr;this.canvas.height=rect.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  renderEffects(points:Point[],ms:number,recipe:Recipe|null,voice:number,cursors:Array<{x:number;y:number}>,ready:boolean,target:{x:number;y:number},origin:{x:number;y:number}) {
    const c=this.ctx,w=this.width,h=this.height,t=ms/1000,color=recipe?colors[recipe.element]:colors.neutral;
    c.clearRect(0,0,w,h);if(ready||t>=23)return;
    c.save();c.globalCompositeOperation='lighter';c.lineCap='round';
    const fade=1-clamp((t-21)/2),nodes=getNodes(points,5);
    if(t>=6&&t<17) {
      for(const p of nodes)this.glow(p.x*w,p.y*h,2+voice*3,color,.5);
      for(let i=0;i<Math.min(8,points.length);i++) {
        const index=Math.floor(((t*.16+i/8)%1)*points.length),p=points[index];
        this.glow(p.x*w,p.y*h,1.8,color,.7);
      }
    }
    if(t>=14&&t<17) {
      const charge=clamp((t-14)/3);
      this.glow(origin.x,origin.y,5+charge*11,color,.4+charge*.3);
      for(let i=0;i<nodes.length;i++) {
        const p=(t*.8+i/nodes.length)%1,a=nodes[i];
        this.glow(a.x*w+(origin.x-a.x*w)*p,a.y*h+(origin.y-a.y*h)*p,2,color,p*.7);
      }
    }
    if(t<14)for(const p of cursors)this.glow(p.x*w,p.y*h,4+voice*2,color,1);
    c.restore();
    if(t>=17&&recipe){c.save();c.globalAlpha=fade;this.release(origin,{x:target.x*w,y:target.y*h},t-17,recipe);c.restore();}
  }
  thumbnail(points:Point[],color:string,source:{width:number;height:number}) {
    this.resize();const c=this.ctx,w=this.width,h=this.height;
    c.clearRect(0,0,w,h);c.save();c.globalCompositeOperation='lighter';c.strokeStyle=color;c.lineWidth=1.1;c.shadowColor=color;c.shadowBlur=9;
    const normalized=points.map(p=>({...p,x:p.x*source.width/w,y:p.y*source.height/h}));
    const shape=fitSpell(normalized,w,h,{x:w/2,y:h/2,width:w*.7,height:h*.7});
    let stroke=-1;c.beginPath();
    for(const p of shape){if(p.stroke!==stroke){c.moveTo(p.x*w,p.y*h);stroke=p.stroke;}else c.lineTo(p.x*w,p.y*h);}c.stroke();
    for(const p of getNodes(shape,5))this.glow(p.x*w,p.y*h,2.5,color,.9);
    this.glow(w/2,h/2,5,color,.9);c.restore();
  }
  private glow(x:number,y:number,r:number,color:string,alpha:number) {
    const c=this.ctx;c.save();c.globalAlpha=clamp(alpha);const gradient=c.createRadialGradient(x,y,0,x,y,r*4);gradient.addColorStop(0,'#fff8e9');gradient.addColorStop(0.18,color);gradient.addColorStop(1,color+'00');c.fillStyle=gradient;c.beginPath();c.arc(x,y,r*4,0,Math.PI*2);c.fill();c.restore();
  }
  private release(origin:{x:number;y:number},target:{x:number;y:number},time:number,r:Recipe) {
    if(time>7)return;
    const c=this.ctx,color=colors[r.element],arrival=1.5,travel=clamp(time/arrival),fade=(1-clamp((time-3.2-r.duration)/2.8))*(1-clamp((time-4)/2));
    if(fade<=0)return;
    c.save();c.globalCompositeOperation='lighter';c.strokeStyle=color;c.fillStyle=color;c.shadowColor=color;c.shadowBlur=18;
    const focus=0.7+r.concentration*0.6;
    const radius=24+r.area*70;
    const point=(i:number)=>{
      const angle=i/Math.max(1,r.count)*Math.PI*2;
      let x=origin.x+(target.x-origin.x)*travel,y=origin.y+(target.y-origin.y)*travel;
      const arc=Math.sin(travel*Math.PI);
      if(r.count>1){x+=Math.cos(angle)*radius*arc;y+=Math.sin(angle)*radius*arc;}
      if(r.trajectory==='spiral'){x+=Math.sin(travel*14+i)*radius*0.6*arc;y+=Math.cos(travel*14+i)*radius*0.4*arc;}
      if(r.trajectory==='radial'){x+=Math.cos(angle)*radius*arc*1.4;y+=Math.sin(angle)*radius*arc;}
      if(r.trajectory==='orbit'){x+=Math.cos(time*5+i)*radius*arc;y+=Math.sin(time*5+i)*radius*arc;}
      if(r.trajectory==='homing')x+=Math.sin(travel*Math.PI)*radius*(i%2?1:-1);
      return {x,y};
    };
    this.glow(origin.x,origin.y,22*clamp(1-time/0.7),color,clamp(1-time/0.7));
    // 手前から奥へ小さくなる輪で、術式から放出した向きを見せる。
    if(time<2.3&&r.purpose==='attack')for(let i=0;i<3;i++) {
      const depth=.12+i*.2,ringSize=(55-i*13)*Math.min(1,time*5);
      const x=origin.x+(target.x-origin.x)*depth,y=origin.y+(target.y-origin.y)*depth;
      c.globalAlpha=(1-clamp((time-1.2)/1.1))*(.4-i*.07);c.lineWidth=1.2;
      c.beginPath();c.ellipse(x,y,ringSize,ringSize*.38,-.25,0,Math.PI*2);c.stroke();
    }
    if(r.purpose==='bind'&&r.count===1) {
      c.globalAlpha=fade;c.lineWidth=3;
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(target.x,target.y+25*i-15,(25+radius*0.4)*ease(time),10,Math.sin(time+i)*0.2,0,Math.PI*2);c.stroke();}
      this.path(origin,target,color,Math.min(1,time),fade*0.5,2);
    } else if(r.form==='wall'||r.form==='dome'||r.form==='wave'||r.purpose==='enhance'&&r.count===1) {
      const p=point(0);c.globalAlpha=0.13*fade;c.fillStyle=color;c.lineWidth=2+r.defense*3;
      const size=radius*(1.5-travel*0.4),rh=size*(r.form==='wave'?0.35:0.72);
      c.beginPath();
      if(r.form==='dome')c.ellipse(p.x,p.y,size,rh,0,0,Math.PI*2);
      else if(r.form==='wave'||r.purpose==='enhance'){c.moveTo(p.x-size,p.y);c.quadraticCurveTo(p.x,p.y-rh,p.x+size,p.y);c.quadraticCurveTo(p.x,p.y+rh,p.x-size,p.y);}
      else {c.moveTo(p.x-size,p.y-rh);c.lineTo(p.x+size,p.y-rh*0.8);c.lineTo(p.x+size,p.y+rh);c.lineTo(p.x-size,p.y+rh*0.8);c.closePath();}
      c.fill();c.globalAlpha=fade;c.stroke();
      this.glow(p.x,p.y,15,color,0.2*fade);
      if(travel<1)this.path(origin,p,color,1,0.28,2);
    } else for(let i=0;i<r.count;i++) {
      const p=point(i),a={x:origin.x+(i-(r.count-1)/2)*7,y:origin.y};
      const beam=r.form==='beam';
      if(beam||travel<1)this.path(a,p,color,1,fade*(beam?0.9:0.5),beam?5*focus:2);
      if(travel<1||time<arrival+0.35)this.element(p.x,p.y,beam?9:r.count>1?6:22,r.element,color,fade,time,i);
    }
    if(time>=arrival) {
      const impact=time-arrival,ring=ease(impact/1.1);
      c.globalAlpha=(1-ring)*0.8;c.lineWidth=3;c.beginPath();c.ellipse(target.x,target.y,Math.max(1,ring*radius*1.7),Math.max(1,ring*radius*0.58),0,0,Math.PI*2);c.stroke();
      this.glow(target.x,target.y,30*(1-clamp(impact/1.3))+5,color,fade*0.7);
      if(impact<.8) {
        c.strokeStyle='#e6f4ff';c.lineWidth=1.4;c.globalAlpha=(1-impact/.8)*.85;
        for(let i=0;i<22;i++) {
          const a=i*2.399,spread=(25+(i*19)%100)*Math.min(1,impact*4),length=8+20*(1-impact/.8);
          c.beginPath();c.moveTo(target.x+Math.cos(a)*spread,target.y+Math.sin(a)*spread*.7);
          c.lineTo(target.x+Math.cos(a)*(spread+length),target.y+Math.sin(a)*(spread+length)*.7);c.stroke();
        }
      }
      for(let i=0;i<30;i++){
        const a=i*2.399,spread=(22+(i*13)%80)*Math.min(impact*1.1,1.6),x=target.x+Math.cos(a)*spread,y=target.y+Math.sin(a)*spread*0.65+impact*impact*5;
        this.glow(x,y,1.4,color,fade*(1-clamp(impact/4)));
      }
      if(r.enclosure){c.globalAlpha=fade*0.4;c.lineWidth=1;c.beginPath();c.ellipse(target.x,target.y,radius*0.7,radius,0,0,Math.PI*2);c.stroke();}
    }
    c.restore();
  }
  private path(a:{x:number;y:number},b:{x:number;y:number},color:string,progress:number,alpha:number,width:number) {
    const c=this.ctx;c.save();c.globalAlpha=alpha;c.lineWidth=width;c.strokeStyle=color;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(a.x+(b.x-a.x)*progress,a.y+(b.y-a.y)*progress);c.stroke();c.lineWidth=width*0.3;c.strokeStyle='#fffcef';c.stroke();c.restore();
  }
  private element(x:number,y:number,size:number,element:Element,color:string,fade:number,time:number,index:number) {
    const c=this.ctx;this.glow(x,y,size,color,fade*0.8);c.globalAlpha=fade;c.lineWidth=2;c.beginPath();
    if(element==='ice'){c.moveTo(x,y-size*1.8);c.lineTo(x+size*0.7,y);c.lineTo(x,y+size);c.lineTo(x-size*0.7,y);c.closePath();c.stroke();}
    else if(element==='lightning'){c.moveTo(x-size,y-size*1.8);for(let i=0;i<6;i++)c.lineTo(x+(i%2?1:-1)*(size*0.6),y-size*1.5+i*size*0.6);c.stroke();}
    else if(element==='wind'){for(let i=0;i<3;i++){c.moveTo(x-size,y+i*5);c.quadraticCurveTo(x,y-size-i*5,x+size,y+i*5);}c.stroke();}
    else if(element==='fire'){for(let i=0;i<5;i++)this.glow(x+Math.sin(time*6+i+index)*size*0.6,y-i*size*0.6,size*0.3,color,fade*(1-i/6));}
    else if(element==='dark'){c.fillStyle='#101020';c.arc(x,y,size*0.55,0,Math.PI*2);c.fill();c.stroke();}
    else {c.arc(x,y,size*0.7,0,Math.PI*2);c.stroke();}
  }
}
