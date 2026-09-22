import { clamp } from '../../game/motion';
import { glow, type Frame } from './frame';

/** 言葉の色を積み、締め切りで中心へ集める。声の大きさは使わない。 */
export function drawVoiceGrowth(f:Frame) {
  const {c,beat,t,origin:o}=f;
  if(beat.voiceStart===null||t<beat.voiceStart||t>=beat.release)return;
  const layers=f.live.colorLayers??[];
  const grow=clamp((t-beat.voiceStart)/Math.max(.001,beat.inputEnd-beat.voiceStart));
  const gather=clamp((t-beat.inputEnd)/Math.max(.001,beat.lock-beat.inputEnd));
  const radius=Math.min(f.w,f.h)*(.075+grow*.035+Math.min(layers.length,6)*.007);
  if(beat.drawEnd===null) {
    c.strokeStyle=f.palette.main;c.lineWidth=1.5+grow;
    c.globalAlpha=.2+grow*.3;
    c.beginPath();c.ellipse(o.x,o.y,radius,radius*.7,0,0,Math.PI*2);c.stroke();
    glow(f,o.x,o.y,4+grow*7,.2+grow*.25);
  }
  layers.forEach((layer,i)=>{
    const pal=f.locked?f.palette:f.preset.palettes[layer.element];
    const angle=i*2.4+t*.35,reach=radius*(1-gather);
    const x=o.x+Math.cos(angle)*reach,y=o.y+Math.sin(angle)*reach*.7;
    glow(f,x,y,5+grow*3,layer.active?.75:.12,pal.main,pal.core);
  });
}
