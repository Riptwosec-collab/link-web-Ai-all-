import {getAll,getOne,putOne,uid,logEvent,getSetting} from './db.js';
import {getMetadata,displayHost,makeSnapshot} from './metadata.js';

const inflight=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function toast(text){
  const root=document.getElementById('toast-root');
  if(!root)return;
  const el=document.createElement('div');
  el.className='toast instant-toast';
  el.textContent=text;
  root.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function rerender(){
  try{window.dispatchEvent(new HashChangeEvent('hashchange'))}
  catch{window.dispatchEvent(new Event('hashchange'))}
}

function normalize(raw){
  let value=String(raw||'').trim();
  if(!value)throw new Error('Empty URL');
  if(!/^https?:\/\//i.test(value))value='https://'+value;
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol))throw new Error('Invalid URL');
  u.hash='';
  const url=u.href;
  return {url,normalizedUrl:url.replace(/\/$/,''),asciiHost:u.hostname.replace(/^www\./,''),displayHost:displayHost(u.hostname.replace(/^www\./,''))};
}

async function settings(){
  return {
    autoMetadata:await getSetting('autoMetadata',true),
    aiEnabled:await getSetting('aiEnabled',true),
    autoSnapshot:await getSetting('autoSnapshot',false),
    workerUrl:await getSetting('workerUrl','')
  };
}

async function saveSnapshot(link,cfg){
  if(!cfg.autoSnapshot)return;
  try{
    const snap=await makeSnapshot(link,cfg);
    await putOne('archives',{id:uid('arc'),linkId:link.id,title:link.title,url:link.url,description:link.description,imageUrl:link.imageUrl,capturedAt:Date.now(),...snap});
    await logEvent('snapshot',{id:link.id,via:'instant-save'});
  }catch(err){console.warn('Auto snapshot failed',err)}
}

async function hydrate(id,cfg){
  const original=await getOne('links',id);
  if(!original)return;
  try{
    const m=cfg.autoMetadata?await getMetadata(original.url,cfg):null;
    const current=await getOne('links',id);
    if(!current)return;
    const next={
      ...current,
      title:m?.title||current.title,
      domain:m?.domain||current.domain,
      description:m?.description||current.description||'',
      summary:m?.summary||m?.description||current.summary||'',
      imageUrl:m?.imageUrl||current.imageUrl||'',
      favicon:m?.favicon||current.favicon||'',
      category:m?.category||current.category||'General',
      tags:m?.tags?.length?m.tags:(current.tags||[]),
      metadataSource:m?.source||current.metadataSource||'local',
      metadataRefreshedAt:Date.now(),
      pending:false,
      updatedAt:Date.now()
    };
    await putOne('links',next);
    await logEvent('metadata_refresh',{id,source:next.metadataSource,instant:true,hasImage:!!next.imageUrl});
    await saveSnapshot(next,cfg);
    rerender();
  }catch(err){
    console.warn('Background metadata failed',err);
    const current=await getOne('links',id);
    if(current){current.pending=false;current.updatedAt=Date.now();await putOne('links',current);rerender()}
  }finally{inflight.delete(original.normalizedUrl)}
}

