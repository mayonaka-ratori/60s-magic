import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { evaluateJev, validState } from './jev';
import { connectSpeech } from './speech';
import { LocalSpeech } from './local-speech';
import { connectLocalSpeech } from './local-speech-session';

const app=express();
const speechProvider=process.env.SPEECH_PROVIDER??'local';
if(!['local','google','off'].includes(speechProvider))throw new Error('SPEECH_PROVIDER は local、google、off のいずれかを設定してください');
const localSpeech=new LocalSpeech();
if(speechProvider==='local')localSpeech.start();
app.disable('x-powered-by');
app.use(express.json({limit:'48kb'}));
app.get('/api/status',(_req,res)=>res.json({jev:!!process.env.JEV_API_KEY,
  speech:speechProvider==='local'?localSpeech.getStatus().state==='ready':speechProvider==='google'&&!!process.env.GOOGLE_CLOUD_PROJECT,
  speechProvider,localSpeech:speechProvider==='local'?localSpeech.getStatus():null,
  handModel:existsSync(resolve('public/vision/hand_landmarker.task')),model:process.env.JEV_MODEL??'jev-1.13.0'}));
app.post('/api/interpret',async(req,res)=>{
  if(!validState(req.body)){res.status(400).json({error:'入力の形式が正しくありません'});return;}
  const abort=new AbortController();
  res.on('close',()=>abort.abort());
  const result=await evaluateJev(req.body,{key:process.env.JEV_API_KEY,model:process.env.JEV_MODEL,signal:abort.signal});
  if(!res.destroyed)res.json(result);
});
const server=createServer(app);
const speech=new WebSocketServer({noServer:true,maxPayload:8192});
let speechClients=0;
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/api/speech')return; // 開発用の画面更新はViteへ渡す。
  const origin=req.headers.origin;
  if(!origin||new URL(origin).host!==req.headers.host||speechClients>=2){socket.destroy();return;}
  speech.handleUpgrade(req,socket,head,ws=>{
    speechClients++;ws.once('close',()=>speechClients--);
    if(speechProvider==='local')connectLocalSpeech(ws,localSpeech);
    else if(speechProvider==='google')connectSpeech(ws,process.env.GOOGLE_CLOUD_PROJECT,process.env.GOOGLE_CLOUD_LOCATION??'us');
    else ws.close(1013,'音声認識は使用しない設定です');
  });
});
if(process.argv.includes('--production')) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
} else {
  const vite=await createViteServer({server:{middlewareMode:true,hmr:{server}},appType:'spa'});
  app.use(vite.middlewares);
}
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error(error instanceof Error?error.message:'処理に失敗しました');
  res.status(500).json({error:'処理に失敗しました'});
});
const port=Number(process.env.PORT??5173);
server.listen(port,process.env.HOST??'127.0.0.1',()=>console.log(`魔法の試作を開けます: http://localhost:${port}`));
let stopping=false;
function stop(){if(stopping)return;stopping=true;localSpeech.dispose();speech.clients.forEach(ws=>ws.terminate());server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>localSpeech.dispose());
