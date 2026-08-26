import {getAll,getOne,putOne,deleteOne,uid,logEvent} from './db.js';

const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route=()=>location.hash.slice(1)||'home';
const idle=fn=>('requestIdleCallback' in window?requestIdleCallback(fn,{timeout:700}):setTimeout(fn,80));
let enhanceQueued=false,spotQueued=false,menu=null,undoTimer=null,analyticsRange=30;

function initAmbient(){
  if($('#v51-visual-layer'))return;
  const layer=document.createElement('div');
  layer.id='v51-visual-layer';
  layer.innerHTML='<div class="v51-aurora v51-aurora-a"></div><div class="v51-aurora v51-aurora-b"></div><div class="v51-aurora v51-aurora-c"></div><div class="v51-pointer-light"></div>';
  document.body.prepend(layer);
  if(matchMedia('(pointer:fine)').matches){
    document.addEventListener('pointermove',e=>{
      if(spotQueued)return;spotQueued=true;
      requestAnimationFrame(()=>{spotQueued=false;document.documentElement.style.setProperty('--v51-mx',`${e.clientX}px`);document.documentElement.style.setProperty('--v51-my',`${e.clientY}px`)})
    },{passive:true});
  }
}

function toast(message,{undo}={}){
  const root=$('#toast-root');if(!root)return;
  const el=document.createElement('div');el.className='toast v51-toast';
  el.innerHTML=`<i class="ph-fill ph-check-circle"></i><span>${esc(message)}</span>${undo?'<button class="v51-toast-undo">Undo</button>':''}<b></b>`;
  root.appendChild(el);
  if(undo) $('.v51-toast-undo',el)?.addEventListener('click',async()=>{clearTimeout(undoTimer);await undo();el.remove()},{once:true});
  setTimeout(()=>el.classList.add('leaving'),2600);setTimeout(()=>el.remove(),2920);
  return el;
}

async function updateSidebarCounts(){
  const [links,cols]=await Promise.all([getAll('links'),getAll('collections')]);
  const a=$('#side-links'),b=$('#side-favs'),c=$('#side-cols');if(a)a.textContent=links.length;if(b)b.textContent=links.filter(x=>x.favorite).length;if(c)c.textContent=cols.length;
}

function setButtonState(btn,state,label){
  if(!btn)return;btn.dataset.v51State=state;
  if(label!=null){if(!btn.dataset.v51Original)btn.dataset.v51Original=btn.innerHTML;btn.innerHTML=label}
  if(state==='idle'&&btn.dataset.v51Original){btn.innerHTML=btn.dataset.v51Original;delete btn.dataset.v51Original}
}

function enhanceButtons(root=document){
  $$('button,.primary-btn,.secondary-btn,.icon-btn',root).forEach(btn=>{
    if(btn.dataset.v51Button)return;btn.dataset.v51Button='1';
    btn.addEventListener('pointerdown',()=>btn.classList.add('v51-pressed'),{passive:true});
    const up=()=>btn.classList.remove('v51-pressed');btn.addEventListener('pointerup',up,{passive:true});btn.addEventListener('pointercancel',up,{passive:true});btn.addEventListener('pointerleave',up,{passive:true});
  })
}

function cardActionMarkup(link){
  return `<button class="card-action v51-star ${link.favorite?'active':''}" data-v51-action="favorite" aria-label="Favorite"><i class="${link.favorite?'ph-fill':'ph'} ph-star"></i></button><button class="card-action v51-more" data-v51-action="more" aria-label="More actions"><i class="ph ph-dots-three"></i></button>`
}

async function enhanceCards(){
  const cards=$$('.link-card[data-link-id]');if(!cards.length)return;
  const links=await getAll('links'),map=new Map(links.map(x=>[x.id,x]));
  cards.forEach((card,index)=>{
    const link=map.get(card.dataset.linkId);if(!link)return;
    const menuHost=$('.link-menu',card);if(menuHost&&!menuHost.dataset.v51Actions){
      menuHost.dataset.v51Actions='1';$$('button',menuHost).forEach(b=>b.classList.add('v51-legacy-action'));
      menuHost.insertAdjacentHTML('beforeend',cardActionMarkup(link));
    }
    if(!card.dataset.v51Motion){card.dataset.v51Motion='1';if(index<8){card.style.setProperty('--v51-i',index);card.classList.add('v51-card-enter')}}
    if($('.v12-loading-pill',card))card.classList.add('v51-pending');else card.classList.remove('v51-pending');
    $$('.v12-bg-photo,.v12-brand-img',card).forEach(img=>{
      if(img.dataset.v51Image)return;img.dataset.v51Image='1';
      const ready=()=>img.classList.add('v51-image-ready');img.addEventListener('load',ready,{once:true});if(img.complete&&img.naturalWidth)ready();
    });
  });
}

