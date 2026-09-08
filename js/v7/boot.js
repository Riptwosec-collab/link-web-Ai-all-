import {initCore,BUILD} from './core.js';
import {initKnowledge} from './knowledge.js';
import {initMobile} from './mobile.js';
import {initAutoCategory} from './auto-category.js';

async function boot(){
  try{
    await initCore();
    await initKnowledge();
    initAutoCategory();
    initMobile();
    document.documentElement.classList.add('slh-v7-ready');
    window.dispatchEvent(new CustomEvent('smartlink:v7-ready',{detail:{build:BUILD}}));
  }catch(error){
    console.error('Smart Link Hub V7 boot failed',error);
    const el=document.createElement('div');el.className='v7-boot-error';el.textContent=`V7 boot error: ${error?.message||error}`;document.body.appendChild(el);
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
