// ══════════════════════════════════════════════════════════
//  auth.js — boot, login/signup, MFA verify & setup
// ══════════════════════════════════════════════════════════

window.addEventListener('load', boot);

async function boot() {
  var savedTheme = localStorage.getItem('ft_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeBtn(savedTheme);
  if (!APP_SUPABASE_URL || APP_SUPABASE_URL.includes('PASTE_YOUR')) {
    hidePageLoader(); showScreen('config'); return;
  }
  sbClient = window.supabase.createClient(APP_SUPABASE_URL, APP_SUPABASE_KEY);
  try {
    var res = await sbClient.from('app_config').select('key,value');
    if (res.data) res.data.forEach(function(r){ appConfig[r.key] = r.value; });
  } catch(e) {}
  try {
    var sessionRes = await sbClient.auth.getSession();
    hidePageLoader();
    if (sessionRes.data.session) await enterApp(sessionRes.data.session.user);
    else showScreen('auth');
  } catch(e) { hidePageLoader(); showScreen('auth'); }
  sbClient.auth.onAuthStateChange(async function(event, session) {
    if (event === 'SIGNED_IN' && session && !currentUser) await enterApp(session.user);
    if (event === 'SIGNED_OUT') { currentUser = null; mfaFactorId = null; showScreen('auth'); }
  });
}

async function enterApp(user) {
  currentUser = user;
  try {
    var aalRes = await sbClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalRes.error) throw aalRes.error;
    var currentLevel = aalRes.data.currentLevel, nextLevel = aalRes.data.nextLevel;
    if (currentLevel === 'aal1' && nextLevel === 'aal2') {
      var factorRes = await sbClient.auth.mfa.listFactors();
      var verified = factorRes.data && factorRes.data.totp && factorRes.data.totp.find(function(f){ return f.status === 'verified'; });
      if (verified) { mfaFactorId = verified.id; showScreen('mfa-verify'); return; }
    }
  } catch(e) {}
  await onLogin(user);
  showScreen('app');
  setTimeout(function(){ renderAll(); }, 50);
}

// ── LOGIN / SIGNUP ──
function switchTab(tab) {
  document.getElementById('tab-login').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach(function(b, i){
    b.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='signup'));
  });
}

async function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pass  = document.getElementById('login-password').value;
  var msg   = document.getElementById('login-msg');
  msg.className = 'auth-msg'; msg.style.display = 'none';
  if (!email || !pass) { msg.className='auth-msg error'; msg.textContent='Please enter email and password.'; return; }
  var btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="spinner"></span>Signing in...'; btn.disabled = true;
  var res = await sbClient.auth.signInWithPassword({ email: email, password: pass });
  var authScreen = document.getElementById('auth-screen');
  if (authScreen && authScreen.style.display !== 'none') {
    btn.innerHTML = 'Sign in'; btn.disabled = false;
    if (res.error) { msg.className='auth-msg error'; msg.textContent=res.error.message; }
  }
}

async function doSignup() {
  var name  = document.getElementById('signup-name').value.trim();
  var email = document.getElementById('signup-email').value.trim();
  var pass  = document.getElementById('signup-password').value;
  var msg   = document.getElementById('signup-msg');
  if (!name||!email||!pass) { msg.className='auth-msg error'; msg.textContent='Please fill all fields.'; return; }
  if (pass.length < 6)       { msg.className='auth-msg error'; msg.textContent='Password must be at least 6 characters.'; return; }
  setBtn('signup-btn', true);
  var res = await sbClient.auth.signUp({ email: email, password: pass, options: { data: { full_name: name, role: 'member' } } });
  setBtn('signup-btn', false, 'Create account');
  if (res.error) { msg.className='auth-msg error'; msg.textContent=res.error.message; }
  else {
    msg.className='auth-msg success'; msg.textContent='Account created! You can now sign in.';
    setTimeout(function(){ switchTab('login'); document.getElementById('login-email').value = email; }, 2000);
  }
}

async function doForgotPassword() {
  var email = document.getElementById('login-email').value.trim();
  if (!email) { toast('Enter your email first'); return; }
  var res = await sbClient.auth.resetPasswordForEmail(email);
  toast(res.error ? 'Error: ' + res.error.message : 'Password reset email sent!');
}

async function doLogout() {
  currentUser = null; mfaFactorId = null;
  await sbClient.auth.signOut();
}

