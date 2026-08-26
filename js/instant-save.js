import {getAll,getOne,putOne,uid,logEvent,getSetting} from './db.js';
import {getMetadata,displayHost,makeSnapshot} from './metadata.js';

const inflight=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(text){
  const root=document.getElementById('toast-root');
  if(!root)return;
  const el=document.createElement('div');
  el.className='toast instant-toast';
  el.innerHTML=`<span class="instant-toast-icon"><i class="ph-fill ph-lightning"></i></span><span>${esc(text)}</span><span class="instant-toast-line"></span>`;
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
    const now=Date.now();
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
      metadataRefreshedAt:now,
      previewReadyAt:now,
      pending:false,
      updatedAt:now
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
    if(input){input.value='';input.disabled=false;input.placeholder='Paste URL or type one here…';input.classList.add('save-pop');setTimeout(()=>input.classList.remove('save-pop'),520)}
    toast('Saved ทันที · กำลังสร้าง Preview');
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

function hashNumber(value=''){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
}

function coverPalette(link){
  const seed=hashNumber(link.domain||link.url||link.id||'link');
  const base=seed%360;
  const category=String(link.category||'').toLowerCase();
  let hue=base;
  if(category.includes('travel'))hue=188+(seed%28);
  else if(category.includes('ai'))hue=245+(seed%40);
  else if(category.includes('develop'))hue=205+(seed%30);
  else if(category.includes('design'))hue=292+(seed%34);
  else if(category.includes('finance'))hue=145+(seed%34);
  else if(category.includes('media'))hue=332+(seed%28);
  else if(category.includes('learn'))hue=35+(seed%35);
  return {a:hue%360,b:(hue+48+(seed%26))%360,c:(hue+118+(seed%42))%360};
}

function coverIcon(category=''){
  const c=String(category).toLowerCase();
  if(c.includes('travel'))return 'mountains';
  if(c.includes('ai'))return 'brain';
  if(c.includes('develop'))return 'code';
  if(c.includes('design'))return 'palette';
  if(c.includes('finance'))return 'chart-line-up';
  if(c.includes('media'))return 'play-circle';
  if(c.includes('learn'))return 'book-open';
  if(c.includes('shopping'))return 'shopping-bag';
  return 'link-simple';
}

function coverInitial(link){
  const title=String(link.title||link.domain||'LINK').trim();
  const parts=title.split(/[\s._-]+/).filter(Boolean);
  return (parts.length>1?(parts[0][0]+parts[1][0]):title.slice(0,2)).toUpperCase();
}

function ensureColorCover(preview,link){
  let cover=preview.querySelector('.smart-color-cover');
  const p=coverPalette(link);
  if(!cover){
    cover=document.createElement('div');
    cover.className='smart-color-cover';
    preview.insertBefore(cover,preview.firstChild);
  }
  cover.style.setProperty('--cover-a',p.a);
  cover.style.setProperty('--cover-b',p.b);
  cover.style.setProperty('--cover-c',p.c);
  cover.innerHTML=`<div class="cover-glow cover-glow-a"></div><div class="cover-glow cover-glow-b"></div><div class="cover-grid"></div><div class="cover-symbol"><i class="ph ph-${coverIcon(link.category)}"></i><b>${esc(coverInitial(link))}</b></div>`;
  return cover;
}

function bindImageQuality(img,preview){
  if(img.dataset.qualityBound==='1')return;
  img.dataset.qualityBound='1';
  const decide=()=>{
    const w=img.naturalWidth||0,h=img.naturalHeight||0,area=w*h;
    const poor=!w||!h||w<420||h<180||area<180000;
    preview.classList.toggle('cover-color-only',poor);
    preview.classList.toggle('cover-image-good',!poor);
    img.classList.toggle('low-quality-preview',poor);
    if(poor){img.setAttribute('aria-hidden','true');img.title='Low-resolution preview replaced with smart color cover'}
  };
  img.addEventListener('load',decide,{once:true});
  img.addEventListener('error',()=>{preview.classList.add('cover-color-only');preview.classList.remove('cover-image-good')},{once:true});
  if(img.complete)requestAnimationFrame(decide);
}

let decorating=false;
async function decorateCards(){
  if(decorating)return;decorating=true;
  try{
    const links=await getAll('links'),map=new Map(links.map(x=>[x.id,x]));
    document.querySelectorAll('.link-card[data-link-id]').forEach(card=>{
      const link=map.get(card.dataset.linkId),preview=card.querySelector('.preview');
      if(!link||!preview)return;
      ensureColorCover(preview,link);
      card.classList.toggle('is-pending',!!link.pending);
      const img=preview.querySelector(':scope > img');
      if(img){
        img.classList.add('preview-image');img.loading='lazy';img.decoding='async';
        bindImageQuality(img,preview);
        if(!preview.querySelector('.preview-overlay'))preview.insertAdjacentHTML('beforeend','<div class="preview-overlay"></div>');
      }else preview.classList.add('cover-color-only');

      if(link.pending&&!preview.querySelector('.preview-loader')){
        preview.insertAdjacentHTML('beforeend',`<div class="preview-loader"><span class="preview-orbit"><i class="ph ph-sparkle"></i></span><b>Smart Save</b><small>กำลังดึงชื่อ · คำอธิบาย · รูปปก</small><div class="save-flow"><span><i class="ph-fill ph-check-circle"></i>Saved</span><em></em><span><i class="ph ph-radar"></i>Reading</span><em></em><span><i class="ph ph-image"></i>Preview</span></div></div><span class="saving-pill"><i class="ph-fill ph-lightning"></i> Saved instantly</span>`);
      }

      const ready=Number(link.previewReadyAt||0)>0&&Date.now()-Number(link.previewReadyAt)<6500;
      if(ready&&!link.pending&&!preview.querySelector('.ready-pill')){
        preview.insertAdjacentHTML('beforeend','<span class="ready-pill"><i class="ph-fill ph-check-circle"></i> Ready</span><span class="ready-burst"></span>');
      }
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
