import {exportCloudState,importCloudState} from './db.js';

const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const DIRTY_KEY='slh_cloud_dirty';
const REVISION_KEY='slh_cloud_revision';
let syncing=false;
let requested=false;
let lastStatus='local';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function token(){return localStorage.getItem(TOKEN_KEY)||''}
async function rpc(name,body){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`${name} ${res.status}: ${text.slice(0,180)}`)}
  return res.json();
}
function setStatus(mode){
  lastStatus=mode;
  const pill=document.getElementById('sync-pill');if(!pill)return;
  const map={syncing:['syncing','Syncing…'],synced:['cloud','Synced'],offline:['local','Offline'],error:['local','Sync retry'],local:['local','Local']};
  const [cls,label]=map[mode]||map.local;
  pill.className=`status-pill ${cls}`;
  pill.innerHTML=`<span></span>${label}`;
  pill.title=mode==='synced'?'Auto Cloud Sync is active':mode==='offline'?'Changes are queued and will sync when online':'Auto Cloud Sync';
}
function markDirty(){try{localStorage.setItem(DIRTY_KEY,'1')}catch{}}
function clearDirty(revision){
  try{localStorage.removeItem(DIRTY_KEY);if(revision!=null)localStorage.setItem(REVISION_KEY,String(revision))}catch{}
}
async function pushNow(){
  const t=token();if(!t)return setStatus('local');
  if(!navigator.onLine){markDirty();setStatus('offline');return false}
  setStatus('syncing');
  const state=await exportCloudState();
  const rows=await rpc('smartlink_state_put',{p_token:t,p_state:state});
  const row=Array.isArray(rows)?rows[0]:rows;
  clearDirty(row?.revision);
  setStatus('synced');
  window.dispatchEvent(new CustomEvent('smartlink:cloud-synced',{detail:{revision:row?.revision||null,updatedAt:row?.updated_at||null}}));
  return true;
}
async function drain(){
  if(syncing){requested=true;return}
  syncing=true;
  try{
    do{
      requested=false;
      try{await pushNow()}catch(err){console.warn('Auto cloud sync',err);markDirty();setStatus(navigator.onLine?'error':'offline');break}
    }while(requested)
  }finally{syncing=false}
}
function queueSync(){markDirty();requested=true;queueMicrotask(drain)}
async function cloudGet(){
  const t=token();if(!t)return null;
  const rows=await rpc('smartlink_state_get',{p_token:t});
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function waitForSession(){
  for(let i=0;i<80;i++){if(token())return true;await sleep(250)}return false
}
async function bootstrap(){
  if(!(await waitForSession())){setStatus('local');return}
  if(!navigator.onLine){markDirty();setStatus('offline');return}
  try{
    const dirty=localStorage.getItem(DIRTY_KEY)==='1';
    const cloud=await cloudGet();
    if(!cloud){
      await pushNow();
      return;
    }
    if(dirty){
      await pushNow();
      return;
    }
    const state=cloud.state&&typeof cloud.state==='object'?cloud.state:null;
    if(state){
      await importCloudState(state);
      clearDirty(cloud.revision);
      setStatus('synced');
      window.dispatchEvent(new Event('smartlink:cloud-restored'));
      try{window.dispatchEvent(new HashChangeEvent('hashchange'))}catch{window.dispatchEvent(new Event('hashchange'))}
    }else await pushNow();
  }catch(err){console.warn('Cloud bootstrap',err);markDirty();setStatus('error')}
}

window.addEventListener('smartlink:local-mutation',queueSync);
window.addEventListener('online',()=>{if(localStorage.getItem(DIRTY_KEY)==='1')drain();else setStatus('synced')},{passive:true});
window.addEventListener('offline',()=>setStatus('offline'),{passive:true});
window.addEventListener('hashchange',()=>setTimeout(()=>setStatus(lastStatus),0));
window.addEventListener('smartlink:cards-patched',()=>setStatus(lastStatus));
window.addEventListener('smartlink:cloud-force-sync',queueSync);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
