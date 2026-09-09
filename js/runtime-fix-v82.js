import {hydrateCloudLinks,getAll,getIntegrityStatus,logRuntimeEvent} from './db.js';

const POLL_MS=12000;
let pollTimer=null;
let running=false;
let lastSignature='';
let eventBusy=false;
let renderTimer=null;

const token=()=>{try{return localStorage.getItem('smartlink_session_token')||''}catch{return ''}};
const liveRows=rows=>(Array.isArray(rows)?rows:[]).filter(x=>!x?.deletedAt);

function signature(rows=[]){
  return liveRows(rows).map(x=>`${x.id}:${Number(x.version||0)}:${x.favorite?1:0}:${x.readLater?1:0}:${x.category||''}:${Number(x.updatedAt||0)}`).sort().join('|');
}

async function updateSidebar(rows=null){
  const links=rows?liveRows(rows):await getAll('links');
  const collections=await getAll('collections').catch(()=>[]);
  const linkEl=document.getElementById('side-links');
  const favEl=document.getElementById('side-favs');
  const colEl=document.getElementById('side-cols');
  if(linkEl)linkEl.textContent=String(links.length);
  if(favEl)favEl.textContent=String(links.filter(x=>x.favorite).length);
  if(colEl)colEl.textContent=String(collections.length);
  return links;
}

function primaryKey(){
  const q=new URLSearchParams(location.search);
  const title=document.getElementById('page-title')?.textContent?.trim()||'';
  if(q.get('v7')==='semantic'||title==='Semantic AI')return'ai';
  if(q.get('v76')==='organization'||title==='Category Center')return'categories';
  if(q.get('v6')==='read-later'||title==='Read Later')return'read-later';
  if(location.hash==='#favorites'||title==='Favorites')return'favorites';
  if(location.hash==='#search'||title==='Search')return'library';
  if(location.hash==='#settings'||title==='Settings')return'settings';
  return'home';
}

function userIsEditing(){
  const a=document.activeElement;
  return !!(a&&['INPUT','TEXTAREA','SELECT'].includes(a.tagName)&&!a.matches('[readonly],[disabled]'));
}

function refreshCurrent({force=false}={}){
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>{
    if(!force&&userIsEditing())return;
    if(document.querySelector('.modal-backdrop,#command-overlay:not(.hidden),#v7-command:not(.hidden)'))return;
    const key=primaryKey();
    if(!force&&!['home','library','favorites','read-later'].includes(key))return;
    const nav=window.SmartLinkNavigation;
    if(nav?.route){nav.route(key);return}
    const legacy={home:'home',library:'search',favorites:'favorites',settings:'settings'}[key];
    if(legacy)document.querySelector(`#sidebar-nav [data-page="${legacy}"]`)?.click();
  },120);
}

async function record(type,detail={},level='info'){
  if(!token()||!navigator.onLine)return;
  try{await logRuntimeEvent(type,detail,level)}catch{}
}

async function syncNow({forceRender=false,quiet=false}={}){
  if(running||!token()||!navigator.onLine||(!forceRender&&document.visibilityState==='hidden'))return false;
  running=true;
  try{
    const rows=await hydrateCloudLinks({force:true});
    const next=signature(rows);
    const changed=lastSignature!==''&&next!==lastSignature;
    const first=lastSignature==='';
    lastSignature=next;
    await updateSidebar(rows);
    if(forceRender||changed||first)refreshCurrent({force:forceRender||first});
    return true;
  }catch(error){
    if(!quiet)console.warn('V8.2 cloud refresh',error);
    record('v82_cloud_refresh_failed',{message:String(error?.message||error).slice(0,300)},'error');
    return false;
  }finally{running=false}
}

function startPolling(){
  clearInterval(pollTimer);
  pollTimer=setInterval(()=>void syncNow({quiet:true}),POLL_MS);
}

function bindCloudEvents(){
  window.addEventListener('smartlink:session-ready',()=>{
    lastSignature='';
    setTimeout(()=>void syncNow({forceRender:true}),180);
    startPolling();
  });
  window.addEventListener('smartlink:session-cleared',()=>{
    clearInterval(pollTimer);
    lastSignature='';
    const linkEl=document.getElementById('side-links');const favEl=document.getElementById('side-favs');
    if(linkEl)linkEl.textContent='0';if(favEl)favEl.textContent='0';
  });
  window.addEventListener('smartlink:cloud-link-saved',()=>setTimeout(async()=>{
    const links=await updateSidebar().catch(()=>null);
    if(links){lastSignature=signature(links);refreshCurrent({force:false})}
  },80));
  window.addEventListener('smartlink:cloud-restored',()=>{
    if(eventBusy)return;
    eventBusy=true;
    queueMicrotask(async()=>{
      try{await updateSidebar()}catch{}finally{eventBusy=false}
    });
  });
  window.addEventListener('online',()=>void syncNow({forceRender:true}),{passive:true});
  window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void syncNow({quiet:true})});
}

async function quickIntegrity(){
  if(!token()||!navigator.onLine)return;
  try{
    const s=await getIntegrityStatus();
    const bad=Number(s?.duplicate_groups||0)+Number(s?.orphan_history||0)+Number(s?.checksum_failures||0);
    if(bad)record('v82_integrity_warning',{issues:bad},'warn');
  }catch{}
}

export function initRuntimeFixV82(){
  bindCloudEvents();
  startPolling();
  if(token())setTimeout(()=>void syncNow({forceRender:true}),250);
  setTimeout(()=>void quickIntegrity(),1800);
  window.SmartLinkV82={syncNow,updateSidebar,refreshCurrent,version:'8.2-runtime-fix'};
}
