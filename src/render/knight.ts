import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { CubeTextureCreateFromImages } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { clamp } from '../game/motion';
import { BATTLE_END, FINAL_BLOW_MS, FINISH_COLLAPSE_MS, FINISH_FALL_FROM_MS, FINISH_FALL_TO_MS, FINISH_HIT_MS, FINISH_HIT_OFFSETS_MS, FINISH_KNEEL_MS, FINISH_SWORD_DROP_MS, ROUNDS } from '../game/rounds';
import { colors } from './magic';
import { getPreset, type EffectPreset } from './effects/presets';
import { smooth } from './effects/frame';
import { IMPACT_AT } from './effects/screen';
import type { Recipe } from '../game/types';

/** 画面の中の点を出すときに使う単位行列。毎コマ作らず、この一つを使い回す。 */
const IDENTITY=Matrix.Identity();
/** 反応の強さの基準にする設定（派手）。この設定のときの強さは今まで通りにする。 */
const BASE_PRESET = getPreset(null);
/** 立体を描く面の粗さ。背景の一枚絵より少しだけ粗く描き、拡大で輪郭をなまらせる。描く点が減るので速さにも効く。 */
const COARSE = 1.3;

const mix=(a:string,b:string,r:number)=>{
  const read=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const [ar,ag,ab]=read(a),[br,bg,bb]=read(b);
  return `rgb(${Math.round(ar+(br-ar)*r)},${Math.round(ag+(bg-ag)*r)},${Math.round(ab+(bb-ab)*r)})`;
};

/**
 * 魔法から反応の強さ（0〜1）を出す。個数、範囲、収束が大きいほど大きく崩れる。
 * 入力の量（たくさん描き、たくさん唱えたか）で最大0.3ほど強くなる。量の効き方は設定で変わらない。
 * 見た目の設定でも変わる。派手を1とした倍率を掛けるので、最大では大きく、控えめでは小さく崩れる。
 * 派手のときの値は今まで通り。
 */
export function reactionPower(recipe:Recipe|null|undefined,amount=0,preset:EffectPreset=getPreset(null)) {
  const gain=preset.gain/BASE_PRESET.gain;
  const fromInput=clamp(amount)*.3;
  if(!recipe)return clamp(.45*gain+fromInput);
  const many=clamp((recipe.count-1)/5),wide=clamp((recipe.area-.2)/.8),focus=clamp(recipe.concentration);
  return clamp((.16+many*.42+wide*.22+focus*.26)*gain+fromInput);
}

/** 待機の息づかいの周期（秒）。剣を上げてから下ろすまでを一回とする。 */
export const IDLE_BREATH_SECONDS=5.6;
/** 息づかいで、上げた構え（姿勢9）へどれだけ寄せるか。1にすると上げきったまま止まって見える。 */
export const IDLE_BREATH_DEPTH=.62;
/**
 * 待機の息づかい（0〜IDLE_BREATH_DEPTH）。待機（姿勢0）を、剣を上げた待機（姿勢9）へどれだけ寄せるか。
 * 一回目と防御の回で同じ式を使う。別々に書くと、切り替わる時刻で姿勢が飛ぶ。
 * 動きを減らす設定では止める。
 */
export const idleSway=(ms:number,reduced=false)=>
  reduced?0:(.5-.5*Math.cos(ms/1000*Math.PI*2/IDLE_BREATH_SECONDS))*IDLE_BREATH_DEPTH;

export function knightPose(ms:number,active:boolean,reduced=false,purpose:Recipe['purpose']='attack',power=.45,calm=false,impactMs=ROUNDS[0].impact) {
  const t=(ms-impactMs)/1000;
  const hit=active?smooth(t/.09)*(1-smooth((t-.62)/.2)):0;
  const recover=active?smooth((t-.62)/.2)*(1-smooth((t-1.65)/.65)):0;
  const force=purpose==='bind'?.35:purpose==='enhance'?.5:1;
  const flash=active?Math.max(0,1-t/.24)*(t>=0?1:0):0;
  // 反応の強さ。弱いと怯むだけ、中でよろめき、強いと転倒に近い崩れになる。
  const strength=clamp(power)*force,struck=active&&t>=0;
  // 奥へ押されて戻る。強いほど戻りが遅い。
  const push=struck?(t<.15?smooth(t/.15):1-smooth((t-.15)/(.35+strength*.85))):0;
  // 転倒に近い沈み込みは強いときだけ。0.6秒で沈み、1.2秒で戻る。
  const fall=clamp((strength-.55)/.45);
  const collapse=struck?fall*(t<.6?smooth(t/.6):1-smooth((t-.6)/1.2)):0;
  // 白飛びは白、属性色、白の三段で合計0.15秒。
  const step=struck&&t<.15?Math.floor(t/.05):-1;
  // 待機の息づかい。構え（0）と、剣をもう少し上げた構え（9）をゆっくり行き来する。
  // ひるみと構え戻しの間は、その分だけ薄まる。動きを減らす設定では止める。
  // 割り算の端数で 1-hit-recover がごくわずかに負へ回ることがあるので、0で受け止める。
  const rest=Math.max(0,1-hit-recover);
  const sway=idleSway(ms,reduced);
  const weights=pad([rest*(1-sway),hit,recover]);weights[9]=rest*sway;
  return {weights,lean:reduced?0:hit*force,
    breath:reduced?0:Math.sin(ms*.0016)*.003,flash,
    // shakeは体の細かい震え。立体のほうを揺らすので、押し戻しや回りとは別に持つ。
    shake:reduced?0:flash*.028,
    state:hit>.1?'hit':recover>.1?'recover':'idle',
    // 崩れ落ちはとどめの回だけ。一回目はいつも立っている。
    fall:0,still:1,blink:0,
    strength,push:reduced?0:push,collapse:reduced?0:collapse,
    // 打撃の向きに合わせ、右へのけぞる。単位は度。
    spin:reduced?0:push*(1.4+strength*2.6)+collapse*3.4,
    // 控えめモードでは白飛びを出さず、残像と輪郭の発光を3分の1にする。
    flashAlpha:calm||step<0?0:(.85-step*.2)*(.5+strength*.5),flashTint:step===1?1:0,
    ghost:(struck&&t<.3?1-t/.3:0)*(calm?1/3:1),rim:(struck&&t<.6?1-smooth(t/.6):0)*(calm?1/3:1)};
}

// 姿勢の表。角度だけを並べ、weightsで混ぜる。body と head は、正の値で後ろへ反る。
// turn は上半身のひねり。正の値で盾の側が手前に出て、剣の側が引ける。脚はひねらない。
// 0〜2 は一回目で使う待機・ひるむ・構えを戻す。3〜7 は防御の回で使う。9 は待機の息づかい。
type Pose={body:number;head:number;turn:number;swordSwing:number;swordOut:number;shieldSwing:number;shieldOut:number;crouch:number};
const POSES:Pose[]=[
  // 待機。剣を肩の後ろへ振りかぶり、盾を前へ出し、膝を沈めて半身に構える。
  {body:-.06,head:-.05,turn:.22,swordSwing:-2.24,swordOut:.57,shieldSwing:.4,shieldOut:.46,crouch:-.12},
  {body:.3,head:.24,turn:0,swordSwing:-.5,swordOut:.55,shieldSwing:-.8,shieldOut:.5,crouch:-.11},
  {body:-.1,head:-.04,turn:0,swordSwing:-.12,swordOut:-.04,shieldSwing:.16,shieldOut:-.2,crouch:-.03},
  // 構え。剣を引き、腰を落とし、盾を前へ出す。
  {body:-.06,head:-.04,turn:0,swordSwing:-.55,swordOut:.34,shieldSwing:.55,shieldOut:.5,crouch:-.16},
  // 溜め。剣を頭上まで上げ、体を反らす。待機の振りかぶりより高く上げ、見分けが付くようにする。
  {body:.24,head:.14,turn:0,swordSwing:-2.8,swordOut:.42,shieldSwing:.25,shieldOut:.28,crouch:-.04},
  // 振り下ろし。踏み込んで前へ斬る。
  {body:-.4,head:-.22,turn:0,swordSwing:.95,swordOut:.12,shieldSwing:-.35,shieldOut:.22,crouch:-.24},
  // 弾かれる。腕ごと押し戻され、上半身が反る。
  {body:.5,head:.32,turn:0,swordSwing:-1.15,swordOut:.85,shieldSwing:-.55,shieldOut:.72,crouch:-.02},
  // 前屈。胸当てが割れて弱点が見える姿勢。
  {body:-.5,head:-.34,turn:0,swordSwing:-.12,swordOut:.04,shieldSwing:-.2,shieldOut:.08,crouch:-.32},
  // 崩れ落ちる。膝をつき、体が前へ折れて腕が垂れる。とどめの回の最後だけで使う。
  {body:-.95,head:-.52,turn:0,swordSwing:.34,swordOut:.06,shieldSwing:.3,shieldOut:.05,crouch:-.92},
  // 待機の息づかい。剣をもう少し上げ、背を伸ばしたところ。待機（0）との間をゆっくり行き来する。
  {body:.04,head:-.02,turn:.18,swordSwing:-2.5,swordOut:.68,shieldSwing:.28,shieldOut:.38,crouch:-.03},
];
/** 姿勢の重みを、表の長さにそろえる。足りない分は0。 */
const pad=(weights:number[])=>{const full=new Array(POSES.length).fill(0);for(let i=0;i<weights.length;i++)full[i]=weights[i];return full;};

