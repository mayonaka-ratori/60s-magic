import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',timeout:65000,fullyParallel:false,workers:1,
  use:{baseURL:'http://127.0.0.1:5173',viewport:{width:1440,height:900},headless:true,channel:'chromium',
    launchOptions:{args:['--use-angle=d3d11','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:5173/api/status',reuseExistingServer:true,timeout:60000},
});
