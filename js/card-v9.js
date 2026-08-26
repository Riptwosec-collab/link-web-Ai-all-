import {getAll} from './db.js';

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
function accent(link){return safeColor(link.themeColor)||`hsl(${hashHue(host(link))} 52% 30%)`}

function generatedSurface(link,logo,icon,{fallback=false}={}){
  const cls=`v11-generated-surface${fallback?' v11-photo-fallback':''}`;
  const style=`--v11-accent:${esc(accent(link))}`;
  if(logo)return `<div class="${cls}" style="${style}"><div class="v11-orb v11-orb-a"></div><div class="v11-orb v11-orb-b"></div><div class="v11-grid"></div><div class="v11-logo-card"><img class="v11-real-logo" src="${esc(logo)}" alt=""><span class="v11-logo-initials hidden">${esc(initials(link))}</span></div></div>`;
  if(icon)return `<div class="${cls}" style="${style}"><div class="v11-orb v11-orb-a"></div><div class="v11-orb v11-orb-b"></div><div class="v11-grid"></div><div class="v11-icon-card"><img src="${esc(icon)}" alt=""><span class="v11-icon-initials hidden">${esc(initials(link))}</span></div></div>`;
  return `<div class="${cls}" style="${style}"><div class="v11-orb v11-orb-a"></div><div class="v11-orb v11-orb-b"></div><div class="v11-grid"></div><div class="v11-watermark">${esc(initials(link))}</div><div class="v11-initial-card">${esc(initials(link))}</div></div>`;
}
function photoSurface(link,art,logo,icon){
  const fallback=generatedSurface(link,logo,icon,{fallback:true});
  return `<div class="v11-photo-surface"><img class="v11-bg-photo" src="${esc(art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><div class="v11-photo-dim"></div>${logo?`<div class="v11-logo-on-photo"><img class="v11-real-logo" src="${esc(logo)}" alt=""><span class="v11-logo-initials hidden">${esc(initials(link))}</span></div>`:''}</div>${fallback}`;
}
function coverHTML(link){
  const logo=realLogo(link),art=feature(link),icon=qualityIcon(link);
  if(art)return photoSurface(link,art,logo,icon);
  return generatedSurface(link,logo,icon);
}
function previewHTML(link){
  const category=esc(link.category&&link.category!=='Loading'?link.category:'General');
  return `${coverHTML(link)}<div class="v11-cover-shade"></div><div class="v9-cover-title"><p>${category}</p><h3>${esc(link.title||host(link))}</h3></div><div class="link-menu v9-menu flex gap-1"><button class="card-action favorite-btn ${link.favorite?'active':''}" data-action="favorite" aria-label="Favorite"><i class="${link.favorite?'ph-fill':'ph'} ph-star"></i></button><button class="card-action" data-action="edit" aria-label="Edit"><i class="ph ph-pencil-simple"></i></button><button class="card-action" data-refresh-metadata="1" aria-label="Refresh metadata" title="Refresh metadata"><i class="ph ph-arrows-clockwise"></i></button></div>${link.pending?'<span class="v9-loading-pill"><i class="ph ph-circle-notch"></i> Loading</span>':''}`;
}
function bodyHTML(link,col){
  const art=feature(link),logo=realLogo(link),icon=qualityIcon(link);
  const mark=logo||(!art?icon:'');
  const tags=filteredTags(link);
  return `<div class="v9-card-body"><div class="v9-info-row"><div class="v9-site-mark">${mark?`<img src="${esc(mark)}" alt="" loading="lazy" decoding="async">`:''}<span>${esc(initials(link))}</span></div><div class="v9-info-copy"><div class="v9-domain-line"><span class="health-dot ${link.health?.state==='ok'?'health-ok':link.health?.state==='broken'?'health-broken':link.health?.state==='redirect'?'health-redirect':'health-unknown'}"></span><span>${esc(host(link))}</span></div><p class="v9-description">${esc(description(link))}</p></div></div><div class="v9-tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${col?`<span class="tag text-cyan-300/70"><i class="ph ph-folder"></i> ${esc(col.name)}</span>`:''}</div></div>`;
}
function validateMedia(card){
  const preview=card.querySelector('.preview');if(!preview)return;
  preview.classList.remove('v10-logo-failed','v10-feature-failed','v11-photo-failed');
  const bg=preview.querySelector('.v11-bg-photo');
  if(bg){
    const fail=()=>preview.classList.add('v11-photo-failed');
    const decide=()=>{const w=bg.naturalWidth||0,h=bg.naturalHeight||0,ratio=h?w/h:99;const good=w>=320&&h>=160&&w*h>=85000&&ratio<6&&ratio>.42;if(!good)fail()};
    bg.addEventListener('load',decide,{once:true});bg.addEventListener('error',fail,{once:true});if(bg.complete)requestAnimationFrame(decide);
  }
  preview.querySelectorAll('.v11-real-logo').forEach(img=>{
    const fail=()=>{img.classList.add('hidden');img.nextElementSibling?.classList.remove('hidden')};
    img.addEventListener('error',fail,{once:true});img.addEventListener('load',()=>{if((img.naturalWidth||0)<24||(img.naturalHeight||0)<24)fail()},{once:true});
  });
  preview.querySelectorAll('.v11-icon-card img').forEach(img=>{
    const fail=()=>{img.classList.add('hidden');img.nextElementSibling?.classList.remove('hidden')};
    img.addEventListener('error',fail,{once:true});img.addEventListener('load',()=>{if((img.naturalWidth||0)<24||(img.naturalHeight||0)<24)fail()},{once:true});
  });
  const mark=card.querySelector('.v9-site-mark img');
  if(mark){const fail=()=>mark.classList.add('hidden');mark.addEventListener('error',fail,{once:true});mark.addEventListener('load',()=>{if((mark.naturalWidth||0)<24||(mark.naturalHeight||0)<24)fail()},{once:true})}
}
async function patchCards(){
  queued=false;
  const cards=[...document.querySelectorAll('.link-card[data-link-id]')];if(!cards.length)return;
  const [links,cols]=await Promise.all([getAll('links'),getAll('collections')]);
  const map=new Map(links.map(x=>[x.id,x])),cmap=new Map(cols.map(x=>[x.id,x]));
  for(const card of cards){
    const link=map.get(card.dataset.linkId);if(!link)continue;
    const stamp=`11:${link.updatedAt||0}:${link.favorite?1:0}:${link.pending?1:0}`;
    if(card.dataset.v11Stamp===stamp)continue;
    card.dataset.v11Stamp=stamp;card.classList.add('card-v9','card-v11');
    const preview=card.querySelector('.preview');
    if(preview){preview.innerHTML=previewHTML(link);const body=preview.nextElementSibling;if(body)body.outerHTML=bodyHTML(link,cmap.get(link.collectionId))}
    validateMedia(card);
  }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>setTimeout(patchCards,30))}
function observe(){const root=document.getElementById('dynamic-content');if(!root)return setTimeout(observe,100);new MutationObserver(schedule).observe(root,{childList:true});schedule()}
window.addEventListener('smartlink:data-updated',schedule);
observe();