async function onLogin(user) {
  currentUser = user;
  var res = await sbClient.from('profiles').select('*').eq('id', user.id).single();
  userProfile = res.data;
  document.getElementById('topbar-user').textContent = userProfile && userProfile.full_name ? userProfile.full_name : user.email.split('@')[0];
  document.getElementById('tx-date').value  = new Date().toISOString().slice(0,10);
  document.getElementById('inv-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('share-link').value = window.location.href;
  await loadData();
  setTimeout(applyThemeToBtn, 50);
  setTimeout(function(){ if(typeof initCalculators==='function') initCalculators(); }, 200);
}

// ── MFA VERIFY (login gate) ──
async function doMfaVerify() {
  var code = document.getElementById('mfa-verify-code').value.trim();
  var msg  = document.getElementById('mfa-verify-msg');
  var btn  = document.getElementById('mfa-verify-btn');
  if (code.length !== 6) { msg.className='auth-msg error'; msg.textContent='Please enter a 6-digit code.'; return; }
  btn.innerHTML = '<span class="spinner"></span>Verifying...'; btn.disabled = true;
  msg.className = 'auth-msg'; msg.style.display = 'none';
  try {
    var chalRes = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chalRes.error) throw chalRes.error;
    var verRes = await sbClient.auth.mfa.verify({ factorId: mfaFactorId, challengeId: chalRes.data.id, code: code });
    if (verRes.error) throw verRes.error;
    btn.innerHTML = 'Verify'; btn.disabled = false;
    await onLogin(currentUser);
    showScreen('app');
    setTimeout(function(){ renderAll(); }, 50);
  } catch(e) {
    btn.innerHTML = 'Verify'; btn.disabled = false;
    msg.className = 'auth-msg error';
    msg.textContent = e.message && e.message.includes('nvalid') ? 'Incorrect code. Please try again.' : (e.message || 'Verification failed.');
    document.getElementById('mfa-verify-code').value = '';
    document.getElementById('mfa-verify-code').focus();
  }
}

// ── MFA SETUP (new enrollment) ──
async function startMfaSetup(inline) {
  if (inline) { showMfaModal(); return; }
  showScreen('mfa-setup');
  document.getElementById('mfa-setup-msg').className = 'auth-msg';
  document.getElementById('mfa-setup-code').value = '';
  await loadMfaQr('mfa-qr-code', 'mfa-secret-key', 'mfa-setup-msg');
}

async function showMfaModal() {
  var modal = document.getElementById('mfa-inline-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mfa-inline-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px';
    modal.innerHTML =
      '<div style="background:var(--bg);border-radius:var(--rl);padding:32px;max-width:440px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.2);position:relative;max-height:90vh;overflow-y:auto">' +
        '<button onclick="closeMfaModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--txt2)">\u2715</button>' +
        '<div style="font-size:16px;font-weight:700;margin-bottom:16px">Set up two-factor auth</div>' +
        '<p style="font-size:13px;color:var(--txt2);margin-bottom:16px">Scan with <strong>Google Authenticator</strong> or <strong>Authy</strong>, then enter the 6-digit code.</p>' +
        '<div id="mfa-modal-msg" style="display:none;padding:10px 13px;border-radius:var(--r);font-size:13px;margin-bottom:12px"></div>' +
        '<div style="text-align:center;margin-bottom:16px"><div id="mfa-modal-qr" style="display:inline-block;padding:14px;background:#fff;border-radius:10px"><div style="width:180px;height:180px;background:var(--bg2);display:flex;align-items:center;justify-content:center"><div class="section-loader-ring"></div></div></div></div>' +
        '<div style="background:var(--bg2);border-radius:var(--r);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--txt2)">Manual code:<br><code id="mfa-modal-secret" style="font-size:13px;font-weight:700;color:var(--txt);letter-spacing:2px;word-break:break-all">\u2014</code></div>' +
        '<div style="margin-bottom:12px"><label style="display:block;font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:5px">6-DIGIT CODE</label>' +
          '<input type="text" id="mfa-modal-code" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code" style="width:100%;padding:10px;border:0.5px solid var(--bdr2);border-radius:var(--r);background:var(--bg);color:var(--txt);font-size:22px;letter-spacing:8px;text-align:center;font-family:monospace;outline:none" oninput="this.value=this.value.replace(/\\D/g,\'\')" onkeydown="if(event.key===\'Enter\')doMfaModalVerify()"></div>' +
        '<button class="btn btn-primary btn-full" id="mfa-modal-btn" onclick="doMfaModalVerify()">Activate 2FA</button>' +
      '</div>';
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
    document.getElementById('mfa-modal-msg').style.display = 'none';
    document.getElementById('mfa-modal-code').value = '';
  }
  await loadMfaQr('mfa-modal-qr', 'mfa-modal-secret', 'mfa-modal-msg');
}

function closeMfaModal() {
  var m = document.getElementById('mfa-inline-modal');
  if (m) m.style.display = 'none';
}

async function loadMfaQr(qrElId, secretElId, msgElId) {
  try {
    var listRes = await sbClient.auth.mfa.listFactors();
    var totp = listRes.data && listRes.data.totp;
    if (totp) {
      for (var i = 0; i < totp.length; i++) {
        if (totp[i].status !== 'verified') await sbClient.auth.mfa.unenroll({ factorId: totp[i].id });
      }
    }
    var enrolRes = await sbClient.auth.mfa.enroll({ factorType: 'totp', issuer: 'FinanceTracker', friendlyName: 'FinanceTracker-' + Date.now() });
    if (enrolRes.error) throw enrolRes.error;
    mfaFactorId = enrolRes.data.id;
    var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(enrolRes.data.totp.uri);
    document.getElementById(qrElId).innerHTML = '<img src="' + qrUrl + '" width="180" height="180" style="display:block;border-radius:4px">';
    document.getElementById(secretElId).textContent = enrolRes.data.totp.secret;
  } catch(e) {
    var el = document.getElementById(msgElId);
    if (el) { el.style.display='block'; el.style.background='var(--red-bg)'; el.style.color='var(--red-txt)'; el.textContent='Error: '+e.message; }
  }
}

