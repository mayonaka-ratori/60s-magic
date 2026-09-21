import { describe, expect, it } from 'vitest';
import { fitSpell, completedSpellFrame, spellPose, spellBounds, backdropTarget, smoothStroke, SPELL_BOUNDS, SPELL_MIN } from '../src/render/spell-layout';
import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { ROUNDS } from '../src/game/rounds';
const first=ROUNDS[0];
import type { Point } from '../src/game/types';

/** 正規化した四角の中に、二筆の線を置く。x0〜x1、y0〜y1 の範囲いっぱいに広がる。 */
const shapeIn = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0, t: 0, hand: 0, stroke: 1 }, { x: x1, y: y0 + (y1 - y0) * .5, t: 10, hand: 0, stroke: 1 },
  { x: x0 + (x1 - x0) * .5, y: y1, t: 20, hand: 0, stroke: 2 }, { x: x0 + (x1 - x0) * .2, y: y0 + (y1 - y0) * .8, t: 30, hand: 0, stroke: 2 },
];
/** 発動の時刻の表示位置（正規化）。cast-scene.ts と同じ式で点を動かす。 */
const shownAt = (points: readonly Point[], w: number, h: number, ms: number, beat = BEATS[0]) => {
  const pose = spellPose(points, w, h, ms, beat);
  return points.map(p => ({ x: ((p.x - .5) * w * pose.scale + pose.dx + w / 2) / w, y: ((p.y - .5) * h * pose.scale + pose.dy + h / 2) / h }));
};
const widthOf = (shown: Array<{ x: number; y: number }>) => Math.max(...shown.map(p => p.x)) - Math.min(...shown.map(p => p.x));
const heightOf = (shown: Array<{ x: number; y: number }>) => Math.max(...shown.map(p => p.y)) - Math.min(...shown.map(p => p.y));
const RELEASE_MS = BEATS[0].release * 1000, DEFEND = BEATS[1], DEFEND_RELEASE_MS = DEFEND.release * 1000;

describe('完成した術式の配置', () => {
  const points: Point[] = [
    { x: 0, y: 0, t: 0, hand: 0, stroke: 1 },
    { x: 1, y: .5, t: 10, hand: 0, stroke: 1 },
    { x: .5, y: 1, t: 20, hand: 1, stroke: 2 },
  ];
  it.each([[1440,900],[390,844],[2560,1080]])('画面全体に描いても収まり、縦横比と筆の切れ目が変わらない %s×%s', (w,h) => {
    const before = structuredClone(points), frame = completedSpellFrame(w,h);
    const fitted = fitSpell(points,w,h,frame);
    for (const p of fitted) {
      expect(p.x*w).toBeGreaterThanOrEqual(frame.x-frame.width/2-.001);
      expect(p.x*w).toBeLessThanOrEqual(frame.x+frame.width/2+.001);
      expect(p.y*h).toBeGreaterThanOrEqual(frame.y-frame.height/2-.001);
      expect(p.y*h).toBeLessThanOrEqual(frame.y+frame.height/2+.001);
    }
    const xScale = fitted[1].x-fitted[0].x, yScale = fitted[2].y-fitted[0].y;
    expect(xScale).toBeCloseTo(yScale);
    expect(fitted.map(({stroke,hand,t})=>({stroke,hand,t}))).toEqual(points.map(({stroke,hand,t})=>({stroke,hand,t})));
    expect(points).toEqual(before);
  });
  it('空の入力と一つの点でも、無限大や不正な座標が出ない', () => {
    const frame = completedSpellFrame(1440,900);
    expect(fitSpell([],1440,900,frame)).toEqual([]);
    const [p] = fitSpell([points[0]],1440,900,frame);
    expect(p.x).toBe(.5); expect(p.y).toBeCloseTo(.66);
  });
  it('締め切りまでは入力位置を動かさず、発動で完成位置と一致する',()=>{
    const w=1440,h=900;
    for(const ms of [0,first.build!,first.inputEnd-1,first.inputEnd]) {
      const pose=spellPose(points,w,h,ms);expect(pose.scale).toBe(1);expect(pose.dx).toBe(0);expect(pose.dy).toBe(0);
    }
    const pose=spellPose(points,w,h,first.release),fitted=fitSpell(points,w,h,completedSpellFrame(w,h,BEATS[0],points));
    for(let i=0;i<points.length;i++) {
      expect(((points[i].x-.5)*w*pose.scale+pose.dx+w/2)/w).toBeCloseTo(fitted[i].x);
      expect(((points[i].y-.5)*h*pose.scale+pose.dy+h/2)/h).toBeCloseTo(fitted[i].y);
    }
    expect(spellPose(points,w,h,(first.inputEnd+first.release)/2).progress).toBe(.5);
    expect(spellPose(points,w,h,first.handoff).opacity).toBe(0);
  });
  it('何も描いていないときと一点だけのときは、一回目は下寄りの中央、防御の回は狙いの印の高さに置く',()=>{
    const w=1440,h=900,dot=[{x:.3,y:.3,t:0,hand:0,stroke:1}];
    expect(completedSpellFrame(w,h).x).toBeCloseTo(w*.5);expect(completedSpellFrame(w,h).y).toBeCloseTo(h*.66);
    expect(completedSpellFrame(w,h,DEFEND).y).toBeCloseTo(h*AIM.y);
    // 一点だけでも同じ場所へ寄り、倍率は1のまま。
    expect(spellPose(dot,w,h,RELEASE_MS).center).toEqual({x:w*.5,y:h*.66});
    expect(spellPose(dot,w,h,RELEASE_MS).scale).toBe(1);
    expect(spellPose(dot,w,h,DEFEND_RELEASE_MS,DEFEND).center.y).toBeCloseTo(h*AIM.y);
  });
});

