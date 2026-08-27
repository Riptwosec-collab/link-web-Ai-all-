/* Smart Link Hub V5.1 keyboard routing */
document.addEventListener('keydown',e=>{
  if(!(e.metaKey||e.ctrlKey))return;
  if(e.key.toLowerCase()==='p'){
    e.preventDefault();
    e.stopImmediatePropagation();
    document.getElementById('command-btn')?.click();
  }
},true);