async function doMfaModalVerify() {
  var code = document.getElementById('mfa-modal-code').value.trim();
  var msg  = document.getElementById('mfa-modal-msg');
  var btn  = document.getElementById('mfa-modal-btn');
  if (code.length !== 6) { msg.style.display='block'; msg.style.background='var(--red-bg)'; msg.style.color='var(--red-txt)'; msg.textContent='Please enter the 6-digit code.'; return; }
  btn.innerHTML = '<span class="spinner"></span>Activating...'; btn.disabled = true;
  try {
    var chalRes = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chalRes.error) throw chalRes.error;
    var verRes = await sbClient.auth.mfa.verify({ factorId: mfaFactorId, challengeId: chalRes.data.id, code: code });
    if (verRes.error) throw verRes.error;
    closeMfaModal(); toast('\u2713 Two-factor authentication enabled!'); renderMfaStatus();
  } catch(e) {
    msg.style.display='block'; msg.style.background='var(--red-bg)'; msg.style.color='var(--red-txt)';
    msg.textContent = e.message && e.message.includes('nvalid') ? 'Incorrect code. Try again.' : e.message;
    document.getElementById('mfa-modal-code').value = '';
  }
  btn.innerHTML = 'Activate 2FA'; btn.disabled = false;
}

async function doMfaSetupVerify() {
  var code = document.getElementById('mfa-setup-code').value.trim();
  var msg  = document.getElementById('mfa-setup-msg');
  var btn  = document.getElementById('mfa-setup-btn');
  if (code.length !== 6) { msg.className='auth-msg error'; msg.textContent='Please enter the 6-digit code from your app.'; return; }
  btn.innerHTML = '<span class="spinner"></span>Activating...'; btn.disabled = true;
  try {
    var chalRes = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (chalRes.error) throw chalRes.error;
    var verRes = await sbClient.auth.mfa.verify({ factorId: mfaFactorId, challengeId: chalRes.data.id, code: code });
    if (verRes.error) throw verRes.error;
    btn.innerHTML = 'Activate 2FA'; btn.disabled = false;
    toast('\u2713 Two-factor authentication enabled!');
    showScreen('app'); setTimeout(function(){ renderAll(); renderMfaStatus(); }, 50);
  } catch(e) {
    btn.innerHTML = 'Activate 2FA'; btn.disabled = false;
    msg.className = 'auth-msg error';
    msg.textContent = e.message && e.message.includes('nvalid') ? 'Incorrect code. Check your app.' : e.message;
    document.getElementById('mfa-setup-code').value = '';
  }
}

function skipMfaSetup() {
  showScreen('app'); setTimeout(function(){ renderAll(); }, 50);
  toast('You can enable 2FA anytime from the Family tab.');
}

async function renderMfaStatus() {
  var el = document.getElementById('mfa-status-block');
  if (!el) return;
  try {
    var res = await sbClient.auth.mfa.listFactors();
    var totp = res.data && res.data.totp;
    var enrolled = totp && totp.length > 0 && totp[0].status === 'verified';
    if (enrolled) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--green-bg);border-radius:var(--r);border:0.5px solid rgba(29,158,117,.3)">' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--green-txt)">2FA is active</div><div style="font-size:12px;color:var(--green-txt);opacity:.8;margin-top:2px">Account protected with authenticator app</div></div>' +
        '<button class="btn btn-sm btn-danger" onclick="disableMfa(\'' + totp[0].id + '\')">Remove 2FA</button></div>';
    } else {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--amber-bg);border-radius:var(--r);border:0.5px solid rgba(239,159,39,.3)">' +
        '<div><div style="font-size:13px;font-weight:600;color:var(--amber-txt)">2FA not enabled</div><div style="font-size:12px;color:var(--amber-txt);opacity:.8;margin-top:2px">Enable for extra account security</div></div>' +
        '<button class="btn btn-sm btn-primary" onclick="startMfaSetup(true)">Enable 2FA</button></div>';
    }
  } catch(e) { el.innerHTML = '<div style="font-size:13px;color:var(--txt3)">Unable to load 2FA status.</div>'; }
}

async function disableMfa(factorId) {
  if (!confirm('Remove two-factor authentication?')) return;
  var res = await sbClient.auth.mfa.unenroll({ factorId: factorId });
  if (res.error) { toast('Error: ' + res.error.message); return; }
  toast('2FA removed'); renderMfaStatus();
}
