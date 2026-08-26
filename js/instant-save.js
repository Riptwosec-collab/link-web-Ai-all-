import {getAll,getOne,putOne,uid,logEvent,getSetting} from './db.js';
import {getMetadata,displayHost,makeSnapshot} from './metadata.js';

const inflight=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let decorateQueued=false;

function toast(text){
  const root=document.getElementById('toast-root');
  if(!root)return;
  const el=document.createElement('div');
  el.className='toast instant-toast';
  el.innerHTML=`<span class="instant-toast-icon"><i class="ph-fill ph-lightning"></i></span><span>${esc(text)}</span><span class="instant-toast-line"></span>`;
  root.appendChild(el);
  setTimeout(()=>el.remove(),2600);
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
  const asciiHost=u.hostname.replace(/^www\./,'');
  return {url,normalizedUrl:url.replace(/\/$/,''),asciiHost,displayHost:displayHost(asciiHost)};
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
    const now=Date.now();
    const next={...current,
      title:m?.title||current.title,
      domain:m?.domain||current.domain,
      description:m?.description||current.description||'',
      summary:m?.summary||m?.description||current.summary||'',
      imageUrl:m?.imageUrl||current.imageUrl||'',
      favicon:m?.favicon||current.favicon||'',
      logoUrl:m?.logoUrl||m?.favicon||current.logoUrl||current.favicon||'',
      category:m?.category||current.category||'General',
      tags:m?.tags?.length?m.tags:(current.tags||[]),
      metadataSource:m?.source||current.metadataSource||'local',
      metadataRefreshedAt:now,previewReadyAt:now,pending:false,updatedAt:now
    };
    await putOne('links',next);
    await logEvent('metadata_refresh',{id,source:next.metadataSource,instant:true,hasImage:!!next.imageUrl});
    await saveSnapshot(next,cfg);
    rerender();
  }catch(err){
    console.warn('Background metadata failed',err);
    const current=await getOne('links',id);
    if(current){current.pending=false;current.previewReadyAt=Date.now();current.updatedAt=Date.now();await putOne('links',current);rerender()}
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
  const fallbackLogo=`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(parsed.asciiHost)}`;
  const draft={id:uid('lnk'),url:parsed.url,normalizedUrl:parsed.normalizedUrl,title:parsed.displayHost,domain:parsed.displayHost,
    description:'',summary:'กำลังดึงชื่อ คำอธิบาย และรูป Preview…',imageUrl:'',favicon:fallbackLogo,logoUrl:fallbackLogo,
    category:'Loading',tags:[],collectionId:'col_inbox',favorite:false,createdAt:now,updatedAt:now,pending:true,metadataSource:'pending',
    health:{state:'unknown',status:null,checkedAt:null}};

  try{
    await putOne('links',draft);
    await logEvent('save',{id:draft.id,category:'Loading',instant:true});
    const input=document.getElementById('url-input');
    if(input){input.value='';input.disabled=false;input.placeholder='Paste URL or type one here…';input.classList.add('save-pop');setTimeout(()=>input.classList.remove('save-pop'),420)}
    toast('Saved · กำลังเติมข้อมูล');
    rerender();
    const cfg=await settings();
    hydrate(draft.id,cfg);
  }catch(err){inflight.delete(parsed.normalizedUrl);console.error(err);toast('บันทึกลิงก์ไม่สำเร็จ')}
}