// 防御の回ととどめの回の時刻は、回の表（rounds.ts）から作る。表を直したら騎士も一緒に動く。
const FIRST=ROUNDS[0],DEFEND=ROUNDS[1],FINISH=ROUNDS[2];
/** とどめの一撃が核へ届く時刻（秒、世界の時刻）。回の表で作った値をそのまま秒にする。 */
export const FINAL_BLOW_AT=FINAL_BLOW_MS/1000;
/** 膝をつき始める時刻（秒）。とどめの一撃の1.3秒後。体力の枠が消え始める時刻と同じ値を使う。 */
export const KNEEL_AT=FINISH_COLLAPSE_MS/1000;
/** 膝をつききるまでの長さ（秒）。ここまで来たら、そのまま倒れ始める。 */
export const KNEEL_RAMP=FINISH_KNEEL_MS/1000;
/** 手前へ倒れ始める時刻と、倒れきる時刻（秒）。崩れる音と同じ表から作る。 */
export const FALL_FROM=FINISH_FALL_FROM_MS/1000,FALL_TO=FINISH_FALL_TO_MS/1000;
/**
 * 倒れるときに足元を軸に回す角（ラジアン）と、視点へ近づく距離。
 * 設計の初めの案は1.2ラジアンと0.6だったが、0.6まで寄せると兜の上面だけが画面いっぱいの
 * 黒い形になり、何が映っているか分からなくなる。回す角も1.0で十分に倒れて見えるので浅くした。
 * 倒れた体の一番上が画面の縦の真ん中より下へ来る程度に抑える。
 */
export const FALL_TURN=1,FALL_NEAR=.25;
/** 防御の姿勢へ移り始める時刻（秒）。一回目の受け渡しの始まり。 */
export const GUARD_FROM=FIRST.handoff/1000;
/**
 * 胸の核の光が満ちきるまでの長さ（ms）。一回目の締め切りから、魔法が届く時刻まで。
 * 決め打ちにすると表を直したときにずれ、届く前に満ちきって待つ形になる。
 */
const CHARGE_MS=FIRST.impact-FIRST.inputEnd;
/** 胸の核の光の満ち具合（0〜1）。締め切りから溜まり、魔法が届く時刻でちょうど満ちる。 */
export const coreCharge=(ms:number,active=true)=>active?clamp((ms-FIRST.inputEnd)/CHARGE_MS):0;
/** 防御の回の姿勢の順。at の時刻から ramp 秒かけて、その姿勢へ移る。 */
const GUARD_STEPS:Array<{at:number;pose:number;ramp:number}>=[
  {at:0,pose:0,ramp:.5},                        // 待機
  {at:GUARD_FROM,pose:3,ramp:1},                // 構え
  // 溜め。剣を上げきるまでの長さは回の表から作り、確定の3秒前に上げきる。
  {at:DEFEND.start/1000+.2,pose:4,ramp:(DEFEND.lock-DEFEND.start)/1000-3},
  {at:DEFEND.lock/1000,pose:5,ramp:.55},        // 振り下ろし
  {at:DEFEND.impact/1000,pose:6,ramp:.22},      // 弾かれる
  {at:DEFEND.impact/1000+2.2,pose:2,ramp:1.1},  // よろめきから構えを戻す
  {at:DEFEND.handoff/1000,pose:7,ramp:1},       // 前屈して弱点を晒す
  {at:KNEEL_AT,pose:8,ramp:KNEEL_RAMP},         // 膝をついて崩れ落ちる
];
/** 弾き返したとき、騎士が自分の一撃を受ける時刻（秒）。一撃が盾に当たってから0.8秒後。 */
export const REFLECT_BACK_AT=DEFEND.impact/1000+.8;
/** 盾に弾かれて兜の角が折れる時刻（ms）。 */
export const HORN_BREAK_MS=DEFEND.impact+2100;
/** 胸当てが外れて弱点が見え始める時刻（ms）。 */
export const WEAKPOINT_MS=DEFEND.handoff;

/** とどめの回で落ちる部品の名前。 */
export type DropKey='shoulderSpike'|'shield'|'horn'|'chestPlate'|'core'|'sword';
/**
 * 部品が落ちる時刻の表（秒、世界の時刻）。多段命中の4回は rounds.ts の一覧から作る。
 * 核は砕け、剣は手放して床へ落ちる。入力では変えない。
 */
export const FINISH_DROPS:Array<{key:DropKey;at:number}>=[
  {key:'shoulderSpike',at:(FINISH.impact+FINISH_HIT_OFFSETS_MS[0])/1000},
  {key:'shield',at:(FINISH.impact+FINISH_HIT_OFFSETS_MS[1])/1000},
  {key:'horn',at:(FINISH.impact+FINISH_HIT_OFFSETS_MS[2])/1000},
  {key:'chestPlate',at:(FINISH.impact+FINISH_HIT_OFFSETS_MS[3])/1000},
  {key:'core',at:FINAL_BLOW_AT+.3},
  {key:'sword',at:FINISH_SWORD_DROP_MS/1000},
];
/**
 * とどめの傷あとの表。4回の命中は当たった部品の場所に、直撃は核の場所に残る。
 * 倒れ始め（FALL_FROM）から0.5秒で全部消す。
 */
export const SCAR_MARKS:Array<{key:DropKey;at:number}>=[...FINISH_DROPS.slice(0,4),{key:'core',at:FINAL_BLOW_AT}];
/** 核が砕けきるまでの長さ（秒、世界の時刻）。スローの中なので、実際には0.5秒かかる。 */
export const CORE_BREAK_SECONDS=.125;
/** その時刻までに落ちている部品の一覧。 */
export const droppedAt=(t:number):DropKey[]=>FINISH_DROPS.filter(drop=>t>=drop.at).map(drop=>drop.key);

/** 落ちる部品ひとつ分の覚え書き。落ちる前に戻すための場所と、傷あとの印を持つ。 */
type Part={key:DropKey;at:number;node:TransformNode;home:TransformNode|null;
  pos:Vector3;rot:Vector3;scale:Vector3;spot:TransformNode;v:Throw;floor:number;
  dropped:boolean;start:Vector3;startRot:Vector3};

/** 落ちる速さ（1秒あたり）と、床で跳ね返るときに残る割合。 */
export const GRAVITY=9.8,BOUNCE=.34;
/** 部品の飛び出し方。回り（spin）と、床で止まる高さ（floor）も一緒に持つ。 */
export type Throw={vx:number;vy:number;vz:number;spin:number;floor:number};
/**
 * 部品ごとの飛び出し方。入力では変えない。
 * 盾と剣は手前（zの負の向き＝視点の側）へ飛ばさない。視点へ寄せると、
 * 床に落ちた盾や剣が画面いっぱいに映ってしまう。足元の左右へ落として床で止める。
 */
export const FINISH_THROWS:Record<DropKey,Throw>={
  shoulderSpike:{vx:-1.1,vy:1.6,vz:-.5,spin:6,floor:0},
  shield:{vx:1.15,vy:.8,vz:.35,spin:3,floor:.1},
  horn:{vx:.9,vy:1.9,vz:-.45,spin:7,floor:0},
  chestPlate:{vx:-.4,vy:1.4,vz:-.6,spin:5,floor:0},
  core:{vx:0,vy:0,vz:0,spin:0,floor:0},
  sword:{vx:-1.05,vy:.55,vz:.3,spin:2.6,floor:.07},
};
/**
 * 落ちた部品の動き。落ち始めからの秒数と、落ち始めの高さ、飛び出す速さから、
 * ずれと回りを出す。重力で落ち、床（高さ0）で1回だけ跳ねて止まる。ばらばらにはしない。
 */
export function debrisMotion(dt:number,height:number,v:{vx:number;vy:number;vz:number;spin:number}) {
  const h=Math.max(0,height),d=Math.max(0,dt);
  // 床に着くまでの時間。落ち始めの高さと上向きの速さから出す。
  const land=(v.vy+Math.sqrt(v.vy*v.vy+2*GRAVITY*h))/GRAVITY;
  // 跳ね返る速さと、跳ねている時間。跳ねるのは1回だけ。
  const back=Math.max(0,GRAVITY*land-v.vy)*BOUNCE,bounce=2*back/GRAVITY,rest=land+bounce;
  let y:number;
  if(d<land)y=h+v.vy*d-GRAVITY*d*d/2;
  else if(d<rest){const u=d-land;y=back*u-GRAVITY*u*u/2;}
  else y=0;
  // 横は着地まで同じ速さで進み、跳ねている間は半分に落として止まる。
  const moved=Math.min(d,land)+Math.max(0,Math.min(d,rest)-land)*.5;
  const turned=v.spin*Math.min(d,rest);
  return {x:v.vx*moved,z:v.vz*moved,y:Math.max(0,y),rot:turned,resting:d>=rest};
}

/**
 * とどめの回の核の明滅（0〜1）。56〜64秒は2秒に1回、64〜72秒は1秒に1回、
 * 確定の0.4秒前から1秒かけて最大の明るさまで上げ、そのあとは最大のままにする。
 */
export function coreBlink(t:number) {
  const start=FINISH.start/1000,fast=FINISH.chant/1000,aim=FINISH.lock/1000-.4;
  if(t<start)return 0;
  if(t<fast)return .5+.5*Math.sin((t-start)*Math.PI*2/2);
  if(t<aim)return .5+.5*Math.sin((t-fast)*Math.PI*2);
  // 74.6秒から1秒かけて上げきり、そのあとは最大のまま。
  const from=.5+.5*Math.sin((aim-fast)*Math.PI*2);
  return from+(1-from)*clamp(t-aim);
}

