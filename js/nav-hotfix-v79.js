/* Smart Link Hub V7.9 — primary navigation hotfix.
 * Own the seven daily menu routes at document-capture level so legacy/V6/V7
 * listeners cannot swallow clicks or depend on hidden/recreated sidebar nodes.
 */
(function(){
  'use strict';

  const LEGACY={home:'home',library:'search',favorites:'favorites',settings:'settings'};
  const PRIMARY=new Set(['home','library','ai','categories','favorites','read-later','settings']);
  let started=false;

  function closeSidebar(){document.getElementById('sidebar')?.classList.remove('open')}

  function setActive(key){
    document.querySelectorAll('#sidebar-nav>.slh-primary-nav-item').forEach(el=>el.classList.remove('active'));
    const el=document.querySelector(`#sidebar-nav>[data-slh-key="${key}"]`)||document.querySelector(`#sidebar-nav>[data-slh-action="${key}"]`);
    el?.classList.add('active');
  }

  function clearSpecialQuery(){
    const url=new URL(location.href);
    url.searchParams.delete('v7');
    url.searchParams.delete('v6');
    return url;
  }

  function routeLegacy(page,key=page){
    const url=clearSpecialQuery();
    const next=`${url.pathname}${url.search}#${page}`;
    history.replaceState(null,'',next);
    // replaceState does not emit hashchange. The base app router listens for it.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setActive(key);
    closeSidebar();
    return true;
  }

  function retry(run,{tries=35,delay=60,fallback=null}={}){
    if(run())return;
    let n=0;
    const timer=setInterval(()=>{
      n+=1;
      if(run()){clearInterval(timer);return}
      if(n>=tries){clearInterval(timer);fallback?.()}
    },delay);
  }

  function routeV7(page,key){
    const run=()=>{
      if(typeof window.SmartLinkV7?.route==='function'){
        window.SmartLinkV7.route(page);
        setActive(key);
        closeSidebar();
        return true;
      }
      return false;
    };
    retry(run,{
      tries:24,
      delay:55,
      fallback:()=>{
        // If V7 failed to boot, keep AI usable through the mature V6 route.
        if(key==='ai')routeV6('ai',key,()=>routeLegacy('search','library'));
        else window.dispatchEvent(new CustomEvent('smartlink:v7-open',{detail:{page}}));
      }
    });
  }

  function routeV6(page,key,fallback){
    const run=()=>{
      const button=document.querySelector(`[data-v6-page="${page}"]`);
      if(!button)return false;
      button.click();
      setActive(key);
      closeSidebar();
      return true;
    };
    retry(run,{tries:35,delay:60,fallback});
  }

  function routeCategories(){
    const run=()=>{
      const button=document.querySelector('[data-v76-page="organization"]');
      if(button){button.click();setActive('categories');closeSidebar();return true}
      if(typeof window.SmartLinkV76?.renderOrganization==='function'){
        window.SmartLinkV76.renderOrganization();
        setActive('categories');
        closeSidebar();
        return true;
      }
      return false;
    };
    // Collections is a functional organization fallback if the optional V7.6
    // organization module is unavailable or delayed.
    retry(run,{tries:18,delay:60,fallback:()=>routeLegacy('collections','categories')});
  }

  function open(key){
    if(!PRIMARY.has(key))return false;
    if(LEGACY[key])return routeLegacy(LEGACY[key],key);
    if(key==='ai'){routeV7('semantic','ai');return true}
    if(key==='categories'){routeCategories();return true}
    if(key==='read-later'){
      routeV6('read-later','read-later',()=>routeLegacy('search','library'));
      return true;
    }
    return false;
  }

  function keyFor(button){
    return button?.dataset?.slhKey||button?.dataset?.slhAction||'';
  }

  function onPrimaryClick(event){
    const button=event.target.closest?.('#sidebar-nav>.slh-primary-nav-item');
    if(!button)return;
    const key=keyFor(button);
    if(!PRIMARY.has(key))return;
    // Capture before legacy/V6/V7 delegated handlers. This prevents duplicate
    // route attempts and fixes clicks after sidebar DOM is moved/reordered.
    event.preventDefault();
    event.stopImmediatePropagation();
    open(key);
  }

  function onBrandClick(event){
    const button=event.target.closest?.('.brand-button[data-page="home"]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    routeLegacy('home','home');
  }

  function onMobilePrimary(event){
    const button=event.target.closest?.('#v7-mobile-nav [data-v7-mobile]');
    if(!button)return;
    const raw=button.dataset.v7Mobile;
    const map={home:'home',library:'library',ai:'ai',more:'categories',categories:'categories'};
    const key=map[raw];
    if(!key)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(key);
  }

  function start(){
    if(started)return;
    started=true;
    document.addEventListener('click',onPrimaryClick,true);
    document.addEventListener('click',onBrandClick,true);
    document.addEventListener('click',onMobilePrimary,true);
    window.addEventListener('smartlink:v79-navigate',e=>open(e.detail?.page));
    window.SmartLinkNav={...(window.SmartLinkNav||{}),open,hotfix:'7.9'};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
