import {exportCloudState,importCloudState,getSyncQueueCount,clearSyncQueue} from './db.js';

const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const DIRTY_KEY='slh_cloud_dirty';
const REVISION_KEY='slh_cloud_revision';
const STORES=['links','collections','settings','archives','workspaces','trash','tombstones'];
const ENTITY_STORES=['links','collections','archives','workspaces'];
let syncing=false;
let requested=false;
let restoring=false;
let lastStatus='local';
let lastDetail='';
let debounceTimer=null;
let lastSyncedAt=null;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function token(){return localStorage.getItem(TOKEN_KEY)||''}
function revision(){const n=Number(localStorage.getItem(REVISION_KEY));return Number.isFinite(n)?n:0}
function keyOf(store,row){return store==='settings'?row?.key:row?.id}
function rowTime(row){for(const k of ['restoredAt','deletedAt','updatedAt','metadataRefreshedAt','previewReadyAt','capturedAt','createdAt']){const n=Number(row?.[k]);if(Number.isFinite(n)&&n>0)return n}return 0}
function mergeRows(store,localRows=[],cloudRows=[]){const map=new Map();for(const row of Array.isArray(cloudRows)?cloudRows:[]){const k=keyOf(store,row);if(k!=null)map.set(String(k),row)}for(const row of Array.isArray(localRows)?localRows:[]){const k=keyOf(store,row);if(k==null)continue;const id=String(k),remote=map.get(id);if(!remote||rowTime(row)>=rowTime(remote))map.set(id,row)}return [...map.values()]}
function applyDeletionRules(state){const tombstones=Array.isArray(state.tombstones)?state.tombstones:[],byEntity=new Map();for(const t of tombstones){if(!t?.store||t?.key==null)continue;byEntity.set(`${t.store}:${String(t.key)}`,t)}for(const store of ENTITY_STORES){state[store]=(Array.isArray(state[store])?state[store]:[]).filter(row=>{const k=keyOf(store,row);if(k==null)return false;const t=byEntity.get(`${store}:${String(k)}`);if(!t)return true;return rowTime(row)>Number(t.deletedAt||0)})}const linksById=new Map((state.links||[]).map(x=>[String(x.id),x]));state.trash=(Array.isArray(state.trash)?state.trash:[]).filter(row=>{const live=linksById.get(String(row.entityId??row.id));return !live||rowTime(live)<=Number(row.deletedAt||0)});return state}
function mergeStates(local={},cloud={}){const merged={version:8,storageMode:'cloud-only-links',syncedAt:new Date().toISOString()};for(const store of STORES)merged[store]=mergeRows(store,local?.[store],cloud?.[store]);return applyDeletionRules(merged)}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};for(const k of Object.keys(value).sort())out[k]=canonical(value[k]);return out}return value}
function fingerprint(state={}){const data={};for(const store of STORES){const rows=Array.isArray(state?.[store])?[...state[store]]:[];rows.sort((a,b)=>String(keyOf(store,a)??'').localeCompare(String(keyOf(store,b)??'')));data[store]=rows}return JSON.stringify(canonical(data))}
function counts(state={}){return {links:Array.isArray(state.links)?state.links.length:0,collections:Array.isArray(state.collections)?state.collections.length:0,trash:Array.isArray(state.trash)?state.trash.length:0}}
function emitState(mode,detail={}){window.dispatchEvent(new CustomEvent('smartlink:cloud-state',{detail:{mode,lastSyncedAt,revision:revision(),...detail}}))}
function refreshUi(detail={}){window.dispatchEvent(new CustomEvent('smartlink:cloud-restored',{detail}));if(location.hash.startsWith('#v6-'))return;try{window.dispatchEvent(new HashChangeEvent('hashchange'))}catch{window.dispatchEvent(new Event('hashchange'))}}
async function rpc(name,body){const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store'});if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`${name} ${res.status}: ${text.slice(0,300)}`)}return res.json()}
function setStatus(mode,detail=''){lastStatus=mode;lastDetail=detail;const pill=document.getElementById('sync-pill');const map={pending:['syncing',detail||'Cloud save queued'],syncing:['syncing',detail||'Saving to cloud…'],synced:['cloud',detail||'Cloud saved'],offline:['local',detail||'Cloud required'],conflict:['syncing','Merging cloud changes…'],error:['local','Cloud save failed'],local:['local','Cloud only']};const [cls,label]=map[mode]||map.local;if(pill){pill.className=`status-pill ${cls}`;pill.innerHTML=`<span></span>${label}`;pill.title=mode==='synced'?'Links are stored in Supabase cloud only':mode==='offline'?'Cloud connection is required to save links. Offline link saves are rejected.':mode==='local'?'Sign in to cloud before saving links. Links are not persisted in browser storage.':'Smart Link Hub cloud-only storage'}emitState(mode,{label})}
async function setPendingStatus(){const n=await getSyncQueueCount().catch(()=>0);if(n)setStatus(navigator.onLine?'pending':'offline',navigator.onLine?`${n} cloud change${n===1?'':'s'} queued`:'Cloud required · changes not committed')}
function markDirty(){try{localStorage.setItem(DIRTY_KEY,'1')}catch{}}
function clearDirty(nextRevision){try{localStorage.removeItem(DIRTY_KEY);if(nextRevision!=null)localStorage.setItem(REVISION_KEY,String(nextRevision))}catch{}}
async function cloudGet(){const t=token();if(!t)return null;const rows=await rpc('smartlink_state_get',{p_token:t});return Array.isArray(rows)&&rows.length?rows[0]:null}
async function cloudPut(state,expectedRevision){try{const rows=await rpc('smartlink_state_put_v2',{p_token:token(),p_state:state,p_expected_revision:Number(expectedRevision||0)});return Array.isArray(rows)?rows[0]:rows}catch(err){if(/PGRST202|404|smartlink_state_put_v2/.test(String(err.message))){const rows=await rpc('smartlink_state_put',{p_token:token(),p_state:state});const row=Array.isArray(rows)?rows[0]:rows;return {...row,conflict:false,legacy:true}}throw err}}
async function pushState(state,expectedRevision){const t=token();if(!t){setStatus('local');return {ok:false}}const pending=await getSyncQueueCount().catch(()=>0);setStatus('syncing',pending?`Saving ${pending} cloud change${pending===1?'':'s'}…`:'Saving to cloud…');const row=await cloudPut(state,expectedRevision);if(row?.conflict){setStatus('conflict');return {ok:false,conflict:true,revision:Number(row.revision||0)}}clearDirty(row?.revision);await clearSyncQueue().catch(()=>{});lastSyncedAt=row?.updated_at||new Date().toISOString();const c=counts(state);setStatus('synced',`Cloud saved · ${c.links} links`);window.dispatchEvent(new CustomEvent('smartlink:cloud-synced',{detail:{revision:row?.revision||null,updatedAt:lastSyncedAt,...c}}));return {ok:true,revision:Number(row?.revision||0)}}
async function pushNow(){if(!token()){setStatus('local');return false}if(!navigator.onLine){markDirty();await setPendingStatus();return false}let local=await exportCloudState(),cloud=await cloudGet(),expected=Number(cloud?.revision||0);if(cloud?.state){local=mergeStates(local,cloud.state);if(Number(cloud.revision)!==revision()||fingerprint(local)!==fingerprint(await exportCloudState())){restoring=true;try{await importCloudState(local)}finally{restoring=false}refreshUi({revision:cloud.revision,...counts(local)})}}let result=await pushState(local,expected);if(!result.conflict)return result.ok;cloud=await cloudGet();if(!cloud)throw new Error('Cloud conflict could not be reloaded');local=mergeStates(await exportCloudState(),cloud.state||{});restoring=true;try{await importCloudState(local)}finally{restoring=false}refreshUi({revision:cloud.revision,conflictResolved:true,...counts(local)});result=await pushState(local,Number(cloud.revision||0));if(result.conflict)throw new Error('Cloud changed repeatedly during conflict resolution');return result.ok}
async function drain(){if(syncing){requested=true;return}syncing=true;try{do{requested=false;try{await pushNow()}catch(err){console.warn('Auto cloud sync',err);markDirty();setStatus(navigator.onLine?'error':'offline');break}}while(requested)}finally{syncing=false;if(requested&&!debounceTimer){debounceTimer=setTimeout(()=>{debounceTimer=null;drain()},180)}}}
function queueSync(){markDirty();requested=true;setPendingStatus();if(restoring||syncing)return;clearTimeout(debounceTimer);debounceTimer=setTimeout(()=>{debounceTimer=null;drain()},140)}
async function waitForSession(){for(let i=0;i<80;i++){if(token())return true;await sleep(250)}return false}
async function reconcile(){if(!token()){setStatus('local');return}if(!navigator.onLine){await setPendingStatus();return}try{const dirty=localStorage.getItem(DIRTY_KEY)==='1',local=await exportCloudState(),cloud=await cloudGet();if(!cloud){markDirty();requested=true;await drain();return}const merged=mergeStates(local,cloud.state||{});restoring=true;try{await importCloudState(merged)}finally{restoring=false}refreshUi({revision:cloud.revision,...counts(merged)});const cloudNeedsMerge=fingerprint(merged)!==fingerprint(cloud.state||{});if(dirty||cloudNeedsMerge||requested){markDirty();requested=true;await drain();return}clearDirty(cloud.revision);lastSyncedAt=cloud.updated_at||lastSyncedAt;const c=counts(merged);setStatus('synced',`Cloud saved · ${c.links} links`)}catch(err){console.warn('Cloud reconcile',err);markDirty();setStatus(navigator.onLine?'error':'offline')}}
async function sessionReady(){if(!token()){setStatus('local');return}requested=true;await reconcile()}
async function bootstrap(){if(!(await waitForSession())){setStatus('local');return}await reconcile()}

window.addEventListener('smartlink:local-mutation',queueSync);
window.addEventListener('smartlink:session-ready',()=>sessionReady());
window.addEventListener('smartlink:session-cleared',()=>{requested=false;setStatus('local')});
window.addEventListener('online',()=>{requested=true;reconcile()},{passive:true});
window.addEventListener('offline',()=>setPendingStatus(),{passive:true});
window.addEventListener('hashchange',()=>setTimeout(()=>setStatus(lastStatus,lastDetail),0));
window.addEventListener('smartlink:cards-patched',()=>setStatus(lastStatus,lastDetail));
window.addEventListener('smartlink:cloud-force-sync',queueSync);
setInterval(()=>{if(token()&&navigator.onLine&&localStorage.getItem(DIRTY_KEY)==='1')reconcile()},30000);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();