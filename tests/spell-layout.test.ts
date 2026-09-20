import { describe, expect, it } from 'vitest';
import { fitSpell, completedSpellFrame, spellPose, backdropTarget } from '../src/render/spell-layout';
import type { Point } from '../src/game/types';

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
  it('14秒までは入力位置を動かさず、17秒で完成位置と一致する',()=>{
    const w=1440,h=900;
    for(const ms of [0,6000,13999,14000]) {
      const pose=spellPose(points,w,h,ms);expect(pose.scale).toBe(1);expect(pose.dx).toBe(0);expect(pose.dy).toBe(0);
    }
    const pose=spellPose(points,w,h,17000),fitted=fitSpell(points,w,h,completedSpellFrame(w,h));
    for(let i=0;i<points.length;i++) {
      expect(((points[i].x-.5)*w*pose.scale+pose.dx+w/2)/w).toBeCloseTo(fitted[i].x);
      expect(((points[i].y-.5)*h*pose.scale+pose.dy+h/2)/h).toBeCloseTo(fitted[i].y);
    }
    expect(spellPose(points,w,h,15500).progress).toBe(.5);
    expect(spellPose(points,w,h,23000).opacity).toBe(0);
  });
  it('縦長と横長でも命中位置が背景画像の胸からずれない',()=>{
    for(const [w,h] of [[1440,900],[390,844],[2560,1080]]) {
      const scale=Math.max(w/1672,h/941),target=backdropTarget(w,h,1672,941);
      expect(target.x).toBe(.5);
      expect(target.y*h).toBeCloseTo((h-941*scale)/2+.32*941*scale);
    }
  });
});
