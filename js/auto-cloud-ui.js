/* Smart Link Hub V5.5 — Auto Cloud only UI. No manual Push/Pull workflow. */
(function(){
  function apply(){
    document.querySelectorAll('#cloud-pull,#cloud-push').forEach(el=>el.remove());

    const save=document.getElementById('save-cloud-config');
    if(save){
      const card=save.closest('.holo-card');
      if(card){
        card.innerHTML=`<div class="flex items-center justify-between gap-4"><div><h3 class="text-white text-sm font-semibold">Auto Cloud Sync</h3><p class="text-[10px] text-slate-500 mt-1 leading-5">บันทึกและแก้ไขข้อมูลในเครื่องก่อน แล้วซิงก์ขึ้น Supabase อัตโนมัติทุกครั้ง ถ้าออฟไลน์ระบบจะส่งให้เองเมื่อออนไลน์</p></div><span class="status-pill cloud"><span></span>Always on</span></div><div class="mt-4 rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] px-3 py-2.5 text-[9px] text-slate-400"><i class="ph ph-cloud-check text-cyan-300 mr-1"></i> ไม่ต้องกด Push / Pull และไม่ต้องตั้งค่า Supabase เพิ่มในหน้านี้</div>`;
      }
    }
  }
  function schedule(){requestAnimationFrame(()=>{apply();setTimeout(apply,40);setTimeout(apply,140)})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  window.addEventListener('hashchange',schedule);
  window.addEventListener('smartlink:cloud-restored',schedule);
})();
