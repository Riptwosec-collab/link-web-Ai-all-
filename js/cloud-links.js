const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
const TOKEN_KEY='smartlink_session_token';

const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||''}catch{return ''}};
const requestId=(kind='mut')=>`${kind}:${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const ms=value=>value?Date.parse(value)||0:0;
const emit=(mode,detail={})=>{try{window.dispatchEvent(new CustomEvent('smartlink:cloud-state',{detail:{mode,storageMode:'supabase-row-v8',...detail}}))}catch{}};

async function rpc(name,body={}){
  const t=token();
  if(!t)throw new Error('Cloud sign-in required. Nothing was saved.');
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Cloud connection required. Nothing was saved.');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_token:t,...body}),cache:'no-store'});
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));let message=text;try{message=JSON.parse(text)?.message||text}catch{}throw new Error(`${name}: ${String(message).slice(0,260)}`)}
  return res.json();
}

function extras(row={}){
  const metadata=row.metadata&&typeof row.metadata==='object'?row.metadata:{};
  const legacy=metadata.legacy&&typeof metadata.legacy==='object'?metadata.legacy:{};
  const patch=metadata.lastClientPatch&&typeof metadata.lastClientPatch==='object'?metadata.lastClientPatch:{};
  return {...legacy,...patch};
}

export function fromCloudRow(row={}){
  const extra=extras(row);
  const healthExtra=extra.health&&typeof extra.health==='object'?extra.health:{};
  const out={
    ...extra,
    id:String(row.id||extra.id||''),
    url:row.url||extra.url||'',
    normalizedUrl:row.normalized_url||extra.normalizedUrl||extra.normalized_url||'',
    title:row.title||extra.title||'',
    description:row.description||extra.description||'',
    domain:row.domain||extra.domain||'',
    category:row.category||extra.category||'General',
    subcategory:row.subcategory||extra.subcategory||'',
    tags:Array.isArray(row.tags)?row.tags:(Array.isArray(extra.tags)?extra.tags:[]),
    favorite:Boolean(row.favorite),
    readLater:Boolean(row.read_later),
    summary:row.summary||extra.summary||'',
    imageUrl:row.image_url||extra.imageUrl||'',
    favicon:row.favicon||extra.favicon||'',
    health:{...healthExtra,state:row.health_status||healthExtra.state||'unknown'},
    createdAt:ms(row.created_at)||Number(extra.createdAt||Date.now()),
    updatedAt:ms(row.updated_at)||Number(extra.updatedAt||Date.now()),
    lastOpenedAt:ms(row.last_opened_at)||Number(extra.lastOpenedAt||0),
    version:Number(row.version||extra.version||1),
    storageMode:'supabase-row-v8'
  };
  if(row.deleted_at)out.deletedAt=ms(row.deleted_at);
  else delete out.deletedAt;
  return out;
}

function clientPayload(link={}){
  return {...link,normalizedUrl:link.normalizedUrl||link.normalized_url||link.url,readLater:Boolean(link.readLater),metadata:{...(link.metadata||{}),clientSchema:8}};
}

async function mutate(name,body,label){
  emit('syncing',{label:`Saving ${label} to Supabase…`});
  try{
    const rows=await rpc(name,body);
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row)throw new Error('Cloud returned no saved record.');
    const link=fromCloudRow(row);
    emit('synced',{label:'Saved to Supabase',linkId:link.id,version:link.version,updatedAt:row.updated_at});
    try{window.dispatchEvent(new CustomEvent('smartlink:cloud-link-saved',{detail:{operation:label,link}}))}catch{}
    return link;
  }catch(error){emit('error',{label:'Cloud save failed',error:error?.message||String(error)});throw error}
}

export async function listCloudLinks({includeDeleted=false}={}){
  const rows=await rpc('smartlink_links_list',{p_include_deleted:Boolean(includeDeleted)});
  return (Array.isArray(rows)?rows:[]).map(fromCloudRow);
}

export async function createCloudLink(link,{request_id=null}={}){
  return mutate('smartlink_link_create',{p_link:clientPayload(link),p_request_id:request_id||requestId('create')},'link');
}

export async function updateCloudLink(id,patch,{request_id=null}={}){
  return mutate('smartlink_link_update',{p_id:String(id),p_patch:clientPayload(patch),p_request_id:request_id||requestId('update')},'changes');
}

export async function deleteCloudLink(id,{request_id=null}={}){
  return mutate('smartlink_link_delete',{p_id:String(id),p_request_id:request_id||requestId('delete')},'deletion');
}

export async function restoreCloudLink(id,{request_id=null}={}){
  return mutate('smartlink_link_restore',{p_id:String(id),p_request_id:request_id||requestId('restore')},'restore');
}

export async function getCloudHistory(linkId=null,limit=200){
  const rows=await rpc('smartlink_link_history_list',{p_link_id:linkId?String(linkId):null,p_limit:Number(limit||200)});
  return Array.isArray(rows)?rows:[];
}

export async function createCloudBackup(label=''){
  const rows=await rpc('smartlink_backup_create',{p_label:String(label||'')});
  return Array.isArray(rows)?rows[0]||null:rows;
}

export async function listCloudBackups(limit=100){
  const rows=await rpc('smartlink_backups_list',{p_limit:Number(limit||100)});
  return Array.isArray(rows)?rows:[];
}

export async function previewCloudBackup(id){
  const rows=await rpc('smartlink_backup_preview',{p_backup_id:id});
  return Array.isArray(rows)?rows[0]||null:rows;
}

export async function restoreCloudBackup(id,{confirm=false}={}){
  if(!confirm)throw new Error('Restore confirmation required.');
  emit('syncing',{label:'Restoring Supabase backup…'});
  try{const rows=await rpc('smartlink_backup_restore',{p_backup_id:id,p_confirm:true});const result=Array.isArray(rows)?rows[0]||null:rows;emit('synced',{label:'Backup restored',result});return result}catch(error){emit('error',{label:'Backup restore failed',error:error?.message||String(error)});throw error}
}

export const SmartLinkCloudV8={listCloudLinks,createCloudLink,updateCloudLink,deleteCloudLink,restoreCloudLink,getCloudHistory,createCloudBackup,listCloudBackups,previewCloudBackup,restoreCloudBackup};
if(typeof window!=='undefined')window.SmartLinkCloudV8=SmartLinkCloudV8;
