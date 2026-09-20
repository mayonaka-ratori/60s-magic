import { CompletedSpell } from './completed-spell';
import { spellPose } from './spell-layout';
import { Knight } from './knight';
import { MagicCanvas, colors } from './magic';
import { clamp } from '../game/motion';
import type { Point, Recipe } from '../game/types';

/** 背景、本人の術式、放出を一つの時刻で更新する。本編の入力と通信には触れない。 */
export class CastScene {
  private spell:CompletedSpell;
  private lastKey='';
  private lastBuild=-Infinity;
  private revision=0;
  private knight:Knight;
  readonly ready:Promise<void>;
  private layers:HTMLElement[];
  private lastShake='';
  constructor(private canvas:HTMLCanvasElement,private backdrop:HTMLImageElement,private effects:MagicCanvas,knightCanvas:HTMLCanvasElement) {
    this.layers=[backdrop,knightCanvas,canvas];
    this.spell=new CompletedSpell(canvas,false);
    this.knight=new Knight(knightCanvas);
    this.ready=Promise.all([backdrop.decode(),this.spell.ready(),this.knight.ready]).then(()=>{});
  }
  resize(){this.spell.resize();this.knight.resize();this.revision++;}
  get impactTarget(){return this.knight.target;}
  render(points:Point[],ms:number,recipe:Recipe|null,voice:number,cursors:Array<{x:number;y:number}>,ready:boolean) {
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    this.knight.render(ms,!ready,recipe);
    const complete=ms>=14000&&!ready;
    const shape=ready?[]:points.length?points:complete?[{x:.5,y:.66,t:0,hand:0,stroke:0}]:[];
    const key=`${this.revision}:${ready}:${complete}:${shape.length}:${shape.at(-1)?.t}:${shape.at(-1)?.x}:${shape.at(-1)?.y}`;
    // 毎フレーム管を作り直さず、入力が変わった時だけ更新。完成後は位置と光だけを変える。
    if(key!==this.lastKey&&(complete||ready||performance.now()-this.lastBuild>=25)) {
      this.spell.setShape(shape,complete);this.lastKey=key;this.lastBuild=performance.now();
    }
    const pose=spellPose(shape,width,height,ms),color=recipe?colors[recipe.element]:colors.neutral;
    const charge=clamp((ms-14000)/3000);
    const glow=.45+clamp(ms/14000)*.25+charge*.55+voice*.45;
    this.spell.setGlow(glow);
    this.spell.present(pose.scale,pose.dx,pose.dy,ready?0:pose.opacity,color,pose.progress);
    this.spell.render();
    const displayed=shape.map(p=>({...p,x:((p.x-.5)*width*pose.scale+pose.dx+width/2)/width,y:((p.y-.5)*height*pose.scale+pose.dy+height/2)/height}));
    this.effects.renderEffects(displayed,ms,recipe,voice,cursors,ready,this.impactTarget,pose.center);
    // 画面の揺れは、背景と騎士と術式の層をまとめて動かす。変わった時だけ書き換える。
    const shake=this.effects.screen,transform=shake.shakeX||shake.shakeY?`translate(${shake.shakeX}px,${shake.shakeY}px)`:'';
    if(transform!==this.lastShake){for(const layer of this.layers)layer.style.transform=transform;this.lastShake=transform;}
    this.canvas.dataset.phase=ready?'ready':ms<14000?'input':ms<17000?'complete':ms<23000?'release':'finished';
    this.canvas.dataset.scale=pose.scale.toFixed(4);
    this.canvas.dataset.visible=String(!ready&&pose.opacity>0);
    this.backdrop.classList.toggle('spell-finished',!ready&&ms>=23500);
  }
  dispose(){this.spell.dispose();}
}
