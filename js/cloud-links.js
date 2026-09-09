const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';
const E2E_KEY='slh_e2e_row_store_v8';

const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}};
const isE2E=()=>{try{return ['localhost','127.0.0.1','::1'].includes(location.hostname)&&new URLSearchParams(location.search).get('e2e')==='1'}catch{return false}};
const requestId=(kind='mut')=>`${kind}:${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const ms=value=>value?Date.parse(value)||0:0;
const emit=(mode,detail={})=>{try{window.dispatchEvent(new CustomEvent('smartlink:cloud-state',{detail:{mode,storageMode:'supabase-row-v8',...detail}}))}catch{}};
const readE2E=()=>{try{return JSON.parse(localStorage.getItem(E2E_KEY)||'')||{links:[],history:[],backups:[]}}catch{return {links:[],history:[],backups:[]}}};
const writeE2E=db=>localStorage.setItem(E2E_KEY,JSON.stringify(db));

function e2eRow(link={},existing=null){
  const nowIso=new Date().toISOString(),created=existing?.created_at||new Date(Number(link.createdAt||Date.now())).toISOString();
  return {
    id:String(existing?.id||link.id||crypto.randomUUID()),profile_id:'00000000-0000-4000-8000-000000000007',url:link.url||existing?.url||'',normalized_url:link.normalizedUrl||link.normalized_url||existing?.normalized_url||link.url||'',title:link.title??existing?.title??'',description:link.description??existing?.description??'',domain:link.domain??existing?.domain??'',category:link.category??existing?.category??'General',subcategory:link.subcategory??existing?.subcategory??'',tags:Array.isArray(link.tags)?link.tags:(existing?.tags||[]),favorite:link.favorite==null?Boolean(existing?.favorite):Boolean(link.favorite),read_later:link.readLater==null?(link.readingState?true:Boolean(existing?.read_later)):Boolean(link.readLater),summary:link.summary??existing?.summary??'',image_url:link.imageUrl??existing?.image_url??'',favicon:link.favicon??existing?.favicon??'',health_status:link.health?.state||existing?.health_status||'unknown',metadata:{...(existing?.metadata||{}),lastClientPatch:{...(existing?.metadata?.lastClientPatch||{}),...link}},last_opened_at:link.lastOpenedAt?new Date(Number(link.lastOpenedAt)).toISOString():(existing?.last_opened_at||null),created_at:created,updated_at:nowIso,deleted_at:existing?.deleted_at||null,version:Number(existing?.version||0)+1
  };
}
function e2eHistory(db,row,action,req=null){db.history.unshift({id:db.history.length+1,profile_id:row.profile_id,link_id:row.id,action,version:row.version,snapshot:row,request_id:req,changed_at:new Date().toISOString()})}
function e2eBackupSnapshot(db,type='manual',key='manual'){const live=db.links.filter(x=>!x.deleted_at);const b={id:crypto.randomUUID(),profile_id:'00000000-0000-4000-8000-000000000007',backup_type:type,backup_key:key,snapshot:live,link_count:live.length,created_at:new Date().toISOString()};db.backups.unshift(b);return b}
async function e2eRpc(name,b={}){
  const db=readE2E();
  if(name==='smartlink_links_list')return db.links.filter(x=>b.p_include_deleted||!x.deleted_at).sort((a,c)=>Date.parse(c.updated_at)-Date.parse(a.updated_at));
  if(name==='smartlink_link_create'){
    if(b.p_request_id){const h=db.history.find(x=>x.request_id===b.p_request_id);if(h)return db.links.filter(x=>x.id===h.link_id)}
    const p=b.p_link||{},idx=db.links.findIndex(x=>x.normalized_url===(p.normalizedUrl||p.normalized_url||p.url)),existing=idx>=0?db.links[idx]:null,row=e2eRow(p,existing);row.deleted_at=null;if(idx>=0)db.links[idx]=row;else db.links.push(row);e2eHistory(db,row,existing?'update':'create',b.p_request_id||null);writeE2E(db);return [row];
  }
  if(name==='smartlink_link_update'){
    const idx=db.links.findIndex(x=>x.id===String(b.p_id));if(idx<0)return [];const row=e2eRow(b.p_patch||{},db.links[idx]);db.links[idx]=row;e2eHistory(db,row,'update',b.p_request_id||null);writeE2E(db);return [row];
  }
  if(name==='smartlink_link_delete'){
    const idx=db.links.findIndex(x=>x.id===String(b.p_id));if(idx<0)return [];const row={...db.links[idx],deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:Number(db.links[idx].version||0)+1};db.links[idx]=row;e2eHistory(db,row,'delete',b.p_request_id||null);writeE2E(db);return [row];
  }
  if(name==='smartlink_link_restore'){
    const idx=db.links.findIndex(x=>x.id===String(b.p_id));if(idx<0)return [];const row={...db.links[idx],deleted_at:null,updated_at:new Date().toISOString(),version:Number(db.links[idx].version||0)+1};db.links[idx]=row;e2eHistory(db,row,'restore',b.p_request_id||null);writeE2E(db);return [row];
  }
  if(name==='smartlink_link_history_list')return db.history.filter(x=>!b.p_link_id||x.link_id===String(b.p_link_id)).slice(0,Number(b.p_limit||200));
  if(name==='smartlink_backup_create'){const backup=e2eBackupSnapshot(db,'manual',b.p_label||`manual-${Date.now()}`);writeE2E(db);return [backup]}
  if(name==='smartlink_backups_list')return db.backups.slice(0,Number(b.p_limit||100));
  if(name==='smartlink_backup_preview'){const bk=db.backups.find(x=>x.id===b.p_backup_id);if(!bk)return [];const live=db.links.filter(x=>!x.deleted_at),cur=new Map(live.map(x=>[x.normalized_url,x])),bak=new Map((bk.snapshot||[]).map(x=>[x.normalized_url,x]));let willRestore=0,willRemove=0,willUpdate=0;for(const [k,v] of bak){if(!cur.has(k))willRestore++;else if(JSON.stringify(cur.get(k))!==JSON.stringify(v))willUpdate++}for(const k of cur.keys())if(!bak.has(k))willRemove++;return [{current_links:live.length,backup_links:bk.snapshot.length,will_restore:willRestore,will_remove:willRemove,will_update:willUpdate}]}
  if(name==='smartlink_backup_restore'){const bk=db.backups.find(x=>x.id===b.p_backup_id);if(!bk||!b.p_confirm)return [];const pre=e2eBackupSnapshot(db,'pre_restore',`pre-${Date.now()}`),keep=new Set((bk.snapshot||[]).map(x=>x.normalized_url));let removed=0;db.links=db.links.map(x=>{if(!x.deleted_at&&!keep.has(x.normalized_url)){removed++;return {...x,deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:Number(x.version||0)+1}}return x});let restored=0;for(const snap of bk.snapshot||[]){const idx=db.links.findIndex(x=>x.normalized_url===snap.normalized_url),row={...snap,deleted_at:null,updated_at:new Date().toISOString(),version:Number((idx>=0?db.links[idx].version:snap.version)||0)+1};if(idx>=0)db.links[idx]=row;else db.links.push(row);e2eHistory(db,row,'backup_restore');restored++}writeE2E(db);return [{restored,removed,backup_id:pre.id}]}
  return [];
}

async function rpc(name,body={}){
  const t=token();
  if(!t)throw new Error('Cloud sign-in required. Nothing was saved.');
  if(isE2E())return e2eRpc(name,body);
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Cloud connection required. Nothing was saved.');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_token:t,...body}),cache:'no-store'});
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));let message=text;try{message=JSON.parse(text)?.message||text}catch{}throw new Error(`${name}: ${String(message).slice(0,260)}`)}
  return res.json();
}

function extras(row={}){const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata:{};const legacy=metadata.legacy&&typeof metadata.legacy==='object'?metadata.legacy:{};const patch=metadata.lastClientPatch&&typeof metadata.lastClientPatch==='object'?metadata.lastClientPatch:{};return {...legacy,...patch}}

export function fromCloudRow(row={}){
  const extra=extras(row),healthExtra=extra.health&&typeof extra.health==='object'?extra.health:{};
  const readLater=Boolean(row.read_later);
  const out={...extra,id:String(row.id||extra.id||''),url:row.url||extra.url||'',normalizedUrl:row.normalized_url||extra.normalizedUrl||extra.normalized_url||'',title:row.title||extra.title||'',description:row.description||extra.description||'',domain:row.domain||extra.domain||'',category:row.category||extra.category||'General',subcategory:row.subcategory||extra.subcategory||'',tags:Array.isArray(row.tags)?row.tags:(Array.isArray(extra.tags)?extra.tags:[]),favorite:Boolean(row.favorite),readLater,readingState:extra.readingState||(readLater?'unread':''),summary:row.summary||extra.summary||'',imageUrl:row.image_url||extra.imageUrl||'',favicon:row.favicon||extra.favicon||'',health:{...healthExtra,state:row.health_status||healthExtra.state||'unknown'},createdAt:ms(row.created_at)||Number(extra.createdAt||Date.now()),updatedAt:ms(row.updated_at)||Number(extra.updatedAt||Date.now()),lastOpenedAt:ms(row.last_opened_at)||Number(extra.lastOpenedAt||0),version:Number(row.version||extra.version||1),storageMode:'supabase-row-v8'};
  if(row.deleted_at)out.deletedAt=ms(row.deleted_at);else delete out.deletedAt;return out;
}

function clientPayload(link={}){const inferredReadLater=Boolean(link.readLater||['unread','reading','read-later'].includes(String(link.readingState||'').toLowerCase()));return {...link,normalizedUrl:link.normalizedUrl||link.normalized_url||link.url,readLater:inferredReadLater,metadata:{...(link.metadata||{}),clientSchema:8}}}

async function mutate(name,body,label){emit('syncing',{label:`Saving ${label} to Supabase…`});try{const rows=await rpc(name,body),row=Array.isArray(rows)?rows[0]:rows;if(!row)throw new Error('Cloud returned no saved record.');const link=fromCloudRow(row);emit('synced',{label:'Saved to Supabase',linkId:link.id,version:link.version,updatedAt:row.updated_at});try{window.dispatchEvent(new CustomEvent('smartlink:cloud-link-saved',{detail:{operation:label,link}}))}catch{}return link}catch(error){emit('error',{label:'Cloud save failed',error:error?.message||String(error)});throw error}}

export async function listCloudLinks({includeDeleted=false}={}){const rows=await rpc('smartlink_links_list',{p_include_deleted:Boolean(includeDeleted)});return (Array.isArray(rows)?rows:[]).map(fromCloudRow)}
export async function createCloudLink(link,{request_id=null}={}){return mutate('smartlink_link_create',{p_link:clientPayload(link),p_request_id:request_id||requestId('create')},'link')}
export async function updateCloudLink(id,patch,{request_id=null}={}){return mutate('smartlink_link_update',{p_id:String(id),p_patch:clientPayload(patch),p_request_id:request_id||requestId('update')},'changes')}
export async function deleteCloudLink(id,{request_id=null}={}){return mutate('smartlink_link_delete',{p_id:String(id),p_request_id:request_id||requestId('delete')},'deletion')}
export async function restoreCloudLink(id,{request_id=null}={}){return mutate('smartlink_link_restore',{p_id:String(id),p_request_id:request_id||requestId('restore')},'restore')}
export async function getCloudHistory(linkId=null,limit=200){const rows=await rpc('smartlink_link_history_list',{p_link_id:linkId?String(linkId):null,p_limit:Number(limit||200)});return Array.isArray(rows)?rows:[]}
export async function createCloudBackup(label=''){const rows=await rpc('smartlink_backup_create',{p_label:String(label||'')});return Array.isArray(rows)?rows[0]||null:rows}
export async function listCloudBackups(limit=100){const rows=await rpc('smartlink_backups_list',{p_limit:Number(limit||100)});return Array.isArray(rows)?rows:[]}
export async function previewCloudBackup(id){const rows=await rpc('smartlink_backup_preview',{p_backup_id:id});return Array.isArray(rows)?rows[0]||null:rows}
export async function restoreCloudBackup(id,{confirm=false}={}){if(!confirm)throw new Error('Restore confirmation required.');emit('syncing',{label:'Restoring Supabase backup…'});try{const rows=await rpc('smartlink_backup_restore',{p_backup_id:id,p_confirm:true}),result=Array.isArray(rows)?rows[0]||null:rows;emit('synced',{label:'Backup restored',result});return result}catch(error){emit('error',{label:'Backup restore failed',error:error?.message||String(error)});throw error}}

export const SmartLinkCloudV8={listCloudLinks,createCloudLink,updateCloudLink,deleteCloudLink,restoreCloudLink,getCloudHistory,createCloudBackup,listCloudBackups,previewCloudBackup,restoreCloudBackup};
if(typeof window!=='undefined')window.SmartLinkCloudV8=SmartLinkCloudV8;
