import {getAll,putOne,getSetting,logEvent} from './db.js';
import {getMetadata,displayHost} from './metadata.js';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const generic=v=>/website or online service|general website|online service from|no description/i.test(String(v||''));
const hostOf=url=>{try{return displayHost(new URL(url).hostname.replace(/^www\./,''))}catch{return ''}};
const badTitle=link=>{const t=String(link?.title||'').trim().toLowerCase(),h=hostOf(link?.url||'').toLowerCase();return !t||t===h||t.startsWith('xn--')||t==='untitled'||t==='home'};
const missingBrand=link=>!link?.brandKind||!(link?.brandAssetUrl||link?.logoUrl||link?.featureImageUrl||link?.favicon);
const needsRepair=link=>badTitle(link)||!String(link?.description||link?.summary||'').trim()||generic(link?.description)||generic(link?.summary)||(!link?.imageUrl&&!link?.featureImageUrl)||missingBrand(link);
function score(link){let s=0;const h=hostOf(link?.url||'').toLowerCase(),t=String(link?.title||'').trim().toLowerCase();if(t&&t!==h&&!t.startsWith('xn--'))s+=4;if(String(link?.description||'').trim().length>=35&&!generic(link.description))s+=2;if(String(link?.summary||'').trim().length>=25&&!generic(link.summary))s+=1;if(link?.imageUrl||link?.featureImageUrl)s+=3;if(link?.brandKind)s+=2;if(link?.logoUrl||link?.brandAssetUrl)s+=2;if(link?.favicon)s+=1;return s}
async function settings(){return {workerUrl:await getSetting('workerUrl',''),aiEnabled:await getSetting('aiEnabled',true)}}

async function repairLink(link,{force=false}={}){
 if(!link?.url)return false;
 const before=score(link),cfg=await settings();
 try{
  const m=await getMetadata(link.url,cfg),now=Date.now();
  const next={...link,
   title:m.title||link.title,domain:m.domain||link.domain,description:m.description||link.description||'',summary:m.summary||m.description||link.summary||'',
   imageUrl:m.imageUrl||link.imageUrl||'',featureImageUrl:m.featureImageUrl||link.featureImageUrl||'',favicon:m.favicon||link.favicon||'',logoUrl:m.logoUrl||link.logoUrl||'',
   touchIconUrl:m.touchIconUrl||link.touchIconUrl||'',manifestIconUrl:m.manifestIconUrl||link.manifestIconUrl||'',themeColor:m.themeColor||link.themeColor||'',
   brandKind:m.brandKind||link.brandKind||'',brandAssetUrl:m.brandAssetUrl||link.brandAssetUrl||'',category:m.category||link.category||'General',tags:(m.tags?.length?m.tags:link.tags)||[],
   metadataSource:m.source||link.metadataSource||'',metadataRefreshedAt:now,updatedAt:now};
  const after=score(next);
  if(force||after>before){await putOne('links',next);await logEvent('metadata_refresh',{id:link.id,before,after,source:m.source||'unknown',brandKind:next.brandKind||'unknown'});return true}
 }catch(err){console.warn('Metadata refresh failed',link.url,err)}
 return false;
}

async function waitForUnlock(){for(let i=0;i<60;i++){const gate=document.getElementById('smartlink-auth-gate');if(!gate||gate.classList.contains('hidden'))return true;await delay(500)}return false}
async function autoRepair(){
 if(!(await waitForUnlock()))return;
 const last=Number(localStorage.getItem('slh_metadata_repair_v2_last')||0);if(Date.now()-last<8*60*1000)return;
 localStorage.setItem('slh_metadata_repair_v2_last',String(Date.now()));
 const links=(await getAll('links')).filter(needsRepair).sort((a,b)=>score(a)-score(b)||(b.createdAt||0)-(a.createdAt||0)).slice(0,3);
 if(!links.length)return;
 let changed=0;for(const link of links){if(await repairLink(link))changed++}
 if(changed&&!sessionStorage.getItem('slh_brand_repaired_once')){sessionStorage.setItem('slh_brand_repaired_once','1');location.reload()}
}

let buttonQueued=false;
function addRefreshButtons(){buttonQueued=false;document.querySelectorAll('.link-card').forEach(card=>{if(card.querySelector('[data-refresh-metadata]'))return;const menu=card.querySelector('.link-menu');if(!menu)return;const btn=document.createElement('button');btn.className='card-action';btn.type='button';btn.dataset.refreshMetadata='1';btn.title='Refresh title, brand, description & preview';btn.setAttribute('aria-label','Refresh metadata');btn.innerHTML='<i class="ph ph-arrows-clockwise"></i>';menu.appendChild(btn)})}
function scheduleButtons(){if(buttonQueued)return;buttonQueued=true;requestAnimationFrame(addRefreshButtons)}
function observeGrid(){const root=document.getElementById('dynamic-content');if(!root)return setTimeout(observeGrid,120);new MutationObserver(scheduleButtons).observe(root,{childList:true});scheduleButtons()}
observeGrid();

document.addEventListener('click',async e=>{
 const btn=e.target.closest?.('[data-refresh-metadata]');if(!btn)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 const card=btn.closest('.link-card'),id=card?.dataset.linkId;if(!id)return;
 btn.disabled=true;btn.innerHTML='<i class="ph ph-circle-notch" style="animation:spin .8s linear infinite"></i>';
 const links=await getAll('links'),link=links.find(x=>x.id===id);const changed=await repairLink(link,{force:true});
 if(changed){sessionStorage.removeItem('slh_brand_repaired_once');location.reload();return}
 btn.disabled=false;btn.innerHTML='<i class="ph ph-arrows-clockwise"></i>';alert('ยังดึงข้อมูลจากเว็บนี้ไม่ได้ กรุณาลองใหม่ภายหลัง');
},true);

setTimeout(autoRepair,1500);