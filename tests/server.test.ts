import { describe,it,expect,vi } from 'vitest';
import { evaluateJev,validState } from '../server/jev';
import { questions } from '../server/questions';
import { CastSession } from '../src/game/session';

describe('Jevへの接続',()=>{
  it('独立した12問を一回で送り、元の番号を返す',async()=>{
    const state=new CastSession(()=>0).freeze();
    const mock=vi.fn(async()=>new Response(JSON.stringify({model:'jev-test',answers:{split:{type:'noul',noul:.8}}}),{status:200}));
    const result=await evaluateJev(state,{key:'test-only',fetcher:mock as typeof fetch});
    expect(mock).toHaveBeenCalledOnce();const [url,request]=mock.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');const body=JSON.parse(request.body as string);
    expect(Object.keys(body.questions)).toHaveLength(12);expect(body.state.sessionId).toBe(state.sessionId);expect(result.sessionId).toBe(state.sessionId);expect(result.status).toBe('ok');
    expect(Object.values(questions).filter(q=>q.type==='choice')).toHaveLength(4);
    expect(Object.values(questions).filter(q=>q.type==='score')).toHaveLength(4);
    expect(Object.values(questions).filter(q=>q.type==='noul')).toHaveLength(4);
  });
  it('未設定を成功と表示せず、通信しない',async()=>{const mock=vi.fn();const result=await evaluateJev(new CastSession(()=>0).freeze(),{fetcher:mock});expect(result.status).toBe('unconfigured');expect(mock).not.toHaveBeenCalled();});
  it('混雑時に再試行して演出を待たせない',async()=>{const mock=vi.fn(async()=>new Response('',{status:429}));expect((await evaluateJev(new CastSession(()=>0).freeze(),{key:'test-only',fetcher:mock})).status).toBe('http-429');expect(mock).toHaveBeenCalledOnce();});
  it('壊れた要求と回答を拒む',async()=>{
    expect(validState({})).toBe(false);expect(validState(new CastSession(()=>0).freeze())).toBe(true);
    const s=new CastSession(()=>0).freeze();s.motion.coverageWidth=Infinity;expect(validState(s)).toBe(false);
    const mock=vi.fn(async()=>new Response('{}'));expect((await evaluateJev(new CastSession(()=>0).freeze(),{key:'test-only',fetcher:mock})).status).toBe('invalid-response');
  });
});