describe('描いた場所と大きさのまま使う',()=>{
  const sizes:[number,number][]=[[1440,900],[390,844],[2560,1080]];
  it.each(sizes)('大きく描いた形は縮めず、動かさない %s×%s',(w,h)=>{
    const points=shapeIn(.2,.3,.7,.7),pose=spellPose(points,w,h,RELEASE_MS);
    expect(pose.scale).toBeCloseTo(1);expect(pose.dx).toBeCloseTo(0);expect(pose.dy).toBeCloseTo(0);
    expect(pose.center).toEqual({x:w*.45,y:h*.5});
    const frame=completedSpellFrame(w,h,BEATS[0],points);
    expect(frame.x).toBeCloseTo(w*.45);expect(frame.y).toBeCloseTo(h*.5);expect(frame.width).toBeCloseTo(w*.5);expect(frame.height).toBeCloseTo(h*.4);
  });
  it.each(sizes)('小さく描いた形は、幅か高さが下限に届くまで広げる %s×%s',(w,h)=>{
    const points=shapeIn(.45,.45,.55,.55),shown=shownAt(points,w,h,RELEASE_MS);
    const pose=spellPose(points,w,h,RELEASE_MS);
    expect(pose.scale).toBeGreaterThan(1);expect(pose.scale).toBeLessThanOrEqual(SPELL_MIN.scale);
    // どちらかの辺が下限ちょうどになり、もう一方は下限を超えない。
    const reachedWidth=Math.abs(widthOf(shown)-SPELL_MIN.width)<1e-6,reachedHeight=Math.abs(heightOf(shown)-SPELL_MIN.height)<1e-6;
    expect(reachedWidth||reachedHeight||pose.scale===SPELL_MIN.scale).toBe(true);
    expect(widthOf(shown)).toBeLessThanOrEqual(SPELL_MIN.width+1e-6);expect(heightOf(shown)).toBeLessThanOrEqual(SPELL_MIN.height+1e-6);
    // 中心は動かない。
    expect(pose.center.x).toBeCloseTo(w*.5);expect(pose.center.y).toBeCloseTo(h*.5);
    // 締め切りまでは等倍のまま。
    expect(spellPose(points,w,h,BEATS[0].inputEnd*1000).scale).toBe(1);
  });
  it('ごく小さい形でも広げる倍率は2.2倍まで',()=>{
    const w=1440,h=900,points=shapeIn(.49,.49,.51,.51);
    expect(spellPose(points,w,h,RELEASE_MS).scale).toBeCloseTo(SPELL_MIN.scale);
  });
  it('横に長い線や縦に長い線は、片方が小さくても広げない',()=>{
    const w=1440,h=900;
    expect(spellPose(shapeIn(.2,.5,.7,.51),w,h,RELEASE_MS).scale).toBeCloseTo(1);
    expect(spellPose(shapeIn(.5,.2,.51,.6),w,h,RELEASE_MS).scale).toBeCloseTo(1);
  });
  it('上の体力表示の帯や下の案内文の帯、画面の端にかかる形だけ中へ寄せ、大きさは変えない',()=>{
    const w=1440,h=900,bounds=spellBounds(w,h);
    const top=bounds.y-bounds.height/2,bottom=bounds.y+bounds.height/2,left=bounds.x-bounds.width/2,right=bounds.x+bounds.width/2;
    expect(top).toBeCloseTo(h*SPELL_BOUNDS.top);expect(bottom).toBeCloseTo(h*(1-SPELL_BOUNDS.bottom));
    // 左上の隅に描いた。左と上の余白のぶんだけ内側へ寄る。
    const corner=shapeIn(0,0,.3,.3),shownCorner=shownAt(corner,w,h,RELEASE_MS);
    expect(spellPose(corner,w,h,RELEASE_MS).scale).toBeCloseTo(1);
    expect(Math.min(...shownCorner.map(p=>p.x))*w).toBeCloseTo(left);expect(Math.min(...shownCorner.map(p=>p.y))*h).toBeCloseTo(top);
    expect(widthOf(shownCorner)).toBeCloseTo(.3);expect(heightOf(shownCorner)).toBeCloseTo(.3);
    // 下の帯にかかる。上へ寄る。
    const low=shapeIn(.3,.75,.7,1),shownLow=shownAt(low,w,h,RELEASE_MS);
    expect(Math.max(...shownLow.map(p=>p.y))*h).toBeCloseTo(bottom);expect(heightOf(shownLow)).toBeCloseTo(.25);
    // 右の端にかかる。左へ寄る。
    const side=shapeIn(.8,.3,1.1,.6),shownSide=shownAt(side,w,h,RELEASE_MS);
    expect(Math.max(...shownSide.map(p=>p.x))*w).toBeCloseTo(right);
    // 収まっている形は寄せない。
    const inside=shapeIn(.3,.3,.6,.6);
    expect(spellPose(inside,w,h,RELEASE_MS).center).toEqual({x:w*.45,y:h*.45});
  });
  it('置ける範囲より大きく描いたときだけ、範囲に収まるぶんだけ縮める',()=>{
    const w=1440,h=900,points=shapeIn(0,0,1,1),shown=shownAt(points,w,h,RELEASE_MS),bounds=spellBounds(w,h);
    const scale=spellPose(points,w,h,RELEASE_MS).scale;
    expect(scale).toBeCloseTo(bounds.height/h);expect(scale).toBeLessThan(1);
    for(const p of shown){expect(p.y*h).toBeGreaterThanOrEqual(bounds.y-bounds.height/2-.001);expect(p.y*h).toBeLessThanOrEqual(bounds.y+bounds.height/2+.001);}
  });
  it('どんな形でも、発動の時刻には置ける範囲の中にある',()=>{
    const w=1440,h=900,bounds=spellBounds(w,h);
    let seed=11;const rand=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
    for(let i=0;i<200;i++){
      const x0=rand()*1.2-.1,y0=rand()*1.2-.1,x1=x0+rand()*1.1,y1=y0+rand()*1.1;
      const shown=shownAt(shapeIn(x0,y0,x1,y1),w,h,RELEASE_MS);
      for(const p of shown){
        expect(p.x*w).toBeGreaterThanOrEqual(bounds.x-bounds.width/2-.01);expect(p.x*w).toBeLessThanOrEqual(bounds.x+bounds.width/2+.01);
        expect(p.y*h).toBeGreaterThanOrEqual(bounds.y-bounds.height/2-.01);expect(p.y*h).toBeLessThanOrEqual(bounds.y+bounds.height/2+.01);
      }
    }
  });
  it('締め切りから発動までの3秒で、倍率と位置がなめらかに移る',()=>{
    const w=1440,h=900,points=shapeIn(0,0,.2,.1);
    const at=(ms:number)=>spellPose(points,w,h,ms);
    expect(at(BEATS[0].inputEnd*1000).progress).toBe(0);expect(at(RELEASE_MS).progress).toBe(1);
    let last=at(BEATS[0].inputEnd*1000);
    for(let ms=BEATS[0].inputEnd*1000+50;ms<=RELEASE_MS;ms+=50){
      const pose=at(ms);
      expect(pose.scale).toBeGreaterThanOrEqual(last.scale);expect(pose.center.x).toBeGreaterThanOrEqual(last.center.x);expect(pose.center.y).toBeGreaterThanOrEqual(last.center.y);
      last=pose;
    }
  });
  it('防御の回も同じ決まりで、描いた場所に残る',()=>{
    const w=1600,h=900;
    // 大きく描いた形は狙いの印の高さへ寄せず、描いた場所と大きさのまま。
    const big=shapeIn(.2,.25,.7,.55),pose=spellPose(big,w,h,DEFEND_RELEASE_MS,DEFEND);
    expect(pose.scale).toBeCloseTo(1);expect(pose.center).toEqual({x:w*.45,y:h*.4});
    expect(completedSpellFrame(w,h,DEFEND,big)).toEqual(completedSpellFrame(w,h,BEATS[0],big));
    // 小さく描いた形は広げ、帯にかかる形は寄せる。一回目と同じ答えになる。
    for(const points of [shapeIn(.45,.45,.55,.55),shapeIn(.6,.8,.9,1),shapeIn(0,0,.25,.2)]){
      const first=spellPose(points,w,h,RELEASE_MS),defend=spellPose(points,w,h,DEFEND_RELEASE_MS,DEFEND);
      expect(defend.scale).toBeCloseTo(first.scale);expect(defend.center.x).toBeCloseTo(first.center.x);expect(defend.center.y).toBeCloseTo(first.center.y);
    }
    // 締め切りまでは入力した位置のまま。
    expect(spellPose(big,w,h,DEFEND.inputEnd*1000,DEFEND).progress).toBe(0);
    expect(spellPose(big,w,h,DEFEND.inputEnd*1000,DEFEND).scale).toBe(1);
  });
  it('結果の縮小図に使う fitSpell は変わらず、指定の枠へ収める',()=>{
    const w=1440,h=900,frame={x:w/2,y:h/2,width:w*.7,height:h*.7};
    const fitted=fitSpell(shapeIn(0,0,1,1),w,h,frame);
    for(const p of fitted){expect(p.x*w).toBeGreaterThanOrEqual(frame.x-frame.width/2-.001);expect(p.x*w).toBeLessThanOrEqual(frame.x+frame.width/2+.001);}
    expect(widthOf(fitted)).toBeCloseTo(.7);
  });
  it('縦長と横長でも命中位置が背景画像の胸からずれない',()=>{
    for(const [w,h] of [[1440,900],[390,844],[2560,1080]]) {
      const scale=Math.max(w/1672,h/941),target=backdropTarget(w,h,1672,941);
      expect(target.x).toBe(.5);
      expect(target.y*h).toBeCloseTo((h-941*scale)/2+.32*941*scale);
    }
  });
});

describe('表示の線をなめらかにする',()=>{
  it('始点と終点を動かさず、ぎざぎざを小さくする',()=>{
    const jagged=Array.from({length:12},(_,i)=>({x:i/11,y:i%2?0.52:0.48,stroke:1}));
    const smooth=smoothStroke(jagged);
    expect(smooth[0]).toEqual(jagged[0]);expect(smooth.at(-1)).toEqual(jagged.at(-1));
    expect(smooth.length).toBeGreaterThan(jagged.length);
    const inner=smooth.slice(4,-4),spread=Math.max(...inner.map(p=>p.y))-Math.min(...inner.map(p=>p.y));
    expect(spread).toBeLessThan(0.01);expect(smooth.every(p=>p.stroke===1)).toBe(true);
  });
  it('2点以下の線はそのまま返す',()=>{
    const two=[{x:0,y:0},{x:1,y:1}];expect(smoothStroke(two)).toEqual(two);
  });
});