function closeMenu(){if(menu){menu.classList.add('closing');setTimeout(()=>menu?.remove(),130);menu=null}document.body.classList.remove('v51-menu-open')}

function positionMenu(anchor,panel){
  const r=anchor.getBoundingClientRect(),w=218,h=Math.min(panel.offsetHeight||330,360);let left=Math.min(innerWidth-w-12,Math.max(12,r.right-w));let top=r.bottom+8;if(top+h>innerHeight-12)top=Math.max(12,r.top-h-8);panel.style.left=`${left}px`;panel.style.top=`${top}px`;
}

async function openMenu(anchor,card){
  closeMenu();const id=card.dataset.linkId,link=await getOne('links',id);if(!link)return;
  const panel=document.createElement('div');panel.className='v51-action-menu';panel.dataset.linkId=id;
  panel.innerHTML=`<button data-v51-menu="open"><i class="ph ph-arrow-square-out"></i><span>Open link</span><kbd>↗</kbd></button><button data-v51-menu="edit"><i class="ph ph-pencil-simple"></i><span>Edit</span></button><button data-v51-menu="copy"><i class="ph ph-copy"></i><span>Copy URL</span></button><button data-v51-menu="refresh"><i class="ph ph-arrows-clockwise"></i><span>Refresh metadata</span></button><button data-v51-menu="move"><i class="ph ph-folder-simple"></i><span>Move to collection</span></button><div class="v51-menu-rule"></div><button data-v51-menu="archive"><i class="ph ph-archive"></i><span>Archive snapshot</span></button><button class="danger" data-v51-menu="delete"><i class="ph ph-trash"></i><span>Delete</span></button>`;
  document.body.appendChild(panel);menu=panel;document.body.classList.add('v51-menu-open');positionMenu(anchor,panel);requestAnimationFrame(()=>panel.classList.add('open'));
}

async function toggleFavorite(btn,card){
  const link=await getOne('links',card.dataset.linkId);if(!link)return;
  const next={...link,favorite:!link.favorite,updatedAt:Date.now()};await putOne('links',next);await logEvent('favorite',{id:link.id,value:next.favorite,via:'v51'});
  btn.classList.toggle('active',next.favorite);btn.innerHTML=`<i class="${next.favorite?'ph-fill':'ph'} ph-star"></i>`;btn.classList.remove('v51-pop');void btn.offsetWidth;btn.classList.add('v51-pop');updateSidebarCounts();
  if(route()==='favorites'&&!next.favorite){card.classList.add('v51-remove');setTimeout(()=>card.remove(),220)}
}

async function movePicker(card,anchor){
  const [link,cols]=await Promise.all([getOne('links',card.dataset.linkId),getAll('collections')]);if(!link)return;
  closeMenu();const panel=document.createElement('div');panel.className='v51-action-menu v51-collection-menu';panel.dataset.linkId=link.id;
  panel.innerHTML=`<div class="v51-menu-head"><b>Move to collection</b><small>${esc(link.title||link.domain||'Link')}</small></div>${cols.map(c=>`<button data-v51-collection="${esc(c.id)}" class="${c.id===link.collectionId?'selected':''}"><i class="ph ph-${esc(c.icon||'folder')}"></i><span>${esc(c.name)}</span>${c.id===link.collectionId?'<i class="ph-fill ph-check-circle"></i>':''}</button>`).join('')}`;
  document.body.appendChild(panel);menu=panel;positionMenu(anchor,panel);requestAnimationFrame(()=>panel.classList.add('open'));
}

async function archiveSnapshot(card){
  const link=await getOne('links',card.dataset.linkId);if(!link)return;
  await putOne('archives',{id:uid('arc'),linkId:link.id,title:link.title,url:link.url,description:link.description||link.summary||'',imageUrl:link.imageUrl||link.heroImageUrl||link.featureImageUrl||'',capturedAt:Date.now(),source:'v51-manual'});
  await logEvent('archive',{id:link.id,via:'v51'});toast('Archived snapshot');closeMenu();
}

