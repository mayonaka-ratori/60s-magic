import { CastSession } from './session';
import { getNodes } from './motion';
import { AIM, type XY } from './guard';
import { BATTLE_END, ROUNDS, phaseAt, roundAt } from './rounds';
import type { Phase, Point } from './types';

/**
 * 60秒の進行役。回ごとの仕組み（CastSession）を並べ、今どの回かを決めるだけ。
 * 時刻はすべて戦いの開始からのms。今は一回目（0〜24秒）と防御（24〜40秒）の二回。
 */
export class Battle {
  readonly id:string;
  readonly startMs:number;
  readonly casts:CastSession[];
  elapsed=0;
  cancelled=false;
  /** 一回目から引き継ぐ光点。23秒で決め、防御の回の間ずっと薄く残す。 */
  inherited:Point[]=[];
  constructor(private clock:()=>number=()=>performance.now(), id:string=crypto.randomUUID()) {
    this.id=id;this.startMs=clock();
    this.casts=ROUNDS.map(round=>new CastSession(clock,id,round,this.startMs));
  }
  // 回の判定はそのときの時計で見る。1コマ前の値で見ると、24秒ちょうどの一瞬だけ
  // 前の回のまま（受付は閉じている）になり、描き始めの点を落とす。
  get round() {return roundAt(this.cancelled?this.elapsed:Math.max(0,this.clock()-this.startMs));}
  get active() {return this.casts[this.round.index-1];}
  get first() {return this.casts[0];}
  get defend() {return this.casts[1];}
  get phase():Phase {return this.cancelled?'cancelled':phaseAt(this.elapsed,this.round);}
  get accepting() {return !this.cancelled&&this.active.accepting;}
  get finished() {return this.elapsed>=BATTLE_END;}
  /** 狙いの印。防御の回の間だけ出す。 */
  get aim():XY {return AIM;}
  tick() {
    if(this.cancelled)return;
    this.elapsed=Math.max(0,this.clock()-this.startMs);
    for(const cast of this.casts)cast.tick();
    // 一回目の形と魔法を防御の回へ渡す。20〜30%だけ残す決まりなので光点は3つまで。
    if(this.elapsed>=ROUNDS[0].handoff&&!this.inherited.length&&this.first.motion.display.length)this.inherited=getNodes(this.first.motion.display,3);
    if(this.elapsed>=ROUNDS[0].handoff&&!this.defend.previous)this.defend.previous=this.first.summary;
  }
  cancel() {this.cancelled=true;for(const cast of this.casts)cast.cancel();}
  report() {
    return {sessionId:this.id,scope:'first-40-seconds',rounds:this.casts.map(cast=>cast.report()),
      cancelled:this.cancelled,inheritedNodes:this.inherited.length};
  }
}
