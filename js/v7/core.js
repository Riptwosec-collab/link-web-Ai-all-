import {getAll,getOne,putOne,bulkPut,uid,logEvent,getSetting,setSetting,putDiagnostic,getSyncQueueCount,openDB} from '../db.js';

export const BUILD=Object.freeze({version:'7.0.0',buildId:'slh-v7-20260909',schema:7,channel:'main'});
export const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
export const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
export const TOKEN_KEY='smartlink_session_token';
export const PROFILE_KEY='smartlink_session_profile';
export const EMBED_MODEL='@cf/baai/bge-m3';
export const $=(q,r=document)=>r.querySelector(q);
export const $$=(q,r=document)=>[...r.querySelectorAll(q)];
export const now=()=>Date.now();
export const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const token=()=>localStorage.getItem(TOKEN_KEY)||'';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export const fmt=t=>t?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t)):'—';

window.__SLH_BUILD__=BUILD;
document.documentElement.dataset.slhVersion='7';

export async function rpc(name,body={}){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store'});
  if(!res.ok){const text=await res.text().catch(()=>String(res.status));const err=new Error(`${name} ${res.status}: ${text.slice(0,300)}`);err.status=res.status;throw err}
  return res.json();
}
export async function workerBase(){return String(await getSetting('workerUrl','')).trim().replace(/\/$/,'')}
export async function workerFetch(path,options={}){const base=await workerBase();if(!base)throw new Error('Worker URL is not configured');const res=await fetch(`${base}${path}`,{cache:'no-store',...options});if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`Worker ${res.status}: ${text.slice(0,260)}`)}return res}

export function toast(text,{kind='info',ms=3200,action=null}={}){
  const el=document.createElement('div');el.className=`v7-toast ${kind}`;el.innerHTML=`<span>${esc(text)}</span>${action?`<button type="button">${esc(action.label)}</button>`:''}`;document.body.appendChild(el);
  if(action)el.querySelector('button').onclick=()=>{try{action.run?.()}finally{el.remove()}};
  setTimeout(()=>el.remove(),ms);return el;
}

const TRACKING=new Set(['fbclid','gclid','dclid','msclkid','mc_cid','mc_eid','igshid','yclid','vero_conv','vero_id','_hsenc','_hsmi','mkt_tok','ref_src','ref_url']);
function cleanHost(host){let h=String(host||'').toLowerCase().replace(/\.$/,'').replace(/^www\./,'');if(h==='m.youtube.com')h='youtube.com';if(h==='mobile.twitter.com'||h==='twitter.com')h='x.com';if(h==='m.facebook.com')h='facebook.com';return h}
export function normalizeUrl(raw,{keepHash=false}={}){
  try{
    let value=String(raw||'').trim();if(!/^https?:\/\//i.test(value))value='https://'+value;const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return '';
    u.hostname=cleanHost(u.hostname);u.username='';u.password='';if((u.protocol==='https:'&&u.port==='443')||(u.protocol==='http:'&&u.port==='80'))u.port='';
    if(u.hostname==='youtu.be'){const id=u.pathname.split('/').filter(Boolean)[0];if(id){u.hostname='youtube.com';u.pathname='/watch';u.search='';u.searchParams.set('v',id)}}
    [...u.searchParams.keys()].forEach(k=>{const low=k.toLowerCase();if(low.startsWith('utm_')||TRACKING.has(low))u.searchParams.delete(k)});
    if(u.hostname==='youtube.com'){for(const k of ['t','start','si','feature','pp'])u.searchParams.delete(k)}
    const sorted=[...u.searchParams.entries()].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));u.search='';for(const [k,v] of sorted)u.searchParams.append(k,v);
    if(!keepHash)u.hash='';if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/+$/,'');return u.href.replace(/\/$/,'');
  }catch{return ''}
}
export const dedupeKey=raw=>normalizeUrl(raw).toLowerCase();
export function titleKey(title){return String(title||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(x=>x.length>1).sort().join(' ')}
function jaccard(a,b){const A=new Set(String(a).split(' ').filter(Boolean)),B=new Set(String(b).split(' ').filter(Boolean));if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}
export function duplicateGroups(links=[]){
  const exact=new Map(),fuzzy=[];for(const l of links){const key=dedupeKey(l.canonicalUrl||l.normalizedUrl||l.url);if(!key)continue;if(!exact.has(key))exact.set(key,[]);exact.get(key).push(l)}
  const groups=[...exact.entries()].filter(([,rows])=>rows.length>1).map(([key,rows])=>({type:'exact',key,rows}));
  const candidates=links.filter(l=>l.title&&l.domain).slice(0,5000),byDomain=new Map();for(const l of candidates){const d=cleanHost(l.domain);if(!byDomain.has(d))byDomain.set(d,[]);byDomain.get(d).push(l)}
  for(const [domain,rows] of byDomain){if(rows.length>80)continue;for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];if(dedupeKey(a.url)===dedupeKey(b.url))continue;const score=jaccard(titleKey(a.title),titleKey(b.title));if(score>=.86)fuzzy.push({type:'likely',key:`${domain}:${a.id}:${b.id}`,score,rows:[a,b]})}}
  return [...groups,...fuzzy].sort((a,b)=>(b.rows.length-a.rows.length)||((b.score||1)-(a.score||1)));
}

