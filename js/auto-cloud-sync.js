import {exportCloudState,importCloudState} from './db.js';

const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const DIRTY_KEY='slh_cloud_dirty';
const REVISION_KEY='slh_cloud_revision';
const STORES=['links','collections','settings','archives','workspaces'];
let syncing=false;
let requested=false;
let restoring=false;
let lastStatus='local';
let debounceTimer=null;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function token(){return localStorage.getItem(TOKEN_KEY)||''}
function revision(){const n=Number(localStorage.getItem(REVISION_KEY));return Number.isFinite(n)?n:0}
function keyOf(store,row){return store==='settings'?row?.key:row?.id}
function rowTime(row){
  for(const k of ['updatedAt','metadataRefreshedAt','previewReadyAt','capturedAt','createdAt']){
    const n=Number(row?.[k]);if(Number.isFinite(n)&&n>0)return n;
  }
  return 0;
}
function mergeRows(store,localRows=[],cloudRows=[]){
  const map=new Map();
  for(const row of Array.isArray(cloudRows)?cloudRows:[]){const k=keyOf(store,row);if(k!=null)map.set(String(k),row)}
  for(const row of Array.isArray(localRows)?localRows:[]){
    const k=keyOf(store,row);if(k==null)continue;
    const id=String(k),remote=map.get(id);
    if(!remote||rowTime(row)>=rowTime(remote))map.set(id,row);
  }
  return [...map.values()];
}
function mergeStates(local={},cloud={}){
  const merged={version:2,syncedAt:new Date().toISOString()};
  for(const store of STORES)merged[store]=mergeRows(store,local?.[store],cloud?.[store]);
  return merged;
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object'){
    const out={};for(const k of Object.keys(value).sort())out[k]=canonical(value[k]);return out;
  }
  return value;
}
function fingerprint(state={}){
  const data={};
  for(const store of STORES){
    const rows=Array.isArray(state?.[store])?[...state[store]]:[];
    rows.sort((a,b)=>String(keyOf(store,a)??'').localeCompare(String(keyOf(store,b)??'')));
    data[store]=rows;
  }
  return JSON.stringify(canonical(data));
}
function counts(state={}){return {links:Array.isArray(state.links)?state.links.length:0,collections:Array.isArray(state.collections)?state.collections.length:0}}
function refreshUi(detail={}){
  window.dispatchEvent(new CustomEvent('smartlink:cloud-restored',{detail}));
  try{window.dispatchEvent(new HashChangeEvent('hashchange'))}catch{window.dispatchEvent(new Event('hashchange'))}
}
async function rpc(name,body){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`${name} ${res.status}: ${text.slice(0,220)}`)}
  return res.json();
}
function setStatus(mode,detail=''){
  lastStatus=mode;
  const pill=document.getElementById('sync-pill');if(!pill)return;
  const map={syncing:['syncing','Saving…'],synced:['cloud',detail||'Saved to Cloud'],offline:['local','Saved locally'],error:['local','Cloud retry'],local:['local','Auto Save']};
  const [cls,label]=map[mode]||map.local;
  pill.className=`status-pill ${cls}`;
  pill.innerHTML=`<span></span>${label}`;
  pill.title=mode==='synced'?'Auto Save + Supabase Cloud Sync is active':mode==='offline'?'Saved locally. Cloud sync will resume automatically when online.':'Auto Save';
}
function markDirty(){try{localStorage.setItem(DIRTY_KEY,'1')}catch{}}
function clearDirty(nextRevision){
  try{localStorage.removeItem(DIRTY_KEY);if(nextRevision!=null)localStorage.setItem(REVISION_KEY,String(nextRevision))}catch{}
}
async function cloudGet(){
  const t=token();if(!t)return null;
  const rows=await rpc('smartlink_state_get',{p_token:t});
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function pushState(state){
  const t=token();if(!t){setStatus('local');return false}
  setStatus('syncing');
  const rows=await rpc('smartlink_state_put',{p_token:t,p_state:state});
  const row=Array.isArray(rows)?rows[0]:rows;
  clearDirty(row?.revision);
  const c=counts(state);
  setStatus('synced',`Cloud saved · ${c.links} links`);
  window.dispatchEvent(new CustomEvent('smartlink:cloud-synced',{detail:{revision:row?.revision||null,updatedAt:row?.updated_at||null,...c}}));
  return true;
}
async function pushNow(){
  const t=token();if(!t){setStatus('local');return false}
  if(!navigator.onLine){markDirty();setStatus('offline');return false}
  let local=await exportCloudState();
  const cloud=await cloudGet();
  if(cloud?.state&&Number(cloud.revision)!==revision()){
    local=mergeStates(local,cloud.state);
    restoring=true;
    try{await importCloudState(local)}finally{restoring=false}
    refreshUi({revision:cloud.revision,...counts(local)});
  }
  return pushState(local);
}
async function drain(){
  if(syncing){requested=true;return}
  syncing=true;
  try{
    do{
      requested=false;
      try{await pushNow()}catch(err){console.warn('Auto cloud sync',err);markDirty();setStatus(navigator.onLine?'error':'offline');break}
    }while(requested)
  }finally{
    syncing=false;
    if(requested&&!debounceTimer){debounceTimer=setTimeout(()=>{debounceTimer=null;drain()},180)}
  }
}
function queueSync(){
  markDirty();requested=true;
  setStatus(navigator.onLine?'syncing':'offline');
  if(restoring||syncing)return;
  clearTimeout(debounceTimer);
  debounceTimer=setTimeout(()=>{debounceTimer=null;drain()},100);
}
async function waitForSession(){for(let i=0;i<80;i++){if(token())return true;await sleep(250)}return false}
async function reconcile(){
  if(!token()){setStatus('local');return}
  if(!navigator.onLine){setStatus('offline');return}
  try{
    const dirty=localStorage.getItem(DIRTY_KEY)==='1';
    const local=await exportCloudState();
    const cloud=await cloudGet();
    if(!cloud){markDirty();requested=true;await drain();return}

    const merged=mergeStates(local,cloud.state||{});
    restoring=true;
    try{await importCloudState(merged)}finally{restoring=false}
    refreshUi({revision:cloud.revision,...counts(merged)});

    const cloudNeedsMerge=fingerprint(merged)!==fingerprint(cloud.state||{});
    if(dirty||cloudNeedsMerge||requested){
      markDirty();requested=true;await drain();return;
    }

    clearDirty(cloud.revision);
    const c=counts(merged);
    setStatus('synced',`Cloud saved · ${c.links} links`);
  }catch(err){console.warn('Cloud reconcile',err);markDirty();setStatus(navigator.onLine?'error':'offline')}
}
async function sessionReady(){
  if(!token()){setStatus('local');return}
  requested=true;
  await reconcile();
}
async function bootstrap(){if(!(await waitForSession())){setStatus('local');return}await reconcile()}

window.addEventListener('smartlink:local-mutation',queueSync);
window.addEventListener('smartlink:session-ready',()=>sessionReady());
window.addEventListener('smartlink:session-cleared',()=>{requested=false;setStatus('local')});
window.addEventListener('online',()=>{requested=true;reconcile()},{passive:true});
window.addEventListener('offline',()=>setStatus('offline'),{passive:true});
window.addEventListener('hashchange',()=>setTimeout(()=>setStatus(lastStatus),0));
window.addEventListener('smartlink:cards-patched',()=>setStatus(lastStatus));
window.addEventListener('smartlink:cloud-force-sync',queueSync);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
