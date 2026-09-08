import {getAll,getOne,putOne,getSetting} from '../db.js';
import {workerFetch} from './core.js';

const DEFAULT_CATEGORIES=new Set(['','general','other','uncategorized']);
const CANONICAL_CATEGORIES=['AI & Research','Development','Security','Finance','Shopping','Social','Media & Entertainment','News','Education','Design','Productivity','Work','Travel','Food & Places','Health & Fitness','General'];
const CATEGORY_ALIASES=new Map([
  ['ai','AI & Research'],['artificial intelligence','AI & Research'],['research','AI & Research'],['ai & research','AI & Research'],
  ['development','Development'],['developer','Development'],['programming','Development'],['code','Development'],
  ['security','Security'],['cybersecurity','Security'],['cyber security','Security'],
  ['finance','Finance'],['investing','Finance'],['investment','Finance'],['stocks','Finance'],['stock market','Finance'],
  ['shopping','Shopping'],['ecommerce','Shopping'],['e-commerce','Shopping'],
  ['social','Social'],['social media','Social'],
  ['media','Media & Entertainment'],['entertainment','Media & Entertainment'],['media & entertainment','Media & Entertainment'],
  ['news','News'],['learning','Education'],['education','Education'],
  ['design','Design'],['ui/ux','Design'],['ui ux','Design'],
  ['productivity','Productivity'],['work','Work'],['business','Work'],
  ['travel','Travel'],['food','Food & Places'],['places','Food & Places'],['food & places','Food & Places'],
  ['health','Health & Fitness'],['fitness','Health & Fitness'],['health & fitness','Health & Fitness'],
  ['general','General'],['other','General']
]);
const RULES=[
  {category:'AI & Research',domains:['openai.com','chatgpt.com','anthropic.com','claude.ai','perplexity.ai','huggingface.co','replicate.com','stability.ai','midjourney.com','gemini.google.com','deepmind.google','mistral.ai','cohere.com','arxiv.org','semanticscholar.org'],keywords:['artificial intelligence','machine learning','deep learning','llm','large language model','generative ai','chatgpt','openai','claude','gemini','prompt engineering','research paper','arxiv','model inference','embedding','transformer'],tags:['AI','Research']},
  {category:'Development',domains:['github.com','gitlab.com','stackoverflow.com','stackexchange.com','npmjs.com','pypi.org','developer.mozilla.org','dev.to','vercel.com','cloudflare.com','docker.com','kubernetes.io','codepen.io','replit.com','codesandbox.io'],keywords:['github','repository','source code','developer','programming','javascript','typescript','python','react','next.js','nextjs','node.js','npm','api documentation','sdk','docker','kubernetes','frontend','backend','database','code example'],tags:['Development','Code']},
  {category:'Security',domains:['virustotal.com','shodan.io','censys.io','portswigger.net','hackthebox.com','tryhackme.com','malwarebytes.com','bitdefender.com','owasp.org','exploit-db.com','securitytrails.com','urlscan.io'],keywords:['cybersecurity','security tool','vulnerability','malware','phishing','penetration testing','pentest','cve','exploit','firewall','network security','threat intelligence','soc','siem','zero trust'],tags:['Security']},
  {category:'Finance',domains:['tradingview.com','finance.yahoo.com','marketwatch.com','investing.com','seekingalpha.com','sec.gov','morningstar.com','bloomberg.com','cnbc.com','finviz.com','stockanalysis.com'],keywords:['stock','stocks','share price','earnings','options','call option','put option','dividend','portfolio','investing','investment','financial','market cap','nasdaq','nyse','etf','crypto price','valuation'],tags:['Finance','Investing']},
  {category:'Shopping',domains:['amazon.com','amazon.co.th','shopee.co.th','shopee.com','lazada.co.th','lazada.com','etsy.com','ebay.com','aliexpress.com','temu.com'],keywords:['buy online','shopping','product price','add to cart','checkout','flash sale','coupon','ส่วนลด','ราคา','สั่งซื้อ','ช้อป'],tags:['Shopping']},
  {category:'Social',domains:['facebook.com','instagram.com','x.com','twitter.com','reddit.com','tiktok.com','threads.net','linkedin.com','pinterest.com','discord.com'],keywords:['social media','profile','followers','post','community','subreddit','tweet','instagram','facebook','tiktok','linkedin'],tags:['Social']},
  {category:'Media & Entertainment',domains:['youtube.com','youtu.be','netflix.com','disneyplus.com','primevideo.com','spotify.com','music.apple.com','imdb.com','myanimelist.net','twitch.tv','soundcloud.com'],keywords:['movie','movies','film','series','tv show','music','song','album','video','youtube','streaming','anime','gaming stream','podcast'],tags:['Entertainment','Media']},
  {category:'News',domains:['reuters.com','apnews.com','bbc.com','bbc.co.uk','cnn.com','nytimes.com','theguardian.com','washingtonpost.com','thairath.co.th','matichon.co.th','khaosod.co.th','bangkokpost.com'],keywords:['breaking news','latest news','ข่าวล่าสุด','ข่าววันนี้','world news','politics news','business news','news report'],tags:['News']},
  {category:'Education',domains:['coursera.org','udemy.com','edx.org','khanacademy.org','skillshare.com','codecademy.com','freecodecamp.org','quizlet.com'],keywords:['course','tutorial','lesson','learn','learning path','certificate','study','training','บทเรียน','คอร์ส','เรียนออนไลน์'],tags:['Education','Learning']},
  {category:'Design',domains:['figma.com','canva.com','dribbble.com','behance.net','adobe.com','framer.com','awwwards.com'],keywords:['ui design','ux design','graphic design','design system','prototype','wireframe','mockup','font','typography','illustration','figma','canva'],tags:['Design','UI/UX']},
  {category:'Productivity',domains:['notion.so','trello.com','asana.com','clickup.com','todoist.com','airtable.com','miro.com','zapier.com','make.com'],keywords:['productivity','task management','project management','workflow','automation','notes','knowledge base','to-do','todo','calendar'],tags:['Productivity']},
  {category:'Work',domains:['slack.com','microsoft365.com','office.com','sharepoint.com','teams.microsoft.com','zoom.us','freshservice.com','atlassian.net'],keywords:['helpdesk','ticket','enterprise','office 365','microsoft 365','workplace','meeting','company portal','service desk','it support'],tags:['Work']},
  {category:'Travel',domains:['booking.com','agoda.com','trip.com','skyscanner.com','airbnb.com','hotels.com','expedia.com','maps.google.com','traveloka.com'],keywords:['hotel','flight','travel','trip','เที่ยว','ที่พัก','โรงแรม','ตั๋วเครื่องบิน','booking','destination','itinerary'],tags:['Travel']},
  {category:'Food & Places',domains:['wongnai.com','food.grab.com','lineman.line.me','tripadvisor.com'],keywords:['restaurant','cafe','coffee shop','food','menu','ร้านอาหาร','คาเฟ่','ชาบู','หมูกระทะ','ก๋วยเตี๋ยว','ของกิน','เปิดกี่โมง','รีวิวร้าน'],tags:['Food','Places']},
  {category:'Health & Fitness',domains:['myfitnesspal.com','strava.com','healthline.com','webmd.com','mayoclinic.org','fitbit.com'],keywords:['health','fitness','workout','running','exercise','nutrition','calories','protein','สุขภาพ','ออกกำลังกาย','ฟิตเนส','วิ่ง'],tags:['Health','Fitness']}
];

