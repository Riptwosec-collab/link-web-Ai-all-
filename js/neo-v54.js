/* Smart Link Hub V5.4 — event-driven motion only. No MutationObserver, no pointer tracking. */
(function(){
  const $=(q,r=document)=>r.querySelector(q);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');

  function setSaveState(btn,state){
    if(!btn)return;
    if(!btn.dataset.v54Label)btn.dataset.v54Label=btn.innerHTML;
    btn.classList.remove('v54-saving','v54-save-success');
    if(state==='loading'){
      btn.classList.add('v54-saving');
      btn.innerHTML='<i class="ph ph-circle-notch"></i><span class="hidden sm:inline">Saving</span>';
    }else if(state==='success'){
      btn.classList.add('v54-save-success');
      btn.innerHTML='<i class="ph-fill ph-check-circle"></i><span class="hidden sm:inline">Saved</span>';
      setTimeout(()=>{if(btn.isConnected){btn.innerHTML=btn.dataset.v54Label||'<i class="ph ph-sparkle"></i><span class="hidden sm:inline">Smart Save</span>';btn.classList.remove('v54-save-success')}},520);
    }else{
      btn.innerHTML=btn.dataset.v54Label||btn.innerHTML;
    }
  }

  document.addEventListener('click',e=>{
    const save=e.target.closest?.('#save-url-btn,#modal-save-url');
    if(save)setSaveState(save,'loading');
  },true);

  document.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target?.id==='url-input')setSaveState($('#save-url-btn'),'loading');
  },true);

  document.addEventListener('paste',e=>{
    if(e.target?.id==='url-input')setTimeout(()=>setSaveState($('#save-url-btn'),'loading'),0);
  },true);

  document.addEventListener('smartlink:card-inserted',e=>{
    const id=e.detail?.id;if(!id)return;
    const card=document.querySelector(`.link-card[data-link-id="${CSS.escape(id)}"]`);if(!card)return;
    if(!reduce.matches)requestAnimationFrame(()=>card.classList.add('v54-card-born'));
    setSaveState($('#save-url-btn'),'success');
  });

  document.addEventListener('smartlink:card-ready',e=>{
    const id=e.detail?.id;if(!id)return;
    const card=document.querySelector(`.link-card[data-link-id="${CSS.escape(id)}"]`);if(!card)return;
    card.classList.add('v54-card-ready');
    setTimeout(()=>card.classList.remove('v54-card-ready'),360);
  });

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.nav-item,.v5-context-tab,.secondary-btn,.primary-btn,.icon-btn,.card-action');
    if(!b||reduce.matches)return;
    if(b.animate)b.animate([{opacity:1},{opacity:.72},{opacity:1}],{duration:130,easing:'ease-out'});
  },{passive:true});
})();
