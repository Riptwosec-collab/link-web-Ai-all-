const HUB='https://link-web-ai-all.aidsaras.workers.dev/';
let active=null;
const $=q=>document.querySelector(q);
async function init(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});active=tabs[0]||null;
  $('#title').textContent=active?.title||'No active tab';$('#url').textContent=active?.url||'';
  const allowed=active?.url&&/^https?:\/\//i.test(active.url);$('#save').disabled=!allowed;
  if(!allowed)$('#status').textContent='This page cannot be captured.';
}
function captureUrl(){const u=new URL(HUB);u.searchParams.set('capture',active.url);if(active.title)u.searchParams.set('title',active.title);if($('#read-later').checked)u.searchParams.set('readLater','1');return u.href}
$('#save').addEventListener('click',async()=>{if(!active?.url)return;$('#status').textContent='Sending to Smart Link Hub…';await chrome.tabs.create({url:captureUrl()});$('#status').textContent='Captured';setTimeout(()=>window.close(),250)});
$('#open').addEventListener('click',async()=>{await chrome.tabs.create({url:HUB});window.close()});
init().catch(err=>{$('#status').textContent=err.message});
