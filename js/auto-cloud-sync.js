import {exportCloudState,importCloudState,hydrateCloudLinks} from './db.js';

const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const REVISION_KEY='slh_cloud_revision';
const LEGACY_KEYS=['collections','settings','archives','workspaces'];
let syncing=false;
let timer=null;
let lastMode='local';
let lastDetail='';

const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}};
const revision=()=>Number(localStorage.getItem(REVISION_KEY)||0)||0;
const emit=(mode,detail={})=>{try{window.dispatchEvent(new CustomEvent('smartlink:cloud-state',{detail:{mode,storageMode:'supabase-row-v8',...detail}}))}catch{}};

function setStatus(mode,detail=''){
  lastMode=mode;lastDetail=detail;
  const pill=document.getElementById('sync-pill');
  const map={synced:['cloud',detail||'Supabase ready'],syncing:['syncing',detail||'Syncing cloud settings…'],offline:['local',detail||'Cloud required'],error:['local',detail||'Cloud error'],local:['local',detail||'Cloud only']};
  const [cls,label]=map[mode]||map.local;
  if(pill){pill.className=`status-pill ${cls}`;pill.innerHTML=`<span></span>${label}`;pill.title='Links are saved directly as Supabase rows. Browser storage is not used for links.'}
  emit(mode,{label});
}

async function rpc(name,body={}){
  const t=token();if(!t)throw new Error('invalid_session');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_token:t,...body}),cache:'no-store'});
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`${name} ${res.status}: ${text.slice(0,220)}`)}
  return res.json();
}

async function getLegacyState(){const rows=await rpc('smartlink_state_get');return Array.isArray(rows)&&rows.length?rows[0]:null}
async function putLegacyState(state,expected){const rows=await rpc('smartlink_state_put_v2',{p_state:state,p_expected_revision:Number(expected||0)});return Array.isArray(rows)?rows[0]:rows}

async function syncLegacy(){
  if(syncing||!token())return;
  if(!navigator.onLine){setStatus('offline');return}
  syncing=true;setStatus('syncing');
  try{
    const [local,cloud]=await Promise.all([exportCloudState(),getLegacyState()]);
    if(cloud?.state){const incoming={};for(const k of LEGACY_KEYS)incoming[k]=Array.isArray(cloud.state[k])?cloud.state[k]:[];await importCloudState(incoming,{replace:true})}
    const refreshed=await exportCloudState();
    const base=cloud?.state&&typeof cloud.state==='object'?cloud.state:{};
    const next={...base,version:8,storageMode:'supabase-row-v8',syncedAt:new Date().toISOString()};
    for(const k of LEGACY_KEYS)next[k]=Array.isArray(refreshed[k])?refreshed[k]:[];
    const row=await putLegacyState(next,Number(cloud?.revision||0));
    if(row?.conflict){const latest=await getLegacyState();localStorage.setItem(REVISION_KEY,String(latest?.revision||0));setStatus('synced','Supabase ready');return}
    localStorage.setItem(REVISION_KEY,String(row?.revision||cloud?.revision||revision()));
    setStatus('synced','Supabase ready');
  }catch(error){console.warn('Legacy cloud settings sync',error);setStatus(navigator.onLine?'error':'offline')}
  finally{syncing=false}
}

async function bootstrap(){
  if(!token()){setStatus('local');return}
  if(!navigator.onLine){setStatus('offline');return}
  try{await hydrateCloudLinks({force:true});setStatus('synced','Supabase ready')}catch(error){console.warn('Cloud link hydrate',error);setStatus('error','Cloud load failed')}
  syncLegacy();
}

function queueLegacy(event){if(event?.detail?.store==='links')return;clearTimeout(timer);timer=setTimeout(syncLegacy,250)}
window.addEventListener('smartlink:local-mutation',queueLegacy);
window.addEventListener('smartlink:session-ready',bootstrap);
window.addEventListener('smartlink:session-cleared',()=>setStatus('local'));
window.addEventListener('online',bootstrap,{passive:true});
window.addEventListener('offline',()=>setStatus('offline'),{passive:true});
window.addEventListener('hashchange',()=>setTimeout(()=>setStatus(lastMode,lastDetail),0));
window.addEventListener('smartlink:cloud-link-saved',e=>setStatus('synced',e?.detail?.operation==='deletion'?'Deleted in Supabase':'Saved to Supabase'));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
