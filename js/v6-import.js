import {importCloudState,bulkPut,logEvent} from './db.js';

function toast(text){const el=document.createElement('div');el.className='v6-toast';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),3500)}

async function handleV6Json(event){
  const input=event.currentTarget,file=input?.files?.[0];
  if(!file||!/\.json$/i.test(file.name))return;
  let payload;
  try{payload=JSON.parse(await file.text())}catch{return}
  if(!payload||typeof payload!=='object'||Number(payload.version||0)<6)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{
    await importCloudState(payload,{replace:false});
    if(Array.isArray(payload.events)&&payload.events.length)await bulkPut('events',payload.events);
    await logEvent('import_v6_backup',{file:file.name,links:Array.isArray(payload.links)?payload.links.length:0});
    toast(`V6 backup imported · ${Array.isArray(payload.links)?payload.links.length:0} links`);
    window.dispatchEvent(new Event('smartlink:cloud-force-sync'));
    setTimeout(()=>location.reload(),500);
  }catch(err){console.error(err);toast('V6 backup import failed: '+err.message)}finally{input.value=''}
}

function bind(){const input=document.getElementById('import-file');if(input&&!input.dataset.v6Import){input.dataset.v6Import='1';input.addEventListener('change',handleV6Json,true)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
