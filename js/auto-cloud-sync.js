import {exportCloudState,importCloudState,hydrateCloudLinks} from './db.js';

const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const REVISION_KEY='slh_cloud_revision';
const LEGACY_KEYS=['collections','settings','archives','workspaces'];
const RPC_TIMEOUT_MS=7000;

let syncing=false;
let timer=null;
let lastMode='local';
let lastDetail='';
let applyingRemote=false;
let linkCloudReady=false;

const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}};
const revision=()=>Number(localStorage.getItem(REVISION_KEY)||0)||0;
const emit=(mode,detail={})=>{try{window.dispatchEvent(new CustomEvent('smartlink:cloud-state',{detail:{mode,storageMode:'supabase-row-v8.1',...detail}}))}catch{}};

function setStatus(mode,detail=''){
  lastMode=mode;
  lastDetail=detail;
  const pill=document.getElementById('sync-pill');
  const map={
    synced:['cloud',detail||'Cloud ready'],
    syncing:['syncing',detail||'Syncing settings…'],
    offline:['local',detail||'Cloud offline'],
    error:['local',detail||'Cloud error'],
    local:['local',detail||'Cloud only']
  };
  const [cls,label]=map[mode]||map.local;
  if(pill){
    pill.className=`status-pill ${cls}`;
    pill.innerHTML=`<span></span>${label}`;
    pill.title='Links are written directly to Supabase. Settings sync runs separately and never blocks the link library.';
  }
  emit(mode,{label});
}

async function rpc(name,body={}){
  const t=token();
  if(!t)throw new Error('invalid_session');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),RPC_TIMEOUT_MS);
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_token:t,...body}),
      cache:'no-store',
      signal:controller.signal
    });
    if(!res.ok){
      const text=await res.text().catch(()=>String(res.status));
      throw new Error(`${name} ${res.status}: ${text.slice(0,220)}`);
    }
    return res.json();
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`${name} timed out`);
    throw error;
  }finally{clearTimeout(timeout)}
}

async function getLegacyState(){
  const rows=await rpc('smartlink_state_get');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function putLegacyState(state,expected){
  const rows=await rpc('smartlink_state_put_v2',{p_state:state,p_expected_revision:Number(expected||0)});
  return Array.isArray(rows)?rows[0]:rows;
}

function sameLegacyState(cloudState={},localState={}){
  try{return LEGACY_KEYS.every(k=>JSON.stringify(Array.isArray(cloudState?.[k])?cloudState[k]:[])===JSON.stringify(Array.isArray(localState?.[k])?localState[k]:[]))}
  catch{return false}
}

async function importRemoteState(cloud){
  if(!cloud?.state)return;
  const incoming={};
  for(const k of LEGACY_KEYS)incoming[k]=Array.isArray(cloud.state[k])?cloud.state[k]:[];
  applyingRemote=true;
  try{await importCloudState(incoming,{replace:true})}
  finally{applyingRemote=false}
}

async function syncLegacy({showStatus=false}={}){
  if(syncing||!token())return false;
  if(!navigator.onLine){if(showStatus||!linkCloudReady)setStatus('offline');return false}
  syncing=true;
  if(showStatus)setStatus('syncing','Syncing settings…');
  try{
    const cloud=await getLegacyState();
    await importRemoteState(cloud);
    const local=await exportCloudState();
    const cloudState=cloud?.state&&typeof cloud.state==='object'?cloud.state:{};

    if(sameLegacyState(cloudState,local)){
      localStorage.setItem(REVISION_KEY,String(Number(cloud?.revision||revision())));
      if(showStatus||linkCloudReady)setStatus('synced','Cloud ready');
      return true;
    }

    const next={...cloudState,version:8.1,storageMode:'supabase-row-v8.1',syncedAt:new Date().toISOString()};
    for(const k of LEGACY_KEYS)next[k]=Array.isArray(local[k])?local[k]:[];
    const row=await putLegacyState(next,Number(cloud?.revision||0));

    if(row?.conflict){
      const latest=await getLegacyState();
      await importRemoteState(latest);
      localStorage.setItem(REVISION_KEY,String(Number(latest?.revision||0)));
      if(showStatus||linkCloudReady)setStatus('synced','Cloud ready');
      return true;
    }

    localStorage.setItem(REVISION_KEY,String(Number(row?.revision||cloud?.revision||revision())));
    if(showStatus||linkCloudReady)setStatus('synced','Cloud ready');
    return true;
  }catch(error){
    console.warn('Cloud settings sync',error);
    if(showStatus){
      if(linkCloudReady)setStatus('synced','Cloud ready · settings retry');
      else setStatus(navigator.onLine?'error':'offline');
    }
    return false;
  }finally{
    applyingRemote=false;
    syncing=false;
  }
}

async function bootstrap(){
  if(!token()){linkCloudReady=false;setStatus('local');return}
  if(!navigator.onLine){linkCloudReady=false;setStatus('offline');return}
  try{
    await hydrateCloudLinks({force:true});
    linkCloudReady=true;
    setStatus('synced','Cloud ready');
    void syncLegacy({showStatus:false});
  }catch(error){
    linkCloudReady=false;
    console.warn('Cloud link hydrate',error);
    setStatus('error','Cloud load failed');
  }
}

function queueLegacy(event){
  if(event?.detail?.store==='links'||applyingRemote)return;
  clearTimeout(timer);
  timer=setTimeout(()=>void syncLegacy({showStatus:false}),500);
}

window.addEventListener('smartlink:local-mutation',queueLegacy);
window.addEventListener('smartlink:session-ready',bootstrap);
window.addEventListener('smartlink:session-cleared',()=>{linkCloudReady=false;setStatus('local')});
window.addEventListener('smartlink:cloud-force-sync',()=>void syncLegacy({showStatus:true}));
window.addEventListener('online',bootstrap,{passive:true});
window.addEventListener('offline',()=>setStatus('offline'),{passive:true});
window.addEventListener('hashchange',()=>setTimeout(()=>setStatus(lastMode,lastDetail),0));
window.addEventListener('smartlink:cloud-link-saved',e=>setStatus('synced',e?.detail?.operation==='deletion'?'Deleted in Supabase':'Cloud ready'));

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
