const CORS={
  'content-type':'application/json;charset=UTF-8',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'cache-control':'no-store'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:CORS});
const MAX_HTML=750000;
const MAX_BODY=400000;
const AI_MODEL='@cf/meta/llama-3.1-8b-instruct-fast';

function privateIPv4(host){
  const m=String(host).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);if(!m)return false;
  const [a,b,c,d]=m.slice(1).map(Number);if([a,b,c,d].some(n=>n<0||n>255))return true;
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19))||(a>=224);
}
function unsafeHostname(host){const h=String(host||'').toLowerCase().replace(/\.$/,'');return !h||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='metadata.google.internal'||h==='169.254.169.254'||privateIPv4(h)||h==='::1'||h.startsWith('fc')||h.startsWith('fd')||h.startsWith('fe80:')}
function validUrl(s){try{const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||unsafeHostname(u.hostname)||u.username||u.password)return null;return u}catch{return null}}
const meta=(html,name)=>{const safe=name.replace(':','\\:');const re=new RegExp(`<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${safe}["']`,'i');return (html.match(re)||[]).slice(1).find(Boolean)||''};
const titleOf=html=>meta(html,'og:title')||meta(html,'twitter:title')||((html.match(/<title[^>]*>([^<]*)<\/title>/i)||[])[1]||'').trim();
const descOf=html=>meta(html,'og:description')||meta(html,'twitter:description')||meta(html,'description');
const imageOf=html=>meta(html,'og:image')||meta(html,'twitter:image');
const abs=(v,b)=>{try{return new URL(v,b).href}catch{return ''}};
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();

