import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BATTLE_END, ENEMY_CHARGE_FROM_MS, ENEMY_MOVES, ENEMY_SLAM_MS, ROUNDS } from '../src/game/rounds';
import { ENEMY_CUES, calmSoundCues, dueSounds, shouldDuck, soundCues } from '../src/audio/cues';
import { CastAudio, HUM, enemyHum, enemyHumLevel } from '../src/audio/cast-audio';
import { dbToGain } from '../src/audio/sample-bank';

const defend = ROUNDS[1];
const step = ENEMY_MOVES[0].at, clang = ENEMY_MOVES[1].at;
/** 「同時に」の防御で声の受付を終え、音量を元へ戻す時刻（ms）。 */
const defendVoiceEnd = defend.inputEnd;
/** うなりの長さのうち、どこまで進んだか（0〜1）を時刻（ms）に直す。 */
const humAt = (u: number) => HUM.from + (HUM.to - HUM.from) * u;
const names = (from: number, to: number, microphone: boolean) => dueSounds(from, to, microphone).map(cue => cue.name);
/** その並びの中で、その音が鳴る時刻（ms）。 */
const 至 = (cues: typeof soundCues, name: string) => cues.find(cue => cue.name === name)!.at;

describe('敵の側の音の合図', () => {
  it('一回目は足音と盾の音、防御は振り下ろしと床の一撃が、回の表の時刻に並ぶ', () => {
    expect(至(soundCues, 'step')).toBe(ENEMY_MOVES[0].at);
    expect(至(soundCues, 'clang')).toBe(ENEMY_MOVES[1].at);
    expect(至(soundCues, 'swing')).toBe(defend.lock);
    expect(至(soundCues, 'slam')).toBe(ENEMY_SLAM_MS);
    // 床の一撃は確定の0.55秒後。溜めは防御の回の始まりの0.2秒後。
    expect(ENEMY_SLAM_MS).toBe(defend.lock + 550); expect(ENEMY_CHARGE_FROM_MS).toBe(defend.start + 200);
    // 既存の音の時刻も回の表と同じ。
    expect(至(soundCues, 'trace')).toBe(ROUNDS[0].build); expect(至(soundCues, 'release')).toBe(ROUNDS[0].release);
    expect(至(soundCues, 'block')).toBe(defend.impact);
  });
  it('一回目と防御の並びの全体', () => {
    const first = soundCues.filter(cue => cue.round === 'first').map(cue => cue.name);
    expect(first).toEqual(['step', 'trace', 'clang', 'chant', 'build', 'complete', 'release', 'impact', 'settle']);
    const defendCues = soundCues.filter(cue => cue.round === 'defend').map(cue => cue.name);
    // 確定の時刻は完成の音と振り下ろしが同時。完成の音を先に置く。
    expect(defendCues).toEqual(['chant', 'build', 'complete', 'swing', 'slam', 'release', 'block', 'settle']);
    // とどめの回には敵の音が混ざらない（とどめの並びは finish-audio の試験が見る）。
    const finish = soundCues.filter(cue => cue.round === 'finish').map(cue => cue.name);
    for (const name of ENEMY_CUES) expect(finish).not.toContain(name);
    for (let i = 1; i < soundCues.length; i++) expect(soundCues[i].at).toBeGreaterThanOrEqual(soundCues[i - 1].at);
  });
  it('控えめモードの並びでも同じ時刻にある', () => {
    for (const name of ENEMY_CUES) expect(至(calmSoundCues, name)).toBe(至(soundCues, name));
  });
  it('マイクを使う回も足音と盾の音が鳴る', () => {
    expect(names(step - 10, step + 10, true)).toEqual(['step']);
    expect(names(clang - 10, clang + 10, true)).toEqual(['clang']);
    expect(names(step - 10, step + 10, false)).toEqual(['step']);
    expect(names(clang - 10, clang + 10, false)).toEqual(['clang']);
  });
  it('振り下ろしと床の一撃は録音の後なので、マイクを使っても鳴る', () => {
    expect(names(defend.lock - 10, defend.lock + 10, true)).toEqual(['complete', 'swing']);
    expect(names(ENEMY_SLAM_MS - 10, ENEMY_SLAM_MS + 10, true)).toEqual(['slam']);
    expect(names(ENEMY_SLAM_MS - 10, ENEMY_SLAM_MS + 10, false)).toEqual(['slam']);
    // 遅れた音をまとめて鳴らさない決まりは、敵の音にも同じに効く。確定から発動まで一気に進めると、発動の音だけが鳴る。
    expect(names(defend.lock, defend.release, false)).toEqual(['release']);
  });
});

