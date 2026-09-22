import type { Motion, Point } from './types';
import { ROUNDS } from './rounds';
export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);

export class MotionRecorder {
  readonly raw: Point[] = [];
  readonly display: Point[] = [];
  private last = new Map<number, Point>();
  private stroke = 0;
  private first: Point | null = null;
  /** 一度でも最初の点から動いたか。毎コマ全点を集計せずに済むよう、点を足すときに覚える。 */
  hasMovement = false;
  /** 受け付ける時刻の範囲。回ごとに変わる（その回の start から inputEnd まで）。 */
  constructor(private from = ROUNDS[0].start, private to = ROUNDS[0].inputEnd) {}
  add(x: number, y: number, t: number, hand = 0) {
    if (![x, y, t].every(Number.isFinite) || t < this.from || t >= this.to) return false;
    const previous = this.last.get(hand);
    if (previous && t <= previous.t) return false;
    const broken = !previous || t-previous.t > 350 || distance({x,y}, previous) > 0.3;
    const point: Point = { x: clamp(x), y: clamp(y), t, hand, stroke: broken ? ++this.stroke : previous.stroke };
    // 保存する点は補正しない。表示だけ、ごく小さい揺れを抑える。
    this.raw.push(point);
    this.last.set(hand, point);
    if (!this.first) this.first = point;
    else if (!this.hasMovement && (Math.abs(point.x - this.first.x) > 0.001 || Math.abs(point.y - this.first.y) > 0.001)) this.hasMovement = true;
    const rendered = { ...point };
    if (!broken && previous && distance(point, previous) < 0.012) {
      rendered.x = point.x * 0.8 + previous.x * 0.2;
      rendered.y = point.y * 0.8 + previous.y * 0.2;
    }
    this.display.push(rendered);
    this.decimate(hand);
    return true;
  }
  break(hand: number) { this.last.delete(hand); }
  private decimate(hand: number) {
    const indices = this.display.flatMap((p,i) => p.hand === hand ? [i] : []);
    if (indices.length <= 256) return;
    // 全期間から一本ずつ間引く。筆の切れ目をまたいで接続しない。
    let smallest = Infinity, remove = -1;
    for (let j=1;j<indices.length-1;j++) {
      const i=indices[j], a=this.display[indices[j-1]], b=this.display[i], c=this.display[indices[j+1]];
      if (a.stroke!==b.stroke || b.stroke!==c.stroke) continue;
      const area=Math.abs((a.x-b.x)*(c.y-b.y)-(a.y-b.y)*(c.x-b.x));
      if (area<smallest) { smallest=area; remove=i; }
    }
    // 極端に欠測が多いときも256点の上限を守り、残った筆の番号は保つ。
    if (remove<0) remove=indices[1];
    this.display.splice(remove,1);
  }
}

export function summarizeMotion(points: Point[], voiceOnly=false): Motion {
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const width=points.length ? Math.max(...xs)-Math.min(...xs) : 0;
  const height=points.length ? Math.max(...ys)-Math.min(...ys) : 0;
  const strokes=new Map<number,Point[]>();
  for (const p of points) { const group=strokes.get(p.stroke)??[]; group.push(p); strokes.set(p.stroke,group); }
  let length=0, closedness=0, turns=0, turnCount=0;
  for(const stroke of strokes.values()) {
    let part=0;
    for(let i=1;i<stroke.length;i++) part+=distance(stroke[i-1],stroke[i]);
    length+=part;
    if(part>0.03) closedness=Math.max(closedness,clamp(1-distance(stroke[0],stroke.at(-1)!)/part));
    for(let i=2;i<stroke.length;i++) {
      const a=stroke[i-2],b=stroke[i-1],c=stroke[i];
      const denominator=distance(a,b)*distance(b,c);
      if(denominator>0.000001) { turns+=clamp(((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/denominator,-1,1);turnCount++; }
    }
  }
  const cx=points.length?(Math.max(...xs)+Math.min(...xs))/2:0.5;
  const cy=points.length?(Math.max(...ys)+Math.min(...ys))/2:0.5;
  const tail=points.slice(-Math.max(2,Math.floor(points.length/5)));
  const convergence=tail.length>1?clamp((distance(tail[0],{x:cx,y:cy})-distance(tail.at(-1)!,{x:cx,y:cy}))/Math.max(width,height,0.01)):0.5;
  return { version:'motion-1', coordinateSpace:'mirrored-normalized-screen', sampleCount:points.length, trackedHands:new Set(points.map(p=>p.hand)).size,
    durationMs:points.length ? points.at(-1)!.t-points[0].t : 0,
    coverageWidth:width,coverageHeight:height,pathLength:length,closedness,convergence,
    smoothness:turnCount?clamp((turns/turnCount+1)/2):0.5,
    hasMovement: width>0.001 || height>0.001,
    descriptions:{coverage:Math.max(width,height)>0.45?'広い':Math.max(width,height)>0.15?'中くらい':'小さい',outline:voiceOnly?'線なし':closedness>0.8?'囲う曲線':height<width*0.3?'横へ伸びる線':'自由な線',ending:convergence>0.65?'中心へ集めた':'線を描き足した'} };
}

export function getNodes(points: Point[], max=12): Point[] {
  if(!points.length)return [];
  const nodes:Point[]=[];
  const step=Math.max(1,Math.floor(points.length/max));
  for(let i=0;i<points.length && nodes.length<max;i+=step) {
    const p=points[i]; if(nodes.every(n=>distance(n,p)>0.03))nodes.push(p);
  }
  return nodes;
}