async function deleteCard(card,button){
  if(button.dataset.confirm!=='1'){
    button.dataset.confirm='1';button.classList.add('armed');button.innerHTML='<i class="ph ph-warning-circle"></i><span>Click again to delete</span>';setTimeout(()=>{if(button?.isConnected){button.dataset.confirm='0';button.classList.remove('armed');button.innerHTML='<i class="ph ph-trash"></i><span>Delete</span>'}},2200);return;
  }
  const link=await getOne('links',card.dataset.linkId);if(!link)return;
  await deleteOne('links',link.id);await logEvent('delete',{id:link.id,via:'v51'});closeMenu();card.classList.add('v51-remove');setTimeout(()=>card.remove(),230);updateSidebarCounts();
  toast('Link deleted',{undo:async()=>{await putOne('links',link);await logEvent('undo_delete',{id:link.id,via:'v51'});window.dispatchEvent(new HashChangeEvent('hashchange'));toast('Link restored')}});
}

async function handleMenuAction(button){
  const panel=button.closest('.v51-action-menu'),id=panel?.dataset.linkId,card=id?$(`.link-card[data-link-id="${CSS.escape(id)}"]`):null,link=id?await getOne('links',id):null;if(!link)return;
  const action=button.dataset.v51Menu;
  if(action==='open'){window.open(link.url,'_blank','noopener,noreferrer');await logEvent('open',{id,via:'v51-menu'});closeMenu()}
  else if(action==='copy'){try{await navigator.clipboard.writeText(link.url);toast('URL copied')}catch{toast('Copy failed')}closeMenu()}
  else if(action==='edit'){closeMenu();$('.v51-legacy-action[data-action="edit"]',card)?.click()}
  else if(action==='refresh'){closeMenu();const legacy=$('.v51-legacy-action[data-refresh-metadata]',card);if(legacy){setButtonState(legacy,'loading');legacy.click()}}
  else if(action==='move'){movePicker(card,button)}
  else if(action==='archive'){archiveSnapshot(card)}
  else if(action==='delete'){deleteCard(card,button)}
}

async function chooseCollection(button){
  const panel=button.closest('.v51-collection-menu'),id=panel?.dataset.linkId,link=id?await getOne('links',id):null;if(!link)return;
  const next={...link,collectionId:button.dataset.v51Collection,updatedAt:Date.now()};await putOne('links',next);await logEvent('move_collection',{id,collectionId:next.collectionId,via:'v51'});closeMenu();toast('Moved to collection');window.dispatchEvent(new Event('smartlink:data-updated'));
}

