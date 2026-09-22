import type { InheritedNode } from '../game/voice-growth';
import { ANNOUNCEMENT_MS } from '../game/rounds';
import { VOICE_ORIGIN } from '../game/voice-growth';
import { CompletedSpell } from './completed-spell';
import { spellPose } from './spell-layout';
import { Knight } from './knight';
import { MagicCanvas, colors } from './magic';
import { clamp } from '../game/motion';
import type { Point, Recipe } from '../game/types';
import { emptyLive, type LiveInput } from '../game/live-input';
import { Composite, compositeSettings, layerMotion } from './composite';
import { BATTLE_END, beatAt, type Beat } from '../game/rounds';
import type { GuardPlan, XY } from '../game/guard';

/** 演出が消え終わって元の画面へ戻る時刻（ミリ秒）。今できている最後の回の終わりの0.5秒前。 */
const FADE_OUT_MS = BATTLE_END - 500;

/** 層ひとつ分の変形。動く量（move）と常時の余白（pad）を掛けて作る。中心を軸にする。 */
export function layerTransform(screen:{shakeX:number;shakeY:number;rotate:number;zoom:number},move:number,pad:number) {
  const {x,y,rotate,scale}=layerMotion(screen,move,pad);
  // 揺れていないときは書かない（余白のぶんの拡大だけ残す）。
  if(!x&&!y&&Math.abs(rotate)<.01&&Math.abs(scale-pad)<.001)return pad===1?'':`scale(${pad})`;
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
  /** 最後に描いた時刻（ms）。命中の停止を含む。体力表示もこれを見る。 */
  private worldMs=0;
  constructor(private canvas:HTMLCanvasElement,private backdrop:HTMLImageElement,private effects:MagicCanvas,knightCanvas:HTMLCanvasElement,compositeCanvas?:HTMLCanvasElement|null) {
    this.layers=[backdrop,knightCanvas,canvas];
    this.spell=new CompletedSpell(canvas,false);
    this.knight=new Knight(knightCanvas);
    this.knight.setPreset(effects.preset);
    this.composite=compositeCanvas?Composite.create(compositeCanvas,{world:backdrop,knight:knightCanvas,spell:canvas,magic:effects.canvas},compositeSettings(location.search)):null;
    this.ready=Promise.all([backdrop.decode(),this.spell.ready(),this.knight.ready]).then(()=>{});
  }
  resize(){this.spell.resize();this.knight.resize();this.composite?.resize();this.revision++;}
  /** 遊びを始めるたびに呼ぶ。合成の速さの測りと「諦めた」印を戻す。 */
  resetForPlay(){this.composite?.resetForPlay();}
  get impactTarget(){return this.knight.target;}
  /** 控えめモード。揺れと閃光と停止を抑える。騎士の白飛びも消し、合成では色収差と歪みも切る。 */
  setCalm(calm:boolean){this.calm=calm;this.effects.setCalm(calm);this.knight.setCalm(calm);}
  /** 今の演出の時刻（ms）。命中の停止を含む。render で更新するので、読むのは render の後。 */
  get effectMs(){return this.worldMs;}
  render(points:Point[],ms:number,recipe:Recipe|null,voice:number,cursors:Array<{x:number;y:number}>,ready:boolean,live:LiveInput=emptyLive,guard:GuardPlan|null=null,inherited:InheritedNode[]=[]) {
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
    const beat:Beat=beatAt(ms/1000);
    // 世界の時計は一つ。命中の停止は騎士と術式にも効く。体力表示も effectMs でこれを見る。
    const worldMs=ready?ms:this.effects.effectMsOf(ms,recipe,live.amount,beat);
    this.worldMs=worldMs;
    // 見た目の設定（控えめ・派手・最大）は演出canvasと同じものを騎士にも使う。
    this.knight.setPreset(this.effects.preset);
    // 入力の量を騎士へも渡す。同じ魔法でも、たくさん描いて唱えたほど大きく崩れる。
    // 防御の回の姿勢は、止め方（受け止め・弾き返し・かき消し）で変わる。
    this.knight.render(worldMs,!ready,recipe,live.amount,undefined,guard?.style??null);
    const drawEnd=beat.drawEnd??beat.inputEnd;
    const complete=ms>=drawEnd*1000&&!ready;
    const shape=ready?[]:points.length?points:complete?[{...VOICE_ORIGIN,t:0,hand:0,stroke:0}]:[];
    const key=`${this.revision}:${ready}:${complete}:${shape.length}:${shape.at(-1)?.t}:${shape.at(-1)?.x}:${shape.at(-1)?.y}`;
    // 毎フレーム管を作り直さず、入力が変わった時だけ更新。完成後は位置と光だけを変える。
    if(key!==this.lastKey&&(complete||ready||performance.now()-this.lastBuild>=25)) {
      this.spell.setShape(shape,complete);this.lastKey=key;this.lastBuild=performance.now();
    }
    const pose=spellPose(shape,width,height,worldMs,beat),color=recipe?colors[recipe.element]:colors.neutral;
    const charge=clamp((ms-beat.inputEnd*1000)/((beat.release-beat.inputEnd)*1000));
    const switchGlow=drawEnd<beat.inputEnd&&ms>=drawEnd*1000?Math.max(0,1-(ms-drawEnd*1000)/ANNOUNCEMENT_MS)*.8:0;
    const glow=switchGlow+.45+clamp((ms-beat.start*1000)/((beat.inputEnd-beat.start)*1000))*.25+charge*.55+voice*.45;
    this.spell.setGlow(glow);
    this.spell.present(pose.scale,pose.dx,pose.dy,ready?0:pose.opacity,color,pose.progress);
    this.spell.render();
    const displayed=shape.map(p=>({...p,x:((p.x-.5)*width*pose.scale+pose.dx+width/2)/width,y:((p.y-.5)*height*pose.scale+pose.dy+height/2)/height}));
    this.effects.renderEffects({points:displayed,ms,recipe,voice,cursors,ready,target:this.impactTarget,origin:pose.center,live,beat,guard,inherited});
    // 画面の揺れ、傾き、寄りを三つの層に当てる。手前ほど大きく動かす。変わった時だけ書き換える。
    const screen=this.effects.screen;
    for(let i=0;i<this.layers.length;i++){
      const transform=layerTransform(screen,this.moves[i],this.pads[i]);
      if(transform!==this.lastTransforms[i]){this.layers[i].style.transform=transform;this.lastTransforms[i]=transform;}
    }
    this.canvas.dataset.phase=ready?'ready':ms<beat.inputEnd*1000?'input':ms<beat.release*1000?'complete':ms<beat.handoff*1000?'release':'finished';
    this.canvas.dataset.scale=pose.scale.toFixed(4);
    this.canvas.dataset.visible=String(!ready&&pose.opacity>0);
    this.backdrop.classList.toggle('spell-finished',!ready&&ms>=FADE_OUT_MS);
    // 遊んでいる間だけ合成を使う。終わりのぼかしに入ったらHTMLの層へ戻す。
    if(this.composite){
      this.composite.setActive(!ready&&ms<FADE_OUT_MS);
      this.composite.render({screen,t:worldMs/1000,target:this.impactTarget,calm:this.calm,beat});
    }
    // 合成が実際に描いている間は、演出canvas内の色ずれを飛ばす（後処理の色収差と二重にかからないように）。
    const drawing=!!this.composite&&!this.composite.gaveUp&&this.composite.on;
    if(drawing!==this.lastCompositeDrawing){this.effects.setCompositeActive(drawing);this.lastCompositeDrawing=drawing;}
  }
  dispose(){this.composite?.dispose();this.spell.dispose();this.knight.dispose();}
}
