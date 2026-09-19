import { clamp, getNodes } from '../game/motion';
import type { Point, Recipe, Element } from '../game/types';

export const colors:Record<Element,string>={fire:'#ffa05e',ice:'#8cddff',lightning:'#c5b4ff',wind:'#8cf0cf',light:'#ffeac0',dark:'#b792e6',neutral:'#b5e6f1'};
const ease=(x:number)=>1-Math.pow(1-clamp(x),3);
export class MagicCanvas {
  private ctx:CanvasRenderingContext2D;
  private width=0;private height=0;
  constructor(readonly canvas:HTMLCanvasElement){this.ctx=canvas.getContext('2d')!;this.resize();}
  resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.5);this.width=rect.width;this.height=rect.height;this.canvas.width=rect.width*dpr;this.canvas.height=rect.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  render(points:Point[],ms:number,recipe:Recipe|null,voice:number,cursors:Array<{x:number;y:number}>,ready=false,target={x:0.5,y:0.48}) {
    const c=this.ctx,w=this.width,h=this.height,t=ms/1000;
    c.clearRect(0,0,w,h);c.lineCap='round';c.lineJoin='round';
    for(let i=0;i<42;i++) {
      const x=((i*137.13)%w+Math.sin(t*0.09+i)*15+w)%w;
      const y=((i*79.9)%h-t*(2+i%3)+h*20)%h;
      c.fillStyle=`rgba(171,206,220,${0.07+Math.sin(i+t)*0.045})`;c.beginPath();c.arc(x,y,i%3===0?1.4:0.7,0,Math.PI*2);c.fill();
    }
    if(ready)return;
    let shape=points;
    if(!points.length&&t>=14)shape=[{x:0.5,y:0.6,t:0,hand:0,stroke:0}];
    const center=shape.length?{x:shape.reduce((n,p)=>n+p.x,0)/shape.length,y:shape.reduce((n,p)=>n+p.y,0)/shape.length}:{x:0.5,y:0.6};
    const range=shape.length?Math.max(Math.max(...shape.map(p=>p.x))-Math.min(...shape.map(p=>p.x)),Math.max(...shape.map(p=>p.y))-Math.min(...shape.map(p=>p.y))):0;
    const complete=ease((t-14)/3),scale=1+(clamp(0.45/Math.max(range,0.04),1,2.2)-1)*complete;
    const shift={x:(0.5-center.x)*complete,y:(0.57-center.y)*complete};
    const position=(p:{x:number;y:number})=>({x:((p.x-center.x)*scale+center.x+shift.x)*w,y:((p.y-center.y)*scale+center.y+shift.y)*h});
    const origin=position(center);
    const color=recipe?colors[recipe.element]:colors.neutral;
    const charge=clamp(t/14)*0.6+clamp((t-14)/3)*0.4;
    const residue=t>=17?0.34+0.3*(1-clamp((t-17)/6)):1;
    const strokes=new Map<number,Point[]>();
    for(const p of shape){const list=strokes.get(p.stroke)??[];list.push(p);strokes.set(p.stroke,list);}
    c.save();c.globalCompositeOperation='lighter';
    for(const pass of [0,1]) {
      c.strokeStyle=color;c.globalAlpha=(pass===0?0.15+charge*0.14:0.68+charge*0.26)*residue;
      c.lineWidth=pass===0?8+charge*6:1.8+charge*1.5;
      c.shadowColor=color;c.shadowBlur=pass===0?22+charge*13:6;
      for(const stroke of strokes.values()) {
        c.beginPath();stroke.forEach((p,i)=>{const q=position(p);if(i===0)c.moveTo(q.x,q.y);else c.lineTo(q.x,q.y);});c.stroke();
        if(stroke.length===1){const q=position(stroke[0]);this.glow(q.x,q.y,3,color,0.8);}
      }
    }
    c.shadowBlur=0;
    const nodes=getNodes(shape);
    if(t>=6) {
      c.lineWidth=1;c.strokeStyle=color;c.globalAlpha=0.18*residue;
      let connections=0;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
        if(connections>=18)break;
        const distance=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y);
        if(distance>0.04&&distance<0.15){const a=position(nodes[i]),b=position(nodes[j]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();connections++;}
      }
      nodes.forEach((p,i)=>{const q=position(p),pulse=(Math.sin(t*3+i)+1)/2;this.glow(q.x,q.y,2+charge*2+voice*2,color,(0.5+pulse*0.5)*residue);});
    }
    // 光は本人の線をたどる。既成の円への置き換えはしない。
    if(shape.length>1&&t>=6)for(let i=0;i<Math.min(14,shape.length);i++) {
      const index=Math.floor(((t*(0.12+charge*0.15)+i/14)%1)*shape.length),q=position(shape[index]);
      this.glow(q.x,q.y,1.4+charge*1.2,color,0.7*residue);
    }
    if(t>=14&&t<17) {
      const radius=14+complete*28+Math.sin(t*8)*2;
      this.glow(origin.x,origin.y,radius,color,0.2+complete*0.25);
      for(let i=0;i<nodes.length;i++){const q=position(nodes[i]),p=(t*0.7+i/nodes.length)%1;this.glow(q.x+(origin.x-q.x)*p,q.y+(origin.y-q.y)*p,2,color,p*0.7);}
    }
    if(t<14)for(const p of cursors){const q={x:p.x*w,y:p.y*h};this.glow(q.x,q.y,5+voice*2,color,1);c.globalAlpha=0.4;c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.arc(q.x,q.y,13+voice*5,0,Math.PI*2);c.stroke();}
    c.restore();
    if(t>=17&&recipe)this.release(origin,{x:w*target.x,y:h*target.y},t-17,recipe);
    if(t>=11&&t<14){const p=(14-t)/3;c.strokeStyle=color;c.globalAlpha=0.6;c.lineWidth=2;c.beginPath();c.moveTo(w*0.5-w*0.28*p,h-8);c.lineTo(w*0.5+w*0.28*p,h-8);c.stroke();c.globalAlpha=1;}
  }
  private glow(x:number,y:number,r:number,color:string,alpha:number) {
    const c=this.ctx;c.save();c.globalAlpha=clamp(alpha);const gradient=c.createRadialGradient(x,y,0,x,y,r*4);gradient.addColorStop(0,'#fff8e9');gradient.addColorStop(0.18,color);gradient.addColorStop(1,color+'00');c.fillStyle=gradient;c.beginPath();c.arc(x,y,r*4,0,Math.PI*2);c.fill();c.restore();
  }
  private release(origin:{x:number;y:number},target:{x:number;y:number},time:number,r:Recipe) {
    if(time>7)return;
    const c=this.ctx,color=colors[r.element],arrival=1.5,travel=clamp(time/arrival),fade=1-clamp((time-3.2-r.duration)/2.8);
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
