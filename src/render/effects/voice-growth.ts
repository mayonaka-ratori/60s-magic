import { clamp } from '../../game/motion';
import { voiceRadius, type VoiceLayer } from '../../game/voice-growth';
import { glow, type Frame } from './frame';

/** 形の部品。言葉の意味が同じなら、呼び方が違っても同じ形になる。 */
function shape(f:Frame,layer:VoiceLayer,size:number) {
  const c=f.c;
  c.beginPath();
  if(layer.purpose==='bind') {
    for(let i=-1;i<=1;i++){c.moveTo(-size,i*size/2);c.lineTo(size,i*size/2);c.moveTo(i*size/2,-size);c.lineTo(i*size/2,size);}
  } else if(layer.form==='wall') {
    c.rect(-size,-size*.65,size*2,size*1.3);c.fill();
  } else if(layer.form==='wave') {
    for(let i=-1;i<=1;i++){c.moveTo(-size,i*5);c.quadraticCurveTo(0,-size+i*5,size,i*5);}
  } else if(layer.form==='beam'||(!layer.form&&layer.purpose==='attack')) {
    c.moveTo(-size,0);c.lineTo(size,0);c.moveTo(size-5,-4);c.lineTo(size,0);c.lineTo(size-5,4);
  } else c.ellipse(0,0,size,size*(layer.form==='dome'?.6:1),0,0,Math.PI*2);
  c.stroke();
}

/** 色・形・動き・指示を残し、確定で集め、発動で決まった魔法の形にして放つ。 */
export function drawVoiceGrowth(f:Frame) {
  const {c,beat,t,origin:o}=f;
  if(beat.voiceStart===null||t<beat.voiceStart||t>=beat.release+.5)return;
  const layers=f.live.voiceLayers??[];
  if(t>=beat.release&&!layers.length)return;
  const active=layers.filter(layer=>layer.active);
  const grow=clamp((t-beat.voiceStart)/Math.max(.001,beat.inputEnd-beat.voiceStart));
  const gather=clamp((t-beat.inputEnd)/Math.max(.001,beat.lock-beat.inputEnd));
  const released=t>=beat.release,travel=clamp((t-beat.release)/.5);
  const radius=Math.min(f.w,f.h)*voiceRadius(grow,active.length);
  const invocation=active.filter(layer=>layer.kind==='invocation');
  const bright=1+Math.min(invocation.length,4)*.1;
  // 控えめ表示では回転や速い移動を止め、色と形だけ残す。
  const clock=f.calm?0:t;
  const spiral=active.some(layer=>layer.text==='螺旋');
  const homing=active.some(layer=>/追尾|追え/.test(layer.text));
  const split=active.some(layer=>layer.text==='分裂'||layer.form==='swarm');
  const count=Math.min(12,active.find(layer=>layer.count!==null)?.count??(split?3:1));
  const attack=active.some(layer=>layer.purpose==='attack');
  const protect=active.some(layer=>layer.purpose==='defend'||layer.purpose==='bind');
  const speed=protect?.2:attack?1.2:.35;
  const targetAngle=Math.atan2(f.target.y-o.y,f.target.x-o.x);
  if(beat.drawEnd===null&&!released) {
    c.strokeStyle=f.palette.main;c.lineWidth=1.5+grow;
    c.globalAlpha=(.2+grow*.3)*bright;
    c.beginPath();c.ellipse(o.x,o.y,radius,radius*.7,0,0,Math.PI*2);c.stroke();
    glow(f,o.x,o.y,4+grow*7,(.2+grow*.25)*bright);
  }
  for(const layer of invocation) {
    const age=t-layer.atMs/1000;
    if(age<0||age>=1.5||released)continue;
    c.globalAlpha=(1-age/1.5)*(f.calm?.12:.3);c.strokeStyle=f.palette.core;c.lineWidth=2;
    c.beginPath();c.ellipse(o.x,o.y,radius*(1+age*.2),radius*.7*(1+age*.2),0,0,Math.PI*2);c.stroke();
  }
  layers.forEach((layer,i)=>{
    const pal=f.locked?f.palette:f.preset.palettes[layer.element??active.find(p=>p.element)?.element??'neutral'];
    const alpha=(layer.active?.65:.09)*bright*(released?1-travel:1);
    const copies=layer.kind==='count'||layer.form==='swarm'||layer.text==='分裂'?count:1;
    for(let j=0;j<copies;j++) {
      const angle=i*2.4+j/copies*Math.PI*2+clock*speed*(spiral?2:1);
      const reach=radius*(1-gather);
      const x=o.x+Math.cos(angle)*reach+(released?(f.target.x-o.x)*travel*.3:0);
      const y=o.y+Math.sin(angle)*reach*.7+(released?(f.target.y-o.y)*travel*.3:0);
      const size=(protect?13:9)*(released?1+travel*2:1);
      c.save();c.translate(x,y);c.rotate(homing||attack||released?targetAngle:clock*(spiral?.8:0));
      c.globalAlpha=alpha;c.strokeStyle=pal.main;c.fillStyle=pal.main+'20';c.lineWidth=protect?3:1.5;
      if(released)shape(f,{...layer,form:f.recipe.form,purpose:f.recipe.purpose},size);
      else if(layer.form||layer.purpose)shape(f,layer,size);
      else if(layer.element==='ice') {
        c.beginPath();c.moveTo(0,-size);c.lineTo(size*.6,0);c.lineTo(0,size);c.lineTo(-size*.6,0);c.closePath();c.stroke();
      } else if(layer.element==='lightning') {
        c.beginPath();c.moveTo(-size,-size*.4);c.lineTo(0,0);c.lineTo(-size*.2,size*.5);c.lineTo(size,size);c.moveTo(0,0);c.lineTo(size*.7,-size*.6);c.stroke();
      } else if(layer.element==='wind'||layer.text==='螺旋') {
        c.beginPath();c.ellipse(0,0,size*1.4,size*.5,0,.3,Math.PI*1.7);c.stroke();
      } else if(layer.element==='dark') {
        c.globalAlpha=alpha*.4;c.beginPath();c.ellipse(0,0,size*1.5,size,0,0,Math.PI*2);c.fill();
      } else if(layer.element==='fire') {
        for(let k=0;k<3;k++){const u=(clock*.5+k/3)%1;glow(f,k*4-4,-u*size*2,3,alpha*(1-u),pal.main,pal.core);}
      } else glow(f,0,0,5+grow*3,alpha,pal.main,pal.core);
      c.restore();
    }
  });
}