describe('溜めのうなり', () => {
  it('溜めの始まりで0から上がり、振り下ろしの時刻ちょうどで0になる', () => {
    expect(HUM.from).toBe(ENEMY_CHARGE_FROM_MS); expect(HUM.to).toBe(defend.lock);
    expect(enemyHumLevel(HUM.from - 200)).toBe(0);
    expect(enemyHumLevel(ENEMY_CHARGE_FROM_MS)).toBe(0);
    expect(enemyHumLevel(HUM.from + 800)).toBeGreaterThan(0);
    expect(enemyHumLevel(HUM.to - 1)).toBeGreaterThan(.99);
    expect(enemyHumLevel(HUM.to)).toBe(0);
    expect(enemyHumLevel(HUM.to + 2000)).toBe(0);
    // 一回目と、振り下ろしのあと（とどめの回を含む）では鳴らない。
    for (let ms = 0; ms < HUM.from; ms += 100) expect(enemyHumLevel(ms)).toBe(0);
    for (let ms = HUM.to; ms < BATTLE_END; ms += 100) expect(enemyHumLevel(ms)).toBe(0);
  });
  it('上がる一方で下がらず、前半は控えめ', () => {
    let before = 0;
    for (let ms = ENEMY_CHARGE_FROM_MS; ms < defend.lock; ms += 50) { const now = enemyHumLevel(ms); expect(now).toBeGreaterThanOrEqual(before); before = now; }
    expect(enemyHumLevel(humAt(.4))).toBeLessThan(.25);
    expect(enemyHumLevel(humAt(.8))).toBeGreaterThan(.5);
  });
  it('録音中の下げは曲と同じ範囲に掛かり、声の受付の終わりで戻る', () => {
    const recording = defend.start + 2000;
    expect(enemyHum(recording, true).ducked).toBe(true);
    expect(enemyHum(defendVoiceEnd - 10, true).ducked).toBe(true);
    expect(enemyHum(defendVoiceEnd, true).ducked).toBe(false);
    expect(enemyHum(recording, false).ducked).toBe(false);
    expect(enemyHum(recording, true).ducked).toBe(shouldDuck(recording));
    expect(enemyHum(HUM.to, true)).toEqual({ level: 0, ducked: false });
  });
});

