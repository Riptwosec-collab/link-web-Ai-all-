const BOOT_ERRORS=[];
window.__SLH_BOOT_ERRORS__=BOOT_ERRORS;

function record(stage,error){
  const row={stage,message:String(error?.message||error||'Unknown error'),name:String(error?.name||'Error'),at:Date.now()};
  BOOT_ERRORS.push(row);
  console.error(`Smart Link Hub boot stage failed: ${stage}`,error);
  window.dispatchEvent(new CustomEvent('smartlink:v7-boot-error',{detail:row}));
  return row;
}

async function load(stage,path,initializer,{required=false}={}){
  try{
    const mod=await import(path);
    if(initializer){const fn=mod?.[initializer];if(typeof fn!=='function')throw new Error(`${initializer} export missing`);await fn()}
    return mod;
  }catch(error){record(stage,error);if(required)throw error;return null}
}

async function boot(){
  let core=null;
  try{
    core=await load('core','./core.js','initCore',{required:true});
    await load('knowledge','./knowledge.js','initKnowledge');
    await load('auto-category','./auto-category.js','initAutoCategory');
    await load('organization','./organization.js','initOrganization');
    await load('mobile','./mobile.js','initMobile');

    document.documentElement.classList.add('slh-v7-ready');
    if(!BOOT_ERRORS.some(x=>x.stage==='organization'))document.documentElement.classList.add('slh-v76-ready');
    document.documentElement.dataset.slhBootErrors=String(BOOT_ERRORS.length);
    window.dispatchEvent(new CustomEvent('smartlink:v7-ready',{detail:{build:core?.BUILD||window.__SLH_BUILD__||null,errors:[...BOOT_ERRORS]}}));

    if(BOOT_ERRORS.length){
      const el=document.createElement('button');el.type='button';el.className='v7-boot-warning';el.title=BOOT_ERRORS.map(x=>`${x.stage}: ${x.message}`).join('\n');el.innerHTML=`<i class="ph ph-warning-circle"></i><span>${BOOT_ERRORS.length} module warning${BOOT_ERRORS.length===1?'':'s'}</span>`;el.onclick=()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'status'}}));document.body.appendChild(el);
    }
  }catch(error){
    const el=document.createElement('div');el.className='v7-boot-error';el.dataset.stage='core';el.textContent=`V7 core boot error: ${error?.message||error}`;document.body.appendChild(el);
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
