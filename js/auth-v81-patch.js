/* Smart Link Hub V8.1 auth UI patch. Credential material never lives in source control. */
(function(){
  'use strict';
  const USER='meka';
  const LABEL='Meka';
  let scheduled=false;

  function patch(){
    const gate=document.getElementById('smartlink-auth-gate');
    if(gate){
      const select=gate.querySelector('select[name="username"]');
      if(select){
        let option=select.querySelector(`option[value="${USER}"]`);
        if(!option){option=document.createElement('option');select.replaceChildren(option)}
        option.value=USER;option.textContent=LABEL;option.selected=true;select.value=USER;
      }
      const kicker=gate.querySelector('.slh-kicker');if(kicker)kicker.textContent='Private Cloud Library · V8.1';
      const intro=gate.querySelector('.slh-login>p');if(intro)intro.textContent='เข้าสู่ระบบเพื่อใช้งาน Supabase Cloud-only Library ทุกการเพิ่ม แก้ไข จัดหมวดหมู่ และลบ จะสำเร็จหลัง Server ยืนยันเท่านั้น';
      const submit=gate.querySelector('.slh-submit');if(submit)submit.textContent='Login to Supabase Cloud';
      const foot=gate.querySelector('.slh-foot span:first-child');if(foot)foot.textContent='Server-confirmed writes only';
    }
    document.querySelectorAll('#smartlink-user-wrap .slh-user-card b,#smartlink-user-button span:nth-child(2)').forEach(el=>{if(/^(Mek|Meka)$/i.test(el.textContent||''))el.textContent=LABEL});
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch()})}
  function start(){patch();new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.SmartLinkAuthV81={username:USER,refresh:patch};
})();
