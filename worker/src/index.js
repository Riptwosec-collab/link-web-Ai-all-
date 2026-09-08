const CORS={
  'content-type':'application/json;charset=UTF-8',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:CORS});
const MAX_HTML=900000;
const MAX_BODY=500000;
const AI_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const EMBED_MODEL='@cf/baai/bge-m3';
const RERANK_MODEL='@cf/baai/bge-reranker-base';
const API_VERSION='7.0.0';

function privateIPv4(host){
  const m=String(host).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);if(!m)return false;
  const [a,b,c,d]=m.slice(1).map(Number);if([a,b,c,d].some(n=>n<0||n>255))return true;
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19))||(a>=224);
}
function unsafeHostname(host){
  const h=String(host||'').toLowerCase().replace(/\.$/,'');
  return !h||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='metadata.google.internal'||h==='169.254.169.254'||privateIPv4(h)||h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:');
}
function validUrl(s){try{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||unsafeHostname(u.hostname)||u.username||u.password)return null;return u}catch{return null}}
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const escRe=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const meta=(html,name)=>{const safe=escRe(name);const re=new RegExp(`<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${safe}["']`,'i');return clean((html.match(re)||[]).slice(1).find(Boolean)||'')};
const titleOf=html=>meta(html,'og:title')||meta(html,'twitter:title')||clean(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||''));
const descOf=html=>meta(html,'og:description')||meta(html,'twitter:description')||meta(html,'description');
const imageOf=html=>meta(html,'og:image')||meta(html,'twitter:image');
const siteOf=html=>meta(html,'og:site_name')||meta(html,'application-name');
const authorMeta=html=>meta(html,'author')||meta(html,'article:author')||meta(html,'twitter:creator');
const publishedMeta=html=>meta(html,'article:published_time')||meta(html,'date')||meta(html,'datePublished');
const languageOf=html=>clean(((html.match(/<html[^>]+lang=["']([^"']+)["']/i)||[])[1]||'')).slice(0,24);
const canonicalOf=(html,base)=>{const v=clean(((html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)||[]).slice(1).find(Boolean)||''));return abs(v,base)};
const abs=(v,b)=>{try{return v?new URL(v,b).href:''}catch{return ''}};

