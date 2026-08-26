import {getAll,getOne,putOne,uid,logEvent,getSetting} from './db.js';
import {getMetadata,displayHost,makeSnapshot} from './metadata-v9.js';

const CARD_DATA_VERSION=10;
const inflight=new Set();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(text){
  const root=document.getElementById('toast-root');
  if(!root)return;
  const el=document.createElement('div');
  el.className='toast v9-save-toast';
  el.innerHTML=`<i class="ph-fill ph-lightning"></i><span>${esc(text)}</span><b></b>`;
  root.appendChild(el);
  setTimeout(()=>el.remove(),2300);
}
function refreshApp(){try{window.dispatchEvent(new HashChangeEvent('hashchange'))}catch{window.dispatchEvent(new Event('hashchange'))}}
function normalize(raw){
  let value=String(raw||'').trim();
  if(!value)throw new Error('empty');
  if(!/^https?:\/\//i.test(value))value='https://'+value;
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol))throw new Error('protocol');
  u.hash='';
  const asciiHost=u.hostname.replace(/^www\./,'');
  return {url:u.href,normalizedUrl:u.href.replace(/\/$/,''),asciiHost,displayHost:displayHost(asciiHost)};
}
async function settings(){return {autoMetadata:await getSetting('autoMetadata',true),aiEnabled:await getSetting('aiEnabled',true),autoSnapshot:await getSetting('autoSnapshot',false),workerUrl:await getSetting('workerUrl','')}}
async function snapshot(link,cfg){
  if(!cfg.autoSnapshot)return;
  try{const snap=await makeSnapshot(link,cfg);await putOne('archives',{id:uid('arc'),linkId:link.id,title:link.title,url:link.url,description:link.description,imageUrl:link.imageUrl,capturedAt:Date.now(),...snap});await logEvent('snapshot',{id:link.id,via:'instant-v10'})}catch(err){console.warn('snapshot',err)}
}
async function hydrate(id,cfg){
  const original=await getOne('links',id);if(!original)return;
  try{
    const m=cfg.autoMetadata?await getMetadata(original.url,cfg):null;
    const current=await getOne('links',id);if(!current)return;
    const now=Date.now();
    const next={...current,
      title:m?.title||current.title,domain:m?.domain||current.domain,
      description:m?.description||current.description||'',summary:m?.summary||m?.description||current.summary||'',
      imageUrl:m?.imageUrl||current.imageUrl||'',heroImageUrl:m?.heroImageUrl||current.heroImageUrl||'',featureImageUrl:m?.featureImageUrl||current.featureImageUrl||'',featureLogoUrl:m?.featureLogoUrl||m?.featureImageUrl||current.featureLogoUrl||'',
      favicon:m?.favicon||current.favicon||'',logoUrl:m?.logoUrl||current.logoUrl||'',touchIconUrl:m?.touchIconUrl||current.touchIconUrl||'',manifestIconUrl:m?.manifestIconUrl||current.manifestIconUrl||'',
      themeColor:m?.themeColor||current.themeColor||'',brandKind:m?.brandKind||current.brandKind||'',brandAssetUrl:m?.brandAssetUrl||current.brandAssetUrl||'',
      category:m?.category||current.category||'General',tags:m?.tags||[],metadataSource:m?.source||current.metadataSource||'local',
      pending:false,previewReadyAt:now,metadataRefreshedAt:now,cardDataVersion:CARD_DATA_VERSION,updatedAt:now
    };
    await putOne('links',next);
    await logEvent('metadata_refresh',{id,source:next.metadataSource,via:'instant-v10',brandKind:next.brandKind||'unknown',hasFeatureLogo:!!next.featureLogoUrl});
    await snapshot(next,cfg);refreshApp();
  }catch(err){
    console.warn('metadata v10',err);
    const current=await getOne('links',id);
    if(current){await putOne('links',{...current,pending:false,previewReadyAt:Date.now(),cardDataVersion:CARD_DATA_VERSION,updatedAt:Date.now()});refreshApp()}
  }finally{inflight.delete(original.normalizedUrl)}
}
async function instantSave(raw){
  let p;try{p=normalize(raw)}catch{return toast('URL ไม่ถูกต้อง')}
  if(inflight.has(p.normalizedUrl))return;
  inflight.add(p.normalizedUrl);
  const rows=await getAll('links');
  if(rows.some(x=>x.normalizedUrl===p.normalizedUrl||String(x.url||'').replace(/\/$/,'')===p.normalizedUrl)){inflight.delete(p.normalizedUrl);return toast('ลิงก์นี้บันทึกไว้แล้ว')}
  const now=Date.now(),fallback=`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(p.asciiHost)}`;
  const draft={id:uid('lnk'),url:p.url,normalizedUrl:p.normalizedUrl,title:p.displayHost,domain:p.displayHost,description:'',summary:'',imageUrl:'',heroImageUrl:'',featureImageUrl:'',featureLogoUrl:'',favicon:fallback,logoUrl:'',touchIconUrl:'',manifestIconUrl:'',themeColor:'',brandKind:'',brandAssetUrl:'',category:'Loading',tags:[],collectionId:'col_inbox',favorite:false,pending:true,cardDataVersion:CARD_DATA_VERSION,createdAt:now,updatedAt:now,health:{state:'unknown',status:null,checkedAt:null}};
  try{
    await putOne('links',draft);await logEvent('save',{id:draft.id,instant:true,version:CARD_DATA_VERSION});
    const input=document.getElementById('url-input');if(input){input.value='';input.disabled=false;input.classList.add('v9-saved-input');setTimeout(()=>input.classList.remove('v9-saved-input'),350)}
    toast('Saved · กำลังหาโลโก้หรือจุดเด่นเว็บ');refreshApp();hydrate(draft.id,await settings());
  }catch(err){inflight.delete(p.normalizedUrl);console.error(err);toast('บันทึกลิงก์ไม่สำเร็จ')}
}
function intercept(e){
  const click=e.type==='click'&&e.target.closest?.('#save-url-btn,#modal-save-url');
  const enter=e.type==='keydown'&&e.key==='Enter'&&e.target?.id==='url-input';
  const paste=e.type==='paste'&&e.target?.id==='url-input';
  if(!click&&!enter&&!paste)return;
  let raw='';if(click)raw=document.getElementById(click.id==='modal-save-url'?'modal-url':'url-input')?.value||'';else if(enter)raw=e.target.value||'';else raw=(e.clipboardData||window.clipboardData)?.getData('text')||'';
  if(!String(raw).trim())return;if(paste&&!/^\s*(?:https?:\/\/|www\.|[\p{L}\p{N}-]+\.)/iu.test(raw))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(click?.id==='modal-save-url'){document.getElementById('modal-root').innerHTML='';if(location.hash!=='#home')location.hash='home'}
  instantSave(raw);
}
document.addEventListener('click',intercept,true);document.addEventListener('keydown',intercept,true);document.addEventListener('paste',intercept,true);