/** 仮の音の部品。つないだ先と、音量などの指示を記録する。node には本物の音の仕組みが無いため。 */
class FakeParam {
  value = 0; target: number | null = null; events: Array<[string, number, number?]> = [];
  setValueAtTime(v: number, t: number) { this.value = v; this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number) { this.value = v; this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.value = v; this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.target = v; this.events.push(['target', v, t]); return this; }
  cancelScheduledValues(t: number) { this.events.push(['cancel', t]); return this; }
}
class FakeNode {
  outputs: FakeNode[] = [];
  constructor(readonly kind: string) {}
  connect(dest: FakeNode | FakeParam) { if (dest instanceof FakeNode) this.outputs.push(dest); return dest; }
  disconnect() { this.outputs = []; }
}
class FakeGain extends FakeNode { gain = new FakeParam(); constructor() { super('gain'); } }
class FakeOscillator extends FakeNode {
  type = 'sine'; frequency = new FakeParam(); startedAt: number | null = null; stoppedAt: number | null = null; onended: (() => void) | null = null;
  constructor() { super('oscillator'); }
  start(t = 0) { this.startedAt = t; } stop(t = 0) { this.stoppedAt = t; }
}
class FakeBufferSource extends FakeNode {
  buffer: unknown = null; loop = false; playbackRate = new FakeParam(); onended: (() => void) | null = null;
  constructor() { super('buffer'); } start() {} stop() {}
}
class FakeFilter extends FakeNode { type = 'lowpass'; Q = new FakeParam(); frequency = new FakeParam(); constructor() { super('filter'); } }
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(); knee = new FakeParam(); ratio = new FakeParam(); attack = new FakeParam(); release = new FakeParam();
  constructor() { super('compressor'); }
}
class FakeContext {
  state = 'running'; currentTime = 0; sampleRate = 48000; destination = new FakeNode('destination');
  gains: FakeGain[] = []; oscillators: FakeOscillator[] = [];
  createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator() { const o = new FakeOscillator(); this.oscillators.push(o); return o; }
  createBufferSource() { return new FakeBufferSource(); }
  createBiquadFilter() { return new FakeFilter(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  createBuffer(channels: number, length: number, rate: number) { return { sampleRate: rate, length, numberOfChannels: channels, duration: length / rate, getChannelData: () => new Float32Array(length) }; }
  async resume() {} async close() {}
  async decodeAudioData() { throw new Error('試験では素材を読まない'); }
}
/** つないだ先をたどって、通る部品をすべて集める。 */
function chain(node: FakeNode, seen = new Set<FakeNode>()) {
  if (seen.has(node)) return seen; seen.add(node);
  for (const next of node.outputs) chain(next, seen);
  return seen;
}

describe('うなりの経路と止め方', () => {
  const original = globalThis.AudioContext;
  let ctx: FakeContext;
  beforeAll(() => { (globalThis as unknown as { AudioContext: unknown }).AudioContext = class extends FakeContext { constructor() { super(); ctx = this; } }; });
  afterAll(() => { (globalThis as unknown as { AudioContext: unknown }).AudioContext = original; });

  /** 音を用意して本編を始める。マイクの有無を選べる。 */
  async function begin(microphone: boolean) {
    const audio = new CastAudio(); await audio.prepare(); audio.start(microphone);
    return audio;
  }
  /** 発振器の最初の高さ（Hz）。合成音は高さを滑らせるので、最後の値ではなく最初の指示を見る。 */
  const startHz = (o: FakeOscillator) => o.frequency.events.find(([kind]) => kind === 'set')?.[1] ?? o.frequency.value;
  const humOscillators = () => ctx.oscillators.filter(o => HUM.tones.includes(startHz(o)));
  const hasTone = (hz: number, type = 'sine') => ctx.oscillators.some(o => o.type === type && startHz(o) === hz);
  /** 録音中の下げの段。開始でマイクありなら 8dB 下げる指示を受けている。 */
  const duckNode = () => ctx.gains.find(g => g.gain.events.some(([kind, v]) => kind === 'target' && Math.abs(v - dbToGain(-8)) < 1e-6))!;

  it('溜めの間だけ鳴り、曲と同じ下げの段を通り、振り下ろしで切れる', async () => {
    const audio = await begin(true);
    audio.update(HUM.from - 200, null); expect(audio.snapshot.enemyHum.playing).toBe(false); expect(humOscillators()).toHaveLength(0);
    audio.update(HUM.from + 800, null);
    expect(audio.snapshot.enemyHum.playing).toBe(true);
    // うなりは効果音の数に入れない（終了後に 0 であることを見るブラウザーの試験がある）。
    expect(audio.snapshot.activeSources).toBe(0);
    const lows = humOscillators(); expect(lows.map(startHz).sort()).toEqual([38, 55]);
    expect(lows.every(o => o.startedAt !== null && o.stoppedAt === null)).toBe(true);
    // 低い正弦波から出口までの道に、録音中の下げの段がある。効果音も同じ段を通る。
    const duck = duckNode(); expect(duck).toBeDefined();
    expect(chain(lows[0]).has(duck)).toBe(true);
    expect(chain(lows[0]).has(ctx.destination)).toBe(true);
    // 録音中は下げたまま、声の受付の終わりで戻す。
    const recording = defend.start + 2000, afterQuiet = defendVoiceEnd + 250;
    audio.update(recording, null); expect(audio.snapshot.ducked).toBe(true); expect(duck.gain.target).toBeCloseTo(dbToGain(-8), 6);
    expect(audio.snapshot.enemyHum.level).toBeCloseTo(enemyHumLevel(recording), 9);
    expect(audio.snapshot.enemyHum.gain).toBeGreaterThan(0);
    expect(audio.snapshot.enemyHum.gain).toBeLessThanOrEqual(HUM.ratio * dbToGain(HUM.musicDbWithoutBgm) + 1e-9);
    audio.update(afterQuiet, null); expect(audio.snapshot.ducked).toBe(false); expect(duck.gain.target).toBe(1);
    expect(audio.snapshot.enemyHum.gain).toBeGreaterThan(0);
    // 振り下ろしで切る。発振器は止まり、音量の段は0へ。
    audio.update(HUM.to, null);
    expect(audio.snapshot.enemyHum).toEqual({ playing: false, level: 0, gain: 0 });
    expect(lows.every(o => o.stoppedAt !== null)).toBe(true);
    // 停止すれば効果音も空になる。
    audio.stop(); expect(audio.snapshot.activeSources).toBe(0);
  });
  it('うなりの音量は上がる一方で、上限は曲の3割', async () => {
    const audio = await begin(false);
    let before = 0, last = 0;
    for (let ms = HUM.from - 200; ms < HUM.to; ms += 200) { audio.update(ms, null); const gain = audio.snapshot.enemyHum.gain; expect(gain).toBeGreaterThanOrEqual(before); before = gain; last = ms; }
    expect(before).toBeCloseTo(HUM.ratio * dbToGain(HUM.musicDbWithoutBgm) * enemyHumLevel(last), 6);
    audio.stop();
  });
  it('停止と消音で必ず止まる', async () => {
    const audio = await begin(false);
    audio.update(humAt(.5), null); expect(audio.snapshot.enemyHum.playing).toBe(true);
    audio.stop();
    expect(audio.snapshot.enemyHum.playing).toBe(false);
    expect(humOscillators().every(o => o.stoppedAt !== null)).toBe(true);
    // 消音でも同じ。
    const again = await begin(false);
    again.update(humAt(.5), null); expect(again.snapshot.enemyHum.playing).toBe(true);
    again.setEnabled(false);
    expect(again.snapshot.enemyHum.playing).toBe(false);
    expect(humOscillators().every(o => o.stoppedAt !== null)).toBe(true);
    // 消音のまま時刻が進んでも始まらない。
    again.update(humAt(.7), null); expect(again.snapshot.enemyHum.playing).toBe(false);
    again.stop();
  });
  it('マイクを使う回も足音と盾の音を合成し、音量を下げる', async () => {
    const withMic = await begin(true);
    withMic.update(step - 100, null); withMic.update(step + 10, null); withMic.update(clang - 100, null); withMic.update(clang + 10, null);
    expect(withMic.snapshot.events.map(e=>e.name)).toEqual(['step','clang']);
    expect(withMic.snapshot.ducked).toBe(true);
    expect(chain(ctx.oscillators.find(o=>startHz(o)===900)!).has(duckNode())).toBe(true);
    withMic.ring(1);expect(withMic.snapshot.events.at(-1)?.name).toBe('ring');
    withMic.stop();
    // 録音中に中止しても、開始画面で試す音が小さいままにならない。
    expect(duckNode().gain.target).toBe(1);
    const mouse = await begin(false);
    mouse.update(step - 100, null); mouse.update(step + 10, null); mouse.update(clang - 100, null); mouse.update(clang + 10, null);
    expect(mouse.snapshot.events.map(e => e.name)).toEqual(['step', 'clang']);
    // 足音は低い三角波（60Hz）、盾の音は倍音の関係にない二つの高い音。
    expect(hasTone(60, 'triangle')).toBe(true);
    expect(hasTone(900)).toBe(true);
    expect(hasTone(1400)).toBe(true);
    mouse.stop();
  });
  it('振り下ろしと床の一撃は、マイクを使っても合成する', async () => {
    const audio = await begin(true);
    audio.update(defend.lock - 10, null); audio.update(defend.lock + 10, null); audio.update(ENEMY_SLAM_MS - 10, null); audio.update(ENEMY_SLAM_MS + 10, null);
    expect(audio.snapshot.events.map(e => e.name)).toEqual(['complete', 'swing', 'slam']);
    // 床の一撃は重い低音（70Hz）を持つ。
    expect(hasTone(70, 'triangle')).toBe(true);
    audio.stop();
  });
});