async function instantSave(raw){
  let parsed;
  try{parsed=normalize(raw)}catch{return toast('URL ไม่ถูกต้อง')}
  if(inflight.has(parsed.normalizedUrl))return;
  inflight.add(parsed.normalizedUrl);

  const rows=await getAll('links');
  const duplicate=rows.find(x=>x.normalizedUrl===parsed.normalizedUrl||String(x.url||'').replace(/\/$/,'')===parsed.normalizedUrl);
  if(duplicate){inflight.delete(parsed.normalizedUrl);toast('ลิงก์นี้บันทึกไว้แล้ว');return}

  const now=Date.now();
  const draft={
    id:uid('lnk'),
    url:parsed.url,
    normalizedUrl:parsed.normalizedUrl,
    title:parsed.displayHost,
    domain:parsed.displayHost,
    description:'',
    summary:'กำลังดึงชื่อ คำอธิบาย และรูป Preview…',
    imageUrl:'',
    favicon:`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(parsed.asciiHost)}`,
    category:'Loading',
    tags:[],
    collectionId:'col_inbox',
    favorite:false,
    createdAt:now,
    updatedAt:now,
    pending:true,
    metadataSource:'pending',
    health:{state:'unknown',status:null,checkedAt:null}
  };

  try{
    await putOne('links',draft);
    await logEvent('save',{id:draft.id,category:'Loading',instant:true});
    const input=document.getElementById('url-input');
    if(input){input.value='';input.disabled=false;input.placeholder='Paste URL or type one here…'}
    toast('บันทึกแล้วทันที · กำลังโหลด Preview');
    rerender();
    const cfg=await settings();
    hydrate(draft.id,cfg);
  }catch(err){
    inflight.delete(parsed.normalizedUrl);
    console.error(err);toast('บันทึกลิงก์ไม่สำเร็จ');
  }
}

function intercept(e){
  const click=e.type==='click'&&e.target.closest?.('#save-url-btn,#modal-save-url');
  const enter=e.type==='keydown'&&e.key==='Enter'&&e.target?.id==='url-input';
  const paste=e.type==='paste'&&e.target?.id==='url-input';
  if(!click&&!enter&&!paste)return;
  let raw='';
  if(click){raw=document.getElementById(click.id==='modal-save-url'?'modal-url':'url-input')?.value||''}
  if(enter)raw=e.target.value||'';
  if(paste)raw=(e.clipboardData||window.clipboardData)?.getData('text')||'';
  if(!String(raw).trim())return;
  if(paste&&!/^\s*(?:https?:\/\/|www\.|[\p{L}\p{N}-]+\.)/iu.test(raw))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(click?.id==='modal-save-url')document.getElementById('modal-root').innerHTML='';
  instantSave(raw);
}

document.addEventListener('click',intercept,true);
document.addEventListener('keydown',intercept,true);
document.addEventListener('paste',intercept,true);

let decorating=false;
async function decorateCards(){
  if(decorating)return;decorating=true;
  try{
    const links=await getAll('links'),map=new Map(links.map(x=>[x.id,x]));
    document.querySelectorAll('.link-card[data-link-id]').forEach(card=>{
      const link=map.get(card.dataset.linkId),preview=card.querySelector('.preview');
      if(!link||!preview)return;
      card.classList.toggle('is-pending',!!link.pending);
      const img=preview.querySelector(':scope > img');
      if(img){img.classList.add('preview-image');img.loading='lazy';img.decoding='async';if(!preview.querySelector('.preview-overlay'))preview.insertAdjacentHTML('beforeend','<div class="preview-overlay"></div>')}
      if(link.pending&&!preview.querySelector('.preview-loader'))preview.insertAdjacentHTML('beforeend','<div class="preview-loader"><span class="preview-orbit"><i class="ph ph-image"></i></span><b>Loading preview</b><small>ดึงรูปและข้อมูลเว็บไซต์…</small></div><span class="saving-pill"><i class="ph ph-lightning"></i> Saved</span>');
      if(!link.pending&&!img&&!preview.querySelector('.preview-missing'))preview.insertAdjacentHTML('beforeend','<div class="preview-missing"><i class="ph ph-image-broken"></i><span>Preview unavailable</span></div>');
    });
  }finally{decorating=false}
}

const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(decorateCards,40)});
observer.observe(document.documentElement,{subtree:true,childList:true});
setTimeout(decorateCards,250);

// Upgrade any draft left pending by a closed tab/reload.
(async()=>{
  await sleep(1200);
  const cfg=await settings(),pending=(await getAll('links')).filter(x=>x.pending).slice(0,2);
  pending.forEach(x=>hydrate(x.id,cfg));
})();
