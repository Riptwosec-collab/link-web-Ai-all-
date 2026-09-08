(() => {
  const SUPABASE_URL = 'https://gfqkexnqbjtuwsyqacsw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
  const TOKEN_KEY = 'smartlink_session_token';
  const PROFILE_KEY = 'smartlink_session_profile';
  const CLOUD_USERS = [{ value: 'mek', label: 'Mek' }];

  const rpc = async (name, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error(`Auth service error (${res.status})`);
    return res.json();
  };

  const styles = `
    #smartlink-auth-gate{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 18% 20%,rgba(34,211,238,.14),transparent 28%),radial-gradient(circle at 82% 82%,rgba(139,92,246,.16),transparent 30%),rgba(3,5,10,.985);backdrop-filter:blur(28px);font-family:Inter,system-ui,sans-serif}
    #smartlink-auth-gate.hidden{display:none}
    .slh-login{position:relative;width:min(430px,100%);overflow:hidden;border-radius:30px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(145deg,rgba(20,24,36,.92),rgba(8,10,17,.98));box-shadow:0 35px 120px rgba(0,0,0,.58),0 0 70px rgba(34,211,238,.07);padding:32px}
    .slh-login:before{content:'';position:absolute;inset:-1px;background:linear-gradient(120deg,transparent 20%,rgba(34,211,238,.16),transparent 48%,rgba(139,92,246,.16),transparent 75%);transform:translateX(-70%);animation:slhscan 7s linear infinite;pointer-events:none}
    @keyframes slhscan{to{transform:translateX(70%)}}
    .slh-logo{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#22d3ee);box-shadow:0 0 34px rgba(34,211,238,.3);font-size:24px;color:white;margin-bottom:22px}
    .slh-kicker{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:rgba(103,232,249,.72)}
    .slh-login h1{margin:7px 0 8px;color:white;font-size:27px;line-height:1.1;font-weight:650;letter-spacing:-.035em}.slh-login p{margin:0;color:#64748b;font-size:12px;line-height:1.65}
    .slh-field{margin-top:18px}.slh-field label{display:block;color:#94a3b8;font-size:10px;margin:0 0 8px 3px}.slh-field input,.slh-field select{box-sizing:border-box;width:100%;height:50px;border-radius:15px;border:1px solid rgba(255,255,255,.08);outline:none;background:rgba(255,255,255,.035);color:white;padding:0 15px;font:500 14px Inter,system-ui;transition:.2s}.slh-field select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,#67e8f9 50%),linear-gradient(135deg,#67e8f9 50%,transparent 50%);background-position:calc(100% - 19px) 21px,calc(100% - 14px) 21px;background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:42px}.slh-field select option{background:#0b1019;color:white}.slh-field input:focus,.slh-field select:focus{border-color:rgba(34,211,238,.45);box-shadow:0 0 0 4px rgba(34,211,238,.06)}
    .slh-profile-row{display:flex;align-items:center;gap:10px}.slh-profile-dot{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(37,99,235,.3),rgba(34,211,238,.18));border:1px solid rgba(103,232,249,.16);color:#a5f3fc;font-size:11px;font-weight:700;flex:0 0 auto}.slh-profile-row select{flex:1}
    .slh-submit{width:100%;height:52px;margin-top:20px;border:0;border-radius:15px;color:white;font:700 13px Inter,system-ui;cursor:pointer;background:linear-gradient(100deg,#2563eb,#0891b2);box-shadow:0 12px 34px rgba(37,99,235,.24),0 0 28px rgba(34,211,238,.10);transition:.2s}.slh-submit:hover{transform:translateY(-1px);filter:brightness(1.1)}.slh-submit:disabled{opacity:.55;cursor:wait;transform:none}
    .slh-status{min-height:18px;margin-top:13px!important;text-align:center;color:#94a3b8!important}.slh-status.err{color:#fda4af!important}.slh-foot{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.055);font-size:9px;color:#475569}.slh-secure{color:#67e8f9}
    #smartlink-user-wrap{position:relative}.slh-user-button{height:36px;padding:0 10px 0 12px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);color:#cbd5e1;font:500 10px Inter,system-ui;cursor:pointer;display:flex;align-items:center;gap:7px;white-space:nowrap}.slh-user-button:hover,.slh-user-button.open{background:rgba(255,255,255,.07);color:white;border-color:rgba(103,232,249,.16)}.slh-user-dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399}.slh-user-chevron{font-size:9px;opacity:.5;transition:transform .18s}.slh-user-button.open .slh-user-chevron{transform:rotate(180deg)}
    .slh-user-menu{position:absolute;right:0;top:44px;width:220px;padding:8px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(7,10,17,.97);backdrop-filter:blur(22px);box-shadow:0 22px 70px rgba(0,0,0,.45);z-index:99999;opacity:0;transform:translateY(-5px) scale(.98);pointer-events:none;transition:.16s}.slh-user-menu.open{opacity:1;transform:none;pointer-events:auto}.slh-user-card{padding:10px 11px 11px;border-bottom:1px solid rgba(255,255,255,.055);margin-bottom:6px}.slh-user-card b{display:block;color:#fff;font:600 12px Inter,system-ui}.slh-user-card small{display:flex;align-items:center;gap:6px;color:#64748b;font:500 9px Inter,system-ui;margin-top:4px}.slh-menu-dot{width:6px;height:6px;border-radius:50%;background:#34d399}.slh-menu-action{width:100%;height:34px;border:0;border-radius:10px;background:transparent;color:#94a3b8;text-align:left;padding:0 10px;font:500 10px Inter,system-ui;cursor:pointer;display:flex;align-items:center;gap:8px}.slh-menu-action:hover{background:rgba(255,255,255,.055);color:white}.slh-menu-action.danger:hover{background:rgba(244,63,94,.09);color:#fda4af}
  `;

  function emitSessionReady(profile){
    window.dispatchEvent(new CustomEvent('smartlink:session-ready',{detail:{profile}}));
  }

  function ensureGate(){
    if(document.getElementById('smartlink-auth-gate')) return document.getElementById('smartlink-auth-gate');
    const style=document.createElement('style'); style.textContent=styles; document.head.appendChild(style);
    const options=CLOUD_USERS.map((u,i)=>`<option value="${u.value}" ${i===0?'selected':''}>${u.label}</option>`).join('');
    const gate=document.createElement('div'); gate.id='smartlink-auth-gate';
    gate.innerHTML=`<div class="slh-login">
      <div class="slh-logo">↗</div>
      <div class="slh-kicker">Private Cloud Library</div>
      <h1>Smart Link Hub</h1>
      <p>เข้าสู่ระบบ Cloud เพื่อให้ทุกการเพิ่ม แก้ไข และจัดหมวดหมู่ Auto Save ไปยัง Supabase อัตโนมัติ</p>
      <form id="smartlink-login-form">
        <div class="slh-field"><label>Cloud Profile</label><div class="slh-profile-row"><div class="slh-profile-dot">M</div><select name="username" autocomplete="username" required>${options}</select></div></div>
        <div class="slh-field"><label>PIN / Password</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password" placeholder="••••••" required></div>
        <button class="slh-submit" type="submit">Login & Enable Auto Cloud</button>
        <p class="slh-status" id="smartlink-login-status"></p>
      </form>
      <div class="slh-foot"><span>Auto Save → Supabase</span><span class="slh-secure">Encrypted PIN · 90-day session</span></div>
    </div>`;
    document.body.appendChild(gate);
    return gate;
  }

  function closeUserMenu(){
    document.querySelector('.slh-user-menu')?.classList.remove('open');
    document.querySelector('.slh-user-button')?.classList.remove('open');
  }

  function addUserDropdown(profile){
    const host=document.querySelector('header .flex.items-center.gap-2');
    if(!host || document.getElementById('smartlink-user-wrap')) return;
    const wrap=document.createElement('div');wrap.id='smartlink-user-wrap';
    const name=profile?.display_name || 'Mek';
    wrap.innerHTML=`<button id="smartlink-user-button" class="slh-user-button" type="button" aria-haspopup="menu" aria-expanded="false"><span class="slh-user-dot"></span><span>${name}</span><span class="slh-user-chevron">▾</span></button><div class="slh-user-menu" role="menu"><div class="slh-user-card"><b>${name}</b><small><span class="slh-menu-dot"></span>Cloud connected · Auto Save ON</small></div><button class="slh-menu-action" type="button" data-smartlink-sync><span>↻</span>Sync now</button><button class="slh-menu-action danger" type="button" data-smartlink-logout><span>↪</span>Logout</button></div>`;
    host.appendChild(wrap);
    const btn=wrap.querySelector('#smartlink-user-button'),menu=wrap.querySelector('.slh-user-menu');
    btn.addEventListener('click',e=>{e.stopPropagation();const open=menu.classList.toggle('open');btn.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open))});
    wrap.querySelector('[data-smartlink-sync]').addEventListener('click',()=>{closeUserMenu();window.dispatchEvent(new Event('smartlink:cloud-force-sync'))});
    wrap.querySelector('[data-smartlink-logout]').addEventListener('click',()=>{closeUserMenu();logout()});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))closeUserMenu()});
  }

  async function validate(token){
    if(!token) return null;
    try{const rows=await rpc('smartlink_session',{p_token:token});return Array.isArray(rows)&&rows[0]?rows[0]:null}
    catch(err){if(!navigator.onLine){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'null')}catch{return null}}return null}
  }

  async function login(username,pin){
    const rows=await rpc('smartlink_login',{p_username:username,p_pin:pin});
    const row=Array.isArray(rows)?rows[0]:null;
    if(!row || row.error_code){if(row?.error_code==='try_later') throw new Error('ลองผิดหลายครั้ง กรุณารอ 10 นาที');throw new Error('Profile หรือ PIN ไม่ถูกต้อง')}
    localStorage.setItem(TOKEN_KEY,row.session_token);
    const profile={profile_id:row.profile_id,display_name:row.display_name,username,expires_at:row.expires_at};
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return profile;
  }

  async function logout(){
    const token=localStorage.getItem(TOKEN_KEY);
    try{if(token)await rpc('smartlink_logout',{p_token:token})}catch{}
    localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PROFILE_KEY);
    window.dispatchEvent(new Event('smartlink:session-cleared'));
    location.reload();
  }

  async function start(){
    const gate=ensureGate();
    const app=document.getElementById('app'); if(app){app.style.filter='blur(8px)';app.style.pointerEvents='none'}
    const token=localStorage.getItem(TOKEN_KEY); const valid=await validate(token);
    if(valid){
      gate.classList.add('hidden');if(app){app.style.filter='';app.style.pointerEvents=''}addUserDropdown(valid);
      setTimeout(()=>emitSessionReady(valid),0);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PROFILE_KEY);
    const form=document.getElementById('smartlink-login-form'),status=document.getElementById('smartlink-login-status');
    form.addEventListener('submit',async e=>{
      e.preventDefault();status.className='slh-status';status.textContent='กำลังเชื่อม Cloud…';const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
      try{
        const fd=new FormData(form);const profile=await login(String(fd.get('username')||''),String(fd.get('pin')||''));
        status.textContent='Cloud connected · Auto Save ON';gate.classList.add('hidden');if(app){app.style.filter='';app.style.pointerEvents=''}addUserDropdown(profile);emitSessionReady(profile);window.dispatchEvent(new Event('smartlink:cloud-force-sync'));form.elements.pin.value='';
      }
      catch(err){status.className='slh-status err';status.textContent=err.message}finally{btn.disabled=false}
    });
    setTimeout(()=>form.elements.pin?.focus(),100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
