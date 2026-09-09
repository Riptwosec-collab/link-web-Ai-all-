const DB_NAME='smart-link-hub-v3';
const DB_VERSION=4;
const CLOUD_ENTITY_STORES=new Set(['links','collections','archives','workspaces']);
const CLOUD_STORES=new Set(['links','collections','settings','archives','workspaces','trash','tombstones']);
const CLOUD_STATE_STORES=['links','collections','settings','archives','workspaces','trash','tombstones'];
const VOLATILE_STORES=new Set(['links','trash','tombstones']);
const volatileStores={links:new Map(),trash:new Map(),tombstones:new Map()};
let dbPromise;

export const uid=(p='id')=>`${p}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const tombstoneId=(store,key)=>`${store}:${String(key)}`;
const now=()=>Date.now();
const sessionToken=()=>{try{return localStorage.getItem('smartlink_session_token')||''}catch{return ''}};
const isCloudApplying=()=>Boolean(globalThis.__slhCloudApplying);
const volatileKey=(name,value)=>name==='settings'?(value?.key):value?.id;

function ensureIndex(objectStore,name,keyPath,options={}){
  if(!objectStore.indexNames.contains(name))objectStore.createIndex(name,keyPath,options);
}
function volatileGetAll(name){return [...(volatileStores[name]?.values?.()||[])];}
function volatileGetOne(name,key){return volatileStores[name]?.get(String(key));}
function volatilePut(name,value){const key=volatileKey(name,value);if(key==null)throw new Error(`Missing key for ${name}`);volatileStores[name].set(String(key),value);return value;}
function volatileDelete(name,key){volatileStores[name]?.delete(String(key));}
function volatileClear(name){volatileStores[name]?.clear();}
function enqueueMutation(detail){
  openDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('syncQueue','readwrite');
    tx.objectStore('syncQueue').put({id:uid('sync'),...detail});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  })).catch(()=>{});
}
function notifyCloud(store,operation,key=null){
  if(!CLOUD_STORES.has(store)||isCloudApplying())return;
  const detail={store,operation,key,at:now(),cloudOnly:VOLATILE_STORES.has(store)};
  try{localStorage.setItem('slh_cloud_dirty','1')}catch{}
  enqueueMutation(detail);
  try{window.dispatchEvent(new CustomEvent('smartlink:local-mutation',{detail}))}catch{}
}
async function cloudCommitRequired(){
  if(isCloudApplying())return true;
  if(!sessionToken())throw new Error('Cloud sign-in required before saving links.');
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Cloud connection required. Link was not saved.');
  return new Promise((resolve,reject)=>{
    let stableTimer=null;
    const timeout=setTimeout(()=>finish(false,new Error('Cloud save timed out. Link was not saved.')),20000);
    const finish=(ok,error)=>{clearTimeout(timeout);clearTimeout(stableTimer);window.removeEventListener('smartlink:cloud-state',onState);ok?resolve(true):reject(error||new Error('Cloud save failed.'))};
    const onState=(event)=>{
      const mode=event?.detail?.mode;
      if(mode==='error'||mode==='offline')return finish(false,new Error(mode==='offline'?'Cloud connection required. Link was not saved.':'Cloud save failed. Link was not saved.'));
      if(mode==='pending'||mode==='syncing'||mode==='conflict'){clearTimeout(stableTimer);stableTimer=null;return}
      if(mode==='synced'){clearTimeout(stableTimer);stableTimer=setTimeout(()=>finish(true),250)}
    };
    window.addEventListener('smartlink:cloud-state',onState);
    window.dispatchEvent(new CustomEvent('smartlink:cloud-force-sync',{detail:{reason:'cloud-only-link-commit'}}));
  });
}
async function wipeLegacyPersistedCloudOnlyStores(db){
  const names=[...VOLATILE_STORES].filter(n=>db.objectStoreNames.contains(n));
  if(!names.length)return;
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(names,'readwrite');
    for(const name of names)tx.objectStore(name).clear();
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}

export function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=(event)=>{
      const db=req.result,tx=req.transaction;
      let links;
      if(!db.objectStoreNames.contains('links'))links=db.createObjectStore('links',{keyPath:'id'});else links=tx.objectStore('links');
      ensureIndex(links,'url','url',{unique:true});
      ensureIndex(links,'normalizedUrl','normalizedUrl');
      ensureIndex(links,'favorite','favorite');
      ensureIndex(links,'collectionId','collectionId');
      ensureIndex(links,'createdAt','createdAt');
      ensureIndex(links,'updatedAt','updatedAt');
      ensureIndex(links,'domain','domain');
      ensureIndex(links,'category','category');
      ensureIndex(links,'readingState','readingState');
      if(!db.objectStoreNames.contains('collections'))db.createObjectStore('collections',{keyPath:'id'});
      if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
      if(!db.objectStoreNames.contains('events')){const s=db.createObjectStore('events',{keyPath:'id'});s.createIndex('at','at')}
      if(!db.objectStoreNames.contains('archives')){const s=db.createObjectStore('archives',{keyPath:'id'});s.createIndex('linkId','linkId');s.createIndex('capturedAt','capturedAt')}
      else{const s=tx.objectStore('archives');ensureIndex(s,'linkId','linkId');ensureIndex(s,'capturedAt','capturedAt')}
      if(!db.objectStoreNames.contains('workspaces'))db.createObjectStore('workspaces',{keyPath:'id'});
      if(!db.objectStoreNames.contains('trash')){const s=db.createObjectStore('trash',{keyPath:'id'});s.createIndex('deletedAt','deletedAt');s.createIndex('expiresAt','expiresAt');s.createIndex('entityStore','entityStore')}
      if(!db.objectStoreNames.contains('tombstones')){const s=db.createObjectStore('tombstones',{keyPath:'id'});s.createIndex('deletedAt','deletedAt');s.createIndex('store','store')}
      if(!db.objectStoreNames.contains('syncQueue')){const s=db.createObjectStore('syncQueue',{keyPath:'id'});s.createIndex('at','at')}
      if(!db.objectStoreNames.contains('documents')){const s=db.createObjectStore('documents',{keyPath:'linkId'});s.createIndex('fetchedAt','fetchedAt');s.createIndex('contentHash','contentHash')}
      if(!db.objectStoreNames.contains('visuals')){const s=db.createObjectStore('visuals',{keyPath:'linkId'});s.createIndex('updatedAt','updatedAt')}
      if(!db.objectStoreNames.contains('diagnostics')){const s=db.createObjectStore('diagnostics',{keyPath:'id'});s.createIndex('at','at');s.createIndex('type','type')}
      if(Number(event.oldVersion||0)<4){
        for(const name of VOLATILE_STORES){if(db.objectStoreNames.contains(name))tx.objectStore(name).clear()}
      }
    };
    req.onsuccess=async()=>{
      try{await wipeLegacyPersistedCloudOnlyStores(req.result)}catch(err){console.warn('Could not purge legacy local link cache',err)}
      resolve(req.result);
    };
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>console.warn('Smart Link Hub IndexedDB upgrade is blocked by another open tab.');
  });
  return dbPromise;
}
async function store(name,mode='readonly'){const db=await openDB();return db.transaction(name,mode).objectStore(name)}
async function directDelete(name,key){
  if(VOLATILE_STORES.has(name)){volatileDelete(name,key);return}
  const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})
}

export async function getAll(name){
  if(VOLATILE_STORES.has(name))return volatileGetAll(name);
  const s=await store(name);return new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})
}
export async function getOne(name,key){
  if(VOLATILE_STORES.has(name))return volatileGetOne(name,key);
  const s=await store(name);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
}
export async function getAllByIndex(name,index,key){
  if(VOLATILE_STORES.has(name))return volatileGetAll(name).filter(row=>row?.[index]===key);
  const db=await openDB(),s=db.transaction(name).objectStore(name).index(index);return new Promise((res,rej)=>{const r=s.getAll(key);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})
}

export async function putOne(name,value){
  const key=value?.id??value?.key??null;
  if(VOLATILE_STORES.has(name)){
    const previous=key!=null?volatileGetOne(name,key):undefined;
    volatilePut(name,value);
    if(name==='links'&&!isCloudApplying()&&key!=null){
      volatileDelete('tombstones',tombstoneId(name,key));
      volatileDelete('trash',String(key));
      notifyCloud(name,'put',key);notifyCloud('tombstones','delete',tombstoneId(name,key));notifyCloud('trash','delete',String(key));
      try{await cloudCommitRequired()}catch(err){if(previous)volatilePut(name,previous);else volatileDelete(name,key);throw err}
    }else notifyCloud(name,'put',key);
    return value;
  }
  const db=await openDB();
  const resurrection=CLOUD_ENTITY_STORES.has(name)&&!isCloudApplying()&&key!=null;
  const names=resurrection?[name,'tombstones']:[name];
  return new Promise((res,rej)=>{
    const tx=db.transaction(names,'readwrite');
    tx.objectStore(name).put(value);
    if(resurrection)volatileDelete('tombstones',tombstoneId(name,key));
    tx.oncomplete=()=>{notifyCloud(name,'put',key);if(resurrection)notifyCloud('tombstones','delete',tombstoneId(name,key));res(value)};
    tx.onerror=()=>rej(tx.error);
  });
}

export async function deleteOne(name,key){
  if(name==='links'){
    if(!isCloudApplying()&&!sessionToken())throw new Error('Cloud sign-in required before deleting links.');
    if(!isCloudApplying()&&typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Cloud connection required. Link was not deleted.');
    const previous=volatileGetOne('links',key),deletedAt=now();
    if(previous)volatilePut('trash',{id:String(key),entityStore:'links',entityId:String(key),payload:previous,deletedAt,expiresAt:deletedAt+30*864e5});
    volatilePut('tombstones',{id:tombstoneId('links',key),store:'links',key:String(key),deletedAt});
    volatileDelete('links',key);
    if(!isCloudApplying()){
      notifyCloud('links','delete',key);notifyCloud('tombstones','put',tombstoneId('links',key));if(previous)notifyCloud('trash','put',String(key));
      try{await cloudCommitRequired()}catch(err){if(previous)volatilePut('links',previous);volatileDelete('tombstones',tombstoneId('links',key));if(previous)volatileDelete('trash',String(key));throw err}
    }
    return;
  }
  if(VOLATILE_STORES.has(name)){volatileDelete(name,key);notifyCloud(name,'delete',key);return}
  const db=await openDB();
  const guarded=CLOUD_ENTITY_STORES.has(name)&&!isCloudApplying();
  if(!guarded){return new Promise((res,rej)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).delete(key);tx.oncomplete=()=>{notifyCloud(name,'delete',key);res()};tx.onerror=()=>rej(tx.error)})}
  const names=[name];
  return new Promise((res,rej)=>{
    const tx=db.transaction(names,'readwrite');tx.objectStore(name).delete(key);
    tx.oncomplete=()=>{volatilePut('tombstones',{id:tombstoneId(name,key),store:name,key:String(key),deletedAt:now()});notifyCloud(name,'delete',key);notifyCloud('tombstones','put',tombstoneId(name,key));res()};
    tx.onerror=()=>rej(tx.error);
  });
}

export async function clearStore(name){
  if(VOLATILE_STORES.has(name)){
    if(name==='links'&&!isCloudApplying()){const rows=await getAll('links');for(const row of rows)await deleteOne('links',row?.id);return}
    volatileClear(name);notifyCloud(name,'clear');return;
  }
  if(CLOUD_ENTITY_STORES.has(name)&&!isCloudApplying()){const rows=await getAll(name);for(const row of rows)await deleteOne(name,row?.id);return}
  const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>{notifyCloud(name,'clear');res()};r.onerror=()=>rej(r.error)})
}

export async function bulkPut(name,rows=[]){
  const valid=Array.isArray(rows)?rows:[];
  if(VOLATILE_STORES.has(name)){
    for(const row of valid)volatilePut(name,row);
    if(name==='links'&&!isCloudApplying()){
      for(const row of valid){if(row?.id!=null){volatileDelete('tombstones',tombstoneId(name,row.id));volatileDelete('trash',String(row.id))}}
      notifyCloud(name,'bulk');notifyCloud('tombstones','bulk-clear');notifyCloud('trash','bulk-clear');
      await cloudCommitRequired();
    }else notifyCloud(name,'bulk');
    return;
  }
  const db=await openDB();
  const resurrection=CLOUD_ENTITY_STORES.has(name)&&!isCloudApplying();
  return new Promise((res,rej)=>{
    const tx=db.transaction(name,'readwrite'),s=tx.objectStore(name);valid.forEach(x=>s.put(x));
    tx.oncomplete=()=>{notifyCloud(name,'bulk');if(resurrection&&valid.length)notifyCloud('tombstones','bulk-clear');res()};
    tx.onerror=()=>rej(tx.error);
  });
}

export async function getByIndex(name,index,key){
  if(VOLATILE_STORES.has(name))return volatileGetAll(name).find(row=>row?.[index]===key);
  const db=await openDB(),s=db.transaction(name).objectStore(name).index(index);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
}
export async function logEvent(type,detail={}){return putOne('events',{id:uid('evt'),type,detail,at:now()})}
export async function getSetting(key,fallback=null){const row=await getOne('settings',key);return row?row.value:fallback}
export async function setSetting(key,value){return putOne('settings',{key,value,updatedAt:now()})}

export async function putDiagnostic(type,detail={},level='info'){
  const row={id:uid('diag'),type:String(type||'event').slice(0,80),level:String(level||'info').slice(0,20),detail,at:now()};
  await putOne('diagnostics',row);pruneDiagnostics().catch(()=>{});return row;
}
export async function pruneDiagnostics(max=200){const rows=(await getAll('diagnostics')).sort((a,b)=>Number(b.at||0)-Number(a.at||0));for(const row of rows.slice(Math.max(50,max)))await directDelete('diagnostics',row.id);return Math.min(rows.length,max)}
export async function putDocument(linkId,data={}){return putOne('documents',{linkId:String(linkId),...data,fetchedAt:Number(data.fetchedAt||now())})}
export async function getDocument(linkId){return getOne('documents',String(linkId))}
export async function putVisual(linkId,data={}){return putOne('visuals',{linkId:String(linkId),...data,updatedAt:Number(data.updatedAt||now())})}
export async function getVisual(linkId){return getOne('visuals',String(linkId))}

export async function restoreTrash(id){
  const row=await getOne('trash',String(id));if(!row?.payload)return false;
  await putOne(row.entityStore||'links',{...row.payload,updatedAt:now()});
  volatileDelete('trash',String(id));notifyCloud('trash','delete',String(id));
  return true;
}
export async function purgeTrash({expiredOnly=false}={}){
  const rows=await getAll('trash'),cut=now();let removed=0;
  for(const row of rows){if(expiredOnly&&Number(row.expiresAt||0)>cut)continue;volatileDelete('trash',row.id);notifyCloud('trash','delete',row.id);removed++}
  if(removed&&!isCloudApplying())await cloudCommitRequired();
  return removed;
}
export async function getSyncQueueCount(){const rows=await getAll('syncQueue');return rows.length}
export async function clearSyncQueue(){const s=await store('syncQueue','readwrite');return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

export async function exportAll(){return {version:8,storageMode:'cloud-only-links',exportedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),events:await getAll('events'),archives:await getAll('archives'),workspaces:await getAll('workspaces'),trash:await getAll('trash'),tombstones:await getAll('tombstones'),documents:await getAll('documents'),visuals:await getAll('visuals')}}
export async function exportCloudState(){return {version:8,storageMode:'cloud-only-links',syncedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),archives:await getAll('archives'),workspaces:await getAll('workspaces'),trash:await getAll('trash'),tombstones:await getAll('tombstones')}}

export async function importCloudState(state={},options={}){
  const replace=options?.replace===true;
  globalThis.__slhCloudApplying=true;
  try{
    for(const name of CLOUD_STATE_STORES){
      const rows=Array.isArray(state?.[name])?state[name]:[];
      if(replace){if(VOLATILE_STORES.has(name))volatileClear(name);else{const s=await store(name,'readwrite');await new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}}
      if(rows.length)await bulkPut(name,rows);
    }
    const tombstones=Array.isArray(state?.tombstones)?state.tombstones:[];
    for(const t of tombstones){if(CLOUD_ENTITY_STORES.has(t?.store)&&t?.key!=null)await directDelete(t.store,t.key)}
  }finally{globalThis.__slhCloudApplying=false}
}

export async function resetAll(){for(const n of ['links','collections','settings','events','archives','workspaces','trash','tombstones','syncQueue','documents','visuals','diagnostics'])await clearStore(n)}