/** とどめの回より前の、核のふだんの脈打ち（0〜1）。1秒に2回ほどの速い脈。 */
export const idlePulse=(t:number)=>.5+.5*Math.sin(t*12);
/** ふだんの脈から、とどめの回の明滅へ移り変わる長さ（秒）。 */
export const CORE_BLEND=.3;
/**
 * 核の明るさの脈（0〜1）。56秒の手前0.3秒で、速い脈からとどめの回の明滅へ混ぜて移る。
 * 56秒より後で混ぜると、速い脈が56秒をまたいで残り、境目で明るさが大きく動いてしまう。
 */
export function corePulse(t:number) {
  const start=FINISH.start/1000;
  if(t<start-CORE_BLEND)return idlePulse(t);
  const u=smooth(clamp((t-(start-CORE_BLEND))/CORE_BLEND));
  // 56秒より前の coreBlink は0なので、混ぜ先は56秒の値（0.5）から始める。
  return idlePulse(t)*(1-u)+coreBlink(Math.max(t,start))*u;
}

/** 膝をついてから手前へ倒れるまでの進み具合（0〜1）。控えめモードでも減らさない。 */
export const fallAt=(t:number)=>smooth(clamp((t-FALL_FROM)/(FALL_TO-FALL_FROM)));

/**
 * とどめの回の白飛び。4回の命中はそれぞれ短い白、とどめの一撃は白→属性色→白の三段。
 * 命中点の丸い光だけでは当たった実感が薄いので、騎士の形の上だけを白く飛ばす。
 */
export const FINISH_FLASH={hit:.08,hitAlpha:.5,blow:.15};
/** その時刻の、とどめの白飛びの濃さと、属性色の段かどうか。控えめモードの割引はここでは掛けない。 */
export function finishFlashAt(t:number) {
  for(const at of FINISH_HIT_MS) {
    const since=t-at/1000;
    if(since>=0&&since<FINISH_FLASH.hit)return {alpha:FINISH_FLASH.hitAlpha,tint:false};
  }
  const since=t-FINAL_BLOW_AT;
  if(since>=0&&since<FINISH_FLASH.blow) {
    const step=Math.min(2,Math.floor(since/(FINISH_FLASH.blow/3)));
    return {alpha:.85-step*.2,tint:step===1};
  }
  return {alpha:0,tint:false};
}

/**
 * 防御の回（29秒以降）の姿勢。順に姿勢を移すだけで、入力では変えない。
 * 「返せ」で弾き返したときだけ、騎士が自分の一撃を受けて短くひるむ。
 */
export function guardPose(ms:number,reduced=false,style:'block'|'reflect'|'erase'='block') {
  const t=ms/1000;
  let index=0;
  for(let i=0;i<GUARD_STEPS.length;i++)if(t>=GUARD_STEPS[i].at)index=i;
  const step=GUARD_STEPS[index],previous=GUARD_STEPS[Math.max(0,index-1)];
  const u=smooth((t-step.at)/step.ramp);
  const weights=new Array(POSES.length).fill(0);
  weights[previous.pose]+=1-u;weights[step.pose]+=u;
  // 待機（姿勢0）が残っている間は、一回目と同じ息づかいを混ぜる。
  // 混ぜないと、待機から構えへ移る時刻で息づかいの分だけ姿勢が一コマで飛ぶ。
  // 構えより後ろの姿勢に姿勢0は混ざらないので、そこから先は何も変わらない。
  const sway=idleSway(ms,reduced);
  if(sway>0&&weights[0]>0){const move=weights[0]*sway;weights[0]-=move;weights[9]+=move;}
  // 溜めの間は剣が低く脈打つ。毎秒1回まで。
  const charging=index===2?smooth((t-GUARD_STEPS[2].at)/2):0;
  // 弾かれた瞬間だけ押し戻される。
  const hitAt=DEFEND.impact/1000;
  const repel=t>=hitAt?Math.max(0,1-(t-hitAt)/1.2):0;
  // 弾き返しでは、戻ってきた一撃を受けて白く光る。
  const back=style==='reflect'?t-REFLECT_BACK_AT:-1;
  const struck=back>=0&&back<.7;
  const stepIndex=struck&&back<.15?Math.floor(back/.05):-1;
  // 控えめモードでは、白飛びを3分の1にして残像を出さない。動きはもともと止めてある。
  const soft=reduced?1/3:1,weak=WEAKPOINT_MS/1000;
  const flash=struck?Math.max(0,1-back/.24)*soft:0;
  // 崩れ落ち。膝をついてから手前へ倒れる進み具合。倒れきったら呼吸の揺れも止める。
  const fall=fallAt(t),still=1-fall;
  // とどめの4回の命中と直撃の白飛び。防御の弾き返しとは時刻が離れているが、念のため濃いほうを使う。
  const blast=finishFlashAt(t);
  return {weights,lean:reduced?0:repel*.35,
    // 0に丸めるときに符号が残らないよう、0を足しておく。
    breath:reduced?0:(Math.sin(ms*.0016)*.003+charging*Math.sin(t*Math.PI*2)*.004)*still+0,
    flash,fall,still,blink:corePulse(t),
    // shakeは体の細かい震え。一回目と同じ作り方にする。
    shake:reduced?0:flash*.028,
    // 崩れ始めと倒れきった後は、とどめの回だけの名前にする。ブラウザーの試験はこれを見る。
    state:t>=FALL_TO?'down':index>=7?'collapse':index>=6?'exposed':index===5?'recover':index===4?'repel':index===3?'swing':index===2?'charge':index===1?'guard':'idle',
    strength:.5,push:reduced?0:repel*.5+(struck?Math.max(0,1-back/.3)*.3:0),collapse:0,
    spin:reduced?0:repel*2.2,
    flashAlpha:Math.max(stepIndex<0?0:(.85-stepIndex*.2)*.75*soft,blast.alpha*soft),flashTint:stepIndex===1||blast.tint?1:0,
    ghost:reduced||!struck?0:back<.3?1-back/.3:0,
    // 弱点の輪郭の光は、回の終わりまでに0へ戻す。結果を出したまま待つ間、毎コマ形を塗り直さないため。
    rim:t>=weak?smooth((t-weak)/.5)*(1-smooth((t-weak-.5)/.5))*.5:struck?1-smooth(back/.6):0};
}
const POSE_KEYS=Object.keys(POSES[0]) as Array<keyof Pose>;
/** 重みから実際の角度を出す。描くときと、試験で姿勢を確かめるときに使う。 */
export const blendPose=(weights:number[]):Pose=>{
  const result={} as Pose;
  for(const key of POSE_KEYS)result[key]=POSES.reduce((sum,pose,i)=>sum+pose[key]*weights[i],0);
  return result;
};

// 一枚絵の騎士と同じ位置に立たせる。角の先まで2.93mとし、足元を画面の高さの71.4%、頭の先を5.2%へ置く。
const HEIGHT=2.93,FOOT=.714,CROWN=.052,TAN=.3205,BACKDROP_RATIO=1672/941;
const DEPTH=HEIGHT/((FOOT-.5)*2+(.5-CROWN)*2),CAMERA_Y=(FOOT-.5)*2*DEPTH,CAMERA_Z=-DEPTH/TAN;

/** 騎士をどこへどう置くか。足元の位置、吹き飛びのずれ、縮み、回りを一つにまとめたもの。 */
export type KnightTransform={x:number;y:number;scale:number;rot:number;footX:number;footY:number};

/**
 * 姿勢から騎士の置き方を出す。純粋な計算で、描く絵も命中の位置もこの一つだけを見る。
 * 奥へ（上へ）押されて少し縮み、崩れるときは沈む。回りの軸は足元。
 * width と height は描く面の大きさ（点の数）、unit は画面1pxあたりの点の数。
 */
export function knightTransform(pose:{push:number;collapse:number;strength:number;spin:number},width:number,height:number,unit=1):KnightTransform {
  return {x:0,y:(-pose.push*(4+pose.strength*7)+pose.collapse*11)*unit,
    scale:1-pose.push*.03-pose.collapse*.02,rot:pose.spin*Math.PI/180,
    footX:width/2,footY:height*FOOT};
}

/** 置き方をcanvasの行列にする。足元を軸に回して縮め、吹き飛びの分だけずらす。 */
export function knightMatrix(t:KnightTransform) {
  const cos=Math.cos(t.rot),sin=Math.sin(t.rot);
  const a=cos*t.scale,b=sin*t.scale,c=-sin*t.scale,d=cos*t.scale;
  return {a,b,c,d,e:t.footX+t.x-(a*t.footX+c*t.footY),f:t.footY+t.y-(b*t.footX+d*t.footY)};
}

/** 同じ行列を点へ当てる。胸の核（命中の位置）を動かすのに使う。 */
export function knightPoint(t:KnightTransform,x:number,y:number) {
  const m=knightMatrix(t);
  return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};
}