function jsonLdInfo(html){
  const info={author:'',publishedAt:'',type:'',headline:''};
  const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;let m,count=0;
  while((m=re.exec(html))&&count++<8){try{const root=JSON.parse(m[1]),nodes=Array.isArray(root)?root:Array.isArray(root?.['@graph'])?root['@graph']:[root];for(const x of nodes){if(!x||typeof x!=='object')continue;const type=Array.isArray(x['@type'])?x['@type'][0]:x['@type'];if(!info.type&&type)info.type=clean(type).slice(0,50);if(!info.headline)info.headline=clean(x.headline||x.name).slice(0,240);if(!info.publishedAt)info.publishedAt=clean(x.datePublished||x.dateCreated).slice(0,80);const a=x.author;if(!info.author&&a){if(typeof a==='string')info.author=clean(a);else if(Array.isArray(a))info.author=clean(a.map(v=>typeof v==='string'?v:v?.name).filter(Boolean).join(', '));else info.author=clean(a.name)}}}catch{}}
  return info;
}
function plainText(html){return clean(String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<svg[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>'))}
function contentTypeOf(url,html,ldType=''){
  const u=String(url).toLowerCase(),t=String(ldType).toLowerCase();
  if(/github\.com\/.+\/.+/.test(u))return 'GitHub Repo';
  if(/youtube\.com|youtu\.be|vimeo\.com/.test(u)||t.includes('video'))return 'Video';
  if(/\.pdf(?:$|\?)/.test(u))return 'PDF';
  if(t.includes('article')||/<article\b/i.test(html))return 'Article';
  if(t.includes('product'))return 'Product';
  if(/docs?\.|\/docs?\//.test(u))return 'Documentation';
  if(/twitter\.com|x\.com|facebook\.com|instagram\.com|threads\.net/.test(u))return 'Social Post';
  return 'Web Page';
}
function analyzeHtml(html,url){
  const ld=jsonLdInfo(html),text=plainText(html),words=text?text.split(/\s+/).length:0;
  return {
    title:titleOf(html)||ld.headline||new URL(url).hostname,
    description:clean(descOf(html)).slice(0,420),
    imageUrl:abs(imageOf(html),url),
    canonicalUrl:canonicalOf(html,url)||url,
    author:clean(authorMeta(html)||ld.author).slice(0,160),
    publishedAt:clean(publishedMeta(html)||ld.publishedAt).slice(0,80),
    siteName:clean(siteOf(html)).slice(0,120),
    language:languageOf(html),
    contentType:contentTypeOf(url,html,ld.type),
    wordCount:words,
    readingMinutes:words?Math.max(1,Math.round(words/220)):0,
    text
  };
}
function heuristic(url,title,description){
  const text=`${url} ${title} ${description}`.toLowerCase();
  const rules={AI:['openai','chatgpt','claude','gemini','llm','machine learning','artificial intelligence','midjourney','stable diffusion','flux'],Development:['github','gitlab','developer','api','programming','javascript','typescript','python','react','next.js','vercel','cloudflare'],Security:['security','cyber','cve','vulnerability','malware','pentest','hacking','defender','zero trust'],Design:['figma','canva','design','ui','ux','typography','dribbble','behance'],Media:['youtube','video','music','spotify','stream','movie','series'],Travel:['travel','hotel','flight','booking','trip','maps','restaurant','cafe'],Finance:['stock','finance','invest','trading','market','option','earnings','crypto'],Learning:['learn','course','education','tutorial','docs','documentation','academy','school'],Shopping:['shop','store','product','amazon','shopee','lazada','price','deal'],Productivity:['notion','task','calendar','productivity','workflow','automation','workspace']};
  let category='General',score=0;for(const [cat,terms] of Object.entries(rules)){const n=terms.reduce((v,k)=>v+(text.includes(k)?1:0),0);if(n>score){score=n;category=cat}}
  const tags=[category];try{const domain=new URL(url).hostname.replace(/^www\./,'').split('.')[0];if(domain&&domain.length<24)tags.push(domain)}catch{}
  return {category,tags:[...new Set(tags)].slice(0,5),summary:clean(description||`${category} website or online service.`).slice(0,170)};
}
async function readLimited(response,max=MAX_HTML){const reader=response.body?.getReader();if(!reader)return (await response.text()).slice(0,max);const decoder=new TextDecoder(),parts=[];let size=0;try{while(size<max){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;parts.push(decoder.decode(value,{stream:true}));if(size>=max)break}}finally{reader.cancel().catch(()=>{})}return parts.join('').slice(0,max)}
async function fetchPage(input,method='GET'){
  let current=validUrl(input);if(!current)throw new Error('blocked_url');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);let hops=0;
  try{
    while(hops++<6){
      const r=await fetch(current.href,{method,redirect:'manual',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 SmartLinkHub/7.0','accept':'text/html,application/xhtml+xml,application/json;q=.8,*/*;q=.5'}});
      if(r.status>=300&&r.status<400){const loc=r.headers.get('location');if(!loc)return r;const next=validUrl(abs(loc,current));if(!next)throw new Error('blocked_redirect');current=next;method='GET';continue}
      Object.defineProperty(r,'smartlinkFinalUrl',{value:current.href,enumerable:false});return r;
    }
    throw new Error('too_many_redirects');
  }finally{clearTimeout(timer)}
}
async function parseBody(req){const len=Number(req.headers.get('content-length')||0);if(len>MAX_BODY)throw new Error('payload_too_large');const text=(await req.text()).slice(0,MAX_BODY);return text?JSON.parse(text):{}}
async function classify(env,item){
  const fallback=heuristic(item.url||'',item.title||'',item.description||'');if(!env.AI)return fallback;
  try{const prompt=`Classify one saved web link. Return strict JSON only with keys category, tags, summary. Category should be one concise useful folder name. tags must be 2-5 short strings. summary must be one factual sentence <=150 characters.\nURL: ${clean(item.url).slice(0,500)}\nTitle: ${clean(item.title).slice(0,300)}\nDescription: ${clean(item.description).slice(0,700)}`;const out=await env.AI.run(AI_MODEL,{prompt,max_tokens:180,temperature:.1});const text=out?.response||'';const match=text.match(/\{[\s\S]*\}/);if(!match)return fallback;const parsed=JSON.parse(match[0]);return {category:clean(parsed.category||fallback.category).slice(0,40)||fallback.category,tags:(Array.isArray(parsed.tags)?parsed.tags:fallback.tags).map(x=>clean(x).slice(0,30)).filter(Boolean).slice(0,5),summary:clean(parsed.summary||fallback.summary).slice(0,170)}}catch{return fallback}
}
function localRank(question,links){const terms=clean(question).toLowerCase().split(/\s+/).filter(Boolean);return links.map(l=>{const hay=[l.title,l.url,l.domain,l.summary,l.description,l.category,l.content,...(Array.isArray(l.tags)?l.tags:[])].join(' ').toLowerCase();let score=0;for(const t of terms){if(String(l.title||'').toLowerCase().includes(t))score+=7;if(String(l.domain||'').toLowerCase().includes(t))score+=5;if(String(l.category||'').toLowerCase().includes(t))score+=4;if(hay.includes(t))score+=1}return {...l,__score:score}}).filter(l=>l.__score>0).sort((a,b)=>b.__score-a.__score)}
async function ask(env,question,links){
  const ranked=(links.some(x=>Number.isFinite(x.semanticScore))?links.slice().sort((a,b)=>(b.semanticScore||0)-(a.semanticScore||0)):localRank(question,links)).slice(0,20);
  if(!env.AI)return {answer:ranked.length?`Found ${ranked.length} relevant saved links. Review the cited results below.`:'No relevant saved links were found.',linkIds:ranked.map(x=>x.id)};
  if(!ranked.length)return {answer:'I could not find a saved link that is relevant enough to answer from your library.',linkIds:[]};
  const context=ranked.map((l,i)=>`[${i+1}] id=${clean(l.id)} | ${clean(l.title).slice(0,180)} | ${clean(l.url).slice(0,300)} | category=${clean(l.category)} | tags=${(l.tags||[]).map(clean).join(', ')} | ${clean(l.summary||l.description).slice(0,500)} | archived=${clean(l.content).slice(0,1200)}`).join('\n');
  const prompt=`You are Smart Link Hub AI. Answer ONLY from the saved-link context below. Do not invent facts about pages that are not in the context. If context is insufficient, say so. Answer in the same language as the user's question. Mention source numbers like [1], [2] when relevant.\n\nQuestion: ${clean(question).slice(0,1200)}\n\nSaved links:\n${context}`;
  try{const out=await env.AI.run(AI_MODEL,{prompt,max_tokens:650,temperature:.12});return {answer:clean(out?.response||'').slice(0,5000)||'No grounded answer was generated.',linkIds:ranked.map(x=>x.id)}}catch{return {answer:`Found ${ranked.length} relevant saved links. AI generation is temporarily unavailable.`,linkIds:ranked.map(x=>x.id)}}
}
async function embed(env,texts){if(!env.AI)throw new Error('ai_binding_unavailable');const input=(Array.isArray(texts)?texts:[texts]).slice(0,64).map(x=>clean(x).slice(0,12000));if(!input.length)throw new Error('text_required');const out=await env.AI.run(EMBED_MODEL,{text:input});const data=Array.isArray(out?.data)?out.data:Array.isArray(out)?out:[];if(!data.length)throw new Error('embedding_failed');return {model:EMBED_MODEL,dimensions:data[0]?.length||1024,data}}
async function rerank(env,query,contexts){if(!env.AI)return null;const list=(Array.isArray(contexts)?contexts:[]).slice(0,30).map(x=>({text:clean(x?.text||x).slice(0,3000)}));if(!list.length)return {response:[]};return env.AI.run(RERANK_MODEL,{query:clean(query).slice(0,1200),contexts:list})}
async function browserSnapshot(env,url){
  if(!env.BROWSER?.quickAction)return null;
  try{const raw=await env.BROWSER.quickAction('snapshot',{url});const v=raw?.result||raw||{};let screenshot=v.screenshot||'';if(typeof screenshot==='string'&&screenshot&&screenshot.length<=430000&&!screenshot.startsWith('data:'))screenshot=`data:image/png;base64,${screenshot}`;if(typeof screenshot!=='string'||screenshot.length>450000)screenshot='';return {markdown:String(v.markdown||'').slice(0,60000),content:String(v.content||'').slice(0,60000),screenshot}}catch(e){return {error:clean(e?.message||e).slice(0,160)}}
}

export default {async fetch(req,env){
  if(req.method==='OPTIONS')return json({ok:true});
  const u=new URL(req.url),target=validUrl(u.searchParams.get('url'));
  try{
    if(u.pathname==='/api/status')return json({ok:true,name:'Smart Link Hub API',version:API_VERSION,capabilities:{ai:Boolean(env.AI),semantic:Boolean(env.AI),rerank:Boolean(env.AI),browser:Boolean(env.BROWSER?.quickAction)},models:{chat:AI_MODEL,embedding:EMBED_MODEL,rerank:RERANK_MODEL},now:new Date().toISOString()});
    if(u.pathname==='/api/metadata'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);const started=Date.now(),r=await fetchPage(target);const finalUrl=r.smartlinkFinalUrl||target.href,type=r.headers.get('content-type')||'',domain=new URL(finalUrl).hostname.replace(/^www\./,'');
      if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))return json({title:domain,description:'',imageUrl:'',favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain,status:r.status,finalUrl,canonicalUrl:finalUrl,contentType:type.includes('pdf')?'PDF':'Web File',author:'',publishedAt:'',siteName:domain,language:'',wordCount:0,readingMinutes:0,latencyMs:Date.now()-started});
      const html=await readLimited(r),a=analyzeHtml(html,finalUrl);return json({...a,text:undefined,title:a.title||domain,description:a.description.slice(0,260),favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain,status:r.status,finalUrl,latencyMs:Date.now()-started});
    }
    if(u.pathname==='/api/health'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);const started=Date.now();let r;try{r=await fetchPage(target,'HEAD');if(r.status===405||r.status===403)r=await fetchPage(target,'GET')}catch(e){return json({status:null,ok:false,state:'broken',error:clean(e.message),latencyMs:Date.now()-started,checkedAt:Date.now()})}const finalUrl=r.smartlinkFinalUrl||target.href,redirect=finalUrl!==target.href;return json({status:r.status,ok:r.ok,state:redirect?'redirect':r.ok?'ok':'broken',finalUrl,redirect,contentType:r.headers.get('content-type')||'',latencyMs:Date.now()-started,checkedAt:Date.now()});
    }
    if(u.pathname==='/api/snapshot'||u.pathname==='/api/archive'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);const browser=u.pathname==='/api/archive'?await browserSnapshot(env,target.href):null;const r=await fetchPage(target),finalUrl=r.smartlinkFinalUrl||target.href,html=await readLimited(r,500000),a=analyzeHtml(html,finalUrl);const markdown=clean(browser?.markdown||'').slice(0,60000),content=plainText(browser?.content||'').slice(0,60000)||a.text.slice(0,60000);return json({type:'full-text-archive',title:a.title,url:target.href,finalUrl,canonicalUrl:a.canonicalUrl,description:a.description.slice(0,300),imageUrl:a.imageUrl,author:a.author,publishedAt:a.publishedAt,siteName:a.siteName,language:a.language,contentType:a.contentType,wordCount:a.wordCount,readingMinutes:a.readingMinutes,content,markdown,screenshot:browser?.screenshot||'',browserCaptured:Boolean(browser&&!browser.error),browserError:browser?.error||'',capturedAt:Date.now(),status:r.status});
    }
    if(u.pathname==='/api/ai'&&req.method==='POST'){const b=await parseBody(req);return json(await classify(env,b))}
    if(u.pathname==='/api/ai-batch'&&req.method==='POST'){const b=await parseBody(req),items=Array.isArray(b.items)?b.items.slice(0,80):[];const out=[];for(let i=0;i<items.length;i+=4){const batch=items.slice(i,i+4);const classified=await Promise.all(batch.map(async item=>({id:item.id,...await classify(env,item)})));out.push(...classified)}return json({items:out,count:out.length})}
    if(u.pathname==='/api/embed'&&req.method==='POST'){const b=await parseBody(req);return json(await embed(env,b.texts??b.text??[]))}
    if(u.pathname==='/api/rerank'&&req.method==='POST'){const b=await parseBody(req);if(!clean(b.query))return json({error:'query_required'},400);return json(await rerank(env,b.query,b.contexts))}
    if(u.pathname==='/api/ask'&&req.method==='POST'){const b=await parseBody(req),question=clean(b.question),links=(Array.isArray(b.links)?b.links:[]).slice(0,30);if(!question)return json({error:'question_required'},400);return json(await ask(env,question,links))}
    return json({name:'Smart Link Hub API',version:API_VERSION,endpoints:['/api/status','/api/metadata','/api/health','/api/snapshot','/api/archive','/api/ai','/api/ai-batch','/api/embed','/api/rerank','/api/ask'],security:['private-network URL blocking','manual redirect validation','request size limits','timeouts']});
  }catch(e){const msg=String(e?.message||e);if(msg==='payload_too_large')return json({error:msg},413);if(['blocked_url','blocked_redirect','too_many_redirects'].includes(msg))return json({error:msg},400);return json({error:msg.slice(0,250)},500)}
}};