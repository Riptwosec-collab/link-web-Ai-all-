/* Smart Link Hub V7.10 — authoritative navigation + simplified daily UI. */
(function(){
  'use strict';

  const PRIMARY=[
    ['home','house','Home'],
    ['library','squares-four','Library'],
    ['ai','brain','AI Search'],
    ['categories','tree-structure','Categories'],
    ['favorites','star','Favorites'],
    ['read-later','book-open-text','Read Later'],
    ['settings','gear-six','Settings']
  ];
  const LEGACY={home:'home',library:'search',favorites:'favorites',settings:'settings'};
  let observer=null,scheduled=false,pendingRoute='';

  function installStyle(){
    if(document.getElementById('slh-v710-nav-style'))return;
    const style=document.createElement('style');
    style.id='slh-v710-nav-style';
    style.textContent=`
      #v7-home-intel,.v7-home-intel{display:none!important}
      #sidebar-nav.slh-v710-nav> :not(.slh-v710-label):not(.slh-v710-item){display:none!important}
      #sidebar-nav.slh-v710-nav>.slh-v710-label{display:block!important;margin-top:8px}
      #sidebar-nav.slh-v710-nav>.slh-v710-item{display:flex!important}
      .slh-library-views{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px;padding:10px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:16px;background:var(--panel,rgba(7,10,15,.92));backdrop-filter:blur(18px)}
      .slh-library-views button{border:1px solid var(--border,rgba(255,255,255,.09));border-radius:999px;padding:7px 11px;background:rgba(255,255,255,.035);color:var(--muted,#8b919c);font-size:10px;font-weight:600;transition:.18s ease}
      .slh-library-views button:hover,.slh-library-views button.active{color:var(--text,#fff);border-color:rgba(var(--accent-rgb,245,197,66),.38);background:rgba(var(--accent-rgb,245,197,66),.1)}
      .slh-settings-tools{margin-top:18px;border:1px solid var(--border,rgba(255,255,255,.09));border-radius:20px;background:var(--panel,rgba(7,10,15,.92));padding:18px}
      .slh-settings-tools>header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
      .slh-settings-tools>header span{display:block;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent,#f5c542);margin-bottom:5px}.slh-settings-tools>header b{font-size:14px;color:var(--text,#fff)}.slh-settings-tools>header p{font-size:10px;color:var(--muted,#8b919c);margin-top:4px;max-width:650px}
      .slh-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.slh-settings-group{border:1px solid var(--border,rgba(255,255,255,.08));border-radius:16px;padding:13px;background:rgba(255,255,255,.02)}
      .slh-settings-group h4{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--muted,#8b919c);margin-bottom:8px}.slh-tool-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.slh-tool-list button{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;background:rgba(255,255,255,.025);color:var(--text,#fff);padding:9px 10px;font-size:10px}.slh-tool-list button:hover{border-color:rgba(var(--accent-rgb,245,197,66),.38);background:rgba(var(--accent-rgb,245,197,66),.08)}
      .slh-category-collections{margin-left:8px}
      @media(max-width:760px){.slh-settings-grid{grid-template-columns:1fr}.slh-tool-list{grid-template-columns:1fr}.slh-library-views{overflow-x:auto;flex-wrap:nowrap}.slh-library-views button{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function iconClass(key,icon){return key==='home'?'ph-fill':'ph'}
  function buildNav(){
    const nav=document.getElementById('sidebar-nav');
    if(!nav)return;
    installStyle();
    nav.classList.add('slh-v710-nav');
    let label=nav.querySelector(':scope>.slh-v710-label');
    if(!label){label=document.createElement('div');label.className='nav-label slh-v710-label';label.textContent='MAIN';nav.appendChild(label)}
    const existing=new Map([...nav.querySelectorAll(':scope>.slh-v710-item')].map(x=>[x.dataset.slhRoute,x]));
    for(const [key,icon,text] of PRIMARY){
      let b=existing.get(key);
      if(!b){b=document.createElement('button');b.type='button';b.className='nav-item slh-primary-nav-item slh-v710-item';b.dataset.slhRoute=key;b.innerHTML=`<i class="${iconClass(key,icon)} ph-${icon}"></i><span>${text}</span>`}
      if(!b.isConnected)nav.appendChild(b);
      existing.delete(key)
    }
    existing.forEach(x=>x.remove());
    const order=[label,...PRIMARY.map(([key])=>nav.querySelector(`:scope>[data-slh-route="${key}"]`)).filter(Boolean)];
    order.forEach(x=>nav.appendChild(x));
    syncActive();
  }

  function setActive(key){
    document.querySelectorAll('#sidebar-nav>.slh-v710-item').forEach(x=>x.classList.toggle('active',x.dataset.slhRoute===key));
    document.getElementById('sidebar')?.classList.remove('open');
  }

  function routeFromLocation(){
    if(location.hash==='#home')return 'home';
    if(location.hash==='#search')return 'library';
    if(location.hash==='#favorites')return 'favorites';
    if(location.hash==='#settings')return 'settings';
    if(location.hash==='#v7-semantic'||new URLSearchParams(location.search).get('v7')==='semantic')return 'ai';
    if(location.hash==='#v6-read-later'||new URLSearchParams(location.search).get('v6')==='read-later')return 'read-later';
    if(location.hash==='#v76-organization'||new URLSearchParams(location.search).get('v76')==='organization')return 'categories';
    const title=document.getElementById('page-title')?.textContent?.trim();
    if(title==='Semantic AI')return 'ai';if(title==='Category Center')return 'categories';if(title==='Read Later')return 'read-later';if(title==='Favorites')return 'favorites';if(title==='Settings')return 'settings';if(title==='Search')return 'library';
    return 'home'
  }
  function syncActive(){setActive(routeFromLocation())}

  function waitFor(test,tries=60,delay=70){
    return new Promise(resolve=>{let n=0;const tick=()=>{let value=null;try{value=test()}catch{}if(value||n++>=tries)return resolve(value||null);setTimeout(tick,delay)};tick()})
  }

  async function openLegacy(page,key){
    pendingRoute='';setActive(key);
    history.replaceState(null,'',`${location.pathname}#${page}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const b=await waitFor(()=>document.querySelector(`#sidebar-nav [data-page="${page}"]`),12,50);
    if(b){try{b.click()}catch{}}
    setTimeout(()=>setActive(key),80)
  }

  async function openV7(page,key){
    pendingRoute=key;setActive(key);
    const fn=await waitFor(()=>typeof window.SmartLinkV7?.route==='function'&&window.SmartLinkV7.route,55,70);
    if(fn){pendingRoute='';fn(page);setTimeout(()=>setActive(key),30);return true}
    window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page}}));
    return false
  }

  async function openCategories(){
    pendingRoute='categories';setActive('categories');
    const fn=await waitFor(()=>typeof window.SmartLinkV76?.renderOrganization==='function'&&window.SmartLinkV76.renderOrganization,55,70);
    if(fn){pendingRoute='';history.replaceState(null,'',`${location.pathname}?v76=organization#v76-organization`);await fn();setTimeout(()=>setActive('categories'),30);return true}
    window.dispatchEvent(new CustomEvent('smartlink:v76-open',{detail:{page:'organization'}}));
    return false
  }

  async function openV6(page,key){
    pendingRoute=key;setActive(key);
    const direct=await waitFor(()=>typeof window.SmartLinkV6?.openPage==='function'&&window.SmartLinkV6.openPage,10,50);
    if(direct){pendingRoute='';direct(page);setTimeout(()=>setActive(key),30);return true}
    const btn=await waitFor(()=>document.querySelector(`#v6-nav-marker [data-v6-page="${page}"]`),60,70);
    if(btn){pendingRoute='';btn.click();setTimeout(()=>setActive(key),30);return true}
    return false
  }

  async function route(key){
    if(!PRIMARY.some(x=>x[0]===key))return false;
    if(LEGACY[key]){await openLegacy(LEGACY[key],key);return true}
    if(key==='ai')return openV7('semantic','ai');
    if(key==='categories')return openCategories();
    if(key==='read-later')return openV6('read-later','read-later');
    return false
  }

  function bindNavigation(){
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('#sidebar-nav>[data-slh-route]');if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();route(b.dataset.slhRoute)
    },true);
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('#v7-mobile-nav [data-v7-mobile]');if(!b)return;
      const map={home:'home',library:'library',ai:'ai',categories:'categories',more:'categories'};
      const key=map[b.dataset.v7Mobile];
      if(b.dataset.v7Mobile==='add'){e.preventDefault();e.stopImmediatePropagation();document.getElementById('add-link-btn')?.click();return}
      if(!key)return;
      e.preventDefault();e.stopImmediatePropagation();route(key)
    },true)
  }

  function adaptMobile(){
    const b=document.querySelector('#v7-mobile-nav [data-v7-mobile="more"]');
    if(b){b.dataset.v7Mobile='categories';b.innerHTML='<i class="ph ph-tree-structure"></i><span>Categories</span>'}
  }

  function useSmart(id,query=''){
    route('library').then(()=>setTimeout(()=>{const input=document.getElementById('search-input');if(!input)return;input.dataset.v76Smart=id||'';input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}))},120))
  }
  function injectLibraryViews(){
    const root=document.getElementById('dynamic-content'),input=document.getElementById('search-input');if(!root||!input||document.getElementById('slh-library-views'))return;
    const bar=document.createElement('div');bar.id='slh-library-views';bar.className='slh-library-views';bar.innerHTML='<button data-smart="" class="active">All</button><button data-smart="week">Recent</button><button data-query="is:favorite">Favorites</button><button data-smart="read">Read Later</button><button data-smart="never">Never Opened</button><button data-smart="needs">Needs Category</button><button data-smart="broken">Broken</button>';
    root.prepend(bar);bar.onclick=e=>{const b=e.target.closest('button');if(!b)return;bar.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');input.dataset.v76Smart=b.dataset.smart||'';input.value=b.dataset.query||'';input.dispatchEvent(new Event('input',{bubbles:true}))}
  }

  async function clickTool(tool){
    const v7={duplicates:'duplicates',archive:'archive',import:'import',status:'status',maintenance:'librarian'};
    if(v7[tool]){await openV7(v7[tool],routeFromLocation());return}
    if(tool==='categories'){await route('categories');return}if(tool==='ai'){await route('ai');return}
    if(tool==='cloud'||tool==='trash'){await openV6(tool,routeFromLocation());return}
    const legacy={health:'health',export:'import-export',collections:'collections'}[tool];if(legacy){await openLegacy(legacy,routeFromLocation())}
  }

  function injectSettingsTools(){
    const root=document.getElementById('dynamic-content'),title=document.getElementById('page-title')?.textContent?.trim();if(!root||title!=='Settings'||document.getElementById('slh-settings-tools'))return;
    const box=document.createElement('section');box.id='slh-settings-tools';box.className='slh-settings-tools';box.innerHTML=`<header><div><span>Advanced tools</span><b>Power features without sidebar clutter</b><p>Daily navigation stays simple. Maintenance, backup, import and diagnostics remain available here while automation continues in the background.</p></div></header><div class="slh-settings-grid"><div class="slh-settings-group"><h4>Library</h4><div class="slh-tool-list"><button data-tool="categories"><i class="ph ph-tree-structure"></i>Categories</button><button data-tool="collections"><i class="ph ph-folders"></i>Collections</button><button data-tool="duplicates"><i class="ph ph-copy"></i>Duplicate Review</button><button data-tool="archive"><i class="ph ph-archive"></i>Archive</button><button data-tool="health"><i class="ph ph-heartbeat"></i>Link Health</button><button data-tool="trash"><i class="ph ph-trash"></i>Trash</button></div></div><div class="slh-settings-group"><h4>AI & Automation</h4><div class="slh-tool-list"><button data-tool="ai"><i class="ph ph-brain"></i>AI Search</button><button data-tool="maintenance"><i class="ph ph-sparkle"></i>Run Maintenance</button></div></div><div class="slh-settings-group"><h4>Cloud & Data</h4><div class="slh-tool-list"><button data-tool="cloud"><i class="ph ph-cloud-check"></i>Cloud & Backup</button><button data-tool="import"><i class="ph ph-upload-simple"></i>Import Wizard</button><button data-tool="export"><i class="ph ph-arrows-down-up"></i>Import / Export</button></div></div><div class="slh-settings-group"><h4>Advanced</h4><div class="slh-tool-list"><button data-tool="status"><i class="ph ph-pulse"></i>System Status & Diagnostics</button></div></div></div>`;
    (root.querySelector('.page-shell')||root).appendChild(box);box.onclick=e=>{const b=e.target.closest('[data-tool]');if(b)clickTool(b.dataset.tool)}
  }

  function injectCollectionsIntoCategories(){
    const root=document.getElementById('dynamic-content'),title=document.getElementById('page-title')?.textContent?.trim();if(!root||title!=='Category Center'||document.getElementById('slh-category-collections'))return;
    const actions=root.querySelector('.v76-hero .v7-actions');if(!actions)return;const b=document.createElement('button');b.id='slh-category-collections';b.className='v7-btn slh-category-collections';b.innerHTML='<i class="ph ph-folders"></i> Collections';b.onclick=()=>clickTool('collections');actions.prepend(b)
  }

  function suppressIntel(){document.querySelectorAll('#v7-home-intel,.v7-home-intel').forEach(x=>{x.setAttribute('aria-hidden','true');x.style.setProperty('display','none','important')})}
  function applyCloudUi(){document.querySelectorAll('#cloud-pull,#cloud-push').forEach(el=>el.remove());const save=document.getElementById('save-cloud-config');if(!save)return;const card=save.closest('.holo-card');if(card&&!card.dataset.slhAutoCloud){card.dataset.slhAutoCloud='1';card.innerHTML='<div class="flex items-center justify-between gap-4"><div><h3 class="text-white text-sm font-semibold">Auto Cloud Sync</h3><p class="text-[10px] text-slate-500 mt-1 leading-5">บันทึกในเครื่องก่อน แล้วซิงก์ขึ้น Cloud อัตโนมัติ หากออฟไลน์ระบบจะส่งต่อเมื่อออนไลน์</p></div><span class="status-pill cloud"><span></span>Always on</span></div>'}}

  function drainPending(){const key=pendingRoute;if(key)setTimeout(()=>route(key),0)}
  function apply(){buildNav();adaptMobile();injectLibraryViews();injectSettingsTools();injectCollectionsIntoCategories();suppressIntel();applyCloudUi();syncActive()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
  function start(){installStyle();bindNavigation();apply();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});setTimeout(apply,200);setTimeout(apply,700);setTimeout(apply,1500)}

  ['smartlink:v7-ready','smartlink:v76-organized','smartlink:cloud-restored'].forEach(name=>window.addEventListener(name,()=>{schedule();drainPending()}));
  window.addEventListener('hashchange',schedule);
  window.addEventListener('popstate',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.SmartLinkNavigation={route,refresh:schedule,primary:PRIMARY.map(x=>x[0])};
})();
