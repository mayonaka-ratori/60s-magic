import { defineConfig } from '@playwright/test';
// Windowsだけ Direct3D 11 を指定する。Macでこの指定を付けるとソフトウェア描画に落ち、24秒を通す試験が間に合わなくなる。
const gpuArgs=process.platform==='win32'?['--use-angle=d3d11']:[];
export default defineConfig({
  testDir:'tests/browser',timeout:65000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},headless:true,channel:'chromium',
    launchOptions:{args:[...gpuArgs,'--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:5173/api/status',reuseExistingServer:true,timeout:60000},
});
