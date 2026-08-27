/* Smart Link Hub V5.2 — static visual bootstrap + reflow-free fast actions. */
(function(){
  document.documentElement.classList.add('smooth-v52');

  /* Pre-create the visual layer. V5.1 runtime sees it and skips animated
     aurora + pointer tracking, removing a continuous repaint source. */
  if(!document.getElementById('v51-visual-layer')){
    const layer=document.createElement('div');
    layer.id='v51-visual-layer';
    layer.setAttribute('aria-hidden','true');
    document.body.prepend(layer);
  }

  /* Favorite is intentionally handled before the legacy premium runtime.
     UI updates immediately; IndexedDB/event logging happens asynchronously.
     This avoids the old forced offsetWidth reflow + extra count reads. */
  document.addEventListener('click',function(e){
    const btn=e.target.closest?.('.v51-star[data-v51="fav"]');
    if(!btn)return;
    const card=btn.closest('.link-card[data-link-id]');
    if(!card)return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const wasActive=btn.classList.contains('active');
    const next=!wasActive;
    btn.classList.toggle('active',next);
    btn.innerHTML=`<i class="${next?'ph-fill':'ph'} ph-star"></i>`;

    if(btn.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      btn.animate(
        [{transform:'scale(.94)'},{transform:'scale(1.08)'},{transform:'scale(1)'}],
        {duration:150,easing:'cubic-bezier(.2,.8,.2,1)'}
      );
    }

    const favCount=document.getElementById('side-favs');
    if(favCount){
      const n=Number.parseInt(favCount.textContent||'0',10)||0;
      favCount.textContent=String(Math.max(0,n+(next?1:-1)));
    }

    if(location.hash==='#favorites'&&!next){
      card.style.pointerEvents='none';
      if(card.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches){
        const a=card.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(3px)'}],{duration:150,easing:'ease-out',fill:'forwards'});
        a.finished.finally(()=>card.remove());
      }else card.remove();
    }

    import('./db.js').then(async({getOne,putOne,logEvent})=>{
      const link=await getOne('links',card.dataset.linkId);
      if(!link)return;
      link.favorite=next;
      link.updatedAt=Date.now();
      await putOne('links',link);
      logEvent('favorite',{id:link.id,value:next,via:'v52-fast'}).catch(()=>{});
    }).catch(()=>{
      /* Revert only when persistence itself fails. */
      btn.classList.toggle('active',wasActive);
      btn.innerHTML=`<i class="${wasActive?'ph-fill':'ph'} ph-star"></i>`;
    });
  },true);
})();
