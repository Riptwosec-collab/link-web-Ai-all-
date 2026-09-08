const {defineConfig,devices}=require('@playwright/test');

module.exports=defineConfig({
  testDir:'./tests',
  timeout:45000,
  expect:{timeout:10000},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['line'],['html',{open:'never',outputFolder:'playwright-report'}]]:'line',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
    viewport:{width:1440,height:900}
  },
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',use:{...devices['Pixel 7']},grep:/@mobile/}
  ],
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1',
    url:'http://127.0.0.1:4173/index.html',
    reuseExistingServer:!process.env.CI,
    timeout:15000
  }
});