const state={pending:new Set(),timer:null,running:false};
const norm=s=>String(s||'').toLowerCase().normalize('NFKC');
const hostOf=link=>norm(link.domain||(()=>{try{return new URL(link.url).hostname.replace(/^www\./,'')}catch{return ''}})());
const domainMatch=(host,rule)=>rule.domains.some(d=>host===d||host.endsWith('.'+d));
const hasMetadata=link=>Boolean(link?.description||link?.summary||(link?.title&&norm(link.title)!==hostOf(link)));

function canonicalCategory(raw,fallback='General'){
  const key=norm(raw).trim();if(!key)return fallback;
  if(CATEGORY_ALIASES.has(key))return CATEGORY_ALIASES.get(key);
  const exact=CANONICAL_CATEGORIES.find(x=>norm(x)===key);if(exact)return exact;
  for(const [alias,cat] of CATEGORY_ALIASES){if(key.includes(alias)||alias.includes(key))return cat}
  return fallback;
}

export function classifyLink(link={}){
  const host=hostOf(link),title=norm(link.title),desc=norm(link.description),summary=norm(link.summary),url=norm(link.url),type=norm(link.contentType);
  let best={category:'General',score:0,tags:[],reasons:[]};
  for(const rule of RULES){
    let score=0;const reasons=[];
    if(domainMatch(host,rule)){score+=8;reasons.push('domain')}
    for(const kw of rule.keywords){
      const k=norm(kw);if(!k)continue;
      if(title.includes(k)){score+=4;reasons.push(`title:${kw}`)}
      else if(desc.includes(k)||summary.includes(k)){score+=2.5;reasons.push(`meta:${kw}`)}
      else if(url.includes(k.replace(/\s+/g,'-'))||url.includes(k.replace(/\s+/g,''))){score+=1.5;reasons.push(`url:${kw}`)}
    }
    if(score>best.score)best={category:rule.category,score,tags:rule.tags,reasons};
  }
  const confidence=best.score>=8?0.98:best.score>=5?0.9:best.score>=3?0.78:best.score>=2?0.66:0;
  if(best.score<2)return {category:'General',confidence:0,tags:[],source:'local-rules-v2',reasons:[]};
  return {...best,confidence,source:'local-rules-v2'};
}