function heuristic(url,title,description){
  const text=`${url} ${title} ${description}`.toLowerCase();
  const rules={
    AI:['openai','chatgpt','claude','gemini','llm','machine learning','artificial intelligence','midjourney','stable diffusion','flux'],
    Development:['github','gitlab','developer','api','programming','javascript','typescript','python','react','next.js','vercel','cloudflare'],
    Security:['security','cyber','cve','vulnerability','malware','pentest','hacking','defender','zero trust'],
    Design:['figma','canva','design','ui','ux','typography','dribbble','behance'],
    Media:['youtube','video','music','spotify','stream','movie','series'],
    Travel:['travel','hotel','flight','booking','trip','maps','restaurant','cafe'],
    Finance:['stock','finance','invest','trading','market','option','earnings','crypto'],
    Learning:['learn','course','education','tutorial','docs','documentation','academy','school'],
    Shopping:['shop','store','product','amazon','shopee','lazada','price','deal'],
    Productivity:['notion','task','calendar','productivity','workflow','automation','workspace']
  };
  let category='General',score=0;for(const [cat,terms] of Object.entries(rules)){const n=terms.reduce((v,k)=>v+(text.includes(k)?1:0),0);if(n>score){score=n;category=cat}}
  const tags=[category];try{const domain=new URL(url).hostname.replace(/^www\./,'').split('.')[0];if(domain&&domain.length<24)tags.push(domain)}catch{}
  return {category,tags:[...new Set(tags)].slice(0,5),summary:clean(description||`${category} website or online service.`).slice(0,170)};
}
async function readLimited(response,max=MAX_HTML){const reader=response.body?.getReader();if(!reader)return (await response.text()).slice(0,max);const decoder=new TextDecoder(),parts=[];let size=0;try{while(size<max){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;parts.push(decoder.decode(value,{stream:true}));if(size>=max)break}}finally{reader.cancel().catch(()=>{})}return parts.join('').slice(0,max)}
async function fetchPage(url,method='GET'){
  if(!validUrl(url))throw new Error('blocked_url');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(url,{method,redirect:'follow',signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 SmartLinkHub/6.0','accept':'text/html,application/xhtml+xml'}});
    const final=validUrl(r.url);if(!final)throw new Error('blocked_redirect');return r;
  }finally{clearTimeout(timer)}
}
async function parseBody(req){const len=Number(req.headers.get('content-length')||0);if(len>MAX_BODY)throw new Error('payload_too_large');const text=(await req.text()).slice(0,MAX_BODY);return text?JSON.parse(text):{}}
async function classify(env,item){
  const fallback=heuristic(item.url||'',item.title||'',item.description||'');if(!env.AI)return fallback;
  try{
    const prompt=`Classify one saved web link. Return strict JSON only with keys category, tags, summary. Category should be one concise useful folder name. tags must be 2-5 short strings. summary must be one factual sentence <=150 characters.\nURL: ${clean(item.url).slice(0,500)}\nTitle: ${clean(item.title).slice(0,300)}\nDescription: ${clean(item.description).slice(0,700)}`;
    const out=await env.AI.run(AI_MODEL,{prompt,max_tokens:180,temperature:.1});const text=out?.response||'';const match=text.match(/\{[\s\S]*\}/);if(!match)return fallback;const parsed=JSON.parse(match[0]);return {category:clean(parsed.category||fallback.category).slice(0,40)||fallback.category,tags:(Array.isArray(parsed.tags)?parsed.tags:fallback.tags).map(x=>clean(x).slice(0,30)).filter(Boolean).slice(0,5),summary:clean(parsed.summary||fallback.summary).slice(0,170)};
  }catch{return fallback}
}
function localRank(question,links){const terms=clean(question).toLowerCase().split(/\s+/).filter(Boolean);return links.map(l=>{const hay=[l.title,l.url,l.domain,l.summary,l.description,l.category,...(Array.isArray(l.tags)?l.tags:[])].join(' ').toLowerCase();let score=0;for(const t of terms){if(String(l.title||'').toLowerCase().includes(t))score+=7;if(String(l.domain||'').toLowerCase().includes(t))score+=5;if(String(l.category||'').toLowerCase().includes(t))score+=4;if(hay.includes(t))score+=1}return {...l,__score:score}}).filter(l=>l.__score>0).sort((a,b)=>b.__score-a.__score)}
async function ask(env,question,links){
  const ranked=localRank(question,links).slice(0,18);if(!env.AI){return {answer:ranked.length?`Found ${ranked.length} relevant saved links. Review the cited results below.`:'No relevant saved links were found.',linkIds:ranked.map(x=>x.id)}}
  if(!ranked.length)return {answer:'I could not find a saved link that is relevant enough to answer from your library.',linkIds:[]};
  const context=ranked.map((l,i)=>`[${i+1}] id=${clean(l.id)} | ${clean(l.title).slice(0,180)} | ${clean(l.url).slice(0,300)} | category=${clean(l.category)} | tags=${(l.tags||[]).map(clean).join(', ')} | ${clean(l.summary||l.description).slice(0,400)}`).join('\n');
  const prompt=`You are Smart Link Hub AI. Answer ONLY from the saved-link context below. Do not invent facts about pages that are not in the context. If the context is insufficient, say so. Answer in the same language as the user's question. Be concise but useful. Mention source numbers like [1], [2] when relevant.\n\nQuestion: ${clean(question).slice(0,1200)}\n\nSaved links:\n${context}`;
  try{const out=await env.AI.run(AI_MODEL,{prompt,max_tokens:500,temperature:.15});return {answer:clean(out?.response||'').slice(0,4000)||'No grounded answer was generated.',linkIds:ranked.map(x=>x.id)}}catch{return {answer:`Found ${ranked.length} relevant saved links. AI generation is temporarily unavailable.`,linkIds:ranked.map(x=>x.id)}}
}

export default {async fetch(req,env){
  if(req.method==='OPTIONS')return json({ok:true});
  const u=new URL(req.url),target=validUrl(u.searchParams.get('url'));
  try{
    if(u.pathname==='/api/metadata'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);const r=await fetchPage(target);const type=r.headers.get('content-type')||'';if(!type.includes('text/html')&&!type.includes('application/xhtml+xml'))return json({title:target.hostname,description:'',imageUrl:'',favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(target.hostname)}`,domain:target.hostname.replace(/^www\./,''),status:r.status,finalUrl:r.url});const html=await readLimited(r);const domain=target.hostname.replace(/^www\./,'');return json({title:titleOf(html)||domain,description:clean(descOf(html)).slice(0,220),imageUrl:abs(imageOf(html),target),favicon:`https://www.google.com/s2/favicons?sz=96&domain=${encodeURIComponent(domain)}`,domain,status:r.status,finalUrl:r.url});
    }
    if(u.pathname==='/api/health'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);let r;try{r=await fetchPage(target,'HEAD');if(r.status===405||r.status===403)r=await fetchPage(target,'GET')}catch(e){return json({status:null,ok:false,state:'broken',error:e.message,checkedAt:Date.now()})}return json({status:r.status,ok:r.ok,state:r.redirected?'redirect':r.ok?'ok':'broken',finalUrl:r.url,checkedAt:Date.now()});
    }
    if(u.pathname==='/api/snapshot'){
      if(!target)return json({error:'invalid_or_blocked_url'},400);const r=await fetchPage(target),html=await readLimited(r,250000);const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,4000);return json({type:'html-excerpt',title:titleOf(html)||target.hostname,url:target.href,description:clean(descOf(html)).slice(0,220),imageUrl:abs(imageOf(html),target),excerpt:text,capturedAt:Date.now(),status:r.status});
    }
    if(u.pathname==='/api/ai'&&req.method==='POST'){
      const b=await parseBody(req);return json(await classify(env,b));
    }
    if(u.pathname==='/api/ai-batch'&&req.method==='POST'){
      const b=await parseBody(req),items=Array.isArray(b.items)?b.items.slice(0,80):[];const out=[];for(let i=0;i<items.length;i+=4){const batch=items.slice(i,i+4);const classified=await Promise.all(batch.map(async item=>({id:item.id,...await classify(env,item)})));out.push(...classified)}return json({items:out,count:out.length});
    }
    if(u.pathname==='/api/ask'&&req.method==='POST'){
      const b=await parseBody(req),question=clean(b.question),links=(Array.isArray(b.links)?b.links:[]).slice(0,30);if(!question)return json({error:'question_required'},400);return json(await ask(env,question,links));
    }
    return json({name:'Smart Link Hub API',version:6,endpoints:['/api/metadata','/api/health','/api/snapshot','/api/ai','/api/ai-batch','/api/ask'],security:['private-network URL blocking','redirect validation','request size limits','timeouts']});
  }catch(e){const msg=String(e?.message||e);if(msg==='payload_too_large')return json({error:msg},413);if(msg==='blocked_url'||msg==='blocked_redirect')return json({error:msg},400);return json({error:msg.slice(0,250)},500)}
}};
