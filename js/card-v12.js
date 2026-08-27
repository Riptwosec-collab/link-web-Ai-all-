import {getAll,getOne} from './db.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const genericText=v=>/^(?:no description|untitled|home)$/i.test(String(v||'').trim())||/website or online service|general website|online service from/i.test(String(v||''));
const googleIcon=u=>/google\.com\/s2\/favicons/i.test(String(u||''));
const genericIcon=u=>googleIcon(u)||/favicon(?:\.ico)?|apple-touch-icon|manifest|\/icons?\//i.test(String(u||''));
const badFeature=u=>!u||/favicon|apple-touch|manifest|logo|icon|sprite|pixel|badge/i.test(String(u).toLowerCase());
const tlds=new Set(['com','net','org','co','th','io','ai','app','dev','xyz','site','online','me','info','biz','cc','tv','shop','store']);
let queued=false;

function safeColor(v=''){
  const s=String(v||'').trim();
  return /^(#[0-9a-f]{3,8}|rgb\([\d\s.,%]+\)|rgba\([\d\s.,%]+\)|hsl\([\d\s.,%]+\)|hsla\([\d\s.,%]+\))$/i.test(s)?s:'';
}
function host(link){try{return String(link.domain||new URL(link.url).hostname.replace(/^www\./,''))}catch{return String(link.domain||'website')}}
function initials(link){
  const value=String(link.title||host(link)||'WEB').replace(/^www\./,'').trim();
  const parts=value.split(/[\s._-]+/).filter(Boolean);
  return (parts.length>1?parts[0][0]+parts[1][0]:value.slice(0,2)).toUpperCase();
}
function realLogo(link){
  const declared=String(link.brandKind||'').toLowerCase();
  const list=[link.logoUrl,declared==='logo'?link.brandAssetUrl:''].filter(Boolean);
  return list.find(x=>!genericIcon(x))||'';
}
function feature(link){
  const declared=String(link.brandKind||'').toLowerCase();
  const list=[link.heroImageUrl,link.featureImageUrl,link.featureLogoUrl,declared==='feature'?link.brandAssetUrl:'',link.imageUrl,link.screenshotUrl].filter(Boolean);
  return list.find(x=>!badFeature(x))||'';
}
function qualityIcon(link){
  if(link.touchIconUrl&&!googleIcon(link.touchIconUrl))return link.touchIconUrl;
  if(link.manifestIconUrl&&!googleIcon(link.manifestIconUrl))return link.manifestIconUrl;
  if(link.favicon&&!googleIcon(link.favicon))return link.favicon;
  return '';
}
function filteredTags(link){
  const h=host(link).toLowerCase();
  const hostParts=new Set(h.split(/[.\-_/]+/).filter(Boolean));
  const cat=String(link.category||'General').toLowerCase();
  const out=[];
  for(const raw of (link.tags||[])){
    const t=String(raw||'').trim();if(!t)continue;
    const k=t.toLowerCase();
    if(k===cat||k==='general'||tlds.has(k)||hostParts.has(k)||k==='www')continue;
    if(k.length<2||out.some(x=>x.toLowerCase()===k))continue;
    out.push(t);if(out.length===3)break;
  }
  return out;
}
function description(link){
  const d=String(link.summary||link.description||'').trim();
  if(d&&!genericText(d))return d;
  if(link.pending)return 'กำลังดึงชื่อ คำอธิบาย และภาพเด่น…';
  return `เปิด ${host(link)} เพื่อดูรายละเอียดเว็บไซต์`;
}
function hashHue(value=''){
  let h=0;for(const c of String(value))h=((h<<5)-h)+c.charCodeAt(0),h|=0;
  return Math.abs(h)%360;
}
function accent(link){return safeColor(link.themeColor)||`hsl(${hashHue(host(link))} 54% 30%)`}

function generatedBackground(link,{fallback=false}={}){
  return `<div class="v12-generated-bg${fallback?' v12-photo-fallback':''}" style="--v12-accent:${esc(accent(link))}"><div class="v12-bg-orb v12-bg-orb-a"></div><div class="v12-bg-orb v12-bg-orb-b"></div><div class="v12-bg-grid"></div><div class="v12-bg-watermark">${esc(initials(link))}</div></div>`;
}
function backgroundHTML(link){
  const art=feature(link);
  if(!art)return generatedBackground(link);
  return `<div class="v12-photo-bg"><img class="v12-bg-photo v51-image-ready" src="${esc(art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><div class="v12-photo-dim"></div></div>${generatedBackground(link,{fallback:true})}`;
}
function brandBadge(link){
  const logo=realLogo(link),art=feature(link),icon=qualityIcon(link);
  if(logo)return `<div class="v12-brand-badge is-logo"><img class="v12-brand-img v51-image-ready" src="${esc(logo)}" alt="" decoding="async"><span class="v12-brand-initials hidden">${esc(initials(link))}</span></div>`;
  if(art)return `<div class="v12-brand-badge is-feature"><img class="v12-brand-img is-feature-img v51-image-ready" src="${esc(art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="v12-brand-initials hidden">${esc(initials(link))}</span></div>`;
  if(icon)return `<div class="v12-brand-badge is-icon"><img class="v12-brand-img v51-image-ready" src="${esc(icon)}" alt="" decoding="async"><span class="v12-brand-initials hidden">${esc(initials(link))}</span></div>`;
  return `<div class="v12-brand-badge is-text"><span class="v12-brand-initials">${esc(initials(link))}</span></div>`;
}
function actionHTML(link){
  return `<div class="link-menu v12-menu flex gap-1"><button class="card-action v53-star ${link.favorite?'active':''}" data-v53="favorite" aria-label="Favorite"><i class="${link.favorite?'ph-fill':'ph'} ph-star"></i></button><button class="card-action v53-more" data-v53="more" aria-label="More actions"><i class="ph ph-dots-three"></i></button><button class="v53-legacy-hook" data-action="edit" tabindex="-1" aria-hidden="true"></button></div>`;
}
function previewHTML(link){
  const category=esc(link.category&&link.category!=='Loading'?link.category:'General');
  return `${backgroundHTML(link)}<div class="v12-cover-shade"></div><div class="v12-brand-row">${brandBadge(link)}<div class="v12-title-copy"><p>${category}</p><h3>${esc(link.title||host(link))}</h3></div></div>${actionHTML(link)}${link.pending?'<span class="v12-loading-pill"><i class="ph ph-circle-notch"></i> Loading</span>':''}`;
}
function bodyHTML(link,col){
  const tags=filteredTags(link);
  return `<div class="v12-card-body"><div class="v12-domain-line"><span class="health-dot ${link.health?.state==='ok'?'health-ok':link.health?.state==='broken'?'health-broken':link.health?.state==='redirect'?'health-redirect':'health-unknown'}"></span><span>${esc(host(link))}</span></div><p class="v12-description">${esc(description(link))}</p><div class="v12-tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${col?`<span class="tag text-cyan-300/70"><i class="ph ph-folder"></i> ${esc(col.name)}</span>`:''}</div></div>`;
}
function validateMedia(card){
  const preview=card.querySelector('.preview');if(!preview)return;
  preview.classList.remove('v12-photo-failed');
  const bg=preview.querySelector('.v12-bg-photo');
  if(bg){
    const fail=()=>preview.classList.add('v12-photo-failed');
    const decide=()=>{const w=bg.naturalWidth||0,h=bg.naturalHeight||0,ratio=h?w/h:99;const good=w>=320&&h>=160&&w*h>=85000&&ratio<6&&ratio>.42;if(!good)fail()};
    bg.addEventListener('load',decide,{once:true});bg.addEventListener('error',fail,{once:true});if(bg.complete&&bg.naturalWidth)decide();
  }
  const mark=preview.querySelector('.v12-brand-img');
  if(mark){
    const badge=mark.closest('.v12-brand-badge'),isFeature=badge?.classList.contains('is-feature');
    const fail=()=>{mark.classList.add('hidden');mark.nextElementSibling?.classList.remove('hidden');badge?.classList.remove('is-logo','is-icon','is-feature');badge?.classList.add('is-text')};
    const decide=()=>{const w=mark.naturalWidth||0,h=mark.naturalHeight||0;const good=isFeature?(w>=80&&h>=80&&w*h>=12000):(w>=24&&h>=24);if(!good)fail()};
    mark.addEventListener('error',fail,{once:true});mark.addEventListener('load',decide,{once:true});if(mark.complete&&mark.naturalWidth)decide();
  }
}
function applyCard(card,link,col){
  if(!card||!link)return;
  const stamp=`12.4:${link.updatedAt||0}:${link.favorite?1:0}:${link.pending?1:0}`;
  if(card.dataset.v12Stamp===stamp)return;
  card.dataset.v12Stamp=stamp;card.classList.add('card-v12');card.dataset.linkUrl=link.url||'';
  const preview=card.querySelector('.preview');
  if(preview){preview.innerHTML=previewHTML(link);const body=preview.nextElementSibling;if(body)body.outerHTML=bodyHTML(link,col)}
  validateMedia(card);
}
export function renderCardHTML(link,col=null,{draggable=false,compact=false}={}){
  return `<article class="link-card card-v12 ${compact?'compact':''}" data-link-id="${esc(link.id)}" data-link-url="${esc(link.url||'')}" ${draggable?'draggable="true"':''}><div class="preview">${previewHTML(link)}</div>${bodyHTML(link,col)}</article>`;
}
export async function refreshVisibleCard(id){
  const card=document.querySelector(`.link-card[data-link-id="${CSS.escape(id)}"]`);if(!card)return false;
  const [link,cols]=await Promise.all([getOne('links',id),getAll('collections')]);if(!link)return false;
  const cmap=new Map(cols.map(x=>[x.id,x]));applyCard(card,link,cmap.get(link.collectionId));return true;
}
export function insertVisibleCard(link){
  const shell=document.querySelector('#dynamic-content .page-shell');if(!shell)return false;
  let grid=document.querySelector('#dynamic-content .link-card[data-link-id]')?.parentElement;
  if(!grid&&location.hash!=='#search')grid=shell.querySelector('section:last-of-type > div.grid');
  if(!grid)return false;
  grid.querySelector('.col-span-full')?.remove();
  const tpl=document.createElement('template');tpl.innerHTML=renderCardHTML(link,null,{draggable:location.hash!=='#search'});const card=tpl.content.firstElementChild;grid.prepend(card);validateMedia(card);document.dispatchEvent(new CustomEvent('smartlink:card-inserted',{detail:{id:link.id}}));return true;
}
async function patchCards(){
  queued=false;
  const cards=[...document.querySelectorAll('.link-card[data-link-id]')];if(!cards.length){document.dispatchEvent(new Event('smartlink:cards-patched'));return}
  const [links,cols]=await Promise.all([getAll('links'),getAll('collections')]);
  const map=new Map(links.map(x=>[x.id,x])),cmap=new Map(cols.map(x=>[x.id,x]));
  for(const card of cards){const link=map.get(card.dataset.linkId);if(link)applyCard(card,link,cmap.get(link.collectionId))}
  document.dispatchEvent(new Event('smartlink:cards-patched'));
}
function schedule(){if(queued)return;queued=true;queueMicrotask(patchCards)}
function observe(){const root=document.getElementById('dynamic-content');if(!root)return setTimeout(observe,80);new MutationObserver(schedule).observe(root,{childList:true});schedule()}
window.addEventListener('smartlink:data-updated',schedule);
observe();
