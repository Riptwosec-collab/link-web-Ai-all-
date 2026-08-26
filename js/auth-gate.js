(() => {
  const SUPABASE_URL = 'https://gfqkexnqbjtuwsyqacsw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jsDnGIrAjuf0b9w9Hy1z8g_u9SXAfht';
  const TOKEN_KEY = 'smartlink_session_token';
  const PROFILE_KEY = 'smartlink_session_profile';

  const rpc = async (name, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
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
    .slh-field{margin-top:18px}.slh-field label{display:block;color:#94a3b8;font-size:10px;margin:0 0 8px 3px}.slh-field input{box-sizing:border-box;width:100%;height:50px;border-radius:15px;border:1px solid rgba(255,255,255,.08);outline:none;background:rgba(255,255,255,.035);color:white;padding:0 15px;font:500 14px Inter,system-ui;transition:.2s}.slh-field input:focus{border-color:rgba(34,211,238,.45);box-shadow:0 0 0 4px rgba(34,211,238,.06)}
    .slh-submit{width:100%;height:52px;margin-top:20px;border:0;border-radius:15px;color:white;font:700 13px Inter,system-ui;cursor:pointer;background:linear-gradient(100deg,#2563eb,#0891b2);box-shadow:0 12px 34px rgba(37,99,235,.24),0 0 28px rgba(34,211,238,.10);transition:.2s}.slh-submit:hover{transform:translateY(-1px);filter:brightness(1.1)}.slh-submit:disabled{opacity:.55;cursor:wait;transform:none}
    .slh-status{min-height:18px;margin-top:13px!important;text-align:center;color:#94a3b8!important}.slh-status.err{color:#fda4af!important}.slh-foot{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.055);font-size:9px;color:#475569}.slh-secure{color:#67e8f9}
    #smartlink-user-button{height:36px;padding:0 12px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);color:#cbd5e1;font:500 10px Inter,system-ui;cursor:pointer;display:flex;align-items:center;gap:7px}#smartlink-user-button:hover{background:rgba(255,255,255,.07);color:white}
  `;

  function ensureGate(){
    if(document.getElementById('smartlink-auth-gate')) return document.getElementById('smartlink-auth-gate');
    const style=document.createElement('style'); style.textContent=styles; document.head.appendChild(style);
    const gate=document.createElement('div'); gate.id='smartlink-auth-gate';
    gate.innerHTML=`<div class="slh-login">
      <div class="slh-logo">↗</div>
      <div class="slh-kicker">Private library</div>
      <h1>Smart Link Hub</h1>
      <p>เข้าสู่ระบบเพื่อเปิดคลังลิงก์ Collections, Analytics และ Workspace ของคุณ</p>
      <form id="smartlink-login-form">
        <div class="slh-field"><label>Username</label><input name="username" value="mek" autocomplete="username" spellcheck="false" required></div>
        <div class="slh-field"><label>PIN / Password</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password" placeholder="••••••" required></div>
        <button class="slh-submit" type="submit">Login / เข้าสู่ระบบ</button>
        <p class="slh-status" id="smartlink-login-status"></p>
      </form>
      <div class="slh-foot"><span>Supabase session</span><span class="slh-secure">Encrypted PIN · 90-day session</span></div>
    </div>`;
    document.body.appendChild(gate);
    return gate;
  }

  function addUserButton(profile){
    const host=document.querySelector('header .flex.items-center.gap-2');
    if(!host || document.getElementById('smartlink-user-button')) return;
    const btn=document.createElement('button');
    btn.id='smartlink-user-button'; btn.title='Logout / ออกจากระบบ';
    btn.innerHTML=`<span style="width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399"></span>${profile?.display_name || 'Mek'} <span style="opacity:.45">· Logout</span>`;
    btn.onclick=logout; host.appendChild(btn);
  }

  async function validate(token){
    if(!token) return null;
    try{const rows=await rpc('smartlink_session',{p_token:token});return Array.isArray(rows)&&rows[0]?rows[0]:null}
    catch(err){if(!navigator.onLine){try{return JSON.parse(localStorage.getItem(PROFILE_KEY)||'null')}catch{return null}}return null}
  }

  async function login(username,pin){
    const rows=await rpc('smartlink_login',{p_username:username,p_pin:pin});
    const row=Array.isArray(rows)?rows[0]:null;
    if(!row || row.error_code){if(row?.error_code==='try_later') throw new Error('ลองผิดหลายครั้ง กรุณารอ 10 นาที');throw new Error('Username หรือ PIN ไม่ถูกต้อง')}
    localStorage.setItem(TOKEN_KEY,row.session_token);
    const profile={profile_id:row.profile_id,display_name:row.display_name,expires_at:row.expires_at};
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return profile;
  }

  async function logout(){const token=localStorage.getItem(TOKEN_KEY);try{if(token)await rpc('smartlink_logout',{p_token:token})}catch{}localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PROFILE_KEY);location.reload()}

  async function start(){
    const gate=ensureGate();
    const app=document.getElementById('app'); if(app){app.style.filter='blur(8px)';app.style.pointerEvents='none'}
    const token=localStorage.getItem(TOKEN_KEY); const valid=await validate(token);
    if(valid){gate.classList.add('hidden');if(app){app.style.filter='';app.style.pointerEvents=''}addUserButton(valid);return}
    localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PROFILE_KEY);
    const form=document.getElementById('smartlink-login-form'),status=document.getElementById('smartlink-login-status');
    form.addEventListener('submit',async e=>{
      e.preventDefault();status.className='slh-status';status.textContent='กำลังตรวจสอบ…';const btn=form.querySelector('button');btn.disabled=true;
      try{const fd=new FormData(form);const profile=await login(String(fd.get('username')||''),String(fd.get('pin')||''));status.textContent='เข้าสู่ระบบสำเร็จ';gate.classList.add('hidden');if(app){app.style.filter='';app.style.pointerEvents=''}addUserButton(profile);form.reset()}
      catch(err){status.className='slh-status err';status.textContent=err.message}finally{btn.disabled=false}
    });
    setTimeout(()=>form.elements.pin?.focus(),100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
