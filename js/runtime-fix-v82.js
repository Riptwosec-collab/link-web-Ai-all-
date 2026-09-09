import {hydrateCloudLinks,getAll,getIntegrityStatus,logRuntimeEvent} from './db.js';

const POLL_MS=12000;
let pollTimer=null;
let running=false;
let lastSignature='';
let eventBusy=false;
let renderTimer=null;
let channel=null;

const token=()=>{try{return localStorage.getItem('smartlink_session_token')||''}catch{return ''}};
const liveRows=rows=>(Array.isArray(rows)?rows:[]).filter(x=>!x?.deletedAt);

function installStyles(){
  if(document.getElementById('slh-v82-runtime-style'))return;
  const s=document.createElement('style');
  s.id='slh-v82-runtime-style';
  s.textContent=`#v81-live-pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:rgba(255,255,255,.035);font:600 9px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#94a3b8;white-space:nowrap}#v81-live-pill:before{content:'';width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399}#v81-live-pill[data-mode="offline"]:before,#v81-live-pill[data-mode="error"]:before{background:#fb7185;box-shadow:0 0 10px #fb7185}#v81-live-pill[data-mode="syncing"]:before{background:#fbbf24;box-shadow:0 0 10px #fbbf24}`;
  document.head.appendChild(s);
}

function ensureLivePill(){
  let p=document.getElementById('v81-live-pill');
  if(p)return p;
  const host=document.querySelector('header .flex.items-center.gap-2');
  if(!host)return null;
  p=document.createElement('span');p.id='v81-live-pill';host.prepend(p);return p;
}
function liveStatus(mode='live',text='Live'){
  const p=ensureLivePill();if(!p)return;
  p.dataset.mode=mode;p.textContent=text;
}

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
  liveStatus('syncing','Syncing');
  try{
    const rows=await hydrateCloudLinks({force:true});
    const next=signature(rows);
    const changed=lastSignature!==''&&next!==lastSignature;
    const first=lastSignature==='';
    lastSignature=next;
    await updateSidebar(rows);
    if(forceRender||changed||first)refreshCurrent({force:forceRender||first});
    liveStatus('live','Live');
    return true;
  }catch(error){
    liveStatus(navigator.onLine?'error':'offline',navigator.onLine?'Sync error':'Offline');
    if(!quiet)console.warn('V8.2 cloud refresh',error);
    record('v82_cloud_refresh_failed',{message:String(error?.message||error).slice(0,300)},'error');
    return false;
  }finally{running=false}
}

function startPolling(){
  clearInterval(pollTimer);
  pollTimer=setInterval(()=>void syncNow({quiet:true}),POLL_MS);
}

function announceChange(){
  try{channel?.postMessage({type:'cloud-change',at:Date.now()})}catch{}
  try{localStorage.setItem('slh_v82_change',String(Date.now()))}catch{}
}

function setupRealtime(){
  try{
    channel=new BroadcastChannel('smart-link-hub-v82');
    channel.onmessage=e=>{if(e.data?.type==='cloud-change')void syncNow({forceRender:false,quiet:true})};
  }catch{}
  window.addEventListener('storage',e=>{if(e.key==='slh_v82_change')void syncNow({forceRender:false,quiet:true})});
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
    liveStatus('offline','Locked');
    const linkEl=document.getElementById('side-links');const favEl=document.getElementById('side-favs');
    if(linkEl)linkEl.textContent='0';if(favEl)favEl.textContent='0';
  });
  window.addEventListener('smartlink:cloud-link-saved',()=>{
    announceChange();
    setTimeout(async()=>{
      const links=await updateSidebar().catch(()=>null);
      if(links){lastSignature=signature(links);refreshCurrent({force:false})}
    },80);
  });
  window.addEventListener('smartlink:cloud-restored',()=>{
    if(eventBusy)return;
    eventBusy=true;
    queueMicrotask(async()=>{try{await updateSidebar()}catch{}finally{eventBusy=false}});
  });
  window.addEventListener('online',()=>{liveStatus('syncing','Syncing');void syncNow({forceRender:true})},{passive:true});
  window.addEventListener('offline',()=>liveStatus('offline','Offline'),{passive:true});
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
  installStyles();ensureLivePill();liveStatus(navigator.onLine?'live':'offline',navigator.onLine?'Live':'Offline');
  setupRealtime();bindCloudEvents();startPolling();
  if(token())setTimeout(()=>void syncNow({forceRender:true}),250);
  setTimeout(()=>void quickIntegrity(),1800);
  const api={poll:syncNow,syncNow,updateSidebar,refreshCurrent,integrity:quickIntegrity,version:'8.2-runtime-fix'};
  window.SmartLinkV82=api;
  window.SmartLinkV81=api;
}