function daysAgoKey(ts){const d=new Date(ts),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function daySeries(events,days,type){
  const out=[];for(let i=days-1;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=daysAgoKey(d),count=events.filter(e=>e.type===type&&daysAgoKey(e.at)===key).length;out.push({label:d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),value:count})}return out;
}
function points(values,w=620,h=164,p=16){const max=Math.max(1,...values),step=(w-p*2)/Math.max(1,values.length-1);return values.map((v,i)=>[p+i*step,h-p-(v/max)*(h-p*2)])}
function linePath(values,w=620,h=164,p=16){const pts=points(values,w,h,p);return pts.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ')}
function areaPath(values,w=620,h=164,p=16){const pts=points(values,w,h,p);if(!pts.length)return '';return `${linePath(values,w,h,p)} L${pts.at(-1)[0].toFixed(1)},${h-p} L${pts[0][0].toFixed(1)},${h-p} Z`}
function spark(values,w=112,h=34){const path=linePath(values,w,h,3);return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="v51-spark" d="${path}"/></svg>`}
function countBy(rows,keyFn){const m=new Map();for(const r of rows){const k=keyFn(r)||'Other';m.set(k,(m.get(k)||0)+1)}return [...m.entries()].sort((a,b)=>b[1]-a[1])}
function donutSegments(items,total){
  let offset=0;return items.map(([name,value],i)=>{const pct=total?value/total:0,len=pct*100,seg=`<circle class="v51-donut-seg seg-${i}" cx="70" cy="70" r="52" pathLength="100" stroke-dasharray="${len} ${100-len}" stroke-dashoffset="${-offset}"/>`;offset+=len;return seg}).join('');
}
function metricCard(label,value,meta,icon,values=[]){return `<div class="v51-metric-card"><div class="v51-metric-top"><span>${esc(label)}</span><i class="ph ph-${icon}"></i></div><div class="v51-metric-value" data-v51-count="${Number(value)||0}">0</div><div class="v51-metric-bottom"><small>${esc(meta)}</small>${values.length?spark(values):''}</div></div>`}
function animateCounts(root){$$('[data-v51-count]',root).forEach(el=>{const to=Number(el.dataset.v51Count)||0,start=performance.now(),dur=480;const tick=t=>{const q=Math.min(1,(t-start)/dur),e=1-Math.pow(1-q,3);el.textContent=Math.round(to*e).toLocaleString();if(q<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)})}

async function renderAnalytics(){
  if(route()!=='analytics')return;
  const shell=$('#dynamic-content .page-shell');if(!shell)return;
  const key=`${analyticsRange}:${shell.dataset.v51AnalyticsSeed||''}`;let dash=$('#v51-analytics-dashboard',shell);
  const [links,events,cols]=await Promise.all([getAll('links'),getAll('events'),getAll('collections')]);
  const since=Date.now()-analyticsRange*86400000,recent=events.filter(e=>(e.at||0)>=since),saved=recent.filter(e=>e.type==='save').length,opened=recent.filter(e=>e.type==='open').length,favs=links.filter(x=>x.favorite).length,broken=links.filter(x=>x.health?.state==='broken').length;
  const displayDays=analyticsRange<=7?7:analyticsRange<=30?14:30,saves=daySeries(events,displayDays,'save'),opens=daySeries(events,displayDays,'open'),vals=saves.map(x=>x.value),openVals=opens.map(x=>x.value),w=620,h=164;
  const categories=countBy(links,x=>x.category||'General').slice(0,5),catTotal=Math.max(1,categories.reduce((s,x)=>s+x[1],0));
  const healthy=links.filter(x=>x.health?.state==='ok').length,healthPct=links.length?Math.round(healthy/links.length*100):0;
  const byCollection=countBy(links,x=>cols.find(c=>c.id===x.collectionId)?.name||'Unsorted').slice(0,5),maxCol=Math.max(1,...byCollection.map(x=>x[1]));
  const openIds=new Map();for(const e of events){if(e.type!=='open')continue;const id=e.detail?.id;if(id)openIds.set(id,(openIds.get(id)||0)+1)}
  const topOpened=[...openIds.entries()].map(([id,count])=>[links.find(x=>x.id===id)?.title||links.find(x=>x.id===id)?.domain||'Unknown',count]).sort((a,b)=>b[1]-a[1]).slice(0,5),maxOpen=Math.max(1,...topOpened.map(x=>x[1]));
  if(!dash){dash=document.createElement('section');dash.id='v51-analytics-dashboard';const hero=$('.page-hero',shell);if(hero)hero.insertAdjacentElement('afterend',dash);else shell.prepend(dash)}
  dash.dataset.key=key;
  dash.innerHTML=`<div class="v51-dashboard-head"><div><span>Live library telemetry</span><h3>Analytics overview</h3></div><div class="v51-range">${[7,30,90].map(n=>`<button data-v51-range="${n}" class="${analyticsRange===n?'active':''}">${n}D</button>`).join('')}</div></div><div class="v51-metric-grid">${metricCard('Total links',links.length,`${saved} saved in range`,'link',vals.slice(-7))}${metricCard('Opened',opened,'Tracked opens','cursor-click',openVals.slice(-7))}${metricCard('Favorites',favs,'Pinned links','star',vals.slice(-7))}${metricCard('Broken',broken,'Needs attention','heartbeat',openVals.slice(-7))}</div><div class="v51-analytics-grid"><article class="v51-chart-card v51-wide"><header><div><small>ACTIVITY</small><h4>Save activity</h4></div><span>${saved} saves · ${analyticsRange} days</span></header><div class="v51-line-chart"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="v51Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-opacity=".32"/><stop offset="100%" stop-opacity="0"/></linearGradient></defs><path class="v51-area" d="${areaPath(vals,w,h)}"/><path class="v51-line" d="${linePath(vals,w,h)}" pathLength="1"/>${points(vals,w,h).map((p,i)=>`<circle class="v51-dot" cx="${p[0]}" cy="${p[1]}" r="3" data-tip="${esc(saves[i].label)} · ${vals[i]} saved"/>`).join('')}</svg><div class="v51-axis-labels"><span>${esc(saves[0]?.label||'')}</span><span>${esc(saves.at(-1)?.label||'')}</span></div></div></article><article class="v51-chart-card"><header><div><small>CATEGORIES</small><h4>Distribution</h4></div></header><div class="v51-donut-wrap"><svg class="v51-donut" viewBox="0 0 140 140"><circle class="v51-donut-track" cx="70" cy="70" r="52"/>${donutSegments(categories,catTotal)}</svg><div class="v51-donut-center"><b>${links.length}</b><small>Links</small></div></div><div class="v51-legend">${categories.map(([n,v],i)=>`<div><i class="seg-${i}"></i><span>${esc(n)}</span><b>${Math.round(v/catTotal*100)}%</b></div>`).join('')}</div></article><article class="v51-chart-card"><header><div><small>HEALTH</small><h4>Link health</h4></div><button data-v51-go-health>View</button></header><div class="v51-health"><svg viewBox="0 0 120 120"><circle class="v51-health-track" cx="60" cy="60" r="46"/><circle class="v51-health-value" cx="60" cy="60" r="46" pathLength="100" stroke-dasharray="${healthPct} ${100-healthPct}"/></svg><div><b>${healthPct}%</b><small>Healthy</small></div></div><div class="v51-health-list"><span><i class="ok"></i>Healthy <b>${healthy}</b></span><span><i class="bad"></i>Broken <b>${broken}</b></span><span><i class="unknown"></i>Other <b>${Math.max(0,links.length-healthy-broken)}</b></span></div></article><article class="v51-chart-card"><header><div><small>COLLECTIONS</small><h4>Top collections</h4></div></header><div class="v51-bars">${byCollection.map(([n,v])=>`<div><span>${esc(n)}</span><b>${v}</b><i><em style="--p:${v/maxCol}"></em></i></div>`).join('')||'<p class="v51-empty-mini">No collection data yet</p>'}</div></article><article class="v51-chart-card"><header><div><small>POPULAR</small><h4>Most opened</h4></div></header><div class="v51-bars">${topOpened.map(([n,v],i)=>`<div><span>${i+1}. ${esc(n)}</span><b>${v}</b><i><em style="--p:${v/maxOpen}"></em></i></div>`).join('')||'<p class="v51-empty-mini">Open links to build activity ranking</p>'}</div></article></div><div id="v51-chart-tip" class="v51-chart-tip"></div>`;
  animateCounts(dash);
  requestAnimationFrame(()=>dash.classList.add('ready'));
  $$('.v51-dot',dash).forEach(dot=>{dot.addEventListener('pointerenter',e=>showChartTip(e,dot.dataset.tip));dot.addEventListener('pointermove',e=>showChartTip(e,dot.dataset.tip));dot.addEventListener('pointerleave',hideChartTip)});
}
function showChartTip(e,text){const t=$('#v51-chart-tip');if(!t)return;t.textContent=text;t.style.left=`${Math.min(innerWidth-170,e.clientX+12)}px`;t.style.top=`${Math.max(12,e.clientY-42)}px`;t.classList.add('show')}
function hideChartTip(){$('#v51-chart-tip')?.classList.remove('show')}

function pageMotion(){
  const shell=$('#dynamic-content .page-shell');if(shell&&!shell.dataset.v51Page){shell.dataset.v51Page='1';shell.classList.add('v51-page-enter')}
  document.body.dataset.v51Route=route();
}

function enhance(){
  enhanceQueued=false;pageMotion();enhanceButtons($('#dynamic-content')||document);enhanceCards();if(route()==='analytics')idle(renderAnalytics);
}
function scheduleEnhance(){if(enhanceQueued)return;enhanceQueued=true;requestAnimationFrame(()=>setTimeout(enhance,18))}

function bindGlobal(){
  document.addEventListener('click',async e=>{
    const a=e.target.closest?.('[data-v51-action]');if(a){e.preventDefault();e.stopPropagation();const card=a.closest('.link-card');if(!card)return;if(a.dataset.v51Action==='favorite')await toggleFavorite(a,card);else if(a.dataset.v51Action==='more')await openMenu(a,card);return}
    const m=e.target.closest?.('[data-v51-menu]');if(m){e.preventDefault();e.stopPropagation();await handleMenuAction(m);return}
    const c=e.target.closest?.('[data-v51-collection]');if(c){e.preventDefault();e.stopPropagation();await chooseCollection(c);return}
    const r=e.target.closest?.('[data-v51-range]');if(r){analyticsRange=Number(r.dataset.v51Range)||30;renderAnalytics();return}
    if(e.target.closest?.('[data-v51-go-health]')){location.hash='health';return}
    if(menu&&!e.target.closest('.v51-action-menu'))closeMenu();
  },true);
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();const q=$('#global-search');q?.focus();q?.select();return}if(e.key==='Escape')closeMenu()},true);
  addEventListener('resize',closeMenu,{passive:true});addEventListener('scroll',()=>menu&&closeMenu(),{passive:true,capture:true});
  addEventListener('hashchange',()=>{closeMenu();scheduleEnhance()});
}
function observe(){const root=$('#dynamic-content');if(!root)return setTimeout(observe,100);new MutationObserver(scheduleEnhance).observe(root,{childList:true,subtree:true});scheduleEnhance()}

initAmbient();enhanceButtons(document);bindGlobal();observe();
