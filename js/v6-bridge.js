(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

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

  window.addEventListener('smartlink:v6-lock',lockViaSettings);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openAddShortcut,{once:true});else openAddShortcut();
})();
