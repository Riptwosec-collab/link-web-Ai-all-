const HUB='https://link-web-ai-all.aidsaras.workers.dev/';
let active=null;
const $=q=>document.querySelector(q);
const ids=['collection','custom-collection','tags','read-later','favorite'];

function base64url(value){const bytes=new TextEncoder().encode(JSON.stringify(value));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function tags(){return $('#tags').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12)}
function payload(){return {url:active?.url||'',title:active?.title||'',collectionId:$('#custom-collection').value.trim()||$('#collection').value||'col_inbox',tags:tags(),favorite:$('#favorite').checked,readLater:$('#read-later').checked,source:'extension-v2'}}
function captureUrl(data=payload()){const u=new URL(HUB);u.searchParams.set('v7capture',base64url(data));return u.href}
async function savePrefs(){await chrome.storage.sync.set({slhV7CapturePrefs:{collectionId:$('#collection').value,customCollection:$('#custom-collection').value.trim(),tags:$('#tags').value,readLater:$('#read-later').checked,favorite:$('#favorite').checked}})}
async function loadPrefs(){const {slhV7CapturePrefs:p={}}=await chrome.storage.sync.get('slhV7CapturePrefs');if(p.collectionId&&[...$('#collection').options].some(x=>x.value===p.collectionId))$('#collection').value=p.collectionId;$('#custom-collection').value=p.customCollection||'';$('#tags').value=p.tags||'';$('#read-later').checked=Boolean(p.readLater);$('#favorite').checked=Boolean(p.favorite)}
async function init(){await loadPrefs();const tabs=await chrome.tabs.query({active:true,currentWindow:true});active=tabs[0]||null;$('#title').textContent=active?.title||'No active tab';$('#url').textContent=active?.url||'';const allowed=active?.url&&/^https?:\/\//i.test(active.url);$('#save').disabled=!allowed;if(!allowed){$('#status').className='bad';$('#status').textContent='This page cannot be captured.'}for(const id of ids)$("#"+id).addEventListener('change',savePrefs);$('#tags').addEventListener('input',()=>{clearTimeout(window.__prefTimer);window.__prefTimer=setTimeout(savePrefs,250)})}
$('#save').addEventListener('click',async()=>{if(!active?.url)return;$('#save').disabled=true;$('#status').className='';$('#status').textContent='Sending rich capture to Smart Link Hub…';await savePrefs();await chrome.tabs.create({url:captureUrl()});$('#status').className='ok';$('#status').textContent='Captured · duplicate check and Auto Cloud run in Hub';setTimeout(()=>window.close(),420)});
$('#open').addEventListener('click',async()=>{await chrome.tabs.create({url:HUB});window.close()});
init().catch(err=>{$('#status').className='bad';$('#status').textContent=err.message});
