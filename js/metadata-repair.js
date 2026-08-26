import {getAll,putOne,getSetting,logEvent} from './db.js';
import {getMetadata,displayHost} from './metadata.js';

const BRAND_AUDIT_VERSION=7;
const BATCH_SIZE=2;
const BATCH_DELAY=900;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const generic=v=>/website or online service|general website|online service from|no description/i.test(String(v||''));
const hostOf=url=>{try{return displayHost(new URL(url).hostname.replace(/^www\./,''))}catch{return ''}};
const badTitle=link=>{const t=String(link?.title||'').trim().toLowerCase(),h=hostOf(link?.url||'').toLowerCase();return !t||t===h||t.startsWith('xn--')||t==='untitled'||t==='home'};
const missingBrand=link=>!link?.brandKind||!(link?.brandAssetUrl||link?.logoUrl||link?.featureImageUrl||link?.touchIconUrl||link?.manifestIconUrl||link?.favicon);
const needsRepair=link=>badTitle(link)||!String(link?.description||link?.summary||'').trim()||generic(link?.description)||generic(link?.summary)||(!link?.imageUrl&&!link?.featureImageUrl)||missingBrand(link);
const needsBrandAudit=link=>Number(link?.brandAuditVersion||0)<BRAND_AUDIT_VERSION;

function score(link){
 let s=0;
 const h=hostOf(link?.url||'').toLowerCase(),t=String(link?.title||'').trim().toLowerCase();
 if(t&&t!==h&&!t.startsWith('xn--'))s+=4;
 if(String(link?.description||'').trim().length>=35&&!generic(link.description))s+=2;
 if(String(link?.summary||'').trim().length>=25&&!generic(link.summary))s+=1;
 if(link?.imageUrl||link?.featureImageUrl)s+=3;
 if(link?.brandKind)s+=2;
 if(link?.logoUrl||link?.brandAssetUrl||link?.touchIconUrl||link?.manifestIconUrl)s+=2;
 if(link?.themeColor)s+=1;
 if(link?.favicon)s+=1;
 return s;
}
async function settings(){return {workerUrl:await getSetting('workerUrl',''),aiEnabled:await getSetting('aiEnabled',true)}}

function mergeMetadata(link,m,{markAudit=false}={}){
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
  category:m.category||link.category||'General',
  tags:(m.tags?.length?m.tags:link.tags)||[],
  metadataSource:m.source||link.metadataSource||'',
  metadataRefreshedAt:now,
  brandAuditedAt:markAudit?now:(link.brandAuditedAt||0),
  brandAuditVersion:markAudit?BRAND_AUDIT_VERSION:Number(link.brandAuditVersion||0),
  updatedAt:now
 };
}

async function repairLink(link,{force=false,markAudit=false,cfg=null}={}){
 if(!link?.url)return false;
 const before=score(link),config=cfg||await settings();
 try{
  const m=await getMetadata(link.url,config);
  const next=mergeMetadata(link,m,{markAudit});
  const after=score(next);
  if(force||markAudit||after>before){
   await putOne('links',next);
   await logEvent('metadata_refresh',{id:link.id,before,after,source:m.source||'unknown',brandKind:next.brandKind||'unknown',brandAudit:!!markAudit,brandAuditVersion:next.brandAuditVersion||0});
   return true;
  }
 }catch(err){
  console.warn('Metadata refresh failed',link.url,err);
  if(markAudit){
   const failed={...link,brandAuditAttemptedAt:Date.now(),brandAuditFailures:Number(link.brandAuditFailures||0)+1,updatedAt:Date.now()};
   await putOne('links',failed);
  }
 }
 return false;
}

async function waitForUnlock(){for(let i=0;i<60;i++){const gate=document.getElementById('smartlink-auth-gate');if(!gate||gate.classList.contains('hidden'))return true;await delay(500)}return false}
async function waitForVisible(){while(document.visibilityState==='hidden')await delay(1000)}

function notify(text){
 const root=document.getElementById('toast-root');if(!root)return;
 const el=document.createElement('div');el.className='toast instant-toast';el.textContent=text;root.appendChild(el);setTimeout(()=>el.remove(),3200);
}
function refreshVisiblePage(){
 try{window.dispatchEvent(new HashChangeEvent('hashchange'))}catch{window.dispatchEvent(new Event('hashchange'))}
}

async function fullBrandAudit(){
 if(!(await waitForUnlock()))return;
 const cfg=await settings();
 let queue=(await getAll('links')).filter(needsBrandAudit).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
 if(!queue.length)return;
 notify(`กำลังตรวจโลโก้และพื้นหลังใหม่ ${queue.length} เว็บ`);
 let completed=0,changed=0;
 while(queue.length){
  await waitForVisible();
  const batch=queue.splice(0,BATCH_SIZE);
  const results=await Promise.all(batch.map(link=>repairLink(link,{force:true,markAudit:true,cfg})));
  changed+=results.filter(Boolean).length;
  completed+=batch.length;
  if(queue.length)await delay(BATCH_DELAY);
 }
 localStorage.setItem('slh_brand_audit_version',String(BRAND_AUDIT_VERSION));
 localStorage.setItem('slh_brand_audit_completed_at',String(Date.now()));
 refreshVisiblePage();
 notify(`ตรวจใหม่ครบ ${completed} เว็บ · อัปเดตปก ${changed} รายการ`);
}

async function quickRepair(){
 if(!(await waitForUnlock()))return;
 const links=(await getAll('links')).filter(x=>!needsBrandAudit(x)&&needsRepair(x)).sort((a,b)=>score(a)-score(b)||(b.createdAt||0)-(a.createdAt||0)).slice(0,2);
 if(!links.length)return;
 const cfg=await settings();
 for(const link of links){await repairLink(link,{cfg});await delay(500)}
}

let buttonQueued=false;
function addRefreshButtons(){
 buttonQueued=false;
 document.querySelectorAll('.link-card').forEach(card=>{
  if(card.querySelector('[data-refresh-metadata]'))return;
  const menu=card.querySelector('.link-menu');if(!menu)return;
  const btn=document.createElement('button');btn.className='card-action';btn.type='button';btn.dataset.refreshMetadata='1';
  btn.title='Refresh title, logo, hero, background & preview';btn.setAttribute('aria-label','Refresh metadata');btn.innerHTML='<i class="ph ph-arrows-clockwise"></i>';menu.appendChild(btn);
 });
}
function scheduleButtons(){if(buttonQueued)return;buttonQueued=true;requestAnimationFrame(addRefreshButtons)}
function observeGrid(){const root=document.getElementById('dynamic-content');if(!root)return setTimeout(observeGrid,120);new MutationObserver(scheduleButtons).observe(root,{childList:true});scheduleButtons()}
observeGrid();

document.addEventListener('click',async e=>{
 const btn=e.target.closest?.('[data-refresh-metadata]');if(!btn)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 const card=btn.closest('.link-card'),id=card?.dataset.linkId;if(!id)return;
 btn.disabled=true;btn.innerHTML='<i class="ph ph-circle-notch" style="animation:spin .8s linear infinite"></i>';
 const links=await getAll('links'),link=links.find(x=>x.id===id);
 const changed=await repairLink(link,{force:true,markAudit:true});
 if(changed){refreshVisiblePage();notify('ตรวจโลโก้และพื้นหลังใหม่แล้ว');return}
 btn.disabled=false;btn.innerHTML='<i class="ph ph-arrows-clockwise"></i>';notify('ยังดึงข้อมูลจากเว็บนี้ไม่ได้');
},true);

setTimeout(fullBrandAudit,1400);
setTimeout(quickRepair,4000);