export function parseQuery(raw=''){
  const src=String(raw||'').trim(),parts=src.match(/(?:[^\s"]+|"[^"]*")+/g)||[],filters={},terms=[];
  for(const part0 of parts){const part=part0.replace(/^"|"$/g,''),m=part.match(/^([a-z-]+):(.*)$/i);if(!m){terms.push(part);continue}const k=m[1].toLowerCase(),v=m[2].replace(/^"|"$/g,'');if(['domain','tag','category','is','before','after','status','type','collection'].includes(k)){(filters[k]??=[]).push(v.toLowerCase())}else terms.push(part)}
  return {raw:src,terms,filters};
}
function dateValue(s,end=false){const d=new Date(s);if(Number.isNaN(d.getTime()))return null;if(end)d.setHours(23,59,59,999);return d.getTime()}
export function matchesQuery(link,query,collections=[]){
  const q=typeof query==='string'?parseQuery(query):query,hay=[link.title,link.url,link.domain,link.description,link.summary,link.category,link.contentType,...(link.tags||[])].filter(Boolean).join(' ').toLowerCase();
  if(q.terms.some(t=>!hay.includes(t.toLowerCase())))return false;const f=q.filters;
  if(f.domain&&!f.domain.some(v=>String(link.domain||'').toLowerCase().includes(v)))return false;
  if(f.tag&&!f.tag.some(v=>(link.tags||[]).some(t=>String(t).toLowerCase().includes(v))))return false;
  if(f.category&&!f.category.some(v=>String(link.category||'').toLowerCase().includes(v)))return false;
  if(f.status&&!f.status.some(v=>String(link.health?.state||'unknown').toLowerCase()===v))return false;
  if(f.type&&!f.type.some(v=>String(link.contentType||'').toLowerCase().includes(v)))return false;
  if(f.collection){const c=collections.find(x=>x.id===link.collectionId);if(!f.collection.some(v=>String(c?.name||link.collectionId||'').toLowerCase().includes(v)))return false}
  if(f.is){for(const v of f.is){if(v==='favorite'&&!link.favorite)return false;if(v==='unread'&&link.readingState!=='unread')return false;if(v==='reading'&&link.readingState!=='reading')return false;if(v==='completed'&&link.readingState!=='completed')return false;if(v==='broken'&&link.health?.state!=='broken')return false;if(v==='archived'&&!link.archivedAt&&!link.archiveId)return false;if(v==='uncategorized'&&link.category&&!['general','other','uncategorized'].includes(String(link.category).toLowerCase()))return false}}
  const when=Number(link.updatedAt||link.createdAt||0);if(f.before){const max=Math.min(...f.before.map(v=>dateValue(v,true)).filter(Boolean));if(max&&when>=max)return false}if(f.after){const min=Math.max(...f.after.map(v=>dateValue(v)).filter(Boolean));if(min&&when<=min)return false}
  return true;
}
export function lexicalScore(link,query){const q=typeof query==='string'?parseQuery(query):query,terms=q.terms.map(x=>x.toLowerCase());if(!terms.length)return 1;let score=0;for(const t of terms){if(String(link.title||'').toLowerCase().includes(t))score+=8;if(String(link.domain||'').toLowerCase().includes(t))score+=5;if(String(link.category||'').toLowerCase().includes(t))score+=4;if((link.tags||[]).some(x=>String(x).toLowerCase().includes(t)))score+=4;if(String(link.summary||link.description||'').toLowerCase().includes(t))score+=2}return score}
export function localSearch(links,q,collections=[]){const query=parseQuery(q);return links.filter(l=>matchesQuery(l,query,collections)).map(link=>({link,score:lexicalScore(link,query)})).sort((a,b)=>b.score-a.score||Number(b.link.updatedAt||0)-Number(a.link.updatedAt||0)).map(x=>x.link)}

let searchWorker=null,searchSeq=0,pendingSearch=new Map();
function ensureSearchWorker(){if(searchWorker||!('Worker'in window))return searchWorker;try{searchWorker=new Worker(new URL('./search-worker.js',import.meta.url),{type:'module'});searchWorker.onmessage=e=>{const p=pendingSearch.get(e.data?.id);if(p){pendingSearch.delete(e.data.id);p.resolve(e.data.rows||[])}};searchWorker.onerror=()=>{searchWorker?.terminate();searchWorker=null};return searchWorker}catch{return null}}
export async function fastSearch(links,q,collections=[]){if(links.length<600)return localSearch(links,q,collections);const w=ensureSearchWorker();if(!w)return localSearch(links,q,collections);const id=++searchSeq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pendingSearch.delete(id);resolve(localSearch(links,q,collections))},1400);pendingSearch.set(id,{resolve:rows=>{clearTimeout(timer);resolve(rows.map(i=>links.find(x=>x.id===i)).filter(Boolean))},reject});w.postMessage({id,q,links:links.map(l=>({id:l.id,title:l.title,url:l.url,domain:l.domain,description:l.description,summary:l.summary,category:l.category,tags:l.tags,contentType:l.contentType,collectionId:l.collectionId,favorite:l.favorite,readingState:l.readingState,health:l.health,updatedAt:l.updatedAt,createdAt:l.createdAt})),collections})})}

