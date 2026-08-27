import {getAll,getOne,putOne,getSetting,logEvent} from './db.js';
import {getMetadata,displayHost} from './metadata-v9.js';
import {refreshVisibleCard} from './card-v12.js';

const DATA_VERSION=11;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const tlds=new Set(['com','net','org','co','th','io','ai','app','dev','xyz','site','online','me','info','biz','cc','tv','shop','store']);
const generic=v=>/^(?:no description|untitled|home)$/i.test(String(v||'').trim())||/website or online service|general website|online service from/i.test(String(v||''));
const hostOf=url=>{try{return displayHost(new URL(url).hostname.replace(/^www\./,''))}catch{return ''}};
function cleanTags(link,tags=link.tags||[]){
  const host=hostOf(link.url||'').toLowerCase(),hostParts=new Set(host.split(/[.\-_/]+/).filter(Boolean)),cat=String(link.category||'General').toLowerCase(),out=[];
  for(const raw of tags){const tag=String(raw||'').trim();if(!tag)continue;const k=tag.toLowerCase();if(k==='www'||k==='general'||k===cat||tlds.has(k)||hostParts.has(k))continue;if(k.length<2||out.some(x=>x.toLowerCase()===k))continue;out.push(tag);if(out.length>=6)break}
  return out;
}
async function settings(){const [workerUrl,aiEnabled]=await Promise.all([getSetting('workerUrl',''),getSetting('aiEnabled',true)]);return {workerUrl,aiEnabled}}
async function waitForUnlock(){for(let i=0;i<80;i++){const gate=document.getElementById('smartlink-auth-gate');if(!gate||gate.classList.contains('hidden'))return true;await delay(350)}return false}
async function waitVisible(){while(document.visibilityState==='hidden')await delay(1000)}
function merge(link,m,{mark=true}={}){
  const now=Date.now(),description=generic(m?.description)?'':(m?.description||link.description||''),summary=generic(m?.summary)?'':(m?.summary||description||link.summary||'');
  const next={...link,title:m?.title||link.title,domain:m?.domain||link.domain,description,summary,imageUrl:m?.imageUrl||link.imageUrl||'',screenshotUrl:m?.screenshotUrl||link.screenshotUrl||'',heroImageUrl:m?.heroImageUrl||link.heroImageUrl||'',featureImageUrl:m?.featureImageUrl||link.featureImageUrl||'',featureLogoUrl:m?.featureLogoUrl||m?.featureImageUrl||link.featureLogoUrl||'',favicon:m?.favicon||link.favicon||'',logoUrl:m?.logoUrl||link.logoUrl||'',touchIconUrl:m?.touchIconUrl||link.touchIconUrl||'',manifestIconUrl:m?.manifestIconUrl||link.manifestIconUrl||'',themeColor:m?.themeColor||link.themeColor||'',brandKind:m?.brandKind||link.brandKind||'',brandAssetUrl:m?.brandAssetUrl||link.brandAssetUrl||'',category:m?.category||link.category||'General',metadataSource:m?.source||link.metadataSource||'',cardDataVersion:mark?DATA_VERSION:Number(link.cardDataVersion||0),cardDataScannedAt:mark?now:(link.cardDataScannedAt||0),updatedAt:now};
  next.tags=cleanTags(next,m?.tags?.length?m.tags:(link.tags||[]));return next;
}
async function scanOne(link,cfg){
  try{const m=await getMetadata(link.url,cfg),next=merge(link,m);await putOne('links',next);logEvent('metadata_v11',{id:link.id,source:m?.source||'unknown',brandKind:next.brandKind||'unknown',hasBackground:!!(next.heroImageUrl||next.featureImageUrl||next.imageUrl||next.screenshotUrl)}).catch(()=>{});return next}
  catch(err){console.warn('V11 metadata scan failed',link.url,err);const now=Date.now(),next={...link,tags:cleanTags(link),cardDataVersion:DATA_VERSION,cardDataScannedAt:now,cardDataScanFailed:true,updatedAt:now};if(generic(next.description))next.description='';if(generic(next.summary))next.summary='';await putOne('links',next);return next}
}
async function migrateAll(){
  if(!(await waitForUnlock()))return;
  const cfg=await settings(),queue=(await getAll('links')).filter(x=>Number(x.cardDataVersion||0)<DATA_VERSION).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  if(!queue.length)return;
  let count=0;for(const link of queue){await waitVisible();const next=await scanOne(link,cfg);count++;if(document.querySelector(`.link-card[data-link-id="${CSS.escape(next.id)}"]`))await refreshVisibleCard(next.id);await delay(count%3===0?850:420)}
  localStorage.setItem('slh_card_data_version',String(DATA_VERSION));localStorage.setItem('slh_card_data_updated_at',String(Date.now()));
}
async function manualRefresh(id,button){const link=await getOne('links',id);if(!link)return;button.disabled=true;button.innerHTML='<i class="ph ph-circle-notch v9-spin"></i>';try{await scanOne({...link,cardDataVersion:0},await settings());await refreshVisibleCard(id)}finally{button.disabled=false;button.innerHTML='<i class="ph ph-arrows-clockwise"></i>'}}
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-refresh-metadata]');if(!button)return;const id=button.closest('.link-card')?.dataset.linkId;if(!id)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();manualRefresh(id,button)},true);
setTimeout(migrateAll,2200);