/** 遺跡の敵。外部の素材を読み込まず、角柱・円錐・半球だけで鎧の形を組む。 */
export class Knight {
  private engine:Engine;
  private scene:Scene;
  private camera:FreeCamera;
  private root:TransformNode;
  private body:TransformNode;
  private head:TransformNode;
  private swordArm:TransformNode;
  private shieldArm:TransformNode;
  private core:Mesh;
  /** 弱点を出すときに動かす胸当てと胸の線、途中で折れる兜の角。 */
  private chestPlate:Mesh|null=null;
  private chestLines:Mesh[]=[];
  private horns:Mesh[]=[];
  private armor:StandardMaterial;
  private coreMaterial:StandardMaterial;
  private eyes:StandardMaterial;
  private burst:PointLight;
  readonly ready:Promise<void>;
  // 立体の騎士は画面に出さないcanvasへ描き、その絵を表に出すcanvasへ重ねて仕上げる。
  private source=document.createElement('canvas');
  private view:CanvasRenderingContext2D|null;
  // 白いシルエットと属性色の影を作る使い回しの小さなcanvas。毎コマ作り直さない。
  private stencil=document.createElement('canvas');
  private stencilContext:CanvasRenderingContext2D|null;
  private trail:KnightTransform[]=[];
  /** とどめの回で落ちる部品。落ちた後は親から外し、重力で床まで落として止める。 */
  private parts:Part[]=[];
  /** 部品を名前で引く表。毎コマ一覧を探し直さない。 */
  private partOf=new Map<DropKey,Part>();
  /** 今落ちている部品。毎コマの分岐で使う。 */
  private down=new Set<DropKey>();
  private cssSize='';
  target={x:.5,y:.32};
  /** 控えめモード。このPCの「動きを減らす」設定を始めの値にし、あとは setCalm で切り替える。 */
  private calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** 見た目の設定（控えめ・派手・最大）。演出canvasと同じものを外から渡す。 */
  private preset:EffectPreset=getPreset(null);
  constructor(private canvas:HTMLCanvasElement) {
    this.source.width=this.source.height=16;
    this.view=canvas.getContext('2d');
    this.stencilContext=this.stencil.getContext('2d');
    // 描いた絵をそのまま取り出すため、描画面を残す設定にする。
    this.engine=new Engine(this.source,true,{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
    this.scene=new Scene(this.engine);
    // 背景の一枚絵を透かすため、描画面は透明のままにする。
    this.scene.clearColor=new Color4(0,0,0,0);
    this.camera=new FreeCamera('固定視点',new Vector3(0,CAMERA_Y,CAMERA_Z),this.scene);
    this.camera.setTarget(new Vector3(0,CAMERA_Y,0));

    const sky=new HemisphericLight('空の光',new Vector3(.15,1,-.4),this.scene);
    sky.intensity=.42;sky.diffuse=new Color3(.54,.62,.74);sky.groundColor=new Color3(.09,.11,.15);sky.specular=new Color3(.15,.17,.21);
    // 背景は空が明るく騎士は逆光。上と奥の面を強く起こし、手前は弱い光だけで形を見せる。
    const back=new DirectionalLight('奥からの光',new Vector3(-.3,-.7,-1),this.scene);
    back.intensity=1.02;back.diffuse=new Color3(.82,.88,.98);
    const fill=new DirectionalLight('床からの照り返し',new Vector3(.45,-.35,1),this.scene);
    fill.intensity=.66;fill.diffuse=new Color3(.44,.49,.57);fill.specular=new Color3(.09,.1,.13);
    fill.position=new Vector3(-2.4,3.4,-3.6);
    // 手前の光だけ影を落とす。剣や盾の影が体に掛かり、厚みが出る。
    const shadows=new ShadowGenerator(1024,fill);
    shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
    shadows.darkness=.24;shadows.bias=.0009;
    // 遠い面ほど空気の色を混ぜる。背中側と裾が背景へ溶け、貼り付けたように見えなくなる。
    this.scene.fogMode=Scene.FOGMODE_LINEAR;this.scene.fogColor=new Color3(.42,.45,.5);
    this.scene.fogStart=6.2;this.scene.fogEnd=13;
    // 蓄積と命中のときだけ胸の前から照らす。色は魔法の属性に合わせる。
    this.burst=new PointLight('魔法の光',new Vector3(0,2,-1.5),this.scene);this.burst.intensity=0;this.burst.range=5;

    // 空と床を写した小さな絵を6面ぶん作り、金属の映り込みに使う。外部のファイルは使わない。
    const paint=(stops:Array<[number,string]>)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const context=canvas.getContext('2d')!,gradient=context.createLinearGradient(0,0,0,64);
      for(const [at,color] of stops)gradient.addColorStop(at,color);
      context.fillStyle=gradient;context.fillRect(0,0,64,64);return canvas.toDataURL();
    };
    const side=paint([[0,'#cdd6df'],[.42,'#93a0ad'],[.52,'#4e5866'],[1,'#191d23']]);
    const backdrop=paint([[0,'#e8eef4'],[.44,'#a9b6c2'],[.52,'#525d6b'],[1,'#1a1e25']]);
    const sight=CubeTextureCreateFromImages([side,paint([[0,'#a3adb8'],[1,'#8a939e']]),backdrop,side,paint([[0,'#15181d'],[1,'#0f1216']]),side],this.scene);
    sight.level=.3;

    // 汚れとてかりむらの絵を描く。これも外部のファイルを持たず、起動時にその場で描く。
    // 同じ並びになるよう、乱数は決まった種から作る。
    let seed=20260920;const rnd=()=>(seed=seed*48271%2147483647)/2147483647;
    const SHEET=256;
    // 端と端がつながるよう、大きな図形は上下左右へ回り込ませて9回描く。
    const wrapOn=(c:CanvasRenderingContext2D)=>(f:()=>void)=>{
      for(let x=-1;x<2;x++)for(let y=-1;y<2;y++){c.save();c.translate(x*SHEET,y*SHEET);f();c.restore();}
    };
    const sheet=(name:string,base:string,draw:(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>void)=>{
      const texture=new DynamicTexture(name,{width:SHEET,height:SHEET},this.scene,true);
      const c=texture.getContext() as CanvasRenderingContext2D;
      c.fillStyle=base;c.fillRect(0,0,SHEET,SHEET);
      draw(c,wrapOn(c));texture.update();return texture;
    };
    // でこぼこの絵。白黒で高さを描いてから、隣との差で面の向きに直す。
    // 色を暗くするのではなく光の当たり方を変えるので、遠目でも凹凸が分かる。
    const relief=(name:string,depth:number,draw:(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>void)=>{
      const height=document.createElement('canvas');height.width=height.height=SHEET;
      const hc=height.getContext('2d')!;hc.fillStyle='#808080';hc.fillRect(0,0,SHEET,SHEET);
      draw(hc,wrapOn(hc));
      const src=hc.getImageData(0,0,SHEET,SHEET).data;
      const at=(x:number,y:number)=>src[(((y+SHEET)%SHEET)*SHEET+(x+SHEET)%SHEET)*4];
      const texture=new DynamicTexture(name,{width:SHEET,height:SHEET},this.scene,true);
      const c=texture.getContext() as CanvasRenderingContext2D,out=c.createImageData(SHEET,SHEET);
      for(let y=0;y<SHEET;y++)for(let x=0;x<SHEET;x++) {
        const dx=(at(x+1,y)-at(x-1,y))/255*depth,dy=(at(x,y+1)-at(x,y-1))/255*depth;
        const len=Math.hypot(dx,dy,1),i=(y*SHEET+x)*4;
        // 縦は絵が上下入れ替わって貼られるぶん、符号を逆にする。ここを間違えるとへこみが出っぱりに見える。
        out.data[i]=(-dx/len*.5+.5)*255;out.data[i+1]=(dy/len*.5+.5)*255;out.data[i+2]=(1/len*.5+.5)*255;out.data[i+3]=255;
      }
      c.putImageData(out,0,0);texture.update();return texture;
    };
    const blot=(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number)=>{
      const g=c.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,color.replace('A',String(alpha)));g.addColorStop(1,color.replace('A','0'));
      c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    };
    // 汚れ。しみと細かいざらつきで、広い面のべた塗りを崩す。紋章や飾りの絵でも下地に使う。
    const paintGrime=(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>{
      for(let i=0;i<20;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=26+rnd()*74,a=.34+rnd()*.44;
        wrap(()=>blot(c,x,y,r,'rgba(18,16,14,A)',a));}
      for(let i=0;i<14;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=20+rnd()*46;
        wrap(()=>blot(c,x,y,r,'rgba(255,250,238,A)',.24+rnd()*.34));}
      // 縦に流れた跡。上下は切れ目なくつながる。
      for(let i=0;i<10;i++){const x=rnd()*SHEET,w=3+rnd()*12;
        c.fillStyle=`rgba(24,22,20,${(.14+rnd()*.24).toFixed(3)})`;c.fillRect(x,0,w,SHEET);}
      for(let i=0;i<1400;i++){const v=rnd()<.5?'0,0,0':'255,255,255';
        c.fillStyle=`rgba(${v},${(.06+rnd()*.16).toFixed(3)})`;c.fillRect(rnd()*SHEET,rnd()*SHEET,2+rnd()*4,2+rnd()*4);}
    };
    const grime=sheet('汚れ','#e6e6e6',paintGrime);
    // てかりむら。磨けた所と曇った所を作り、細い擦り傷を走らせる。
    const shine=sheet('てかりむら','#a8a8a8',(c,wrap)=>{
      for(let i=0;i<12;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=30+rnd()*64;
        wrap(()=>blot(c,x,y,r,'rgba(0,0,0,A)',.38+rnd()*.42));}
      for(let i=0;i<10;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=24+rnd()*50;
        wrap(()=>blot(c,x,y,r,'rgba(255,255,255,A)',.32+rnd()*.42));}
      c.lineWidth=2;
      for(let i=0;i<44;i++){
        const x=rnd()*SHEET,y=rnd()*SHEET,a=(rnd()-.5)*.7+(rnd()<.5?0:Math.PI/2),len=40+rnd()*130;
        c.strokeStyle=`rgba(255,255,255,${(.14+rnd()*.32).toFixed(3)})`;
        wrap(()=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();});
      }
    });

    // 打ち傷のへこみ、擦り傷、鋳物のざらつき。
    const paintDents=(c:CanvasRenderingContext2D,wrap:(f:()=>void)=>void)=>{
      for(let i=0;i<10;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=18+rnd()*40;
        wrap(()=>blot(c,x,y,r,'rgba(0,0,0,A)',.5+rnd()*.4));}
      for(let i=0;i<18;i++){const x=rnd()*SHEET,y=rnd()*SHEET,r=5+rnd()*12;
        wrap(()=>blot(c,x,y,r,rnd()<.6?'rgba(0,0,0,A)':'rgba(255,255,255,A)',.35+rnd()*.45));}
      c.lineWidth=2;
      for(let i=0;i<40;i++) {
        const x=rnd()*SHEET,y=rnd()*SHEET,a=(rnd()-.5)*.5+(rnd()<.5?0:Math.PI/2),len=30+rnd()*120;
        c.strokeStyle=`rgba(0,0,0,${(.3+rnd()*.5).toFixed(3)})`;
        wrap(()=>{c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len);c.stroke();});
      }
      for(let i=0;i<2200;i++){const v=rnd()<.5?'0,0,0':'255,255,255';
        c.fillStyle=`rgba(${v},${(.08+rnd()*.16).toFixed(3)})`;c.fillRect(rnd()*SHEET,rnd()*SHEET,1+rnd()*3,1+rnd()*3);}
    };
    const dents=relief('でこぼこ',4,paintDents);
    dents.level=.6;

    // 盾の紋章。術式と同じ丸と三角を彫る。絵の真ん中が盾の面の真ん中に来る。
    // 絵は上下が入れ替わって貼られるので、三角は絵の下向きに描くと盾では上を向く。
    const crest=(c:CanvasRenderingContext2D,color:string,width:number)=>{
      c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';
      for(const r of [76,65]){c.beginPath();c.arc(128,128,r,0,Math.PI*2);c.stroke();}
      c.beginPath();
      for(let i=0;i<3;i++){
        const a=Math.PI/2+i*Math.PI*2/3,x=128+Math.cos(a)*56,y=128+Math.sin(a)*56;
        if(i)c.lineTo(x,y);else c.moveTo(x,y);
      }
      c.closePath();c.stroke();
      c.beginPath();c.arc(128,128,17,0,Math.PI*2);c.stroke();
      // 上下左右の短い印。
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;c.beginPath();
        c.moveTo(128+Math.cos(a)*82,128+Math.sin(a)*82);c.lineTo(128+Math.cos(a)*93,128+Math.sin(a)*93);c.stroke();
      }
    };
    const emblem=sheet('盾の絵','#e6e6e6',(c,wrap)=>{paintGrime(c,wrap);crest(c,'rgba(96,76,38,.5)',7);});
    const emblemDents=relief('盾のでこぼこ',4,(c,wrap)=>{paintDents(c,wrap);crest(c,'rgba(0,0,0,.7)',7);});
    emblemDents.level=.75;

    // 帯の飾り。同じ形を横へ8つ並べる。横は帯を一周する向き。
    const braid=sheet('帯の飾り','#e0e0e0',(c,wrap)=>{
      paintGrime(c,wrap);
      c.fillStyle='rgba(60,46,18,.55)';c.fillRect(0,0,SHEET,26);c.fillRect(0,SHEET-26,SHEET,26);
      c.strokeStyle='rgba(255,246,214,.3)';c.lineWidth=3;
      c.beginPath();c.moveTo(0,28);c.lineTo(SHEET,28);c.moveTo(0,SHEET-28);c.lineTo(SHEET,SHEET-28);c.stroke();
      for(let i=0;i<8;i++) {
        const x=i*SHEET/8+SHEET/16;
        c.fillStyle='rgba(44,32,10,.66)';
        c.beginPath();c.moveTo(x,54);c.lineTo(x+15,128);c.lineTo(x,202);c.lineTo(x-15,128);c.closePath();c.fill();
        c.fillStyle='rgba(255,246,214,.45)';
        c.beginPath();c.arc(x,128,8,0,Math.PI*2);c.fill();
      }
    });

    // 腰布の裾を欠けさせる。絵の左端が裾の先で、縦に並ぶ方向が裾を一周する向き。
    const tatter=sheet('腰布の絵','#e6e6e6',(c,wrap)=>{
      paintGrime(c,wrap);
      c.globalCompositeOperation='destination-out';
      c.fillStyle='#000';
      // 裾全体をゆるく波打たせてから、深さの違う欠けを不ぞろいに入れる。
      c.beginPath();c.moveTo(-2,-2);
      for(let y=0;y<=SHEET;y+=8)c.lineTo(5+Math.sin(y/SHEET*Math.PI*4)*4+Math.sin(y/SHEET*Math.PI*14)*2,y);
      c.lineTo(-2,SHEET+2);c.closePath();c.fill();
      const notch=(at:number,deep:number,half:number)=>{
        c.beginPath();c.moveTo(-2,at-half);c.quadraticCurveTo(deep*.55,at-half*.25,deep,at);
        c.quadraticCurveTo(deep*.55,at+half*.25,-2,at+half);c.closePath();c.fill();
      };
      for(let y=rnd()*10;y<SHEET;y+=5+rnd()*15) {
        const chance=rnd(),deep=chance<.34?10+rnd()*14:chance<.8?22+rnd()*22:44+rnd()*26;
        const half=4+rnd()*(deep<26?6:11);
        // 一周する向き（縦）だけ回り込ませる。横へ回すと腰側の端まで欠ける。
        notch(y,deep,half);
        if(y-half<0)notch(y+SHEET,deep,half);
        if(y+half>SHEET)notch(y-SHEET,deep,half);
      }
      c.globalCompositeOperation='source-over';
    });
    tatter.hasAlpha=true;

    const material=(name:string,color:string,specular=.24,rim=0)=>{
      const m=new StandardMaterial(name,this.scene);
      m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(specular,specular*1.06,specular*1.14);m.specularPower=46;
      // 逆光の縁だけを明るくする。暗い鎧のまま輪郭を見せるための設定。
      if(rim){m.emissiveColor=new Color3(.26*rim,.32*rim,.4*rim);m.emissiveFresnelParameters=new FresnelParameters({bias:.35,power:1.9,leftColor:Color3.White(),rightColor:Color3.Black()});}
      return m;
    };
    // 汚れとてかりむらを貼る。色は材質の色に掛かり、てかりは場所ごとに強弱が付く。
    const worn=(m:StandardMaterial,shiny=true,paint=grime,relief=dents)=>{
      m.diffuseTexture=paint;m.bumpTexture=relief;
      if(shiny)m.specularTexture=shine;
      return m;
    };
    // 同じ見た目の材質は数値を1か所にまとめ、片方だけ直してしまうのを防ぐ。
    const GOLD=['#8c7749',.36,.7] as const,STEEL=['#8a919d',.48,1.2] as const,FABRIC=['#393c47',.05,.6] as const;
    // 金属には空と床を映り込ませる。正面より縁のほうが強く映る。
    const metal=(m:StandardMaterial,strength=1)=>{
      m.reflectionTexture=sight;
      m.reflectionFresnelParameters=new FresnelParameters({bias:.06,power:2.2,
        leftColor:new Color3(strength,strength,strength),rightColor:new Color3(.13*strength,.15*strength,.18*strength)});
      return m;
    };
    this.armor=worn(metal(material('鎧','#5c6069',.3,1)));
    const plate=worn(metal(material('当て板','#464955',.23,.8),.8));
    const cloth=worn(material('布',...FABRIC),false);cloth.backFaceCulling=false;
    // 腰布は裾を欠かせる。透けさせるのではなく、絵の薄い所を描かない形にして、重なりの順番で困らないようにする。
    const skirt=worn(material('腰布',...FABRIC),false,tatter);skirt.backFaceCulling=false;
    skirt.transparencyMode=StandardMaterial.MATERIAL_ALPHATEST;skirt.alphaCutOff=.45;
    const hollow=material('隙間','#0b0f16',.02);hollow.emissiveColor=new Color3(.52,.23,.07);
    this.eyes=hollow;
    const trim=worn(metal(material('金の縁',...GOLD),.9));
    const beltTrim=worn(metal(material('帯の飾り',...GOLD),.9),true,braid);
    const steel=worn(metal(material('刃と縁',...STEEL),1.3));
    const shieldPlate=worn(metal(material('盾の面',...STEEL),1.3),true,emblem,emblemDents);
    this.coreMaterial=material('胸の核','#2a2418',.1);this.coreMaterial.emissiveColor=Color3.FromHexString('#6f542e');

    this.root=new TransformNode('遺跡の騎士',this.scene);
    // 真正面だと板に見えるため、体をわずかに振っておく。
    this.root.rotation.y=.14;
    const box=(name:string,parent:TransformNode,x:number,y:number,z:number,w:number,h:number,d:number,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };
    // 角柱。上下の太さを変えて鎧のすぼまりを作る。上を0にすると角や棘になる。
    const cone=(name:string,parent:TransformNode,x:number,y:number,z:number,top:number,bottom:number,h:number,sides=12,mat=this.armor)=>{
      const mesh=MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height:h,tessellation:sides},this.scene);
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.rotation.y=Math.PI/sides;mesh.material=mat;return mesh;
    };
    // 横から見た輪郭の線を回して作る部品。角柱より滑らかになり、線に段を付けると重ね板になる。
    // 数の組は[中心からの距離, 高さ]で、下から上へ並べる。
    const lathe=(name:string,parent:TransformNode,x:number,y:number,z:number,profile:number[][],mat=this.armor,cap=Mesh.CAP_ALL,sides=20)=>{
      const mesh=MeshBuilder.CreateLathe(name,{shape:profile.map(p=>new Vector3(p[0],p[1],0)),tessellation:sides,cap},this.scene);
      // 面ごとに平らに塗る。輪郭は丸いまま、板を張り合わせた鎧に見える。
      mesh.convertToFlatShadedMesh();
      mesh.parent=parent;mesh.position.set(x,y,z);mesh.material=mat;return mesh;
    };

    // 脚。左右で前後と開きを変え、まっすぐ立たせない。
    for(const side of [-1,1]) {
      const back=side<0?-.07:.09,open=side*.05;
      const leg=new TransformNode('脚',this.scene);leg.parent=this.root;leg.position.set(side*.22,0,back);leg.rotation.z=open;
      cone('腿',leg,0,.98,0,.32,.26,.78);
      const knee=MeshBuilder.CreateSphere('膝当て',{diameter:.31,segments:12},this.scene);
      knee.parent=leg;knee.position.set(0,.57,-.03);knee.scaling.set(1,.75,1.1);knee.material=plate;
      const shin=cone('脛当て',leg,side*.02,.32,0,.28,.23,.44);shin.rotation.z=-open*1.4;
      const foot=new TransformNode('足',this.scene);foot.parent=leg;foot.position.set(side*.03,0,-.02);foot.rotation.y=-side*.2;
      box('具足',foot,0,.1,-.06,.32,.2,.46,plate);
      cone('具足の先',foot,0,.07,-.36,.1,.3,.24,4,plate).rotation.set(-Math.PI/2,0,0);
    }
    // 腰。輪郭に段を3つ付けて重ね板にし、その下に布を長く垂らす。元絵の裾広がりに合わせる。
    lathe('腰の板',this.root,0,1.35,0,[[.45,-.25],[.42,-.24],[.44,-.19],[.4,-.13],[.37,-.12],[.39,-.07],[.35,-.01],[.33,0],[.34,.05],[.31,.12],[.28,.2],[.27,.25]]);
    lathe('腰布',this.root,0,.85,0,[[.6,-.44],[.57,-.3],[.53,-.12],[.49,.08],[.46,.28],[.44,.44]],skirt,Mesh.NO_CAP);
    cone('帯',this.root,0,1.6,0,.54,.58,.12,16,beltTrim);
    cone('腹',this.root,0,1.72,0,.48,.52,.2,12,plate);

    this.body=new TransformNode('上半身',this.scene);this.body.parent=this.root;this.body.position.y=1.72;
    // 胸は丸みのある胸当て。前後を薄くして、板ではなく鎧の膨らみに見せる。
    // 防御の回の終わりに、この胸当てごと前へ外して弱点（核）を見せる。
    this.chestPlate=lathe('胸',this.body,0,.3,0,[[.2,-.33],[.26,-.25],[.31,-.12],[.33,.02],[.31,.14],[.33,.15],[.28,.25],[.16,.31],[0,.33]],this.armor,Mesh.CAP_ALL,16);
    this.chestPlate.scaling.z=.78;
    // 金の線。核を頂点にしたV字で、狙う場所を分かりやすくする。
    for(const side of [-1,1]) {
      const line=box('胸の線',this.body,side*.1,.38,-.28,.035,.4,.03,trim);line.rotation.set(-.12,0,side*.42);
      this.chestLines.push(line);
    }
    this.core=MeshBuilder.CreateSphere('胸の核',{diameter:.15,segments:16},this.scene);
    this.core.parent=this.body;this.core.position.set(0,.2,-.28);this.core.material=this.coreMaterial;
    lathe('喉当て',this.body,0,.66,-.01,[[.13,-.09],[.18,-.04],[.2,.02],[.17,.08],[.14,.1]],plate);

    // 背中のマント。半分だけの角柱を後ろへ回し、肩から裾へ広げる。
    const cape=MeshBuilder.CreateCylinder('マント',{diameterTop:.72,diameterBottom:1.3,height:1.38,tessellation:6,arc:.5},this.scene);
    // 半円は手前から時計回りに作られるため、半回転させて背中側へ回す。
    cape.parent=this.body;cape.position.set(0,-.06,.09);cape.rotation.set(-.05,Math.PI,0);cape.material=cloth;

    this.head=new TransformNode('首',this.scene);this.head.parent=this.body;this.head.position.y=.74;
    lathe('兜',this.head,0,.16,0,[[0,-.13],[.23,-.13],[.25,-.09],[.22,-.05],[.235,.03],[.225,.12],[.19,.21],[.12,.28],[0,.31]],this.armor,Mesh.CAP_ALL,16);
    for(const side of [-1,1])box('兜の目',this.head,side*.07,.13,-.235,.09,.05,.04,hollow);
    // 面。前へ尖らせて、平らな顔に見えないようにする。
    const face=cone('面覆い',this.head,0,.08,-.18,0,.3,.26,4,plate);face.rotation.set(-Math.PI/2,0,0);
    // 兜の角。外へ開きながら後ろへ寝かせる。
    for(const side of [-1,1]) {
      const horn=cone('兜の角',this.head,side*.17,.23,.05,0,.14,.34,6,plate);horn.rotation.set(.45,0,-side*.55);
      this.horns.push(horn);
    }
    cone('頭頂の先',this.head,0,.32,-.02,0,.11,.13,6,plate);

    // 腕は肩と肘の2段。肘を少し前へ曲げ、手の位置から剣と盾を下げる。
    const arm=(name:string,side:number)=>{
      const node=new TransformNode(name,this.scene);
      node.parent=this.body;node.position.set(side*.35,.32,0);
      // 肩当ては丸い肩の下へ板を2枚重ねた輪郭。盾側だけ少し大きくする。
      const big=side>0?1.12:1;
      const pauldron=lathe('肩当て',node,side*.03,.04,0,[[.26,-.21],[.21,-.19],[.2,-.15],[.25,-.13],[.19,-.11],[.185,-.07],[.23,-.05],[.18,-.03],[.19,.02],[.175,.08],[.13,.13],[0,.16]],this.armor,Mesh.CAP_ALL,16);
      pauldron.scaling.set(big,.9*big,1.05*big);
      const spike=cone('肩の棘',node,side*.18,.08,0,0,.11,.19,6,plate);spike.rotation.set(0,0,-side*1.1);
      cone('上腕',node,side*.01,-.27,0,.22,.19,.4,12,plate);
      const elbow=new TransformNode(name+'の肘',this.scene);
      elbow.parent=node;elbow.position.set(side*.02,-.46,0);elbow.rotation.x=.26;
      cone('肘当て',elbow,0,0,0,.22,.21,.1);
      cone('前腕',elbow,side*.01,-.24,0,.21,.17,.42);
      // 肩の棘は、とどめの一発目で落とすので取り出せるようにする。
      return [node,elbow,spike] as [TransformNode,TransformNode,Mesh];
    };
    const [swordShoulder,swordHand,swordSpike]=arm('剣を持つ腕',-1);this.swordArm=swordShoulder;
    const sword=new TransformNode('剣',this.scene);sword.parent=swordHand;sword.position.set(-.04,-.46,-.03);sword.rotation.z=-.26;
    // 柄は両手で握れる長さ。柄頭も大きくして、剣全体の重さを出す。
    cone('握り',sword,0,.11,0,.075,.085,.28,10,plate);
    cone('柄頭',sword,0,.29,0,.13,.07,.1,10,trim);
    box('鍔',sword,0,-.04,0,.54,.08,.12,trim);
    for(const side of [-1,1]) {
      const tip=cone('鍔の先',sword,side*.29,-.04,0,.02,.11,.1,6,trim);tip.rotation.set(0,0,side*Math.PI/2);
    }
    // 刃は幅の広い身と先の三角に分ける。細いと画面の中でただの線に見える。
    const blade=cone('刃',sword,0,-.73,0,.28,.25,1.14,4,steel);blade.scaling.z=.2;
    const point=cone('切っ先',sword,0,-1.45,0,.25,.02,.31,4,steel);point.scaling.z=.2;
    const [shieldShoulder,shieldHand]=arm('盾を持つ腕',1);this.shieldArm=shieldShoulder;
    // 盾は四角柱を平たくし、縦へ伸ばした凧形。金の縁と中央の飾りを重ねる。
    const mount=new TransformNode('盾の取り付け',this.scene);mount.parent=shieldHand;mount.position.set(.3,-.3,-.2);mount.rotation.set(-.24,-.34,.1);
    const shield=new TransformNode('盾',this.scene);shield.parent=mount;shield.rotation.x=Math.PI/2;
    // 縦へ伸ばす拡大と、五角形を回す回転を別の節に分ける。上が広く下が尖った形になる。
    const stretch=new TransformNode('盾の伸ばし',this.scene);stretch.parent=shield;stretch.scaling.set(.96,1,1.26);
    const spin=new TransformNode('盾の向き',this.scene);spin.parent=stretch;spin.rotation.y=-.314;
    // 手前の面を一回り小さくして、縁に斜めの面を作る。平らな板に光の段が付く。
    const shieldFace=MeshBuilder.CreateCylinder('盾の面',{diameterTop:.96,diameterBottom:.86,height:.13,tessellation:5},this.scene);
    shieldFace.parent=spin;shieldFace.material=shieldPlate;
    const edge=MeshBuilder.CreateCylinder('盾の縁',{diameter:1,height:.05,tessellation:5},this.scene);
    edge.parent=spin;edge.position.y=.03;edge.material=trim;
    // 角の鋲。5つ置くと、のっぺりした板に見えなくなる。
    for(let i=0;i<5;i++) {
      const angle=Math.PI*2*i/5;
      const stud=MeshBuilder.CreateCylinder('盾の鋲',{diameterTop:.05,diameterBottom:.09,height:.05,tessellation:8},this.scene);
      stud.parent=spin;stud.position.set(Math.cos(-angle)*.34,-.07,Math.sin(-angle)*.34);
      stud.rotation.x=Math.PI;stud.material=trim;
    }
    // 中央の帯は角を立てた隆起にする。左右で明るさが変わり、面が平らに見えなくなる。
    const band=cone('盾の帯',shield,0,-.05,0,.14,.17,1.02,4,this.armor);band.rotation.set(Math.PI/2,0,0);band.scaling.z=.45;
    const boss=MeshBuilder.CreateCylinder('盾の飾り',{diameterTop:.07,diameterBottom:.19,height:.12,tessellation:10},this.scene);
    boss.parent=shield;boss.position.y=-.08;boss.rotation.x=Math.PI;boss.material=trim;

    // 影は一枚の面に濃淡を描いて置く。光源の影計算は使わない。
    const texture=new DynamicTexture('影の濃さ',{width:128,height:128},this.scene,false);
    const context=texture.getContext() as CanvasRenderingContext2D;
    const gradient=context.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.45,'#9a9a9a');gradient.addColorStop(1,'#000000');
    context.fillStyle=gradient;context.fillRect(0,0,128,128);texture.update();texture.getAlphaFromRGB=true;
    const shadowMaterial=new StandardMaterial('影',this.scene);
    shadowMaterial.disableLighting=true;shadowMaterial.diffuseColor=new Color3(0,0,0);shadowMaterial.emissiveColor=new Color3(0,0,0);
    shadowMaterial.opacityTexture=texture;shadowMaterial.alpha=.62;shadowMaterial.fogEnabled=false;
    // 視点が低いため、足元の面は手前へ長く取らないと影が見えない。
    const shadow=MeshBuilder.CreateGround('影',{width:2.3,height:3.2},this.scene);
    shadow.parent=this.root;shadow.position.set(0,.02,-.5);shadow.material=shadowMaterial;

    // 手前の光が落とす影。作った部品はすべて影を出し、影も受ける。足元の丸い影だけは別で、濃淡を描いた面を置いている。
    for(const mesh of this.scene.meshes) {
      if(mesh===shadow)continue;
      shadows.addShadowCaster(mesh as Mesh);mesh.receiveShadows=true;
    }

    // にじむ光は胸の核と兜の隙間だけ。鎧の縁まで広げると輪郭がぼやける。
    const glow=new GlowLayer('核のにじみ',this.scene,{blurKernelSize:24,mainTextureRatio:.35});
    glow.intensity=.75;
    for(const mesh of this.scene.meshes)if(mesh!==this.core&&mesh.name!=='兜の目')glow.addExcludedMesh(mesh as Mesh);

    // とどめの回で落ちる部品を登録する。落ちる速さは部品ごとに決め打ちで、入力では変えない。
    // 腕は体に残し、盾と剣は取り付けの節ごと落とす。腕まで外すと体が円錐に見える。
    this.addPart('shoulderSpike',swordSpike);
    this.addPart('shield',mount);
    this.addPart('horn',this.horns[1]);
    if(this.chestPlate)this.addPart('chestPlate',this.chestPlate);
    this.addPart('core',this.core);
    this.addPart('sword',sword);

    this.resize();
    this.ready=this.scene.whenReadyAsync(true).then(()=>{this.scene.render();});
  }
  /**
   * 落ちる部品を一つ登録する。落ちた後にどこへ戻すかと、傷あとを描く位置の印も一緒に作る。
   * 印は部品と同じ所に置いた見えない節で、部品が落ちた後も傷あとの場所を指し続ける。
   */
  private addPart(key:DropKey,node:TransformNode) {
    const at=FINISH_DROPS.find(drop=>drop.key===key)!.at,v=FINISH_THROWS[key],floor=v.floor;
    const spot=new TransformNode('傷あとの位置',this.scene);
    spot.parent=node.parent;spot.position.copyFrom(node.position);
    const part:Part={key,at,node,home:node.parent as TransformNode|null,
      pos:node.position.clone(),rot:node.rotation.clone(),scale:node.scaling.clone(),spot,v,floor,
      dropped:false,start:node.position.clone(),startRot:node.rotation.clone()};
    this.parts.push(part);this.partOf.set(key,part);
  }
  /**
   * 部品の脱落を時刻から作り直す。落ちる時刻を過ぎたら親から外して落とし、
   * 時刻が戻ったり遊びが終わったりしたら元の所へ付け直す。二回目に遊ぶときも欠けたままにしない。
   */
  private updateParts(t:number,active:boolean,coreOpen:number) {
    for(const part of this.parts) {
      const should=active&&t>=part.at;
      if(should&&!part.dropped) {
        part.dropped=true;this.down.add(part.key);
        if(part.key!=='core') {
          // 親から外す。世界の中の場所と向きはそのまま残る。
          part.node.setParent(null);
          part.start.copyFrom(part.node.position);part.startRot.copyFrom(part.node.rotation);
        }
      } else if(!should&&part.dropped) {
        part.dropped=false;this.down.delete(part.key);
        if(part.key==='core')this.core.setEnabled(true);
        else{part.node.setParent(part.home);part.node.position.copyFrom(part.pos);part.node.rotation.copyFrom(part.rot);part.node.scaling.copyFrom(part.scale);part.node.setEnabled(true);}
      }
      // 落ちるまでは、傷あとの印を部品の今の場所に合わせておく。
      // 胸当てのように途中で動く部品は、組み立てたときの場所のままだと当たった所からずれる。
      if(!part.dropped){part.spot.position.copyFrom(part.node.position);continue;}
      const dt=t-part.at;
      if(part.key==='core') {
        // 核は落とさず、その場で縮んで消す。世界の時計で0.125秒（スロー中なので実際は0.5秒）。
        const gone=clamp(dt/CORE_BREAK_SECONDS);
        this.core.scaling.setAll(Math.max(.001,(1+coreOpen*1.2)*(1-gone)));
        this.core.setEnabled(gone<1);
        continue;
      }
      // 大きい部品は、節の真ん中が床に来ると床へめり込む。止まる高さを部品ごとに上げておく。
      const m=debrisMotion(dt,part.start.y-part.floor,part.v);
      part.node.position.set(part.start.x+m.x,m.y+part.floor,part.start.z+m.z);
      part.node.rotation.set(part.startRot.x+m.rot,part.startRot.y,part.startRot.z+m.rot*.6);
    }
  }
  /** 傷あとを描く場所（表に出す面の中の点）。部品が落ちた後も、当たった所を指し続ける。 */
  private scarSpot(key:DropKey,rw:number,rh:number,w:number,h:number) {
    const part=this.partOf.get(key);if(!part)return null;
    const at=Vector3.Project(part.spot.getAbsolutePosition(),IDENTITY,this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(rw,rh));
    return {x:at.x*w/rw,y:at.y*h/rh};
  }
  resize() {
    const cssWidth=Math.max(1,this.canvas.clientWidth),cssHeight=Math.max(1,this.canvas.clientHeight);
    const ratio=Math.min(devicePixelRatio||1,1.5);
    const width=Math.max(1,Math.round(cssWidth*ratio)),height=Math.max(1,Math.round(cssHeight*ratio));
    this.cssSize=`${cssWidth}x${cssHeight}`;
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    // 立体はここで一回り粗く描く。表に出す面は元の大きさのままなので、写すときに広がってにじむ。
    this.engine.setSize(Math.max(1,Math.round(width/COARSE)),Math.max(1,Math.round(height/COARSE)));
    // 残像と輪郭は形しか使わないので、半分の大きさで足りる。
    this.stencil.width=Math.max(1,Math.round(width/2));this.stencil.height=Math.max(1,Math.round(height/2));
    // 背景の一枚絵と同じ拡大率で騎士を見せる。横長の画面では背景が広がる分だけ寄る。
    const cover=Math.max(1,cssWidth/cssHeight/BACKDROP_RATIO);
    this.camera.fov=2*Math.atan(TAN/cover);
  }
  /** 騎士の形だけを一色で塗った絵を作る。使い回しのcanvasに毎回上書きする。 */
  private paintStencil(color:string) {
    const context=this.stencilContext;if(!context)return null;
    const w=this.stencil.width,h=this.stencil.height;
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    context.clearRect(0,0,w,h);context.drawImage(this.source,0,0,w,h);
    context.globalCompositeOperation='source-in';context.fillStyle=color;context.fillRect(0,0,w,h);
    return this.stencil;
  }
  /** 立体の絵を、吹き飛びと回転、白飛び、残像、輪郭の発光と合わせて表の面へ写す。 */
  private compose(pose:ReturnType<typeof knightPose>,recipe:Recipe|null,spot:KnightTransform,unit:number) {
    const context=this.view;if(!context)return;
    const w=this.canvas.width,h=this.canvas.height;if(w<2||h<2)return;
    // 置き方は knightTransform が出した一つだけを使う。命中の位置も同じものを見る。
    const place=(t:KnightTransform)=>{
      const m=knightMatrix(t);context.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
    };
    const main=this.preset.palettes[recipe?.element??'neutral'].main;
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    context.clearRect(0,0,w,h);
    place(spot);context.drawImage(this.source,0,0,w,h);
    context.setTransform(1,0,0,1,0,0);
    // 白飛び。今描いた騎士の形の上だけを塗る。白、属性色、白の三段。
    if(pose.flashAlpha>0) {
      context.globalCompositeOperation='source-atop';context.globalAlpha=Math.min(1,pose.flashAlpha);
      context.fillStyle=pose.flashTint?mix('#ffffff',main,.72):'#ffffff';context.fillRect(0,0,w,h);
    }
    // 輪郭の発光と残像は本体の後ろへ回す。
    context.globalCompositeOperation='destination-over';
    if(pose.rim>0) {
      const glow=this.paintStencil(main),spread=2.6*unit;
      if(glow) {
        // 半分の大きさのcanvasに描いた形を、縁の分だけ広げて1回だけ重ねる。
        // 拡大のぼけがそのままにじみになるので、8方向に重ねなくても光に見える。濃さは薄くする。
        context.globalAlpha=.1*pose.rim;
        place(spot);context.drawImage(glow,-spread,-spread,w+spread*2,h+spread*2);
      }
    }
    if(pose.ghost>0&&this.trail.length) {
      const ghost=this.paintStencil(mix('#ffffff',main,.25));
      if(ghost)for(let i=0;i<3&&i<this.trail.length;i++) {
        context.globalAlpha=(.3-i*.1)*pose.ghost;
        place(this.trail[this.trail.length-1-i]);
        context.drawImage(ghost,0,0,w,h);
      }
    }
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';
    this.trail.push(spot);if(this.trail.length>4)this.trail.shift();
  }
  /**
   * 当たった場所に魔法の色の傷あとを残す。体力バーを見なくても効いたと分かるようにする。
   * 濃さは命中から0.9秒で薄くなり、その後は0.38のまま残す。
   */
  private paintScar(scar:number,recipe:Recipe|null,x:number,y:number) {
    const c=this.view;if(!c)return;
    const w=this.canvas.width,h=this.canvas.height;
    // 一枚絵の騎士と同じ大きさの比で描く。画面の大きさが変わっても傷あとの比は変えない。
    const color=this.preset.palettes[recipe?.element??'neutral'].main,r=44*Math.max(w/1672,h/941);
    c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='lighter';
    const glow=c.createRadialGradient(x,y,0,x,y,r);
    glow.addColorStop(0,color+'cc');glow.addColorStop(.45,color+'55');glow.addColorStop(1,color+'00');
    c.globalAlpha=Math.min(1,scar);c.fillStyle=glow;
    c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
    c.globalAlpha=Math.min(1,scar*.9);c.strokeStyle=color;c.lineWidth=2.4*Math.max(w/1672,h/941);c.lineCap='round';
    c.beginPath();c.moveTo(x-r*.44,y-r*.34);c.lineTo(x+r*.32,y+r*.36);
    c.moveTo(x-r*.12,y+r*.42);c.lineTo(x+r*.4,y-r*.24);c.stroke();
    c.restore();
  }
  /** 控えめモード。動きを小さくし、白飛びを消し、残像と輪郭の発光を弱める。画面のボタンから切り替える。 */
  setCalm(calm:boolean){this.calm=calm;}
  /** 見た目の設定（控えめ・派手・最大）。演出canvasと同じものを渡す。 */
  setPreset(preset:EffectPreset){this.preset=preset;}
  /**
   * amount は入力の量（0〜1）。同じ魔法でも、たくさん描いて唱えたほど反応が強くなる。
   * guardStyle は防御の回の止め方。一回目の受け渡し以降は、これを使って防御の姿勢へ移る。
   */
  render(ms:number,active:boolean,recipe:Recipe|null,amount=0,power?:number,guardStyle:'block'|'reflect'|'erase'|null=null) {
    // 表示の大きさが変わっていたら、描く前に合わせ直す。
    const size=`${Math.max(1,this.canvas.clientWidth)}x${Math.max(1,this.canvas.clientHeight)}`;
    if(size!==this.cssSize)this.resize();
    // 一回目の受け渡しからは防御の回の姿勢へ移る。構え、溜め、振り下ろし、弾かれる、前屈の順。
    const guarding=active&&ms>=GUARD_FROM*1000;
    const pose=guarding?guardPose(ms,this.calm,guardStyle??'block')
      :knightPose(ms,active,this.calm,recipe?.purpose,power??reactionPower(recipe,amount,this.preset),this.calm);
    // 盾に弾かれた勢いで折れる兜の角。止め方によらず、受け止めきった時点で欠ける。
    if(this.horns[0])this.horns[0].setEnabled(!(active&&ms>=HORN_BREAK_MS));
    // 弱点。胸当てが前へ外れ、胸の線が左右へ開き、核が大きくなる。
    const open=active&&ms>=WEAKPOINT_MS?clamp((ms-WEAKPOINT_MS)/700):0;
    const t=ms/1000;
    // とどめの回の部品の脱落。落ちた部品はここで動かすので、この後の姿勢では触らない。
    this.updateParts(t,active,open);
    if(this.chestPlate&&!this.down.has('chestPlate')){this.chestPlate.position.z=-.2-open*.45;this.chestPlate.position.y=.34-open*.6;this.chestPlate.rotation.x=open*1.3;}
    for(let i=0;i<this.chestLines.length;i++)this.chestLines[i].position.x=(i?1:-1)*.11*(1+open*2.4);
    if(!this.down.has('core'))this.core.scaling.setAll(1+open*1.2);
    const p=blendPose(pose.weights);
    // 待機の間もわずかに体と腕を動かし、首をゆっくり振る。動きを減らす設定では止める。
    // 倒れきった後は、この揺れも呼吸も止める。
    const live=(this.calm?0:1)*pose.still;
    const shake=pose.shake;
    // 崩れ落ち。足元を軸に手前へ回し、同時に視点へ近づける。控えめモードでも減らさない。
    this.root.rotation.x=-pose.fall*FALL_TURN;
    this.root.position.z=pose.lean*(recipe?.purpose==='defend'?1.1:.7)-pose.fall*FALL_NEAR;
    this.root.position.y=p.crouch+pose.breath*4;
    this.root.position.x=Math.sin(t*62)*shake;
    this.root.rotation.z=Math.sin(t*44)*shake;
    this.body.rotation.x=p.body+Math.sin(t*.42+1)*.008*live;
    // 上半身のひねり。脚は回さないので、半身に構えて見える。
    this.body.rotation.y=p.turn;
    this.body.rotation.z=Math.sin(t*.55)*.012*live;
    this.head.rotation.x=p.head;
    // 体をひねっても、兜はこちらを向いたままにする。
    this.head.rotation.y=-p.turn*.7+Math.sin(t*.31)*.06*live;
    // 腕は最後まで体に残るので、盾と剣を落とした後も姿勢を当て続ける。
    this.swordArm.rotation.set(p.swordSwing+Math.sin(t*.5)*.03*live,0,-p.swordOut);
    this.shieldArm.rotation.set(p.shieldSwing+Math.sin(t*.5+2)*.024*live,0,p.shieldOut);
    // 一回目の締め切りからの蓄積で核が明るくなり、命中では前から強く照らす。弱点が出たら脈打つ。
    // とどめの回は、明滅の速さを回の表から作った corePulse に任せる。56秒の境目もここでつなぐ。
    const charge=coreCharge(ms,active);
    const pulse=active?corePulse(t):idlePulse(t);
    const glow=.22+charge*.5+pose.flash*1.5+open*pulse*.7;
    this.coreMaterial.emissiveColor.set(.42+glow,.32+glow*.86,.17+glow*.7);
    const blink=.82+Math.sin(t*1.7)*.18*live+pose.flash*.6;
    this.eyes.emissiveColor.set(.52*blink,.23*blink,.07*blink);
    // 色は魔法の属性のままだと鎧まで染まるため、白へ寄せて使う。
    this.burst.diffuse=Color3.Lerp(Color3.FromHexString(recipe?colors[recipe.element]:colors.neutral),new Color3(1,1,1),.4);
    this.burst.intensity=charge*.35+pose.flash*4;
    this.scene.render();
    // 立体を描いた面は表に出す面より粗いので、胸の核の位置は表の面の大きさへ直してから使う。
    const rw=this.engine.getRenderWidth(),rh=this.engine.getRenderHeight();
    const projected=Vector3.Project(this.core.getAbsolutePosition(),IDENTITY,this.scene.getTransformMatrix(),this.camera.viewport.toGlobal(rw,rh));
    const w=Math.max(1,this.canvas.width),h=Math.max(1,this.canvas.height);
    const unit=w/Math.max(1,this.canvas.clientWidth||w);
    // 置き方は一度だけ出し、絵と胸の狙い先の両方に同じものを使う。
    const spot=knightTransform(pose,w,h,unit);
    this.compose(pose,recipe,spot,unit);
    const hit=knightPoint(spot,projected.x*w/rw,projected.y*h/rh);
    // 命中から0.9秒かけて薄くなり、その後は残り続ける傷あと。倒れ始めたら0.5秒で全部消す。
    const wipe=active?1-clamp((t-FALL_FROM)/.5):1;
    const scar=active&&ms>=IMPACT_AT*1000?Math.max(.38,1.15-(ms-IMPACT_AT*1000)/900)*wipe:0;
    if(scar>0)this.paintScar(scar,recipe,hit.x,hit.y);
    // とどめの4回の命中と直撃の傷あと。当たった部品の場所にそれぞれ残る。
    if(active&&wipe>0)for(const mark of SCAR_MARKS) {
      if(t<mark.at)continue;
      const strength=Math.max(.38,1.15-(t-mark.at)/.9)*wipe;
      const at=this.scarSpot(mark.key,rw,rh,w,h);
      if(at){const point=knightPoint(spot,at.x,at.y);this.paintScar(strength,recipe,point.x,point.y);}
    }
    this.target={x:hit.x/w,y:hit.y/h};
    this.canvas.dataset.state=pose.state;
    this.canvas.dataset.scar=scar>0?'1':'0';
    this.canvas.classList.toggle('spell-finished',active&&ms>=BATTLE_END-500);
  }
  dispose(){this.scene.dispose();this.engine.dispose();}
}
