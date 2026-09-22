import { describe, expect, it } from 'vitest';
import { Battle } from '../src/game/battle';
import { FLOW, ROUNDS, TOGETHER_ROUNDS, SEQUENTIAL_ROUNDS, MAX_INPUT_MS, MAX_INPUT_SAMPLES, SAMPLES_PER_MS, flowOf, beatOf, windowMsOf } from '../src/game/rounds';

describe('二つの遊び方', () => {
  it('URLで選び、指定がなければ順番にする', () => {
    expect(flowOf('')).toBe('sequential');
    expect(flowOf('?flow=together')).toBe('together');
    expect(flowOf('?flow=知らない名前')).toBe('sequential');
    expect(ROUNDS).toBe(FLOW === 'together' ? TOGETHER_ROUNDS : SEQUENTIAL_ROUNDS);
  });
  it('設計の時刻で三回をつなぎ、両方とも90秒で終える', () => {
    expect(TOGETHER_ROUNDS.map(r => [r.start, r.end])).toEqual([[0,30000],[30000,56000],[56000,90000]]);
    expect(SEQUENTIAL_ROUNDS.map(r => [r.start,r.inputEnd,r.lock,r.release,r.impact,r.handoff,r.end])).toEqual([
      [0,14000,17000,18000,19500,24000,26000],
      [26000,38000,40000,41000,42400,46000,50000],
      [50000,72000,75000,76000,77600,84000,90000],
    ]);
    let now=0; const battle=new Battle(()=>now);
    for(const round of ROUNDS) {
      now=round.start; battle.tick(); expect(battle.active.round).toBe(round);
      now=round.lock; battle.tick(); expect(battle.active.recipe).not.toBeNull();
      now=round.release; battle.tick(); expect(battle.phase).toBe('release');
      expect(beatOf(round).release*1000).toBe(round.release);
    }
    now=ROUNDS.at(-1)!.end; battle.tick(); expect(battle.finished).toBe(true);
  });
  it('音声の受け皿は両方の表の最長の受付を収める', () => {
    expect(MAX_INPUT_MS).toBe(22000);
    for(const round of [...TOGETHER_ROUNDS,...SEQUENTIAL_ROUNDS]) expect(windowMsOf(round)).toBeLessThanOrEqual(MAX_INPUT_MS);
    expect(MAX_INPUT_SAMPLES).toBe(MAX_INPUT_MS*SAMPLES_PER_MS);
  });
});