function intercept(e){
  const click=e.type==='click'&&e.target.closest?.('#save-url-btn,#modal-save-url');
  const enter=e.type==='keydown'&&e.key==='Enter'&&e.target?.id==='url-input';
  const paste=e.type==='paste'&&e.target?.id==='url-input';
  if(!click&&!enter&&!paste)return;
  let raw='';
  if(click)raw=document.getElementById(click.id==='modal-save-url'?'modal-url':'url-input')?.value||'';
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

function logoFor(link){
  if(link.logoUrl)return link.logoUrl;
  if(link.favicon)return link.favicon;
  try{return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(new URL(link.url).hostname)}`}catch{return ''}
}

function initials(link){
  const value=String(link.title||link.domain||'WEB').trim();
  const p=value.split(/[\s._-]+/).filter(Boolean);
  return (p.length>1?p[0][0]+p[1][0]:value.slice(0,2)).toUpperCase();
}

function ensureBrandCover(preview,link){
  let cover=preview.querySelector('.brand-logo-cover');
  const logo=logoFor(link);
  if(!cover){
    cover=document.createElement('div');
    cover.className='brand-logo-cover';
    preview.insertBefore(cover,preview.firstChild);
  }
  if(cover.dataset.logo===logo&&cover.dataset.title===String(link.title||''))return cover;
  cover.dataset.logo=logo;cover.dataset.title=String(link.title||'');
  cover.innerHTML=logo?`<img class="brand-logo-bg" src="${esc(logo)}" alt=""><div class="brand-logo-shade"></div><div class="brand-logo-box"><img class="brand-logo-main" src="${esc(logo)}" alt=""><span>${esc(initials(link))}</span></div>`:`<div class="brand-logo-shade"></div><div class="brand-logo-box brand-logo-text"><b>${esc(initials(link))}</b></div>`;
  cover.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{preview.classList.add('logo-fallback-text')},{once:true}));
  return cover;
}

function bindImageQuality(img,preview){
  if(img.dataset.qualityBound==='1')return;
  img.dataset.qualityBound='1';
  const decide=()=>{
    const w=img.naturalWidth||0,h=img.naturalHeight||0,src=String(img.currentSrc||img.src||'');
    const area=w*h,oddRatio=h?Math.max(w/h,h/w)>4.5:true;
    const looksLikeIcon=/favicon|logo|icon|sprite|pixel|badge/i.test(src);
    const poor=!w||!h||w<520||h<220||area<260000||oddRatio||looksLikeIcon;
    preview.classList.toggle('use-logo-cover',poor);
    preview.classList.toggle('use-photo-cover',!poor);
    img.classList.toggle('low-quality-preview',poor);
    if(poor)img.setAttribute('aria-hidden','true');
  };
  img.addEventListener('load',decide,{once:true});
  img.addEventListener('error',()=>{preview.classList.add('use-logo-cover');preview.classList.remove('use-photo-cover')},{once:true});
  if(img.complete)requestAnimationFrame(decide);
}

async function decorateCards(){
  decorateQueued=false;
  const cards=[...document.querySelectorAll('.link-card[data-link-id]')];
  if(!cards.length)return;
  const links=await getAll('links');
  const map=new Map(links.map(x=>[x.id,x]));
  for(const card of cards){
    const link=map.get(card.dataset.linkId),preview=card.querySelector('.preview');
    if(!link||!preview)continue;
    const stamp=`${link.updatedAt||0}:${link.pending?1:0}`;
    if(card.dataset.decorateStamp===stamp)continue;
    card.dataset.decorateStamp=stamp;
    ensureBrandCover(preview,link);
    card.classList.toggle('is-pending',!!link.pending);
    const img=preview.querySelector(':scope > img');
    if(img){img.classList.add('preview-image');img.loading='lazy';img.decoding='async';bindImageQuality(img,preview)}
    else{preview.classList.add('use-logo-cover');preview.classList.remove('use-photo-cover')}
    if(link.pending&&!preview.querySelector('.preview-loader'))preview.insertAdjacentHTML('beforeend','<div class="preview-loader fast-loader"><span class="preview-orbit"><i class="ph ph-sparkle"></i></span><b>Saved</b><small>กำลังโหลดข้อมูลเว็บไซต์…</small></div><span class="saving-pill"><i class="ph-fill ph-lightning"></i> Saved</span>');
    const ready=Number(link.previewReadyAt||0)>0&&Date.now()-Number(link.previewReadyAt)<4200;
    if(ready&&!link.pending&&!preview.querySelector('.ready-pill'))preview.insertAdjacentHTML('beforeend','<span class="ready-pill"><i class="ph-fill ph-check-circle"></i> Ready</span>');
  }
}

function scheduleDecorate(){
  if(decorateQueued)return;decorateQueued=true;
  requestAnimationFrame(()=>{
    if('requestIdleCallback'in window)requestIdleCallback(()=>decorateCards(),{timeout:140});
    else setTimeout(decorateCards,24);
  });
}

function observeGrid(){
  const root=document.getElementById('dynamic-content');
  if(!root)return setTimeout(observeGrid,100);
  new MutationObserver(scheduleDecorate).observe(root,{childList:true});
  scheduleDecorate();
}
observeGrid();

(async()=>{
  await sleep(900);
  const cfg=await settings();
  const pending=(await getAll('links')).filter(x=>x.pending).slice(0,2);
  pending.forEach(x=>hydrate(x.id,cfg));
})();