export async function contentHash(text){const value=String(text||'');if(crypto.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('')}let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
export function semanticText(link,doc=null){return [link.title,link.domain,link.url,link.summary,link.description,link.category,(link.tags||[]).join(', '),link.contentType,doc?.content?.slice(0,9000),doc?.markdown?.slice(0,5000)].filter(Boolean).join('\n').slice(0,14000)}

function linkFromUrl(url,{title='',collectionId='col_inbox',tags=[],favorite=false,readLater=false}={}){const normalized=normalizeUrl(url);if(!normalized)return null;const u=new URL(normalized),t=now();return {id:uid('lnk'),url:u.href,normalizedUrl:normalized,canonicalUrl:normalized,dedupeKey:dedupeKey(normalized),title:title||u.hostname,domain:cleanHost(u.hostname),description:'',summary:'',imageUrl:'',favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(u.hostname)}`,category:'General',tags:[...new Set((tags||[]).map(String).filter(Boolean))].slice(0,12),collectionId:collectionId||'col_inbox',favorite:Boolean(favorite),readingState:readLater?'unread':'',readingProgress:0,readingUpdatedAt:readLater?t:null,createdAt:t,updatedAt:t,health:{state:'unknown',status:null,checkedAt:null}}}
function extractUrls(text){const matches=String(text||'').match(/https?:\/\/[^\s<>"']+/gi)||[];return [...new Set(matches.map(x=>x.replace(/[),.;!?]+$/,'')))].slice(0,100)}
export async function enrichLink(link){
  try{const res=await workerFetch(`/api/metadata?url=${encodeURIComponent(link.url)}`),m=await res.json();const next={...link,title:m.title||link.title,description:m.description||link.description,imageUrl:m.imageUrl||link.imageUrl,favicon:m.favicon||link.favicon,domain:m.domain||link.domain,canonicalUrl:normalizeUrl(m.canonicalUrl||m.finalUrl||link.url)||link.canonicalUrl,contentType:m.contentType||link.contentType||'',author:m.author||link.author||'',publishedAt:m.publishedAt||link.publishedAt||'',siteName:m.siteName||link.siteName||'',language:m.language||link.language||'',wordCount:m.wordCount||link.wordCount||0,readingMinutes:m.readingMinutes||link.readingMinutes||0,updatedAt:now()};next.normalizedUrl=normalizeUrl(next.canonicalUrl||next.url);next.dedupeKey=dedupeKey(next.normalizedUrl);await putOne('links',next);return next}catch(e){putDiagnostic('metadata_error',{linkId:link.id,message:e.message},'warn').catch(()=>{});return link}
}
export async function captureText(text,options={}){
  const urls=extractUrls(text);if(!urls.length){const one=normalizeUrl(text);if(one)urls.push(one)}if(!urls.length)return {added:[],duplicates:[],invalid:[text]};
  const links=await getAll('links'),keys=new Map(links.map(l=>[dedupeKey(l.canonicalUrl||l.normalizedUrl||l.url),l])),added=[],duplicates=[],invalid=[];
  for(const raw of urls){const key=dedupeKey(raw);if(!key){invalid.push(raw);continue}const existing=keys.get(key);if(existing){duplicates.push(existing);if(options.readLater&&!existing.readingState){existing.readingState='unread';existing.readingUpdatedAt=existing.updatedAt=now();await putOne('links',existing)}continue}const link=linkFromUrl(raw,options);if(!link){invalid.push(raw);continue}await putOne('links',link);await logEvent('save',{id:link.id,via:options.via||'v7_capture'});added.push(link);keys.set(key,link)}
  toast(`${added.length} link${added.length===1?'':'s'} saved${duplicates.length?` · ${duplicates.length} duplicate${duplicates.length===1?'':'s'}`:''}`,{kind:added.length?'success':'info'});
  for(const link of added.slice(0,12))enrichLink(link).catch(()=>{});
  window.dispatchEvent(new CustomEvent('smartlink:v7-captured',{detail:{added,duplicates,invalid}}));return {added,duplicates,invalid};
}

export function goLegacy(page){history.replaceState(null,'',location.pathname);if(location.hash!==`#${page}`)location.hash=page;setTimeout(()=>{document.querySelector(`[data-page="${page}"]`)?.click()},0)}
export function openAdd(){const btn=$('#add-link-btn');if(btn)btn.click();else window.dispatchEvent(new Event('smartlink:v7-add'))}

let command=null,commandInput=null,commandList=null,cmdRows=[],cmdIndex=0,cmdTimer=null;
async function commandData(q=''){
  const [links,collections]=await Promise.all([getAll('links'),getAll('collections')]);const actions=[
    ['Home','house',()=>goLegacy('home'),'Navigation'],['Library','squares-four',()=>goLegacy('search'),'Navigation'],['Add link','plus',()=>openAdd(),'Capture'],['Paste & save','clipboard-text',()=>captureClipboard(),'Capture'],
    ['Semantic AI Search','brain',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'semantic'}})),'Knowledge'],['AI Librarian','sparkle',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'librarian'}})),'Knowledge'],['Smart Views','funnel',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'views'}})),'Library'],['Duplicate Center','copy',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'duplicates'}})),'Maintenance'],['Archive Lab','archive',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'archive'}})),'Knowledge'],['Import Wizard','upload-simple',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'import'}})),'Data'],['System Status','pulse',()=>window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page:'status'}})),'System'],
    ['Cloud & Backup','cloud-check',()=>window.dispatchEvent(new Event('smartlink:v6-cloud-center')),'System'],['Sync Cloud now','arrows-clockwise',()=>window.dispatchEvent(new Event('smartlink:cloud-force-sync')),'System'],['Read Later','book-open-text',()=>document.querySelector('[data-v6-page="read-later"]')?.click(),'Navigation'],['Trash','trash',()=>document.querySelector('[data-v6-page="trash"]')?.click(),'Safety'],['Settings','gear-six',()=>goLegacy('settings'),'System'],['Toggle theme','palette',()=>window.SmartLinkTheme?.toggle?.(),'Appearance']
  ];
  const query=q.trim(),aq=actions.filter(a=>!query||a[0].toLowerCase().includes(query.toLowerCase())).slice(0,12),lr=query?await fastSearch(links,query,collections):[];
  return [...aq.map(a=>({label:a[0],meta:a[3],icon:a[1],run:a[2]})),...lr.slice(0,12).map(l=>({label:l.title||l.domain,meta:l.domain||l.category||'Saved link',icon:'link',run:()=>window.open(l.url,'_blank','noopener,noreferrer')}))];
}
function ensureCommand(){if(command)return;command=document.createElement('div');command.id='v7-command';command.className='v7-command hidden';command.innerHTML=`<div class="v7-command-box"><div class="v7-command-head"><i class="ph ph-command"></i><input id="v7-command-input" autocomplete="off" spellcheck="false" placeholder="Search links or type a command…"><kbd>ESC</kbd></div><div id="v7-command-list" class="v7-command-list"></div><div class="v7-command-foot"><span>Advanced filters: domain:github.com tag:ai is:favorite status:broken after:2026-09-01</span><span>↑↓ Enter</span></div></div>`;document.body.appendChild(command);commandInput=$('#v7-command-input');commandList=$('#v7-command-list');command.addEventListener('pointerdown',e=>{if(e.target===command)closeCommand()});commandInput.addEventListener('input',()=>{clearTimeout(cmdTimer);cmdTimer=setTimeout(drawCommand,80)});commandInput.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();cmdIndex=Math.min(cmdRows.length-1,cmdIndex+1);paintCommand()}else if(e.key==='ArrowUp'){e.preventDefault();cmdIndex=Math.max(0,cmdIndex-1);paintCommand()}else if(e.key==='Enter'){e.preventDefault();cmdRows[cmdIndex]?.run?.();closeCommand()}else if(e.key==='Escape'){e.preventDefault();closeCommand()}})}
async function drawCommand(){cmdRows=await commandData(commandInput?.value||'');cmdIndex=Math.min(cmdIndex,Math.max(0,cmdRows.length-1));commandList.innerHTML=cmdRows.length?cmdRows.map((r,i)=>`<button class="v7-command-row ${i===cmdIndex?'active':''}" data-v7-cmd="${i}"><i class="ph ph-${r.icon}"></i><span>${esc(r.label)}</span><small>${esc(r.meta)}</small></button>`).join(''):'<div class="v7-command-empty">No result found</div>';$$('[data-v7-cmd]',commandList).forEach(b=>b.onclick=()=>{cmdRows[Number(b.dataset.v7Cmd)]?.run?.();closeCommand()})}
function paintCommand(){$$('[data-v7-cmd]',commandList).forEach((b,i)=>b.classList.toggle('active',i===cmdIndex));$(`[data-v7-cmd="${cmdIndex}"]`,commandList)?.scrollIntoView({block:'nearest'})}
export async function openCommand(){ensureCommand();command.classList.remove('hidden');cmdIndex=0;commandInput.value='';await drawCommand();setTimeout(()=>commandInput.focus(),20)}
export function closeCommand(){command?.classList.add('hidden')}
export async function captureClipboard(){try{const text=await navigator.clipboard.readText();if(!text.trim())throw new Error('Clipboard is empty');return captureText(text,{via:'clipboard'})}catch(e){toast(`Clipboard: ${e.message}`,{kind:'warn'});return null}}

