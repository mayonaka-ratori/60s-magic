/**
 * 試験で使いまわす道具。
 * 本物のcanvasも画面も無いnodeの上で、描く部品を呼べるようにする。
 * ここを直せば全部の試験に効くので、個々の試験ファイルに写しを作らない。
 * 中身が少しずつ違うものは、無理にここへ寄せず、その試験ファイルに置いたままにしてある。
 */
import { BEATS } from '../src/game/rounds';
import { AIM } from '../src/game/guard';
import { presets } from '../src/render/effects/presets';
import { ParticlePool } from '../src/render/effects/particles';
import { RELEASE_AT } from '../src/render/effects/screen';
import type { Frame } from '../src/render/effects/frame';
import type { Recipe } from '../src/game/types';

/** 試験用の魔法。変えたいところだけ渡す。 */
export const testRecipe = (over: Partial<Recipe> = {}): Recipe => ({
  version: 'recipe-1', element: 'fire', purpose: 'attack', form: 'orb', trajectory: 'straight',
  count: 1, explicitCount: null, defense: .3, area: .5, duration: .5, concentration: .5,
  enclosure: false, split: false, developsPrevious: null, motionSpeechAligned: null, noAttack: false,
  name: '', source: 'local', decisions: {}, assistance: [], model: null, ...over });

const digits = (v: number) => Math.round(v * 1000) / 1000;

/**
 * 描く命令を受け流すだけの仮のcanvas。どの命令も自分を返すので、gradient も使える。
 * 記録用の配列を渡すと、描いた命令と数の指定を書き出す。
 */
export function stubContext(log?: string[]) {
  const held: Record<string, unknown> = {};
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => {
      log?.push(key + ':' + args.filter(a => typeof a === 'number').map(a => digits(a as number)).join(','));
      return fake;
    }),
    set: (target, key: string, value) => {
      if (typeof value === 'number') log?.push(key + '=' + digits(value));
      target[key] = value; return true;
    },
  });
  return fake as CanvasRenderingContext2D;
}

/** 控えておく描く命令ひとつ。線の位置、色、太さを後から確かめられる。 */
export type DrawCall = { name: string; args: number[]; strokeStyle: string; lineWidth: number };

/** 描く命令をそのまま控えておく仮のcanvas。 */
export function callRecorder() {
  const calls: DrawCall[] = [];
  const held: Record<string, unknown> = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, globalCompositeOperation: 'lighter' };
  const fake: unknown = new Proxy(held, {
    get: (target, key: string) => key in target ? target[key] : (...args: number[]) => {
      calls.push({ name: key, args, strokeStyle: String(target.strokeStyle), lineWidth: Number(target.lineWidth) });
      return fake;
    },
    set: (target, key: string, value) => { target[key] = value; return true; },
  });
  return { c: fake as CanvasRenderingContext2D, calls };
}

/** 光の絵は描かない仮の絵。置いた場所と大きさを見たいときは自分で差し替える。 */
export const noSprites = { draw: () => {} } as unknown as Frame['sprites'];

/** 部品を1コマぶん呼ぶための仮の Frame。変えたいところだけ渡す。 */
export const testFrame = (over: Partial<Frame> = {}): Frame => ({
  c: stubContext(), w: 1280, h: 720, t: RELEASE_AT, dt: .016,
  sprites: noSprites, pool: new ParticlePool(64),
  preset: presets.vivid, palette: presets.vivid.palettes.fire, intensity: 1.5,
  recipe: testRecipe(), locked: true, origin: { x: 200, y: 500 }, target: { x: 900, y: 360 },
  accent: null, live: { words: [], amount: 0, voice: 0, rings: 0, covered: false }, points: [], cursors: [],
  beat: BEATS[0], guard: null, aim: AIM, inherited: [], calm: false,
  once: (_key, run) => run(), ...over });
