import {getAll} from './db.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const genericText=v=>/^(?:no description|untitled|home)$/i.test(String(v||'').trim())||/website or online service|general website|online service from/i.test(String(v||''));
const genericIcon=u=>/google\.com\/s2\/favicons|favicon(?:\.ico)?|apple-touch-icon|manifest|\/icons?\//i.test(String(u||''));
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
  const list=[declared==='logo'?link.brandAssetUrl:'',link.logoUrl].filter(Boolean);
  return list.find(x=>!genericIcon(x))||'';
}
function feature(link){
  const declared=String(link.brandKind||'').toLowerCase();
  const list=[link.featureImageUrl,declared==='feature'?link.brandAssetUrl:'',link.imageUrl].filter(Boolean);
  return list.find(x=>!badFeature(x))||'';
}
function smallIcon(link){return realLogo(link)||link.touchIconUrl||link.manifestIconUrl||link.favicon||''}
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
function coverFallback(link,logo,icon,theme){
  const hasTheme=!!theme;
  const style=`--v9-theme:${esc(theme||'#0b0f18')}`;
  if(logo)return `<div class="v9-brand-fallback ${hasTheme?'has-theme':''}" style="${style}"><img class="v9-logo-img" src="${esc(logo)}" alt=""><div class="v9-initials hidden">${esc(initials(link))}</div></div>`;
  if(icon)return `<div class="v9-brand-fallback ${hasTheme?'has-theme':''}" style="${style}"><img class="v9-icon-img" src="${esc(icon)}" alt=""><div class="v9-initials hidden">${esc(initials(link))}</div></div>`;
  return `<div class="v9-brand-fallback ${hasTheme?'has-theme':''}" style="${style}"><div class="v9-initials">${esc(initials(link))}</div></div>`;
}
function previewHTML(link){
  const logo=realLogo(link),photo=feature(link),icon=smallIcon(link),theme=safeColor(link.themeColor),fallback=coverFallback(link,logo,icon,theme);
  const photoHtml=photo?`<img class="v9-feature-photo" src="${esc(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'';
  const category=esc(link.category&&link.category!=='Loading'?link.category:'General');
  return `${fallback}${photoHtml}<div class="v9-cover-shade"></div><div class="v9-cover-title"><p>${category}</p><h3>${esc(link.title||host(link))}</h3></div><div class="link-menu v9-menu flex gap-1"><button class="card-action favorite-btn ${link.favorite?'active':''}" data-action="favorite" aria-label="Favorite"><i class="${link.favorite?'ph-fill':'ph'} ph-star"></i></button><button class="card-action" data-action="edit" aria-label="Edit"><i class="ph ph-pencil-simple"></i></button><button class="card-action" data-refresh-metadata="1" aria-label="Refresh metadata" title="Refresh metadata"><i class="ph ph-arrows-clockwise"></i></button></div>${link.pending?'<span class="v9-loading-pill"><i class="ph ph-circle-notch"></i> Loading</span>':''}`;
}
function bodyHTML(link,col){
  const mark=smallIcon(link),tags=filteredTags(link);
  return `<div class="v9-card-body"><div class="v9-info-row"><div class="v9-site-mark">${mark?`<img src="${esc(mark)}" alt="" loading="lazy" decoding="async">`:''}<span>${esc(initials(link))}</span></div><div class="v9-info-copy"><div class="v9-domain-line"><span class="health-dot ${link.health?.state==='ok'?'health-ok':link.health?.state==='broken'?'health-broken':link.health?.state==='redirect'?'health-redirect':'health-unknown'}"></span><span>${esc(host(link))}</span></div><p class="v9-description">${esc(description(link))}</p></div></div><div class="v9-tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${col?`<span class="tag text-cyan-300/70"><i class="ph ph-folder"></i> ${esc(col.name)}</span>`:''}</div></div>`;
}
function validateMedia(card){
  const preview=card.querySelector('.preview');if(!preview)return;
  const photo=preview.querySelector('.v9-feature-photo');
  if(photo){
    const decide=()=>{const w=photo.naturalWidth||0,h=photo.naturalHeight||0,ratio=h?w/h:99;const good=w>=520&&h>=200&&w*h>=240000&&ratio<5.2&&ratio>.7;preview.classList.toggle('v9-has-photo',good);if(!good)photo.remove()};
    photo.addEventListener('load',decide,{once:true});photo.addEventListener('error',()=>photo.remove(),{once:true});if(photo.complete)requestAnimationFrame(decide);
  }
  const brandImg=preview.querySelector('.v9-logo-img,.v9-icon-img');
  if(brandImg){
    const fail=()=>{brandImg.classList.add('hidden');preview.querySelector('.v9-initials')?.classList.remove('hidden')};
    brandImg.addEventListener('error',fail,{once:true});
    brandImg.addEventListener('load',()=>{if((brandImg.naturalWidth||0)<24||(brandImg.naturalHeight||0)<24)fail()},{once:true});
    if(brandImg.complete&&brandImg.naturalWidth&&brandImg.naturalWidth<24)fail();
  }
  const mark=card.querySelector('.v9-site-mark img');
  if(mark){
    const fail=()=>mark.classList.add('hidden');
    mark.addEventListener('error',fail,{once:true});
    mark.addEventListener('load',()=>{if((mark.naturalWidth||0)<24||(mark.naturalHeight||0)<24)fail()},{once:true});
  }
}
async function patchCards(){
  queued=false;
  const cards=[...document.querySelectorAll('.link-card[data-link-id]')];if(!cards.length)return;
  const [links,cols]=await Promise.all([getAll('links'),getAll('collections')]);
  const map=new Map(links.map(x=>[x.id,x])),cmap=new Map(cols.map(x=>[x.id,x]));
  for(const card of cards){
    const link=map.get(card.dataset.linkId);if(!link)continue;
    const stamp=`9:${link.updatedAt||0}:${link.favorite?1:0}:${link.pending?1:0}`;
    if(card.dataset.v9Stamp===stamp)continue;
    card.dataset.v9Stamp=stamp;card.classList.add('card-v9');
    const preview=card.querySelector('.preview');
    if(preview){
      preview.innerHTML=previewHTML(link);
      const body=preview.nextElementSibling;
      if(body)body.outerHTML=bodyHTML(link,cmap.get(link.collectionId));
    }
    validateMedia(card);
  }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>setTimeout(patchCards,45))}
function observe(){const root=document.getElementById('dynamic-content');if(!root)return setTimeout(observe,100);new MutationObserver(schedule).observe(root,{childList:true});schedule()}
window.addEventListener('smartlink:data-updated',schedule);
observe();
