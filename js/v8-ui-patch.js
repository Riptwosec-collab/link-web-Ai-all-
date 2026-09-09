function patchCloudCard(){
  const save=document.getElementById('save-cloud-config');
  if(save){const card=save.closest('.holo-card');if(card){card.dataset.slhAutoCloud='1';card.innerHTML='<div class="flex items-center justify-between gap-4"><div><h3 class="text-white text-sm font-semibold">Supabase Cloud Only</h3><p class="text-[10px] text-slate-500 mt-1 leading-5">ลิงก์บันทึกลง Supabase โดยตรงทีละรายการ และจะแสดงว่าสำเร็จหลัง Server ยืนยันเท่านั้น ไม่มีการเก็บลิงก์ถาวรใน IndexedDB</p></div><span class="status-pill cloud"><span></span>Source of truth</span></div>'}}
  document.querySelectorAll('#cloud-pull,#cloud-push').forEach(x=>x.remove());
  document.querySelectorAll('[data-slh-auto-cloud] p').forEach(p=>{if(/บันทึกในเครื่องก่อน|saved locally|local-first/i.test(p.textContent||''))p.textContent='ลิงก์ใช้ Supabase เป็นฐานข้อมูลหลักเพียงแห่งเดียว การบันทึกทุกครั้งต้องได้รับการยืนยันจาก Cloud ก่อน';});
}
function patchLabels(){
  document.querySelectorAll('[title*="Auto Save"],[title*="Saved locally"]').forEach(el=>{el.title='Supabase-only link storage · server-confirmed writes'});
  const pill=document.getElementById('sync-pill');if(pill&&/Auto Save|Saved locally/i.test(pill.textContent||'')){pill.className='status-pill cloud';pill.innerHTML='<span></span>Cloud only'}
}
export function initV8UIPatch(){
  patchCloudCard();patchLabels();
  const observer=new MutationObserver(()=>{patchCloudCard();patchLabels()});observer.observe(document.body,{childList:true,subtree:true});
  window.SmartLinkV8UI={refresh(){patchCloudCard();patchLabels()},observer};
}
