/* Smart Link Hub V5 navigation layer — reorganizes routes without removing legacy features. */
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>[...r.querySelectorAll(q)];
let navQueued=false;
let searchTimer=null;

const routeConfig={
  home:{eye:'Library',title:'Home',active:'home'},
  search:{eye:'Library',title:'Library',active:'search',tabs:[['All Links','search','squares-four'],['Archived','archive','archive']]},
  archive:{eye:'Library',title:'Library',active:'search',tabs:[['All Links','search','squares-four'],['Archived','archive','archive']]},
  favorites:{eye:'Library',title:'Favorites',active:'favorites'},
  collections:{eye:'Organization',title:'Collections',active:'collections'},
  analytics:{eye:'Insights',title:'Insights',active:'analytics',tabs:[['Analytics','analytics','chart-line-up'],['Link Health','health','heartbeat']]},
  health:{eye:'Insights',title:'Insights',active:'analytics',tabs:[['Analytics','analytics','chart-line-up'],['Link Health','health','heartbeat']]},
  workspaces:{eye:'Advanced',title:'More',active:'workspaces',tabs:[['Workspaces','workspaces','users-three']]},
  settings:{eye:'System',title:'Settings',active:'settings',tabs:[['General','settings','gear-six'],['Data · Import / Export','import-export','arrows-down-up']]},
  'import-export':{eye:'System',title:'Settings',active:'settings',tabs:[['General','settings','gear-six'],['Data · Import / Export','import-export','arrows-down-up']]}
};

function route(){return location.hash.slice(1)||'home'}
function go(name){if(route()===name){decorate();return}location.hash=name}

function tabsHTML(items,current){
  if(!items?.length)return '';
  return `<nav class="v5-context-tabs" aria-label="Section navigation">${items.map(([label,target,icon])=>`<button type="button" data-v5-route="${target}" class="v5-context-tab ${current===target?'active':''}"><i class="ph ph-${icon}"></i><span>${label}</span></button>`).join('')}</nav>`;
}

function setHero(current){
  const hero=$('#dynamic-content .page-hero');if(!hero)return;
  const h2=$('h2',hero),desc=$('p',hero),chip=$('.soft-chip',hero);
  if(current==='search'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-squares-four"></i> Library · All Links';
    if(h2)h2.textContent='Your complete link library.';
    if(desc)desc.textContent='Browse and search every saved link by title, URL, description, category or tag. Archive is now a filter in this Library section.';
  }else if(current==='archive'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-archive"></i> Library · Archived';
    if(h2)h2.textContent='Archived links.';
    if(desc)desc.textContent='Links you moved out of the active library stay here and can be reviewed separately.';
  }else if(current==='analytics'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-chart-line-up"></i> Insights · Analytics';
    if(h2)h2.textContent='Library insights.';
  }else if(current==='health'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-heartbeat"></i> Insights · Link Health';
    if(h2)h2.textContent='Link health.';
  }else if(current==='workspaces'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-dots-three-circle"></i> More · Advanced';
  }else if(current==='import-export'){
    if(chip)chip.innerHTML='<i class="ph-fill ph-database"></i> Settings · Data';
  }
}

function syncSidebar(active){
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===active));
}

function addContextTabs(cfg,current){
  const shell=$('#dynamic-content .page-shell');if(!shell||!cfg.tabs?.length)return;
  let bar=$('.v5-context-tabs',shell);
  const html=tabsHTML(cfg.tabs,current);
  if(bar){bar.outerHTML=html;return}
  shell.insertAdjacentHTML('afterbegin',html);
}

function decorateHome(){
  const b=$('[data-go="search"]');
  if(b&&!b.dataset.v5Label){b.dataset.v5Label='1';b.innerHTML='Open library <i class="ph ph-arrow-right"></i>'}
}

function decorate(){
  navQueued=false;
  const current=route(),cfg=routeConfig[current]||routeConfig.home;
  const eye=$('#page-eyebrow'),title=$('#page-title');
  if(eye)eye.textContent=cfg.eye;if(title)title.textContent=cfg.title;
  syncSidebar(cfg.active);
  addContextTabs(cfg,current);
  setHero(current);
  if(current==='home')decorateHome();
  if(current==='search')applyHeaderSearch(false);
}

function scheduleDecorate(){if(navQueued)return;navQueued=true;requestAnimationFrame(()=>setTimeout(decorate,20))}

function applyHeaderSearch(focus=true){
  const global=$('#global-search');if(!global)return;
  const q=global.value.trim();
  const target=$('#search-input');
  if(target){
    if(target.value!==q)target.value=q;
    target.dispatchEvent(new Event('input',{bubbles:true}));
    if(focus)target.focus({preventScroll:true});
  }
}

function startSearch(){
  const input=$('#global-search');if(!input)return;
  input.addEventListener('input',()=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
      if(route()!=='search'){go('search');setTimeout(()=>applyHeaderSearch(false),90)}
      else applyHeaderSearch(false);
    },120);
  });
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(route()!=='search')go('search');
      setTimeout(()=>applyHeaderSearch(true),70);
    }
  });
  input.addEventListener('focus',()=>{input.closest('.v5-global-search')?.classList.add('focused')});
  input.addEventListener('blur',()=>{input.closest('.v5-global-search')?.classList.remove('focused')});
}

document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-v5-route]');if(!b)return;
  e.preventDefault();go(b.dataset.v5Route);
});
window.addEventListener('hashchange',scheduleDecorate);

function observe(){
  const root=$('#dynamic-content');if(!root)return setTimeout(observe,100);
  new MutationObserver(scheduleDecorate).observe(root,{childList:true});
  scheduleDecorate();
}
startSearch();observe();
