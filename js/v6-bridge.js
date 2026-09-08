(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let hadPending=false;
  if(!('Notification' in window))window.Notification={permission:'unsupported',requestPermission:async()=> 'denied'};

  async function openAddShortcut(){
    const p=new URLSearchParams(location.search);
    if(p.get('v6')!=='add')return;
    history.replaceState(null,'',location.pathname+'#home');
    if(location.hash!=='#home')location.hash='home';
    for(let i=0;i<20;i++){
      const btn=document.getElementById('add-link-btn');
      if(btn){btn.click();return}
      await sleep(100);
    }
  }

  async function lockViaSettings(){
    if(document.getElementById('v6-lock-screen'))return;
    history.replaceState(null,'',location.pathname+'#settings');
    if(location.hash!=='#settings')location.hash='settings';
    for(let i=0;i<30;i++){
      const btn=document.getElementById('v6-settings-lock');
      if(btn){btn.click();return}
      await sleep(100);
    }
  }

  async function registerBackgroundSync(){
    if(navigator.onLine||!('serviceWorker'in navigator))return;
    try{const reg=await navigator.serviceWorker.ready;if(reg.sync?.register)await reg.sync.register('smartlink-cloud-sync')}catch{}
  }

  async function notifySynced(){
    if(Notification.permission!=='granted')return;
    try{
      const reg=await navigator.serviceWorker?.ready;
      if(reg?.showNotification)await reg.showNotification('Smart Link Hub synced',{body:'Offline changes were saved to Cloud successfully.',tag:'smartlink-sync-complete',data:{url:'/?v6=cloud'}});
      else new Notification('Smart Link Hub synced',{body:'Offline changes were saved to Cloud successfully.'});
    }catch{}
  }

  window.addEventListener('smartlink:v6-lock',lockViaSettings);
  window.addEventListener('smartlink:local-mutation',()=>{if(!navigator.onLine){hadPending=true;registerBackgroundSync()}});
  window.addEventListener('smartlink:cloud-state',e=>{
    const mode=e.detail?.mode;
    if(['pending','offline','syncing','conflict'].includes(mode))hadPending=true;
    if(mode==='synced'&&hadPending){hadPending=false;notifySynced()}
  });
  window.addEventListener('online',()=>{if('serviceWorker'in navigator)navigator.serviceWorker.ready.then(r=>r.active?.postMessage({type:'SMARTLINK_SYNC'})).catch(()=>{})},{passive:true});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openAddShortcut,{once:true});else openAddShortcut();
})();
