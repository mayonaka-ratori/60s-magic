import { CompletedSpell } from './completed-spell';
import { spellPose } from './spell-layout';
import { Knight } from './knight';
import { MagicCanvas, colors } from './magic';
import { clamp } from '../game/motion';
import type { Point, Recipe } from '../game/types';
import { emptyLive, type LiveInput } from '../game/live-input';
import { Composite, compositeSettings, layerMotion } from './composite';

/** 層ひとつ分の変形。動く量（move）と常時の余白（pad）を掛けて作る。中心を軸にする。 */
export function layerTransform(screen:{shakeX:number;shakeY:number;rotate:number;zoom:number},move:number,pad:number) {
  const {x,y,rotate,scale}=layerMotion(screen,move,pad);
  if(!x&&!y&&Math.abs(rotate)<.01&&Math.abs(scale-1)<.001)return pad===1?'':`scale(${pad})`;
  return `translate(${x}px,${y}px) rotate(${rotate.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
}

/** 背景、本人の術式、放出を一つの時刻で更新する。本編の入力と通信には触れない。 */
export class CastScene {
  private spell:CompletedSpell;
  private lastKey='';
  private lastBuild=-Infinity;
  private revision=0;
  private knight:Knight;
  readonly ready:Promise<void>;
  private layers:HTMLElement[];
  /** 層ごとの揺れの大きさ。手前ほど大きく動かす。背景1、騎士1.3、術式1。 */
  private moves=[1,1.3,1];
  /** 層ごとの常時の余白（拡大）。端に黒帯が出ないように背景と騎士を1.03倍にしておく。 */
  private pads=[1.03,1.03,1];
  private lastTransforms=['','',''];
  /** 合成用のBabylonシーン。作れなかったときは null で、今まで通りのHTMLの層のまま遊べる。 */
  readonly composite:Composite|null;
  private calm=false;
  /** 前のコマで合成が描いていたか。変わった時だけ演出canvasへ伝える。 */
  private lastCompositeDrawing=false;
  constructor(private canvas:HTMLCanvasElement,private backdrop:HTMLImageElement,private effects:MagicCanvas,knightCanvas:HTMLCanvasElement,compositeCanvas?:HTMLCanvasElement|null) {
    this.layers=[backdrop,knightCanvas,canvas];
    this.spell=new CompletedSpell(canvas,false);
    this.knight=new Knight(knightCanvas);
    this.composite=compositeCanvas?Composite.create(compositeCanvas,{world:backdrop,knight:knightCanvas,spell:canvas,magic:effects.canvas},compositeSettings(location.search)):null;
    this.ready=Promise.all([backdrop.decode(),this.spell.ready(),this.knight.ready]).then(()=>{});
  }
  resize(){this.spell.resize();this.knight.resize();this.composite?.resize();this.revision++;}
  get impactTarget(){return this.knight.target;}
  /** 控えめモード。揺れと閃光と停止を抑える。騎士の白飛びも消し、合成では色収差と歪みも切る。 */
  setCalm(calm:boolean){this.calm=calm;this.effects.setCalm(calm);this.knight.setCalm(calm);}
  /** 今の演出の時刻（ms）。命中の停止を含む。 */
  get effectMs(){return this.effects.effectMs;}
  render(points:Point[],ms:number,recipe:Recipe|null,voice:number,cursors:Array<{x:number;y:number}>,ready:boolean,live:LiveInput=emptyLive) {
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    // 世界の時計は一つ。命中の停止は騎士と術式にも効く。
    const worldMs=ready?ms:this.effects.effectMsOf(ms,recipe,live.amount);
    // 入力の量を騎士へも渡す。同じ魔法でも、たくさん描いて唱えたほど大きく崩れる。
    this.knight.render(worldMs,!ready,recipe,live.amount);
    const complete=ms>=14000&&!ready;
    const shape=ready?[]:points.length?points:complete?[{x:.5,y:.66,t:0,hand:0,stroke:0}]:[];
    const key=`${this.revision}:${ready}:${complete}:${shape.length}:${shape.at(-1)?.t}:${shape.at(-1)?.x}:${shape.at(-1)?.y}`;
    // 毎フレーム管を作り直さず、入力が変わった時だけ更新。完成後は位置と光だけを変える。
    if(key!==this.lastKey&&(complete||ready||performance.now()-this.lastBuild>=25)) {
      this.spell.setShape(shape,complete);this.lastKey=key;this.lastBuild=performance.now();
    }
    const pose=spellPose(shape,width,height,worldMs),color=recipe?colors[recipe.element]:colors.neutral;
    const charge=clamp((ms-14000)/3000);
    const glow=.45+clamp(ms/14000)*.25+charge*.55+voice*.45;
    this.spell.setGlow(glow);
    this.spell.present(pose.scale,pose.dx,pose.dy,ready?0:pose.opacity,color,pose.progress);
    this.spell.render();
    const displayed=shape.map(p=>({...p,x:((p.x-.5)*width*pose.scale+pose.dx+width/2)/width,y:((p.y-.5)*height*pose.scale+pose.dy+height/2)/height}));
    this.effects.renderEffects(displayed,ms,recipe,voice,cursors,ready,this.impactTarget,pose.center,live);
    // 画面の揺れ、傾き、寄りを三つの層に当てる。手前ほど大きく動かす。変わった時だけ書き換える。
    const screen=this.effects.screen;
    for(let i=0;i<this.layers.length;i++){
      const transform=layerTransform(screen,this.moves[i],this.pads[i]);
      if(transform!==this.lastTransforms[i]){this.layers[i].style.transform=transform;this.lastTransforms[i]=transform;}
    }
    this.canvas.dataset.phase=ready?'ready':ms<14000?'input':ms<17000?'complete':ms<23000?'release':'finished';
    this.canvas.dataset.scale=pose.scale.toFixed(4);
    this.canvas.dataset.visible=String(!ready&&pose.opacity>0);
    this.backdrop.classList.toggle('spell-finished',!ready&&ms>=23500);
    // 遊んでいる間だけ合成を使う。終わりのぼかしに入ったらHTMLの層へ戻す。
    if(this.composite){
      this.composite.setActive(!ready&&ms<23500);
      this.composite.render({screen,t:worldMs/1000,target:this.impactTarget,calm:this.calm});
    }
    // 合成が実際に描いている間は、演出canvas内の色ずれを飛ばす（後処理の色収差と二重にかからないように）。
    const drawing=!!this.composite&&!this.composite.gaveUp&&this.composite.on;
    if(drawing!==this.lastCompositeDrawing){this.effects.setCompositeActive(drawing);this.lastCompositeDrawing=drawing;}
  }
  dispose(){this.composite?.dispose();this.spell.dispose();this.knight.dispose();}
}
