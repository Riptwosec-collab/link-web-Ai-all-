import {listCloudLinks,getCloudChanges,createCloudLink,updateCloudLink,deleteCloudLink,restoreCloudLink,purgeCloudLink,getCloudHistory,createCloudBackup,listCloudBackups,verifyCloudBackup,previewCloudBackup,restoreCloudBackup,getIntegrityStatus as cloudIntegrity,previewCloudImport,putRuntimeEvent,listRuntimeEvents} from './cloud-links.js';

const DB_NAME='smart-link-hub-v3';
const DB_VERSION=5;
const LOCAL_STORES=new Set(['collections','settings','events','archives','workspaces','syncQueue','documents','visuals','diagnostics']);
const LEGACY_CLOUD_STORES=['collections','settings','archives','workspaces'];
const linksCache=new Map();
let dbPromise,hydratePromise=null,hydratedToken='';

export const uid=(p='id')=>`${p}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const now=()=>Date.now();
const sessionToken=()=>{try{return localStorage.getItem('smartlink_session_token')||''}catch{return ''}};
const isLocalE2E=()=>{try{return ['localhost','127.0.0.1','::1'].includes(location.hostname)&&new URLSearchParams(location.search).get('e2e')==='1'}catch{return false}};
function ensureIndex(s,n,k,o={}){if(!s.indexNames.contains(n))s.createIndex(n,k,o)}
function txResult(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function requireCloud(){if(isLocalE2E())return;if(!sessionToken())throw new Error('Cloud sign-in required. Nothing was saved.');if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Cloud connection required. Nothing was saved.')}
function notify(detail){try{window.dispatchEvent(new CustomEvent('smartlink:local-mutation',{detail:{at:now(),cloudConfirmed:true,storageMode:'supabase-row-v8.1',...detail}}))}catch{}}
function cachePut(row){if(row?.id)linksCache.set(String(row.id),row);return row}
function trashRow(link){return {id:String(link.id),entityStore:'links',entityId:String(link.id),payload:link,deletedAt:Number(link.deletedAt||0),expiresAt:Number(link.deletedAt||0)+30*864e5,cloudOnly:true,version:Number(link.version||0)}}

export async function hydrateCloudLinks({force=false,includeDeleted=false}={}){
  const t=sessionToken();if(!t&&!isLocalE2E()){linksCache.clear();hydratedToken='';return []}
  if(!force&&hydratedToken===t&&linksCache.size&&!includeDeleted)return [...linksCache.values()];
  if(hydratePromise&&!force)return hydratePromise;
  hydratePromise=(async()=>{try{const rows=await listCloudLinks({includeDeleted});if(!includeDeleted){linksCache.clear();for(const row of rows)if(!row.deletedAt)cachePut(row);hydratedToken=t}else for(const row of rows)if(!row.deletedAt)cachePut(row);try{window.dispatchEvent(new CustomEvent('smartlink:cloud-restored',{detail:{storageMode:'supabase-row-v8.1',links:rows.filter(x=>!x.deletedAt).length}}))}catch{}return rows}finally{hydratePromise=null}})();return hydratePromise;
}
export function applyCloudChanges(rows=[]){let changed=0;for(const row of Array.isArray(rows)?rows:[]){if(!row?.id)continue;if(row.deletedAt)linksCache.delete(String(row.id));else cachePut(row);changed++}if(changed){try{window.dispatchEvent(new CustomEvent('smartlink:cloud-restored',{detail:{storageMode:'supabase-row-v8.1',liveChanges:changed,links:[...linksCache.values()].length}}));window.dispatchEvent(new Event('hashchange'))}catch{}}return changed}
export async function pullCloudChanges(since=null,limit=500){const rows=await getCloudChanges(since,limit);applyCloudChanges(rows);return rows}

export function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result,tx=req.transaction;for(const legacy of ['links','trash','tombstones'])if(db.objectStoreNames.contains(legacy))db.deleteObjectStore(legacy);if(!db.objectStoreNames.contains('collections'))db.createObjectStore('collections',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});if(!db.objectStoreNames.contains('events')){const s=db.createObjectStore('events',{keyPath:'id'});s.createIndex('at','at')}if(!db.objectStoreNames.contains('archives')){const s=db.createObjectStore('archives',{keyPath:'id'});s.createIndex('linkId','linkId');s.createIndex('capturedAt','capturedAt')}else{const s=tx.objectStore('archives');ensureIndex(s,'linkId','linkId');ensureIndex(s,'capturedAt','capturedAt')}if(!db.objectStoreNames.contains('workspaces'))db.createObjectStore('workspaces',{keyPath:'id'});if(!db.objectStoreNames.contains('syncQueue')){const s=db.createObjectStore('syncQueue',{keyPath:'id'});s.createIndex('at','at')}if(!db.objectStoreNames.contains('documents')){const s=db.createObjectStore('documents',{keyPath:'linkId'});s.createIndex('fetchedAt','fetchedAt');s.createIndex('contentHash','contentHash')}if(!db.objectStoreNames.contains('visuals')){const s=db.createObjectStore('visuals',{keyPath:'linkId'});s.createIndex('updatedAt','updatedAt')}if(!db.objectStoreNames.contains('diagnostics')){const s=db.createObjectStore('diagnostics',{keyPath:'id'});s.createIndex('at','at');s.createIndex('type','type')}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>console.warn('Smart Link Hub IndexedDB upgrade is blocked by another open tab.')});return dbPromise}
async function store(name,mode='readonly'){if(!LOCAL_STORES.has(name))throw new Error(`${name} is not a local store in V8.1`);const db=await openDB();return db.transaction(name,mode).objectStore(name)}
async function directDelete(name,key){const s=await store(name,'readwrite');await txResult(s.delete(key))}

export async function getAll(name){if(name==='links'){try{await hydrateCloudLinks()}catch(error){console.warn('Cloud links unavailable',error)}return [...linksCache.values()].filter(x=>!x.deletedAt)}if(name==='trash'){try{return (await listCloudLinks({includeDeleted:true})).filter(x=>x.deletedAt).map(trashRow)}catch{return []}}if(name==='tombstones')return [];const s=await store(name);return (await txResult(s.getAll()))||[]}
export async function getOne(name,key){if(name==='links'){await getAll('links');return linksCache.get(String(key))}if(name==='trash'){const rows=await getAll('trash');return rows.find(x=>String(x.id)===String(key))}if(name==='tombstones')return undefined;const s=await store(name);return txResult(s.get(key))}
export async function getAllByIndex(name,index,key){if(name==='links')return (await getAll('links')).filter(row=>row?.[index]===key);if(name==='trash')return (await getAll('trash')).filter(row=>row?.[index]===key);const db=await openDB(),s=db.transaction(name).objectStore(name).index(index);return (await txResult(s.getAll(key)))||[]}
export async function getByIndex(name,index,key){if(name==='links')return (await getAll('links')).find(row=>row?.[index]===key);if(name==='trash')return (await getAll('trash')).find(row=>row?.[index]===key);const db=await openDB(),s=db.transaction(name).objectStore(name).index(index);return txResult(s.get(key))}

export async function putOne(name,value){
  if(name==='links'){
    requireCloud();const id=value?.id!=null?String(value.id):'';if(!id)throw new Error('Link id is required.');let current=linksCache.get(id);if(!current){try{await hydrateCloudLinks()}catch{}current=linksCache.get(id)}
    const saved=current?await updateCloudLink(id,value,{expectedVersion:Number(current.version||0)}):await createCloudLink(value);if(saved.id!==id)linksCache.delete(id);cachePut(saved);notify({store:'links',operation:current?'update':'create',key:saved.id,version:saved.version});return saved;
  }
  if(name==='trash'||name==='tombstones')throw new Error(`${name} is managed by Supabase V8.1 and cannot be written locally.`);const s=await store(name,'readwrite');await txResult(s.put(value));notify({store:name,operation:'put',key:value?.id??value?.key??null});return value;
}
export async function deleteOne(name,key){if(name==='links'){requireCloud();let current=linksCache.get(String(key));if(!current){await hydrateCloudLinks();current=linksCache.get(String(key))}if(!current)throw new Error('Link not found.');const deleted=await deleteCloudLink(String(key),{expectedVersion:Number(current.version||0)});linksCache.delete(String(key));notify({store:'links',operation:'delete',key:String(key),version:deleted.version});return deleted}if(name==='trash')return restoreTrash(key);if(name==='tombstones')return;const s=await store(name,'readwrite');await txResult(s.delete(key));notify({store:name,operation:'delete',key})}
export async function clearStore(name){if(name==='links')throw new Error('Mass link deletion is blocked by Data Loss Guard V2. Delete links individually or restore a verified backup.');if(name==='trash'||name==='tombstones')return;const s=await store(name,'readwrite');await txResult(s.clear());notify({store:name,operation:'clear'})}

export async function createSafetyBackup(reason='safety'){requireCloud();return createCloudBackup(`${String(reason).replace(/[^a-z0-9_-]+/gi,'-').slice(0,40)}-${new Date().toISOString().slice(0,19)}`)}
export async function bulkPut(name,rows=[]){const valid=Array.isArray(rows)?rows:[];if(name==='links'){requireCloud();if(valid.length>1){const preview=await previewCloudImport(valid);await createSafetyBackup('pre-import');try{window.dispatchEvent(new CustomEvent('smartlink:import-preflight',{detail:preview||{}}))}catch{}}const saved=[];for(const row of valid)saved.push(await putOne('links',row));return saved}if(name==='trash'||name==='tombstones')throw new Error(`${name} is managed by Supabase V8.1.`);const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite'),s=tx.objectStore(name);for(const row of valid)s.put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});notify({store:name,operation:'bulk',count:valid.length});return valid}

export async function logEvent(type,detail={}){return putOne('events',{id:uid('evt'),type,detail,at:now()})}
export async function getSetting(key,fallback=null){const row=await getOne('settings',key);return row?row.value:fallback}
export async function setSetting(key,value){return putOne('settings',{key,value,updatedAt:now()})}
export async function putDiagnostic(type,detail={},level='info'){const row={id:uid('diag'),type:String(type||'event').slice(0,80),level:String(level||'info').slice(0,20),detail,at:now()};await putOne('diagnostics',row);pruneDiagnostics().catch(()=>{});return row}
export async function pruneDiagnostics(max=200){const rows=(await getAll('diagnostics')).sort((a,b)=>Number(b.at||0)-Number(a.at||0));for(const row of rows.slice(Math.max(50,max)))await directDelete('diagnostics',row.id);return Math.min(rows.length,max)}
export async function putDocument(linkId,data={}){return putOne('documents',{linkId:String(linkId),...data,fetchedAt:Number(data.fetchedAt||now())})}
export async function getDocument(linkId){return getOne('documents',String(linkId))}
export async function putVisual(linkId,data={}){return putOne('visuals',{linkId:String(linkId),...data,updatedAt:Number(data.updatedAt||now())})}
export async function getVisual(linkId){return getOne('visuals',String(linkId))}

export async function restoreTrash(id){requireCloud();const row=await getOne('trash',String(id));if(!row?.payload)throw new Error('Deleted link not found.');const restored=await restoreCloudLink(String(id),{expectedVersion:Number(row.payload.version||0)});cachePut(restored);notify({store:'links',operation:'restore',key:String(id),version:restored.version});return true}
export async function purgeTrashItem(id,{confirm=''}={}){requireCloud();const row=await getOne('trash',String(id));if(!row?.payload)throw new Error('Deleted link not found.');const ok=await purgeCloudLink(String(id),{expectedVersion:Number(row.payload.version||0),confirm});notify({store:'links',operation:'purge',key:String(id)});return ok}
export async function purgeTrash(){throw new Error('Mass permanent purge is disabled by Data Loss Guard V2. Purge deleted links individually.')}
export async function getSyncQueueCount(){return 0}
export async function clearSyncQueue(){const s=await store('syncQueue','readwrite');await txResult(s.clear())}

export async function exportAll(){return {version:8.1,storageMode:'supabase-row-v8.1',exportedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),events:await getAll('events'),archives:await getAll('archives'),workspaces:await getAll('workspaces'),trash:await getAll('trash'),tombstones:[],documents:await getAll('documents'),visuals:await getAll('visuals')}}
export async function exportCloudState(){return {version:8.1,storageMode:'supabase-row-v8.1',syncedAt:new Date().toISOString(),collections:await getAll('collections'),settings:await getAll('settings'),archives:await getAll('archives'),workspaces:await getAll('workspaces')}}
export async function importCloudState(state={},options={}){for(const name of LEGACY_CLOUD_STORES){const rows=Array.isArray(state?.[name])?state[name]:[];if(options?.replace){const s=await store(name,'readwrite');await txResult(s.clear())}if(rows.length)await bulkPut(name,rows)}if(Array.isArray(state?.links)&&state.links.length&&options?.allowLinkImport===true)await bulkPut('links',state.links)}
export async function getLinkHistory(linkId=null,limit=200){return getCloudHistory(linkId,limit)}
export async function createBackup(label=''){return createCloudBackup(label)}
export async function listBackups(limit=100){return listCloudBackups(limit)}
export async function verifyBackup(id){return verifyCloudBackup(id)}
export async function previewBackup(id){return previewCloudBackup(id)}
export async function restoreBackup(id,{confirm=false}={}){const result=await restoreCloudBackup(id,{confirm});await hydrateCloudLinks({force:true});notify({store:'links',operation:'backup-restore'});return result}
export async function getIntegrityStatus(){return cloudIntegrity()}
export async function previewImport(rows=[]){return previewCloudImport(rows)}
export async function logRuntimeEvent(type,detail={},level='info'){return putRuntimeEvent(type,level,detail)}
export async function getRuntimeEvents(limit=100){return listRuntimeEvents(limit)}
export async function resetAll(){for(const n of ['collections','settings','events','archives','workspaces','syncQueue','documents','visuals','diagnostics']){try{await clearStore(n)}catch{}}}

if(typeof window!=='undefined'){
  window.addEventListener('smartlink:session-ready',()=>hydrateCloudLinks({force:true}).catch(error=>console.warn('Cloud hydrate',error)));
  window.addEventListener('smartlink:session-cleared',()=>{linksCache.clear();hydratedToken=''});
  window.addEventListener('online',()=>{if(sessionToken())hydrateCloudLinks({force:true}).catch(()=>{})},{passive:true});
}
