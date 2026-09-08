const DB_NAME='smart-link-hub-v3';
const DB_VERSION=3;
const CLOUD_ENTITY_STORES=new Set(['links','collections','archives','workspaces']);
const CLOUD_STORES=new Set(['links','collections','settings','archives','workspaces','trash','tombstones']);
const CLOUD_STATE_STORES=['links','collections','settings','archives','workspaces','trash','tombstones'];
let dbPromise;

export const uid=(p='id')=>`${p}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const tombstoneId=(store,key)=>`${store}:${String(key)}`;
const now=()=>Date.now();

function ensureIndex(objectStore,name,keyPath,options={}){
  if(!objectStore.indexNames.contains(name))objectStore.createIndex(name,keyPath,options);
}
function enqueueMutation(detail){
  openDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction('syncQueue','readwrite');
    tx.objectStore('syncQueue').put({id:uid('sync'),...detail});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  })).catch(()=>{});
}
function notifyCloud(store,operation,key=null){
  if(!CLOUD_STORES.has(store)||globalThis.__slhCloudApplying)return;
  const detail={store,operation,key,at:now()};
  try{localStorage.setItem('slh_cloud_dirty','1')}catch{}
  enqueueMutation(detail);
  try{window.dispatchEvent(new CustomEvent('smartlink:local-mutation',{detail}))}catch{}
}

export function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
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
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>console.warn('Smart Link Hub IndexedDB upgrade is blocked by another open tab.');
  });
  return dbPromise;
}
async function store(name,mode='readonly'){const db=await openDB();return db.transaction(name,mode).objectStore(name)}
async function directDelete(name,key){const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

export async function getAll(name){const s=await store(name);return new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
export async function getOne(name,key){const s=await store(name);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function getAllByIndex(name,index,key){const db=await openDB(),s=db.transaction(name).objectStore(name).index(index);return new Promise((res,rej)=>{const r=s.getAll(key);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}

export async function putOne(name,value){
  const key=value?.id??value?.key??null;
  const db=await openDB();
  const resurrection=CLOUD_ENTITY_STORES.has(name)&&!globalThis.__slhCloudApplying&&key!=null;
  const names=resurrection?(name==='links'?[name,'trash','tombstones']:[name,'tombstones']):[name];
  return new Promise((res,rej)=>{
    const tx=db.transaction(names,'readwrite');
    tx.objectStore(name).put(value);
    if(resurrection){
      tx.objectStore('tombstones').delete(tombstoneId(name,key));
      if(name==='links')tx.objectStore('trash').delete(String(key));
    }
    tx.oncomplete=()=>{
      notifyCloud(name,'put',key);
      if(resurrection){notifyCloud('tombstones','delete',tombstoneId(name,key));if(name==='links')notifyCloud('trash','delete',String(key))}
      res(value);
    };
    tx.onerror=()=>rej(tx.error);
  });
}

export async function deleteOne(name,key){
  const db=await openDB();
  const guarded=CLOUD_ENTITY_STORES.has(name)&&!globalThis.__slhCloudApplying;
  if(!guarded){
    return new Promise((res,rej)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).delete(key);tx.oncomplete=()=>{notifyCloud(name,'delete',key);res()};tx.onerror=()=>rej(tx.error)});
  }
  const names=name==='links'?[name,'trash','tombstones']:[name,'tombstones'];
  return new Promise((res,rej)=>{
    const tx=db.transaction(names,'readwrite'),target=tx.objectStore(name),read=target.get(key),deletedAt=now();
    read.onsuccess=()=>{
      const previous=read.result;
      if(name==='links'&&previous){
        tx.objectStore('trash').put({id:String(key),entityStore:'links',entityId:String(key),payload:previous,deletedAt,expiresAt:deletedAt+30*864e5});
      }
      tx.objectStore('tombstones').put({id:tombstoneId(name,key),store:name,key:String(key),deletedAt});
      target.delete(key);
    };
    tx.oncomplete=()=>{
      notifyCloud(name,'delete',key);notifyCloud('tombstones','put',tombstoneId(name,key));if(name==='links')notifyCloud('trash','put',String(key));res();
    };
    tx.onerror=()=>rej(tx.error);
  });
}

export async function clearStore(name){
  if(CLOUD_ENTITY_STORES.has(name)&&!globalThis.__slhCloudApplying){
    const rows=await getAll(name);for(const row of rows)await deleteOne(name,row?.id);return;
  }
  const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>{notifyCloud(name,'clear');res()};r.onerror=()=>rej(r.error)})
}

export async function bulkPut(name,rows=[]){
  const db=await openDB(),valid=Array.isArray(rows)?rows:[];
  const resurrection=CLOUD_ENTITY_STORES.has(name)&&!globalThis.__slhCloudApplying;
  const names=resurrection?(name==='links'?[name,'trash','tombstones']:[name,'tombstones']):[name];
  return new Promise((res,rej)=>{
    const tx=db.transaction(names,'readwrite'),s=tx.objectStore(name);
    valid.forEach(x=>{
      s.put(x);
      const key=x?.id;
      if(resurrection&&key!=null){tx.objectStore('tombstones').delete(tombstoneId(name,key));if(name==='links')tx.objectStore('trash').delete(String(key))}
    });
    tx.oncomplete=()=>{notifyCloud(name,'bulk');if(resurrection&&valid.length){notifyCloud('tombstones','bulk-clear');if(name==='links')notifyCloud('trash','bulk-clear')}res()};
    tx.onerror=()=>rej(tx.error);
  });
}

export async function getByIndex(name,index,key){const db=await openDB();const s=db.transaction(name).objectStore(name).index(index);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
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
  await directDelete('trash',String(id));
  notifyCloud('trash','delete',String(id));
  return true;
}
export async function purgeTrash({expiredOnly=false}={}){
  const rows=await getAll('trash'),cut=now();let removed=0;
  for(const row of rows){if(expiredOnly&&Number(row.expiresAt||0)>cut)continue;await directDelete('trash',row.id);notifyCloud('trash','delete',row.id);removed++}
  return removed;
}
export async function getSyncQueueCount(){const rows=await getAll('syncQueue');return rows.length}
export async function clearSyncQueue(){const s=await store('syncQueue','readwrite');return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

export async function exportAll(){return {version:7,exportedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),events:await getAll('events'),archives:await getAll('archives'),workspaces:await getAll('workspaces'),trash:await getAll('trash'),tombstones:await getAll('tombstones'),documents:await getAll('documents'),visuals:await getAll('visuals')}}
export async function exportCloudState(){return {version:7,syncedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),archives:await getAll('archives'),workspaces:await getAll('workspaces'),trash:await getAll('trash'),tombstones:await getAll('tombstones')}}

export async function importCloudState(state={},options={}){
  const replace=options?.replace===true;
  globalThis.__slhCloudApplying=true;
  try{
    for(const name of CLOUD_STATE_STORES){
      const rows=Array.isArray(state?.[name])?state[name]:[];
      if(replace){const s=await store(name,'readwrite');await new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
      if(rows.length)await bulkPut(name,rows);
    }
    const tombstones=Array.isArray(state?.tombstones)?state.tombstones:[];
    for(const t of tombstones){if(CLOUD_ENTITY_STORES.has(t?.store)&&t?.key!=null)await directDelete(t.store,t.key)}
  }finally{globalThis.__slhCloudApplying=false}
}

export async function resetAll(){for(const n of ['links','collections','settings','events','archives','workspaces','trash','tombstones','syncQueue','documents','visuals','diagnostics'])await clearStore(n)}