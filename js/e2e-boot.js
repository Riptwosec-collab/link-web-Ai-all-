(() => {
  'use strict';
  const localHost=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const enabled=localHost&&new URLSearchParams(location.search).get('e2e')==='1';
  if(!enabled)return;

  const TOKEN='e2e-smartlink-token';
  const PROFILE={profile_id:'00000000-0000-4000-8000-000000000007',display_name:'Mek',username:'mek',expires_at:'2099-01-01T00:00:00Z',device_name:'Playwright · Chromium'};
  const CLOUD_KEY='slh_e2e_cloud_v7';
  const DOC_KEY='slh_e2e_docs_v7';
  const EMBED_KEY='slh_e2e_embeddings_v7';
  const SHARE_KEY='slh_e2e_shares_v7';
  const realFetch=window.fetch.bind(window);
  const emptyState=()=>({version:7,syncedAt:new Date().toISOString(),links:[],collections:[],settings:[],archives:[],workspaces:[],trash:[],tombstones:[]});
  const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k)||'')||fallback}catch{return fallback}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const cloud=()=>read(CLOUD_KEY,{state:emptyState(),revision:0,updated_at:new Date().toISOString(),history:[]});
  const setCloud=v=>write(CLOUD_KEY,v);
  const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}}));

  localStorage.setItem('smartlink_session_token',TOKEN);
  localStorage.setItem('smartlink_session_profile',JSON.stringify(PROFILE));

  function body(init){try{return JSON.parse(init?.body||'{}')}catch{return {}}}
  function rpcName(url){return String(url).split('/rest/v1/rpc/')[1]?.split(/[?#]/)[0]||''}
  function pseudoVector(text){const out=new Array(1024).fill(0),s=String(text||'').toLowerCase();for(let i=0;i<s.length;i++){const n=(s.charCodeAt(i)*31+i*17)%1024;out[n]+=((s.charCodeAt(i)%13)+1)/13}let norm=Math.sqrt(out.reduce((a,v)=>a+v*v,0))||1;return out.map(v=>v/norm)}
  const cosine=(a,b)=>{let n=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){n+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return aa&&bb?n/Math.sqrt(aa*bb):0};

  async function handleRpc(name,b){
    if(name==='smartlink_session')return [PROFILE];
    if(name==='smartlink_login'||name==='smartlink_login_v2')return [{session_token:TOKEN,profile_id:PROFILE.profile_id,display_name:'Mek',expires_at:PROFILE.expires_at}];
    if(name==='smartlink_logout'||name==='smartlink_logout_others'||name==='smartlink_device_logout')return [{ok:true}];
    if(name==='smartlink_devices')return [{session_id:'00000000-0000-4000-8000-000000000008',device_name:'Playwright · Chromium',created_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),is_current:true}];
    if(name==='smartlink_login_history')return [];
    if(name==='smartlink_state_get'){const c=cloud();return [{state:c.state,revision:c.revision,updated_at:c.updated_at}]}
    if(name==='smartlink_state_put_v2'){
      const c=cloud(),expected=Number(b.p_expected_revision||0);if(expected!==Number(c.revision||0))return [{conflict:true,revision:c.revision,updated_at:c.updated_at}];
      const next={state:b.p_state||emptyState(),revision:c.revision+1,updated_at:new Date().toISOString(),history:[...(c.history||[]),{revision:c.revision,state:c.state,updated_at:c.updated_at}].slice(-50)};setCloud(next);return [{conflict:false,revision:next.revision,updated_at:next.updated_at}];
    }
    if(name==='smartlink_state_put'){const c=cloud(),next={...c,state:b.p_state||emptyState(),revision:c.revision+1,updated_at:new Date().toISOString()};setCloud(next);return [{revision:next.revision,updated_at:next.updated_at}]}
    if(name==='smartlink_state_versions'){const c=cloud();return [...(c.history||[]),{revision:c.revision,state:c.state,updated_at:c.updated_at}].slice(-Number(b.p_limit||20)).reverse().map(x=>({revision:x.revision,updated_at:x.updated_at,links_count:x.state?.links?.length||0}))}
    if(name==='smartlink_state_restore'){const c=cloud(),found=(c.history||[]).find(x=>Number(x.revision)===Number(b.p_revision));if(!found)return [];const next={...c,state:found.state,revision:c.revision+1,updated_at:new Date().toISOString()};setCloud(next);return [{revision:next.revision,updated_at:next.updated_at,state:next.state}]}
    if(name==='smartlink_document_put'){const docs=read(DOC_KEY,{}),t=new Date().toISOString();docs[b.p_link_id]={link_id:b.p_link_id,content:b.p_content||'',markdown:b.p_markdown||'',screenshot_data:b.p_screenshot_data||'',metadata:b.p_metadata||{},content_hash:b.p_content_hash||'',updated_at:t};write(DOC_KEY,docs);return [{updated_at:t}]}
    if(name==='smartlink_document_get'){const d=read(DOC_KEY,{})[b.p_link_id];return d?[d]:[]}
    if(name==='smartlink_document_delete'){const docs=read(DOC_KEY,{}),had=Boolean(docs[b.p_link_id]);delete docs[b.p_link_id];write(DOC_KEY,docs);const em=read(EMBED_KEY,{});delete em[b.p_link_id];write(EMBED_KEY,em);return had}
    if(name==='smartlink_embedding_put'){const em=read(EMBED_KEY,{});let v=[];try{v=JSON.parse(b.p_embedding||'[]')}catch{}em[b.p_link_id]={vector:v,metadata:b.p_metadata||{},content_hash:b.p_content_hash||'',model:b.p_model||'',updated_at:new Date().toISOString()};write(EMBED_KEY,em);return [{updated_at:em[b.p_link_id].updated_at}]}
    if(name==='smartlink_semantic_search'){let q=[];try{q=JSON.parse(b.p_embedding||'[]')}catch{}const em=read(EMBED_KEY,{});return Object.entries(em).map(([id,x])=>({link_id:id,similarity:cosine(q,x.vector||[]),metadata:x.metadata||{}})).filter(x=>x.similarity>=Number(b.p_threshold ?? 0.2)).sort((a,c)=>c.similarity-a.similarity).slice(0,Number(b.p_limit||20))}
    if(name==='smartlink_share_create'){const shares=read(SHARE_KEY,{}),tok='e2e'+Math.random().toString(16).slice(2).padEnd(44,'0').slice(0,44),expires=new Date(Date.now()+30*864e5).toISOString();shares[tok]={kind:b.p_kind||'view',entity_id:b.p_entity_id||'',permission:'viewer',payload:b.p_payload||{},expires_at:expires,created_at:new Date().toISOString()};write(SHARE_KEY,shares);return [{share_token:tok,expires_at:expires}]}
    if(name==='smartlink_share_get'){const x=read(SHARE_KEY,{})[b.p_share_token];return x?[x]:[]}
    if(name==='smartlink_share_revoke'){const shares=read(SHARE_KEY,{}),had=Boolean(shares[b.p_share_token]);delete shares[b.p_share_token];write(SHARE_KEY,shares);return had}
    return [];
  }

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||String(input);
    if(url.includes('gfqkexnqbjtuwsyqacsw.supabase.co/rest/v1/rpc/')){try{return response(await handleRpc(rpcName(url),body(init)))}catch(e){return response({message:e.message},500)}}
    if(url.includes('/e2e-worker/')){
      const path=new URL(url,location.href).pathname.replace('/e2e-worker',''),b=body(init);
      if(path==='/api/status')return response({ok:true,version:'7.0.0-e2e',capabilities:{ai:true,semantic:true,rerank:true,browser:false},models:{embedding:'@cf/baai/bge-m3'}});
      if(path==='/api/embed'){const texts=Array.isArray(b.texts)?b.texts:[b.text||''];return response({model:'@cf/baai/bge-m3',dimensions:1024,data:texts.map(pseudoVector)})}
      if(path==='/api/rerank')return response({response:(b.contexts||[]).map((_,i)=>({index:i,score:1-i*.02}))});
      if(path==='/api/ai-batch')return response({items:(b.items||[]).map(x=>({id:x.id,category:/github|code|api/i.test(`${x.url} ${x.title}`)?'Development':'General',tags:['E2E'],summary:`Summary for ${x.title||x.url}`}))});
      if(path==='/api/ask')return response({answer:'E2E grounded answer [1]',linkIds:(b.links||[]).map(x=>x.id)});
      if(path==='/api/metadata'){const u=new URL(new URL(url,location.href).searchParams.get('url'));return response({title:`Saved ${u.hostname}`,description:'E2E metadata',imageUrl:'',favicon:'',domain:u.hostname.replace(/^www\./,''),status:200,finalUrl:u.href,canonicalUrl:u.href,contentType:'Web Page',author:'',publishedAt:'',siteName:u.hostname,language:'en',wordCount:120,readingMinutes:1})}
      if(path==='/api/health')return response({status:200,ok:true,state:'ok',finalUrl:new URL(url,location.href).searchParams.get('url'),checkedAt:Date.now(),latencyMs:20});
      if(path==='/api/archive')return response({type:'full-text-archive',title:'E2E Archive',url:new URL(url,location.href).searchParams.get('url'),finalUrl:new URL(url,location.href).searchParams.get('url'),canonicalUrl:new URL(url,location.href).searchParams.get('url'),description:'E2E archived page',content:'This is deterministic archived content for semantic search and E2E tests.',markdown:'E2E archived content',screenshot:'',author:'Test',publishedAt:'2026-09-09',siteName:'E2E',language:'en',contentType:'Article',wordCount:100,readingMinutes:1,browserCaptured:false,capturedAt:Date.now(),status:200});
    }
    return realFetch(input,init);
  };

  window.__SLH_E2E__={enabled:true,reset(){localStorage.removeItem(CLOUD_KEY);localStorage.removeItem(DOC_KEY);localStorage.removeItem(EMBED_KEY);localStorage.removeItem(SHARE_KEY)}};
})();