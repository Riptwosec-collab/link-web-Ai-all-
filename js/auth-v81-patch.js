/* Smart Link Hub V8.2 auth compatibility patch. Credential material never lives in source control. */
(function(){
  'use strict';
  const USER='meka';
  const LABEL='Meka';
  const SUPABASE_URL='https://gfqkexnqbjtuwsyqacsw.supabase.co';
  const SUPABASE_KEY='sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
  const TOKEN_KEY='smartlink_session_token';
  const PROFILE_KEY='smartlink_session_profile';
  let scheduled=false;
  let unlockBusy=false;

  function deviceName(){
    const platform=navigator.userAgentData?.platform||navigator.platform||'Device';
    const ua=navigator.userAgent||'';let browser='Browser';
    if(/Edg\//.test(ua))browser='Edge';else if(/Chrome\//.test(ua))browser='Chrome';else if(/Firefox\//.test(ua))browser='Firefox';else if(/Safari\//.test(ua))browser='Safari';
    return `${platform} · ${browser}`.slice(0,120);
  }

  async function rpc(name,body){
    const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body),cache:'no-store'
    });
    if(!res.ok){const text=await res.text().catch(()=>String(res.status));throw new Error(`Auth service error (${res.status}) ${text.slice(0,160)}`)}
    return res.json();
  }

  function patch(){
    const gate=document.getElementById('smartlink-auth-gate');
    if(gate){
      const select=gate.querySelector('select[name="username"]');
      if(select){
        let option=select.querySelector(`option[value="${USER}"]`);
        if(!option){option=document.createElement('option');select.replaceChildren(option)}
        option.value=USER;option.textContent=LABEL;option.selected=true;select.value=USER;
      }
      const kicker=gate.querySelector('.slh-kicker');if(kicker)kicker.textContent='Private Cloud Library · V8.2';
      const intro=gate.querySelector('.slh-login>p');if(intro)intro.textContent='เข้าสู่ระบบเพื่อใช้งาน Supabase Cloud-only Library ทุกการเพิ่ม แก้ไข จัดหมวดหมู่ และลบ จะสำเร็จหลัง Server ยืนยันเท่านั้น';
      const submit=gate.querySelector('.slh-submit');if(submit)submit.textContent='Login to Supabase Cloud';
      const foot=gate.querySelector('.slh-foot span:first-child');if(foot)foot.textContent='Server-confirmed writes only';
    }

    const lock=document.getElementById('v6-lock-screen');
    if(lock){
      const title=lock.querySelector('h2');if(title)title.textContent=`Welcome back, ${LABEL}`;
      const desc=lock.querySelector('p.text-slate-500');if(desc)desc.textContent='Enter your 6-digit PIN to unlock your Supabase Cloud session. Links are not stored locally.';
      const status=lock.querySelector('#v6-unlock-status');if(status&&/Incorrect PIN/i.test(status.textContent||''))status.textContent='';
    }

    document.querySelectorAll('#smartlink-user-wrap .slh-user-card b,#smartlink-user-button span:nth-child(2)').forEach(el=>{if(/^(Mek|Meka)$/i.test(el.textContent||''))el.textContent=LABEL});
  }

  async function unlockMeka(form){
    if(unlockBusy)return;
    unlockBusy=true;
    const pin=form.querySelector('#v6-unlock-pin')?.value||'';
    const status=form.querySelector('#v6-unlock-status');
    const submit=form.querySelector('button[type="submit"]');
    if(status){status.style.color='';status.textContent='Checking Cloud PIN…'}
    if(submit)submit.disabled=true;
    try{
      let rows;
      try{rows=await rpc('smartlink_login_v2',{p_username:USER,p_pin:pin,p_device_name:deviceName()})}
      catch(err){if(/404|PGRST202|smartlink_login_v2/i.test(String(err?.message||err)))rows=await rpc('smartlink_login',{p_username:USER,p_pin:pin});else throw err}
      const row=Array.isArray(rows)?rows[0]:null;
      if(!row||row.error_code)throw new Error(row?.error_code==='try_later'?'Too many attempts. Try again later.':'Incorrect PIN');
      const oldToken=localStorage.getItem(TOKEN_KEY)||'';
      const profile={profile_id:row.profile_id,display_name:row.display_name||LABEL,username:USER,expires_at:row.expires_at,device_name:deviceName()};
      localStorage.setItem(TOKEN_KEY,row.session_token);
      localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
      if(oldToken&&oldToken!==row.session_token)rpc('smartlink_logout',{p_token:oldToken}).catch(()=>{});
      document.getElementById('v6-lock-screen')?.remove();
      window.dispatchEvent(new CustomEvent('smartlink:session-ready',{detail:{profile}}));
      window.dispatchEvent(new Event('smartlink:cloud-force-sync'));
      window.dispatchEvent(new CustomEvent('smartlink:cloud-manual-refresh',{detail:{source:'unlock'}}));
    }catch(err){
      if(status){status.textContent=err?.message||'Unable to unlock';status.style.color='#fda4af'}
    }finally{if(submit)submit.disabled=false;unlockBusy=false}
  }

  function interceptLegacyUnlock(event){
    const form=event.target?.closest?.('#v6-unlock-form');
    if(!form)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void unlockMeka(form);
  }

  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;patch()})}
  function start(){
    patch();
    new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
    document.addEventListener('submit',interceptLegacyUnlock,true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.SmartLinkAuthV81={username:USER,refresh:patch,unlock:unlockMeka,version:'8.2-auth-fix'};
})();
