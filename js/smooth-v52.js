/* Smart Link Hub V5.2 — static visual bootstrap to prevent V5.1 pointer/aurora runtime. */
(function(){
  document.documentElement.classList.add('smooth-v52');
  if(document.getElementById('v51-visual-layer')) return;
  const layer=document.createElement('div');
  layer.id='v51-visual-layer';
  layer.setAttribute('aria-hidden','true');
  document.body.prepend(layer);
})();