function canAutoUpdate(link){
  const current=norm(link.category);
  if(DEFAULT_CATEGORIES.has(current))return true;
  if(link.autoCategorySource&&link.autoCategory===link.category)return true;
  return false;
}
function mergeTags(link,result){
  const current=Array.isArray(link.tags)?link.tags.map(String).filter(Boolean):[];
  const filtered=current.filter(t=>!DEFAULT_CATEGORIES.has(norm(t)));
  return [...new Set([...filtered,result.category,...(result.tags||[])])].slice(0,12);
}

async function aiRefine(link,local,{force=false}={}){
  if(await getSetting('v7AutoCategoryAI',true)===false)return local;
  const recent=Date.now()-Number(link.createdAt||0)<24*3600e3;
  if(!force&&!recent)return local;
  if(!hasMetadata(link))return local;
  if(!force&&link.autoCategoryAIAt&&Number(link.autoCategoryAIAt)>Number(link.updatedAt||0)-1500)return local;
  try{
    const res=await workerFetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:link.url,title:link.title,description:link.description||link.summary||''})});
    const ai=await res.json();const category=canonicalCategory(ai.category,local.category);
    if(category==='General'&&local.category!=='General')return local;
    return {category,tags:Array.isArray(ai.tags)?ai.tags:local.tags,summary:String(ai.summary||'').trim(),confidence:0.94,source:'workers-ai+local-v2',reasons:['workers-ai']};
  }catch{return local}
}

export async function autoClassifyLink(linkOrId,{force=false}={}){
  if(await getSetting('v7AutoCategory',true)===false)return null;
  const link=typeof linkOrId==='string'?await getOne('links',linkOrId):linkOrId;
  if(!link)return null;if(!force&&!canAutoUpdate(link))return null;
  const local=classifyLink(link),result=await aiRefine(link,local,{force});
  if(result.category==='General'||result.confidence<0.6)return result;
  if(!force&&link.category===result.category&&link.autoCategorySource===result.source)return result;
  const next={...link,category:result.category,tags:mergeTags(link,result),autoCategory:result.category,autoCategoryConfidence:result.confidence,autoCategorySource:result.source,autoCategorizedAt:Date.now(),updatedAt:Math.max(Number(link.updatedAt||0),Date.now())};
  if(result.source.startsWith('workers-ai'))next.autoCategoryAIAt=Date.now();
  if(result.summary&&!String(link.summary||'').trim())next.summary=result.summary;
  await putOne('links',next);return result;
}

async function drain(){
  if(state.running)return;state.running=true;
  try{
    const ids=[...state.pending];state.pending.clear();
    if(ids.length){for(const id of ids.slice(0,80))await autoClassifyLink(id).catch(()=>{})}
    else{
      const links=await getAll('links');
      const pending=links.filter(canAutoUpdate).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0)).slice(0,120);
      for(const link of pending)await autoClassifyLink(link).catch(()=>{});
    }
  }finally{state.running=false;if(state.pending.size)schedule()}
}
function schedule(id=null,delay=350){if(id)state.pending.add(String(id));clearTimeout(state.timer);state.timer=setTimeout(drain,delay)}

export function initAutoCategory(){
  schedule(null,900);
  window.addEventListener('smartlink:v7-captured',e=>{for(const link of e.detail?.added||[])schedule(link.id,80)});
  window.addEventListener('smartlink:local-mutation',e=>{const d=e.detail||{};if(d.store!=='links')return;if(d.key)schedule(d.key,450);else schedule(null,700)});
  window.SmartLinkV7={...(window.SmartLinkV7||{}),classifyLink,autoClassifyLink};
}
