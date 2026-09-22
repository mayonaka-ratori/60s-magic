import { SEQUENTIAL_ROUNDS, TOGETHER_ROUNDS } from '../src/game/rounds.ts';

/** 写真の時刻表と、開くページの遊び方を同じ指定から作る。 */
const option=process.argv.find(value=>value.startsWith('--flow='))?.slice(7)??'sequential';
if(!['sequential','together'].includes(option))throw new Error('--flow=sequential または --flow=together を指定してください');
export const flow=option;
export const sequential=flow==='sequential';
export const rounds=sequential?SEQUENTIAL_ROUNDS:TOGETHER_ROUNDS;
export const pageUrl=`http://127.0.0.1:5173/?flow=${flow}`;
// 順番にの写真は見本を使う。機器の音声認識とは分けて確認する。
export const startButton=sequential?'#demo':'#start';

/** 見本の撮影では、音声認識を起動せず開始画面の通常の案内を写す。 */
export async function prepareCapture(page) {
  if(!sequential)return;
  await page.route('**/api/status',async route=>{
    const response=await route.fetch(),status=await response.json();
    await route.fulfill({json:{...status,speech:true,speechProvider:'local',
      localSpeech:{state:'ready',message:'見本の撮影用。実際の音声認識は使いません。'}}});
  });
}
