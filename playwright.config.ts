import { defineConfig } from '@playwright/test';
// Windowsだけ Direct3D 11 を指定する。Macでこの指定を付けるとソフトウェア描画に落ち、90秒を通す試験が間に合わなくなる。
const gpuArgs=process.platform==='win32'?['--use-angle=d3d11']:[];
export default defineConfig({
  // 通しの試験は90秒の本編に、読み込みと3秒の準備の合図が乗って93秒かかる。
  // いちばん長いのは exhibition.spec.ts の「結果のまま誰も触らなければ」で、
  // 結果を待つ100秒に、タイトルへ戻る16秒と見本が始まる16秒が続き、読み込みも足すと最悪137秒になる。
  // 150秒では足りなくなる余地があるので180秒にする。
  testDir:'tests/browser',timeout:180000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},headless:true,channel:'chromium',
    launchOptions:{args:[...gpuArgs,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:5173/api/status',reuseExistingServer:true,timeout:60000},
});
