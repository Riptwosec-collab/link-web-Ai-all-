import {getAll,putOne,getSetting,logEvent} from './db.js';
import {getMetadata} from './metadata.js';

const BRAND_FIX_VERSION=8;
const RESCAN_DELAY=900;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let patchQueued=false;

function safeColor(v=''){
  const s=String(v||'').trim();
  return /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(s)?s:'';
}
function isGenericIconUrl(url=''){
  const s=String(url||'').toLowerCase();
  return !s || /google\.com\/s2\/favicons|favicon(?:\.ico)?|apple-touch-icon|manifest|\/icons?\/|logo-?\d*x\d*|icon-?\d*x\d*/i.test(s);
}
function isFeatureUrl(url=''){
  const s=String(url||'').toLowerCase();
  return !!s&&!/favicon|apple-touch|manifest|logo|icon|sprite|pixel|badge/i.test(s);
}
function initials(link){
  const value=String(link.title||link.domain||'WEB').trim();
  const p=value.split(/[\s._-]+/).filter(Boolean);
  return (p.length>1?p[0][0]+p[1][0]:value.slice(0,2)).toUpperCase();
}
function fallbackIcon(link){
  const candidates=[link.touchIconUrl,link.manifestIconUrl,link.favicon].filter(Boolean);
  if(candidates.length)return candidates[0];
  try{return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(new URL(link.url).hostname)}`}catch{return ''}
}
function realLogo(link){
  const declared=String(link.brandKind||'').toLowerCase();
  const candidates=[declared==='logo'?link.brandAssetUrl:'',link.logoUrl].filter(Boolean);
  return candidates.find(u=>!isGenericIconUrl(u))||'';
}
function featureAsset(link){
  const declared=String(link.brandKind||'').toLowerCase();
  const candidates=[link.featureImageUrl,declared==='feature'?link.brandAssetUrl:'',link.imageUrl].filter(Boolean);
  return candidates.find(isFeatureUrl)||'';
}
function choiceFor(link){
  const logo=realLogo(link);
  const feature=featureAsset(link);
  const icon=fallbackIcon(link);
  const theme=safeColor(link.themeColor);
  if(logo)return {kind:'logo',asset:logo,theme};
  if(feature)return {kind:'feature',asset:feature,theme};
  if(icon)return {kind:'icon',asset:icon,theme};
  return {kind:'text',asset:'',theme};
}
function buildCover(cover,preview,link){
  const choice=choiceFor(link);
  const theme=choice.theme||'#0b0f18';
  const stamp=`v8|${choice.kind}|${choice.asset}|${theme}|${link.updatedAt||0}`;
  if(cover.dataset.brandFixStamp===stamp)return;
  cover.dataset.brandFixStamp=stamp;
  cover.dataset.brandKind=choice.kind;
  cover.dataset.hasTheme=choice.theme?'1':'0';
  cover.style.setProperty('--site-theme',theme);
  preview.dataset.brandKind=choice.kind;
  preview.classList.remove('brand-asset-error','logo-fallback-text');

  if(choice.kind==='feature'){
    cover.innerHTML=`<img class="brand-v8-feature-bg" src="${esc(choice.asset)}" alt=""><div class="brand-v8-shade"></div><div class="brand-v8-feature-box"><img class="brand-v8-feature-main" src="${esc(choice.asset)}" alt=""><span>FEATURE</span></div>`;
  }else if(choice.kind==='logo'){
    cover.innerHTML=`<div class="brand-v8-bg"></div><div class="brand-v8-shade"></div><div class="brand-v8-logo-box"><img class="brand-v8-logo-main" src="${esc(choice.asset)}" alt=""><span>LOGO</span></div>`;
  }else if(choice.kind==='icon'){
    cover.innerHTML=`<div class="brand-v8-bg"></div><div class="brand-v8-shade"></div><div class="brand-v8-icon-box"><img class="brand-v8-icon-main" src="${esc(choice.asset)}" alt=""><span>ICON</span></div>`;
  }else{
    cover.innerHTML=`<div class="brand-v8-bg"></div><div class="brand-v8-shade"></div><div class="brand-v8-text-box"><b>${esc(initials(link))}</b><span>WEB</span></div>`;
  }

  cover.querySelectorAll('img').forEach(img=>{
    img.decoding='async';
    img.loading='lazy';
    img.addEventListener('error',()=>{
      cover.dataset.brandKind='text';
      preview.dataset.brandKind='text';
      cover.innerHTML=`<div class="brand-v8-bg"></div><div class="brand-v8-shade"></div><div class="brand-v8-text-box"><b>${esc(initials(link))}</b><span>WEB</span></div>`;
    },{once:true});
  });
}

async function patchCards(){
  patchQueued=false;
  const cards=[...document.querySelectorAll('.link-card[data-link-id]')];
  if(!cards.length)return;
  const links=await getAll('links');
  const map=new Map(links.map(x=>[x.id,x]));
  for(const card of cards){
    const link=map.get(card.dataset.linkId);
    const preview=card.querySelector('.preview');
    if(!link||!preview)continue;
    let cover=preview.querySelector('.brand-logo-cover');
    if(!cover){cover=document.createElement('div');cover.className='brand-logo-cover';preview.insertBefore(cover,preview.firstChild)}
    cover.classList.add('brand-fix-v8');
    buildCover(cover,preview,link);
  }
}
function schedulePatch(){
  if(patchQueued)return;
  patchQueued=true;
  requestAnimationFrame(()=>setTimeout(patchCards,30));
}
function observe(){
  const root=document.getElementById('dynamic-content');
  if(!root)return setTimeout(observe,120);
  new MutationObserver(schedulePatch).observe(root,{childList:true});
  schedulePatch();
}

function weakBrand(link){
  const c=choiceFor(link);
  const hasRealLogo=!!realLogo(link);
  const hasFeature=!!featureAsset(link);
  const hasTheme=!!safeColor(link.themeColor);
  const genericOnly=c.kind==='icon'&&isGenericIconUrl(c.asset);
  return !hasRealLogo&&!hasFeature&&(genericOnly||!hasTheme);
}
async function settings(){return {workerUrl:await getSetting('workerUrl',''),aiEnabled:await getSetting('aiEnabled',true)}}
async function waitUntilVisible(){while(document.visibilityState==='hidden')await wait(1200)}
async function waitForUnlock(){
  for(let i=0;i<60;i++){
    const gate=document.getElementById('smartlink-auth-gate');
    if(!gate||gate.classList.contains('hidden'))return true;
    await wait(400);
  }
  return false;
}
function merge(link,m){
  const now=Date.now();
  return {...link,
    title:m.title||link.title,
    domain:m.domain||link.domain,
    description:m.description||link.description||'',
    summary:m.summary||m.description||link.summary||'',
    imageUrl:m.imageUrl||link.imageUrl||'',
    featureImageUrl:m.featureImageUrl||link.featureImageUrl||'',
    favicon:m.favicon||link.favicon||'',
    logoUrl:m.logoUrl||link.logoUrl||'',
    touchIconUrl:m.touchIconUrl||link.touchIconUrl||'',
    manifestIconUrl:m.manifestIconUrl||link.manifestIconUrl||'',
    themeColor:m.themeColor||link.themeColor||'',
    brandKind:m.brandKind||link.brandKind||'',
    brandAssetUrl:m.brandAssetUrl||link.brandAssetUrl||'',
    metadataSource:m.source||link.metadataSource||'',
    brandFixVersion:BRAND_FIX_VERSION,
    brandFixScannedAt:now,
    updatedAt:now
  };
}
async function targetedRescan(){
  if(!(await waitForUnlock()))return;
  const cfg=await settings();
  let queue=(await getAll('links')).filter(x=>Number(x.brandFixVersion||0)<BRAND_FIX_VERSION&&weakBrand(x));
  if(!queue.length)return;
  queue=queue.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  for(const link of queue){
    await waitUntilVisible();
    try{
      const m=await getMetadata(link.url,cfg);
      const next=merge(link,m);
      await putOne('links',next);
      await logEvent('brand_fix_v8',{id:link.id,kind:choiceFor(next).kind,source:m.source||'unknown'});
    }catch(err){
      await putOne('links',{...link,brandFixAttemptedAt:Date.now(),brandFixFailures:Number(link.brandFixFailures||0)+1,updatedAt:Date.now()});
      console.warn('Brand V8 scan failed',link.url,err);
    }
    schedulePatch();
    await wait(RESCAN_DELAY);
  }
}

observe();
setTimeout(targetedRescan,1800);
