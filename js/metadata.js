const SUPABASE_META_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co/functions/v1/smartlink-metadata';
const SUPABASE_ANON_JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmcWtleG5xYmp0dXdzeXFhY3N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MzE2NzQsImV4cCI6MjA5ODAwNzY3NH0.3Y7jiiMxbRLp9xsvOUQygrBVEvav9tUqX1fW8_155N0';

const clean=(s='',n=190)=>{s=String(s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n).replace(/\s+\S*$/,'')+'…':s};
const abs=(v,base)=>{try{return v?new URL(v,base).href:''}catch{return ''}};
const meta=(doc,arr)=>{for(const q of arr){const e=doc.querySelector(q),v=e?.content||e?.href||e?.textContent;if(v?.trim())return v.trim()}return ''};

function decodePunyLabel(input=''){
 const base=36,tMin=1,tMax=26,skew=38,damp=700,initialBias=72,initialN=128;
 const digit=cp=>cp>=48&&cp<=57?cp-22:cp>=65&&cp<=90?cp-65:cp>=97&&cp<=122?cp-97:base;
 const adapt=(delta,count,first)=>{delta=first?Math.floor(delta/damp):delta>>1;delta+=Math.floor(delta/count);let k=0;while(delta>((base-tMin)*tMax)>>1){delta=Math.floor(delta/(base-tMin));k+=base}return k+Math.floor(((base-tMin+1)*delta)/(delta+skew))};
 let n=initialN,i=0,bias=initialBias,out=[],pos=0,basic=input.lastIndexOf('-');
 if(basic>=0){for(let j=0;j<basic;j++)out.push(input.charCodeAt(j));pos=basic+1}
 while(pos<input.length){const oldi=i;let w=1;for(let k=base;;k+=base){if(pos>=input.length)return input;const d=digit(input.charCodeAt(pos++));if(d>=base)return input;i+=d*w;const t=k<=bias?tMin:k>=bias+tMax?tMax:k-bias;if(d<t)break;w*=base-t}const len=out.length+1;bias=adapt(i-oldi,len,oldi===0);n+=Math.floor(i/len);i%=len;out.splice(i,0,n);i++}
 try{return String.fromCodePoint(...out)}catch{return input}
}
export function displayHost(host=''){return String(host).split('.').map(label=>label.toLowerCase().startsWith('xn--')?decodePunyLabel(label.slice(4)):label).join('.')}

function parseHTML(text,url){
 const doc=new DOMParser().parseFromString(text,'text/html'),asciiDomain=new URL(url).hostname.replace(/^www\./,''),pretty=displayHost(asciiDomain);
 const title=meta(doc,['meta[property="og:title"]','meta[name="twitter:title"]','title','h1']);
 let description=clean(meta(doc,['meta[property="og:description"]','meta[name="twitter:description"]','meta[name="description"]']),260);
 if(!description){const p=[...doc.querySelectorAll('p')].map(x=>clean(x.textContent,260)).find(x=>x.length>=45&&!/cookie|privacy|copyright/i.test(x));description=p||''}
 let imageUrl=abs(meta(doc,['meta[property="og:image:secure_url"]','meta[property="og:image"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]','meta[itemprop="image"]','link[rel="image_src"]']),url);
 if(!imageUrl){const img=[...doc.images].find(i=>i.src&&!/sprite|pixel|icon/i.test(i.src));imageUrl=abs(img?.getAttribute('src')||'',url)}
 const favicon=abs(meta(doc,['link[rel="apple-touch-icon"]','link[rel="icon"]','link[rel="shortcut icon"]']),url)||`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(asciiDomain)}`;
 return {title:clean(title,180)||pretty,description,imageUrl,favicon,domain:pretty,asciiDomain,displayDomain:pretty,source:'html'};
}

async function timeoutFetch(url,opts={},ms=10000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}}

function meaningfulTitle(title,domain){const t=clean(title,180).toLowerCase(),d=clean(domain,180).toLowerCase();return !!t&&t!==d&&!/^xn--/.test(t)&&t!=='untitled'&&t!=='home'}
function genericText(v=''){return /website or online service|general website|online service from|no description/i.test(String(v))}

