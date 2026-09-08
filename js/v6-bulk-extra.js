import {getOne,putOne,uid,logEvent} from './db.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(text){const el=document.createElement('div');el.className='v6-toast';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),3200)}

async function archiveSelected(){
  const ids=[...document.querySelectorAll('.link-card.v6-selected[data-link-id]')].map(x=>x.dataset.linkId);
  if(!ids.length)return toast('Select links first');
  let count=0;
  for(const id of ids){
    const l=await getOne('links',id);if(!l)continue;
    await putOne('archives',{id:uid('arc'),linkId:l.id,title:l.title,url:l.url,description:l.description||l.summary||'',imageUrl:l.imageUrl||'',excerpt:l.summary||l.description||'',type:'v6-quick-snapshot',capturedAt:Date.now()});count++;
  }
  await logEvent('bulk_snapshot',{count});
  document.querySelector('[data-bulk="clear"]')?.click();
  toast(`Archived ${count} snapshot${count===1?'':'s'}`);
}

async function inject(){
  for(let i=0;i<30;i++){
    const bar=document.getElementById('v6-bulkbar');
    if(bar&&!bar.querySelector('[data-v6-bulk-archive]')){
      const btn=document.createElement('button');btn.className='v6-bulk-icon';btn.type='button';btn.title='Archive snapshot';btn.dataset.v6BulkArchive='1';btn.innerHTML='<i class="ph ph-archive"></i>';btn.onclick=archiveSelected;
      const before=bar.querySelector('[data-bulk="export"]');before?bar.insertBefore(btn,before):bar.appendChild(btn);return;
    }
    await sleep(100);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
