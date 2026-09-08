const {test,expect}=require('@playwright/test');

test('all V7 browser modules parse and import in isolation',async({page})=>{
  await page.goto('/module-diagnostic.html',{waitUntil:'domcontentloaded'});
  const paths=[
    '/js/db.js',
    '/js/v7/core.js',
    '/js/v7/knowledge.js',
    '/js/v7/auto-category.js',
    '/js/v7/organization.js',
    '/js/v7/mobile.js',
    '/js/v7/boot.js'
  ];
  const results=[];
  for(const path of paths){
    const row=await page.evaluate(async path=>{
      try{const mod=await import(path+'?diag='+Date.now());return {path,ok:true,exports:Object.keys(mod)}}
      catch(error){return {path,ok:false,name:error?.name||'Error',message:error?.message||String(error),stack:error?.stack||''}}
    },path);
    results.push(row);
  }
  const failed=results.filter(x=>!x.ok);
  expect(failed,JSON.stringify(results,null,2)).toEqual([]);
});

test('legacy and classic production scripts parse when loaded individually',async({page})=>{
  await page.goto('/module-diagnostic.html',{waitUntil:'domcontentloaded'});
  const paths=['/js/e2e-boot.js','/js/auth-gate.js','/js/auto-cloud-ui.js','/js/smooth-v52.js','/js/neo-v54.js','/js/shortcuts-v51.js','/js/v6-bridge.js','/js/theme-v61.js'];
  const results=[];
  for(const path of paths){
    const row=await page.evaluate(async path=>{
      return await new Promise(resolve=>{
        const s=document.createElement('script');s.src=path+'?diag='+Date.now();s.onload=()=>resolve({path,ok:true});s.onerror=e=>resolve({path,ok:false,message:e?.message||'script load/parse error'});document.head.appendChild(s);
      });
    },path);
    results.push(row);
  }
  const failed=results.filter(x=>!x.ok);
  expect(failed,JSON.stringify(results,null,2)).toEqual([]);
});