export function heuristicAI(url,title='',description='',displayDomain=''){
 const text=`${url} ${title} ${description} ${displayDomain}`.toLowerCase();
 const rules=[
  ['AI',[' ai ','openai','chatgpt','claude','gemini','llm','machine learning','ปัญญาประดิษฐ์','แชตบอต']],
  ['Development',['github','gitlab','developer',' api ','programming','vercel','cloudflare','โค้ด','โปรแกรม']],
  ['Design',['figma','canva','design',' ui ',' ux ','photo','image','ออกแบบ','แต่งรูป']],
  ['Media',['youtube','netflix','video','music','spotify','stream','วิดีโอ','เพลง','หนัง']],
  ['Travel',['travel','hotel','flight','booking','trip','camp','campsite','camping','กางเต็นท์','แคมป์','ท่องเที่ยว','เที่ยว','โรงแรม','ที่พัก']],
  ['Finance',['stock','finance','invest','trading','crypto','bank','หุ้น','ลงทุน','การเงิน']],
  ['Learning',['learn','course','education','tutorial','docs','เรียน','คอร์ส','บทเรียน']],
  ['Shopping',['shop','store','product','amazon','shopee','lazada','สินค้า','ช้อป','ร้านค้า']]
 ];
 let category='General',best=0;for(const [c,ks] of rules){const s=ks.reduce((n,k)=>n+(text.includes(k)?1:0),0);if(s>best){best=s;category=c}}
 const tags=[category];const words=(title+' '+description).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[];for(const w of words){if(!tags.includes(w)&&!['this','that','with','from','your','have','more','website','online','และ','สำหรับ','เว็บไซต์'].includes(w))tags.push(w);if(tags.length>=5)break}
 let summary=clean(description,150);
 if(!summary&&category==='Travel'&&/(กางเต็นท์|แคมป์|camp|campsite)/i.test(text))summary='รวมข้อมูลจุดกางเต็นท์ แคมป์ และข้อมูลสำหรับวางแผนท่องเที่ยว';
 else if(!summary&&category==='Development')summary='เครื่องมือหรือแพลตฟอร์มสำหรับงานพัฒนาโปรแกรมและซอฟต์แวร์';
 else if(!summary&&category==='AI')summary='เครื่องมือหรือบริการด้าน AI สำหรับช่วยทำงาน ค้นคว้า หรือสร้างเนื้อหา';
 else if(!summary&&category==='Learning')summary='เว็บไซต์หรือแพลตฟอร์มสำหรับการเรียนรู้และค้นคว้า';
 else if(!summary&&category==='Shopping')summary='เว็บไซต์สำหรับค้นหา เลือกซื้อ หรือดูข้อมูลสินค้า';
 return {category,tags,summary};
}

async function fetchSupabaseMetadata(url){
 const r=await timeoutFetch(`${SUPABASE_META_URL}?url=${encodeURIComponent(url)}`,{headers:{apikey:SUPABASE_ANON_JWT,Authorization:`Bearer ${SUPABASE_ANON_JWT}`,Accept:'application/json'}},15000);
 if(!r.ok)throw new Error(`Supabase metadata ${r.status}`);
 const d=await r.json();if(d?.error)throw new Error(d.error);
 const pretty=d.displayDomain||displayHost(d.domain||new URL(url).hostname.replace(/^www\./,''));
 return {...d,title:clean(d.title||pretty,180),description:clean(d.description||'',260),imageUrl:d.imageUrl||'',favicon:d.favicon||'',domain:pretty,asciiDomain:d.domain||'',displayDomain:pretty};
}

