/* Smart Link Hub V7.8 — simplified daily navigation + Auto Cloud UI. */
(function(){
  'use strict';
  const PRIMARY=['home','library','ai','categories','favorites','read-later','settings'];
  let navBound=false,observer=null,scheduled=false;

  function installStyle(){
    if(document.getElementById('slh-v78-clean-style'))return;
    const style=document.createElement('style');
    style.id='slh-v78-clean-style';
    style.textContent=`
      #v7-home-intel,.v7-home-intel{display:none!important}
      #sidebar-nav.slh-clean-nav> :not([data-slh-primary]){display:none!important}
      #sidebar-nav.slh-clean-nav .nav-item:not(.slh-primary-nav-item){display:none!important}
      #sidebar-nav.slh-clean-nav>.slh-primary-nav-item{display:flex!important}
      #sidebar-nav.slh-clean-nav>.nav-label[data-slh-primary]{display:block!important;margin-top:8px}
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

  function markPrimary(button,key){
    if(!button)return button;button.dataset.slhPrimary='1';button.dataset.slhKey=key;button.classList.add('slh-primary-nav-item');return button;
  }
  function makeAction(action,icon,label){
    let b=document.querySelector(`#sidebar-nav>[data-slh-action="${action}"]`);
    if(!b){b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.slhAction=action;b.innerHTML=`<i class="ph ph-${icon}"></i><span>${label}</span>`}
    return markPrimary(b,action);
  }
  function legacy(page){return document.querySelector(`#sidebar-nav>[data-page="${page}"]`)}
  function target(selector,tries=22){return new Promise(resolve=>{const tick=()=>{const el=selector&&document.querySelector(selector);if(el||tries--<=0)return resolve(el||null);setTimeout(tick,90)};tick()})}
  function invokeV7(page,tries=20){
    const run=()=>{if(typeof window.SmartLinkV7?.route==='function'){window.SmartLinkV7.route(page);return true}return false};
    if(run()){setTimeout(run,120);setTimeout(run,360);return}
    let n=0;const timer=setInterval(()=>{n++;if(run()||n>=tries)clearInterval(timer)},60);
  }
  async function openAction(action){
    if(action==='ai')invokeV7('semantic');
    else if(action==='categories'){
      const run=()=>{const b=document.querySelector('[data-v76-page="organization"]');if(b){b.click();return true}if(typeof window.SmartLinkV76?.renderOrganization==='function'){window.SmartLinkV76.renderOrganization();return true}return false};
      if(!run()){let n=0,t=setInterval(()=>{n++;if(run()||n>20)clearInterval(t)},70)}
    }else if(action==='read-later'){
      const b=await target('[data-v6-page="read-later"]');if(b)b.click();
    }
    setPrimaryActive(action);
  }
  function setPrimaryActive(key){
    document.querySelectorAll('#sidebar-nav>.slh-primary-nav-item').forEach(x=>x.classList.remove('active'));
    const byAction=document.querySelector(`#sidebar-nav>[data-slh-action="${key}"]`),byKey=document.querySelector(`#sidebar-nav>[data-slh-key="${key}"]`);(byAction||byKey)?.classList.add('active');
  }
  function cleanNav(){
    const nav=document.getElementById('sidebar-nav');if(!nav)return;installStyle();
    nav.querySelectorAll('[data-slh-primary]').forEach(x=>x.removeAttribute('data-slh-primary'));
    nav.querySelectorAll('.slh-primary-nav-item').forEach(x=>x.classList.remove('slh-primary-nav-item'));
    const home=legacy('home'),library=legacy('search'),favorites=legacy('favorites'),settings=legacy('settings');if(!home||!library||!favorites||!settings)return;
    markPrimary(home,'home');markPrimary(library,'library');markPrimary(favorites,'favorites');markPrimary(settings,'settings');
    let label=document.getElementById('slh-main-label');if(!label){label=document.createElement('div');label.id='slh-main-label';label.className='nav-label';label.textContent='MAIN'}label.dataset.slhPrimary='1';
    const ai=makeAction('ai','brain','AI Search'),categories=makeAction('categories','tree-structure','Categories'),read=makeAction('read-later','book-open-text','Read Later');
    nav.append(label,home,library,ai,categories,favorites,read,settings);nav.classList.add('slh-clean-nav');
    if(!navBound){navBound=true;nav.addEventListener('click',e=>{const b=e.target.closest('[data-slh-action]');if(!b)return;e.preventDefault();e.stopPropagation();openAction(b.dataset.slhAction)},true)}
  }

  function useSmart(id,query=''){const input=document.getElementById('search-input');if(!input)return;input.dataset.v76Smart=id||'';input.value=query;input.dispatchEvent(new Event('input',{bubbles:true}))}
  function injectLibraryViews(){
    const root=document.getElementById('dynamic-content'),input=document.getElementById('search-input');if(!root||!input||document.getElementById('slh-library-views'))return;
    const bar=document.createElement('div');bar.id='slh-library-views';bar.className='slh-library-views';bar.innerHTML=`<button data-smart="" class="active">All</button><button data-smart="week">Recent</button><button data-query="is:favorite">Favorites</button><button data-smart="read">Read Later</button><button data-smart="never">Never Opened</button><button data-smart="needs">Needs Category</button><button data-smart="broken">Broken</button>`;
    root.prepend(bar);bar.onclick=e=>{const b=e.target.closest('button');if(!b)return;bar.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');useSmart(b.dataset.smart||'',b.dataset.query||'')};
  }

  function clickTool(tool){
    const v7={duplicates:'duplicates',archive:'archive',import:'import',status:'status',maintenance:'librarian'};
    if(v7[tool]){invokeV7(v7[tool]);return}if(tool==='categories'){openAction('categories');return}if(tool==='ai'){openAction('ai');return}
    const selectors={cloud:'[data-v6-page="cloud"]',trash:'[data-v6-page="trash"]',health:'[data-page="health"]',export:'[data-page="import-export"]',collections:'[data-page="collections"]'};target(selectors[tool]||'',12).then(b=>b?.click());
  }
  function injectSettingsTools(){
    const root=document.getElementById('dynamic-content'),title=document.getElementById('page-title')?.textContent?.trim();if(!root||title!=='Settings'||document.getElementById('slh-settings-tools'))return;
    const box=document.createElement('section');box.id='slh-settings-tools';box.className='slh-settings-tools';box.innerHTML=`<header><div><span>Advanced tools</span><b>Power features without sidebar clutter</b><p>Daily navigation stays simple. Maintenance, backup, import and diagnostics remain available here while automation continues in the background.</p></div></header><div class="slh-settings-grid"><div class="slh-settings-group"><h4>Library</h4><div class="slh-tool-list"><button data-tool="categories"><i class="ph ph-tree-structure"></i>Categories</button><button data-tool="collections"><i class="ph ph-folders"></i>Collections</button><button data-tool="duplicates"><i class="ph ph-copy"></i>Duplicate Review</button><button data-tool="archive"><i class="ph ph-archive"></i>Archive</button><button data-tool="health"><i class="ph ph-heartbeat"></i>Link Health</button><button data-tool="trash"><i class="ph ph-trash"></i>Trash</button></div></div><div class="slh-settings-group"><h4>AI & Automation</h4><div class="slh-tool-list"><button data-tool="ai"><i class="ph ph-brain"></i>AI Search</button><button data-tool="maintenance"><i class="ph ph-sparkle"></i>Run Maintenance</button></div></div><div class="slh-settings-group"><h4>Cloud & Data</h4><div class="slh-tool-list"><button data-tool="cloud"><i class="ph ph-cloud-check"></i>Cloud & Backup</button><button data-tool="import"><i class="ph ph-upload-simple"></i>Import Wizard</button><button data-tool="export"><i class="ph ph-arrows-down-up"></i>Import / Export</button></div></div><div class="slh-settings-group"><h4>Advanced</h4><div class="slh-tool-list"><button data-tool="status"><i class="ph ph-pulse"></i>System Status & Diagnostics</button></div></div></div>`;
    (root.querySelector('.page-shell')||root).appendChild(box);box.onclick=e=>{const b=e.target.closest('[data-tool]');if(b)clickTool(b.dataset.tool)};
  }
  function injectCollectionsIntoCategories(){
    const root=document.getElementById('dynamic-content'),title=document.getElementById('page-title')?.textContent?.trim();if(!root||title!=='Category Center'||document.getElementById('slh-category-collections'))return;
    const actions=root.querySelector('.v76-hero .v7-actions');if(!actions)return;const b=document.createElement('button');b.id='slh-category-collections';b.className='v7-btn slh-category-collections';b.innerHTML='<i class="ph ph-folders"></i> Collections';b.onclick=()=>clickTool('collections');actions.prepend(b);
  }
  function adaptMobile(){const b=document.querySelector('#v7-mobile-nav [data-v7-mobile="more"]');if(!b||b.dataset.slhAdapted)return;b.dataset.slhAdapted='1';b.dataset.v7Mobile='categories';b.innerHTML='<i class="ph ph-tree-structure"></i><span>Categories</span>'}
  function bindMobileCapture(){document.addEventListener('click',e=>{const b=e.target.closest('#v7-mobile-nav [data-v7-mobile="categories"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openAction('categories')},true)}

  function keepHomeIntelSuppressed(){
    const root=document.getElementById('dynamic-content'),rows=root?.querySelectorAll?.('#v7-home-intel,.v7-home-intel');if(!rows?.length)return;for(let i=1;i<rows.length;i++)rows[i].remove();rows[0].setAttribute('aria-hidden','true');
  }
  function ownV7Routes(){
    window.addEventListener('smartlink:v7-open',e=>{const page=e.detail?.page;if(!page)return;setTimeout(()=>invokeV7(page),0)},false);
    window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='k')return;e.preventDefault();e.stopImmediatePropagation();const run=()=>{if(typeof window.SmartLinkV7?.openCommand==='function'){window.SmartLinkV7.openCommand();return true}return false};if(!run()){let n=0,t=setInterval(()=>{n++;if(run()||n>20)clearInterval(t)},40)}},true);
    window.addEventListener('click',e=>{const b=e.target.closest?.('#command-btn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();window.SmartLinkV7?.openCommand?.()},true);
  }
  function applyCloudUi(){
    document.querySelectorAll('#cloud-pull,#cloud-push').forEach(el=>el.remove());const save=document.getElementById('save-cloud-config');if(!save)return;const card=save.closest('.holo-card');if(card&&!card.dataset.slhAutoCloud){card.dataset.slhAutoCloud='1';card.innerHTML=`<div class="flex items-center justify-between gap-4"><div><h3 class="text-white text-sm font-semibold">Auto Cloud Sync</h3><p class="text-[10px] text-slate-500 mt-1 leading-5">บันทึกในเครื่องก่อน แล้วซิงก์ขึ้น Cloud อัตโนมัติ หากออฟไลน์ระบบจะส่งต่อเมื่อออนไลน์</p></div><span class="status-pill cloud"><span></span>Always on</span></div>`}
  }
  function apply(){cleanNav();injectLibraryViews();injectSettingsTools();injectCollectionsIntoCategories();adaptMobile();keepHomeIntelSuppressed();applyCloudUi()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
  function start(){installStyle();bindMobileCapture();ownV7Routes();apply();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});setTimeout(apply,300);setTimeout(apply,900);setTimeout(apply,1800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  ['hashchange','smartlink:cloud-restored','smartlink:v7-ready','smartlink:v76-organized'].forEach(name=>window.addEventListener(name,schedule));
  window.SmartLinkNav={primary:PRIMARY,open:openAction,tool:clickTool,refresh:schedule};
})();
