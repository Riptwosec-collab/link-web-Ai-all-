const DB_NAME='smart-link-hub-v3'; const DB_VERSION=1;
let dbPromise;
export function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;
    if(!db.objectStoreNames.contains('links')){const s=db.createObjectStore('links',{keyPath:'id'});s.createIndex('url','url',{unique:true});s.createIndex('favorite','favorite');s.createIndex('collectionId','collectionId');s.createIndex('createdAt','createdAt')}
    if(!db.objectStoreNames.contains('collections')) db.createObjectStore('collections',{keyPath:'id'});
    if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
    if(!db.objectStoreNames.contains('events')){const s=db.createObjectStore('events',{keyPath:'id'});s.createIndex('at','at')}
    if(!db.objectStoreNames.contains('archives')){const s=db.createObjectStore('archives',{keyPath:'id'});s.createIndex('linkId','linkId')}
    if(!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces',{keyPath:'id'});
  };req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise;
}
async function store(name,mode='readonly'){const db=await openDB();return db.transaction(name,mode).objectStore(name)}
export async function getAll(name){const s=await store(name);return new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
export async function getOne(name,key){const s=await store(name);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function putOne(name,value){const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.put(value);r.onsuccess=()=>res(value);r.onerror=()=>rej(r.error)})}
export async function deleteOne(name,key){const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
export async function clearStore(name){const s=await store(name,'readwrite');return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
export async function bulkPut(name,rows=[]){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(name,'readwrite'),s=tx.objectStore(name);rows.forEach(x=>s.put(x));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
export async function getByIndex(name,index,key){const db=await openDB();const s=db.transaction(name).objectStore(name).index(index);return new Promise((res,rej)=>{const r=s.get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export const uid=(p='id')=>`${p}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
export async function logEvent(type,detail={}){return putOne('events',{id:uid('evt'),type,detail,at:Date.now()})}
export async function getSetting(key,fallback=null){const row=await getOne('settings',key);return row?row.value:fallback}
export async function setSetting(key,value){return putOne('settings',{key,value,updatedAt:Date.now()})}
export async function exportAll(){return {version:3,exportedAt:new Date().toISOString(),links:await getAll('links'),collections:await getAll('collections'),settings:await getAll('settings'),events:await getAll('events'),archives:await getAll('archives'),workspaces:await getAll('workspaces')}}
export async function resetAll(){for(const n of ['links','collections','settings','events','archives','workspaces']) await clearStore(n)}