const perf={lcp:0,cls:0,inp:0,nav:0};
function observePerformance(){try{new PerformanceObserver(list=>{for(const e of list.getEntries())perf.lcp=Math.max(perf.lcp,e.startTime)}).observe({type:'largest-contentful-paint',buffered:true})}catch{}try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)perf.cls+=e.value}).observe({type:'layout-shift',buffered:true})}catch{}try{new PerformanceObserver(list=>{for(const e of list.getEntries())perf.inp=Math.max(perf.inp,e.duration||0)}).observe({type:'event',buffered:true,durationThreshold:40})}catch{}window.addEventListener('load',()=>{const n=performance.getEntriesByType('navigation')[0];perf.nav=n?.duration||0;setTimeout(()=>putDiagnostic('web_vitals',{...perf},'info').catch(()=>{}),2500)},{once:true})}
export function performanceSnapshot(){return {...perf}}
function observeErrors(){window.addEventListener('error',e=>putDiagnostic('window_error',{message:e.message,source:e.filename,line:e.lineno,col:e.colno},'error').catch(()=>{}));window.addEventListener('unhandledrejection',e=>putDiagnostic('unhandled_rejection',{message:String(e.reason?.message||e.reason||'Promise rejected')},'error').catch(()=>{}))}
function lazyAssets(){const apply=root=>root.querySelectorAll?.('img:not([loading])').forEach(img=>{img.loading='lazy';img.decoding='async'});apply(document);new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.tagName==='IMG'){n.loading='lazy';n.decoding='async'}apply(n)}}))).observe(document.body,{childList:true,subtree:true})}

