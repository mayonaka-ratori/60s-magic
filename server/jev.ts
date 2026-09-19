import { questions } from './questions';
import type { JevReply, SpellState } from '../src/game/types';

export async function evaluateJev(state:SpellState, options:{key?:string;model?:string;fetcher?:typeof fetch;signal?:AbortSignal}={}):Promise<JevReply> {
  const base={sessionId:state.sessionId,castId:state.castId,inputRevision:state.inputRevision};
  if(!options.key)return {...base,status:'unconfigured'};
  try {
    const timeout=AbortSignal.timeout(900);
    const response=await (options.fetcher??fetch)('https://api.typesafe.ai/v1/systemone',{
      method:'POST',headers:{Authorization:`Bearer ${options.key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:options.model??'jev-1.13.0',state,questions}),
      signal:options.signal?AbortSignal.any([timeout,options.signal]):timeout,
    });
    if(!response.ok)return {...base,status:`http-${response.status}`};
    const body=await response.json() as {answers?:JevReply['answers'];model?:string};
    if(!body.answers||typeof body.answers!=='object'||Array.isArray(body.answers))return {...base,status:'invalid-response'};
    return {...base,status:'ok',model:body.model,answers:body.answers};
  } catch {return {...base,status:'unavailable'};}
}

export function validState(value:unknown):value is SpellState {
  if(!value||typeof value!=='object')return false;
  const s=value as SpellState;
  return typeof s.sessionId==='string'&&/^[\w-]{1,80}$/.test(s.sessionId)&&s.castId==='cast-01'&&s.inputRevision===1&&s.phase==='free'&&s.schemaVersion==='spell-state-2'&&
    typeof s.speech?.rawTranscript==='string'&&s.speech.rawTranscript.length<=6000&&typeof s.speech.normalizedTranscript==='string'&&s.speech.normalizedTranscript.length<=6000&&
    Array.isArray(s.timedEvents)&&s.timedEvents.length<=100&&typeof s.motion?.hasMovement==='boolean'&&
    ['coverageWidth','coverageHeight','closedness','convergence','smoothness'].every(k=>Number.isFinite((s.motion as unknown as Record<string,number>)[k])&&(s.motion as unknown as Record<string,number>)[k]>=0&&(s.motion as unknown as Record<string,number>)[k]<=1);
}
