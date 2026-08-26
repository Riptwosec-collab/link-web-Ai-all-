const clean=(s='',n=190)=>{s=String(s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n).replace(/\s+\S*$/,'')+'…':s};
const abs=(v,base)=>{try{return new URL(v,base).href}catch{return ''}};
const meta=(doc,arr)=>{for(const q of arr){const e=doc.querySelector(q),v=e?.content||e?.href||e?.textContent;if(v?.trim())return v.trim()}return ''};
function parseHTML(text,url){const doc=new DOMParser().parseFromString(text,'text/html'),domain=new URL(url).hostname.replace(/^www\./,'');return {title:meta(doc,['meta[property="og:title"]','meta[name="twitter:title"]','title','h1']),description:clean(meta(doc,['meta[property="og:description"]','meta[name="twitter:description"]','meta[name="description"]'])),imageUrl:abs(meta(doc,['meta[property="og:image:secure_url"]','meta[property="og:image"]','meta[name="twitter:image"]','meta[itemprop="image"]','link[rel="image_src"]']),url),favicon:abs(meta(doc,['link[rel="apple-touch-icon"]','link[rel="icon"]','link[rel="shortcut icon"]']),url)||`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain}}
async function timeoutFetch(url,opts={},ms=10000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}}
export function heuristicAI(url,title='',description=''){
 const text=`${url} ${title} ${description}`.toLowerCase(); const rules=[['AI',['ai','openai','chatgpt','claude','gemini','llm','machine learning']],['Development',['github','gitlab','code','developer','api','programming','vercel','cloudflare']],['Design',['figma','canva','design','ui','ux','photo','image']],['Media',['youtube','netflix','video','music','spotify','stream']],['Travel',['travel','hotel','flight','booking','trip','map']],['Finance',['stock','finance','invest','trading','crypto','bank']],['Learning',['learn','course','education','tutorial','docs']],['Shopping',['shop','store','product','amazon','shopee','lazada']]];
 let category='General',best=0;for(const [c,ks] of rules){const s=ks.reduce((n,k)=>n+(text.includes(k)?1:0),0);if(s>best){best=s;category=c}}
 const tags=[category];const words=(title+' '+description).toLowerCase().match(/[a-z0-9]{4,}/g)||[];for(const w of words){if(!tags.includes(w)&&!['this','that','with','from','your','have','more','website','online'].includes(w))tags.push(w);if(tags.length>=4)break}
 const summary=clean(description,150)||`${category} website or online service from ${new URL(url).hostname.replace(/^www\./,'')}.`;
 return {category,tags,summary};
}
export async function getMetadata(url,settings={}){const domain=new URL(url).hostname.replace(/^www\./,'');let data=null;const worker=(settings.workerUrl||'').replace(/\/$/,'');
 if(worker){try{const r=await timeoutFetch(`${worker}/api/metadata?url=${encodeURIComponent(url)}`,{},11000);if(r.ok)data=await r.json()}catch{}}
 if(!data){try{const r=await timeoutFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,{},9000);if(r.ok)data=parseHTML(await r.text(),url)}catch{}}
 if(!data||!data.title||!data.imageUrl){try{const r=await timeoutFetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`,{},11000);if(r.ok){const j=await r.json(),d=j.data||{};data={...(data||{}),title:data?.title||d.title||d.publisher||domain,description:data?.description||clean(d.description||''),imageUrl:data?.imageUrl||d.image?.url||'',favicon:data?.favicon||d.logo?.url||`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain}}}catch{}}
 data=data||{title:domain,description:'',imageUrl:'',favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain};
 let ai=heuristicAI(url,data.title,data.description);
 if(worker&&settings.aiEnabled!==false){try{const r=await timeoutFetch(`${worker}/api/ai`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,title:data.title,description:data.description})},15000);if(r.ok){const j=await r.json();ai={...ai,...j}}}catch{}}
 return {...data,description:clean(data.description||ai.summary),summary:clean(ai.summary||data.description),category:ai.category||'General',tags:Array.from(new Set(ai.tags||[ai.category||'General'])).slice(0,6)};
}
export async function checkHealth(url,settings={}){const worker=(settings.workerUrl||'').replace(/\/$/,'');if(worker){try{const r=await timeoutFetch(`${worker}/api/health?url=${encodeURIComponent(url)}`,{},12000);if(r.ok)return await r.json()}catch{}}
 try{const r=await timeoutFetch(url,{method:'HEAD',mode:'cors',redirect:'follow'},7000);return {status:r.status,ok:r.ok,state:r.redirected?'redirect':r.ok?'ok':'broken',finalUrl:r.url||url,checkedAt:Date.now()}}catch{return {status:null,ok:null,state:'unknown',finalUrl:url,checkedAt:Date.now()}}
}
export async function makeSnapshot(link,settings={}){const worker=(settings.workerUrl||'').replace(/\/$/,'');if(worker){try{const r=await timeoutFetch(`${worker}/api/snapshot?url=${encodeURIComponent(link.url)}`,{},15000);if(r.ok)return await r.json()}catch{}}
 return {type:'metadata',title:link.title,url:link.url,description:link.description,imageUrl:link.imageUrl||'',capturedAt:Date.now(),excerpt:link.summary||link.description||''};
}