async function handleV7Capture(){const p=new URLSearchParams(location.search),encoded=p.get('v7capture');if(!encoded)return;try{const raw=decodeURIComponent(escape(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')))),data=JSON.parse(raw);await captureText(data.url||'',{title:data.title||'',collectionId:data.collectionId||'col_inbox',tags:Array.isArray(data.tags)?data.tags:[],favorite:Boolean(data.favorite),readLater:Boolean(data.readLater),via:'extension_v2'});history.replaceState(null,'',location.pathname+'#home');goLegacy('home')}catch(e){putDiagnostic('capture_decode_error',{message:e.message},'warn').catch(()=>{});toast('Could not read extension capture payload',{kind:'error'})}}

export async function systemBaseSnapshot(){const db=await openDB(),[links,collections,diagnostics,queue]=await Promise.all([getAll('links'),getAll('collections'),getAll('diagnostics'),getSyncQueueCount()]),storage=await navigator.storage?.estimate?.().catch(()=>null);return {build:BUILD,dbVersion:db.version,links:links.length,collections:collections.length,queue,diagnostics:diagnostics.length,online:navigator.onLine,serviceWorker:Boolean(navigator.serviceWorker?.controller),storage:{usage:storage?.usage||0,quota:storage?.quota||0},performance:performanceSnapshot()}}

export async function initCore(){
  observeErrors();observePerformance();lazyAssets();
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();openCommand()}else if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='v'){e.preventDefault();e.stopImmediatePropagation();captureClipboard()}},true);
  document.addEventListener('paste',e=>{const target=e.target;if(target?.matches?.('input,textarea,[contenteditable="true"]'))return;const text=e.clipboardData?.getData('text')||'';if(/https?:\/\//i.test(text)){e.preventDefault();captureText(text,{via:'global_paste'})}},true);
  window.addEventListener('smartlink:v7-command',openCommand);
  await handleV7Capture();
  window.SmartLinkV7={...(window.SmartLinkV7||{}),BUILD,normalizeUrl,dedupeKey,parseQuery,localSearch,fastSearch,captureText,captureClipboard,duplicateGroups,systemBaseSnapshot,openCommand};
}
