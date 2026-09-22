import { CastSession } from './session';
import { getNodes } from './motion';
import { AIM, type XY } from './guard';
import { BATTLE_END, ROUNDS, phaseAt, roundAt } from './rounds';
import type { Phase, Point } from './types';

/**
 * 90秒の進行役。回ごとの仕組み（CastSession）を並べ、今どの回かを決めるだけ。
 * 時刻はすべて戦いの開始からのms。一回目（0〜30秒）、防御（30〜56秒）、とどめ（56〜90秒）の三回。
 */
export class Battle {
  readonly id:string;
  readonly startMs:number;
  readonly casts:CastSession[];
  elapsed=0;
  cancelled=false;
  /** 前の回から引き継ぐ光点。一回目の分を29秒、防御の分を55秒で決め、あとの回の間ずっと薄く残す。 */
  inherited:Point[]=[];
  /** 光点をもう受け取った回の名前。同じ回から二度取らないための覚え書き。魔法の引き継ぎとは別に数える。 */
  private handedOff=new Set<string>();
  constructor(private clock:()=>number=()=>performance.now(), id:string=crypto.randomUUID()) {
    this.id=id;this.startMs=clock();
    this.casts=ROUNDS.map(round=>new CastSession(clock,id,round,this.startMs));
  }
  // 回の判定はそのときの時計で見る。1コマ前の値で見ると、30秒ちょうどの一瞬だけ
  // 前の回のまま（受付は閉じている）になり、描き始めの点を落とす。
  get round() {return roundAt(this.cancelled?this.elapsed:Math.max(0,this.clock()-this.startMs));}
  get active() {return this.casts[this.round.index-1];}
  get first() {return this.casts[0];}
  get defend() {return this.casts[1];}
  get finish() {return this.casts[2];}
  get phase():Phase {return this.cancelled?'cancelled':phaseAt(this.elapsed,this.round);}
  get acceptingDrawing() {return !this.cancelled&&this.active.acceptingDrawing;}
  get acceptingVoice() {return !this.cancelled&&this.active.acceptingVoice;}
  get accepting() {return !this.cancelled&&this.active.accepting;}
  get finished() {return this.elapsed>=BATTLE_END;}
  /** 狙いの印。防御の回の間だけ出す。 */
  get aim():XY {return AIM;}
  /** 画面の横と縦の比。盾の判定を、実際に見えている輪と同じ形にする。画面側が大きさを知らせる。 */
  get aspect() {return this.casts[0].aspect;}
  setAspect(aspect:number) {
    if(!Number.isFinite(aspect)||aspect<=0)return;
    for(const cast of this.casts)cast.aspect=aspect;
  }
  tick() {
    if(this.cancelled)return;
    this.elapsed=Math.max(0,this.clock()-this.startMs);
    for(const cast of this.casts)cast.tick();
    // 前の回の形と魔法を次の回へ渡す。20〜30%だけ残す決まりなので、一回につき光点は3つまで（合計6つまで）。
    this.handOff(0,this.first,this.defend);
    this.handOff(1,this.defend,this.finish);
  }
  /**
   * ひとつの回が終わる時刻に、その回の光点と魔法を次の回へ渡す。
   * 光点と魔法は別々に覚える。光点だけ先に渡して覚え書きを立ててしまうと、
   * あとから魔法（summary）が出来上がっても二度と渡せなくなるため。
   */
  private handOff(index:number,from:CastSession,to:CastSession) {
    const round=ROUNDS[index];
    if(this.elapsed<round.handoff)return;
    if(from.motion.display.length&&!this.handedOff.has(round.id)) {
      this.handedOff.add(round.id);
      this.inherited=[...this.inherited,...getNodes(from.motion.display,3)];
    }
    if(!to.previous&&from.summary)to.previous=from.summary;
  }
  cancel() {this.cancelled=true;for(const cast of this.casts)cast.cancel();}
  report() {
    return {sessionId:this.id,scope:'full-90-seconds',rounds:this.casts.map(cast=>cast.report()),
      cancelled:this.cancelled,inheritedNodes:this.inherited.length};
  }
}
