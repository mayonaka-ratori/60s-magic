import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';

/**
 * 合成用のシーンで使う自前のシェーダーをまとめて登録する。
 * 画面を使わない登録だけなので、読み込んだ時点で一度だけ走らせればよい。
 */

/** 板に貼った絵を、彩度だけ変えて出す。 */
export const LAYER_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(){ vUV=uv; gl_Position=worldViewProjection*vec4(position,1.0); }
`;

export const LAYER_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D layer;
uniform float saturateAmount;
void main(){
  vec4 color=texture2D(layer,vUV);
  float gray=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
  color.rgb=mix(vec3(gray),color.rgb,saturateAmount);
  gl_FragColor=color;
}
`;

/**
 * 衝撃波の歪み。命中の位置から広がる輪の内側だけ、中心から外へ向かう向きに数pxずらす。
 * 輪の半径と幅と強さは外から渡す（composite.ts の rippleAt が時刻から決める）。
 */
const SHOCKWAVE_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 center;
uniform float radius;
uniform float ringWidth;
uniform float strength;
uniform float aspect;
void main(){
  vec2 d=vec2((vUV.x-center.x)*aspect,vUV.y-center.y);
  float r=length(d);
  // 輪の上でいちばん強く、輪から離れると0になる。
  float ring=1.0-smoothstep(0.0,max(ringWidth,0.0001),abs(r-radius));
  // 輪の外側は動かさない。内側だけ屈折させる。
  float inside=1.0-smoothstep(radius,radius+ringWidth*0.5,r);
  vec2 dir=r>0.0001?d/r:vec2(0.0);
  vec2 push=dir*ring*inside*strength;
  vec2 uv=vUV-vec2(push.x/aspect,push.y);
  gl_FragColor=texture2D(textureSampler,clamp(uv,vec2(0.001),vec2(0.999)));
}
`;

/** 衝撃波の後処理を探すときの名前。Babylonの置き場の鍵なので英数字にしておく。 */
export const SHOCKWAVE_SHADER = 'shockwave60s';

let registered = false;
/** シェーダーをBabylonの置き場に登録する。二度目からは何もしない。 */
export function registerCompositeShaders() {
  if (registered) return;
  registered = true;
  ShaderStore.ShadersStore[`${SHOCKWAVE_SHADER}FragmentShader`] = SHOCKWAVE_FRAGMENT;
}
