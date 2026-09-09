function patchCloudCard(){
  const save=document.getElementById('save-cloud-config');
  if(save){const card=save.closest('.holo-card');if(card){card.dataset.slhAutoCloud='1';card.innerHTML='<div class="flex items-center justify-between gap-4"><div><h3 class="text-white text-sm font-semibold">Supabase Cloud Only</h3><p class="text-[10px] text-slate-500 mt-1 leading-5">Links are written directly to Supabase one row at a time. The UI reports success only after the server confirms the write; persistent browser link storage is disabled.</p></div><span class="status-pill cloud"><span></span>Source of truth</span></div>'}}
  document.querySelectorAll('#cloud-pull,#cloud-push').forEach(x=>x.remove());
  document.querySelectorAll('[data-slh-auto-cloud] p').forEach(p=>{if(/บันทึกในเครื่องก่อน|saved locally|local-first|offline.*ส่งต่อ/i.test(p.textContent||''))p.textContent='Links use Supabase as the only persistent source of truth. Offline link saves are rejected instead of queued locally.'});
}
function replaceText(root=document){
  const rules=[
    [/stores it locally[^.]*\./gi,'writes it directly to Supabase and confirms it before showing success.'],
    [/Saved permanently/gi,'Server confirmed'],[/Persistent stars/gi,'Cloud stars'],[/Newest items in your local library/gi,'Newest items in your Supabase library'],
    [/IndexedDB/gi,'Supabase'],[/Optional cloud sync/gi,'Cloud-only'],[/Local mode/gi,'Cloud-only mode'],[/local library/gi,'cloud library'],
    [/persisted in IndexedDB[^.]*\./gi,'stored in Supabase with version history.'],[/queued for Cloud/gi,'saved to Supabase'],[/Import \d+ new links/gi,m=>m.replace('Import','Commit')]
  ];
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(node.parentElement?.closest('script,style,textarea,input'))continue;let next=node.nodeValue;for(const [re,to] of rules)next=next.replace(re,to);if(next!==node.nodeValue)node.nodeValue=next}
  const commit=document.getElementById('v7-import-commit');if(commit&&/Import/i.test(commit.textContent||''))commit.innerHTML=commit.innerHTML.replace(/Import/g,'Commit to Supabase');
}
function patchLabels(){
  document.querySelectorAll('[title*="Auto Save"],[title*="Saved locally"],[title*="local-first"]').forEach(el=>{el.title='Supabase-only link storage · server-confirmed writes'});
  const pill=document.getElementById('sync-pill');if(pill&&/Auto Save|Saved locally|Local/i.test(pill.textContent||'')){pill.className='status-pill cloud';pill.innerHTML='<span></span>Cloud only'}
  replaceText(document.getElementById('dynamic-content')||document);
}
export function initV8UIPatch(){
  patchCloudCard();patchLabels();let queued=false;
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patchCloudCard();patchLabels()})});observer.observe(document.body,{childList:true,subtree:true});
  window.SmartLinkV8UI={refresh(){patchCloudCard();patchLabels()},observer};
}
