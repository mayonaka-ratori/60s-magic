import { expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { COUNTDOWN_MS,SEQUENTIAL_ROUNDS,TOGETHER_ROUNDS } from '../../src/game/rounds';

/**
 * 一回目が終わり、防御の回に入るまで待つ。一回目の音（命中のあとの余韻まで）と記録は、ここで出そろっている。
 * 目印は三段の見出しが防御の回のものに替わること。一回目の最後の案内は短いので、遅いPCでも見逃さないこちらを使う。
 * 開始ボタンを押した直後から呼んでよいよう、準備の合図の分と読み込みの余裕を足して待つ。
 * 試験の側では遊び方の表を決められないので、画面が選んだ遊び方（#app の data-flow）から表を選ぶ。
 */
export async function 防御の回まで待つ(page:Page) {
  const rounds=await page.locator('#app').getAttribute('data-flow')==='together'?TOGETHER_ROUNDS:SEQUENTIAL_ROUNDS;
  await expect(page.locator('#step-1-label')).toHaveText('輪を守る',{timeout:COUNTDOWN_MS+rounds[1].start+15000});
}

/**
 * 本編を途中で中止し、タイトルの「前回の記録を保存する」で書き出した記録を読む。
 * 一回目しか見ない試験は、90秒の終わりまで待たずにここで切り上げる。このボタンは ?dev=1 のときだけ出る。
 * 記録は中止の直前に取るので、音の記録（audio）は音を止める前の状態のまま入っている。
 */
export async function 中止して記録を読む(page:Page) {
  await page.locator('#cancel').click();await expect(page.locator('#welcome')).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#last-record').click()]);
  return JSON.parse(await readFile(await download.path(),'utf8'));
}

/**
 * 「順番に」はマイクを使うので、声の受け皿を試験用の返事に差し替える。音そのものは保存しない。
 * 受け皿は使える状態と答え、声が届き始めたら途中の文字を、受付の終わりに確定した文字を返す。
 * 声の受付がある回（一回目ととどめ）は、どちらも同じ言葉を聞き取ったことにする。
 * 実際の認識の速さと中身は、別の音声試験と人の声で確かめる。
 */
export async function 声を試験用の返事にする(page:Page,text:string) {
  await page.route('**/api/status',route=>route.fulfill({json:{jev:false,speech:true,handModel:false,model:'',speechProvider:'local',
    localSpeech:{state:'ready',message:'試験用の受け皿',model:'試験用',device:'cpu'}}}));
  await page.routeWebSocket('**/api/speech',socket=>{
    let sessionId='',windowMs=0,offset:number|null=null;
    const send=(revision:number,endMs:number,final:boolean,words:string)=>socket.send(JSON.stringify({type:'transcript',sessionId,
      entry:{id:0,revision,startMs:offset??0,endMs,text:words,final,stability:final?1:.9,source:'local'}}));
    socket.onMessage(data=>{
      if(typeof data!=='string') {
        if(offset===null){offset=data.readDoubleLE(0);send(1,offset+100,false,text.slice(0,2));}
        return;
      }
      const message=JSON.parse(data);
      if(message.type==='start'){sessionId=message.sessionId;windowMs=message.windowMs;socket.send(JSON.stringify({type:'ready',sessionId,provider:'local'}));}
      if(message.type==='end'){send(2,windowMs-1,true,text);socket.send(JSON.stringify({type:'ended',sessionId}));}
    });
  });
}