async function fetchMicrolink(url,base={}){
 const r=await timeoutFetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=true`,{},14000);if(!r.ok)throw new Error(`Microlink ${r.status}`);
 const j=await r.json(),d=j.data||{},asciiDomain=new URL(url).hostname.replace(/^www\./,''),pretty=displayHost(asciiDomain);
 return {...base,title:meaningfulTitle(base?.title,pretty)?base.title:(d.title||d.publisher||pretty),description:base?.description||clean(d.description||'',260),imageUrl:base?.imageUrl||d.image?.url||d.screenshot?.url||'',favicon:base?.favicon||d.logo?.url||`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(asciiDomain)}`,domain:pretty,asciiDomain,displayDomain:pretty,source:base?.source||'microlink'};
}

export async function getMetadata(url,settings={}){
 const asciiDomain=new URL(url).hostname.replace(/^www\./,''),pretty=displayHost(asciiDomain);let data=null;
 try{data=await fetchSupabaseMetadata(url)}catch(e){console.warn('Supabase metadata fallback:',e?.message||e)}
 const worker=(settings.workerUrl||'').replace(/\/$/,'');
 if((!data||!meaningfulTitle(data.title,pretty)||!data.description||!data.imageUrl)&&worker){try{const r=await timeoutFetch(`${worker}/api/metadata?url=${encodeURIComponent(url)}`,{},12000);if(r.ok){const w=await r.json();data={...(data||{}),title:meaningfulTitle(data?.title,pretty)?data.title:(w.title||pretty),description:data?.description||clean(w.description||'',260),imageUrl:data?.imageUrl||w.imageUrl||'',favicon:data?.favicon||w.favicon||'',domain:pretty,asciiDomain,displayDomain:pretty,source:data?.source||'worker'}}}catch{}}
 if(!data||!meaningfulTitle(data.title,pretty)||!data.description||!data.imageUrl){try{const r=await timeoutFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,{},10000);if(r.ok){const h=parseHTML(await r.text(),url);data={...(data||{}),title:meaningfulTitle(data?.title,pretty)?data.title:h.title,description:data?.description||h.description,imageUrl:data?.imageUrl||h.imageUrl,favicon:data?.favicon||h.favicon,domain:pretty,asciiDomain,displayDomain:pretty,source:data?.source||h.source}}}catch{}}
 if(!data||!meaningfulTitle(data.title,pretty)||!data.description||!data.imageUrl){try{data=await fetchMicrolink(url,data||{})}catch{}}
 data=data||{title:pretty,description:'',imageUrl:'',favicon:`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(asciiDomain)}`,domain:pretty,asciiDomain,displayDomain:pretty,source:'fallback'};
 data.title=meaningfulTitle(data.title,pretty)?clean(data.title,180):pretty;
 data.domain=pretty;
 let ai=heuristicAI(url,data.title,genericText(data.description)?'':data.description,pretty);
 if(worker&&settings.aiEnabled!==false){try{const r=await timeoutFetch(`${worker}/api/ai`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,title:data.title,description:data.description})},15000);if(r.ok){const j=await r.json();ai={...ai,...j}}}catch{}}
 const description=genericText(data.description)?'':clean(data.description,260);
 const summary=genericText(ai.summary)?'':clean(ai.summary||description,160);
 return {...data,description:description||summary,summary:summary||description,category:ai.category||'General',tags:Array.from(new Set((ai.tags||[ai.category||'General']).filter(Boolean))).slice(0,6)};
}

export async function checkHealth(url,settings={}){const worker=(settings.workerUrl||'').replace(/\/$/,'');if(worker){try{const r=await timeoutFetch(`${worker}/api/health?url=${encodeURIComponent(url)}`,{},12000);if(r.ok)return await r.json()}catch{}}
 try{const r=await timeoutFetch(url,{method:'HEAD',mode:'cors',redirect:'follow'},7000);return {status:r.status,ok:r.ok,state:r.redirected?'redirect':r.ok?'ok':'broken',finalUrl:r.url||url,checkedAt:Date.now()}}catch{return {status:null,ok:null,state:'unknown',finalUrl:url,checkedAt:Date.now()}}
}
export async function makeSnapshot(link,settings={}){const worker=(settings.workerUrl||'').replace(/\/$/,'');if(worker){try{const r=await timeoutFetch(`${worker}/api/snapshot?url=${encodeURIComponent(link.url)}`,{},15000);if(r.ok)return await r.json()}catch{}}
 return {type:'metadata',title:link.title,url:link.url,description:link.description,imageUrl:link.imageUrl||'',capturedAt:Date.now(),excerpt:link.summary||link.description||''};
}
