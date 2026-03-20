// ══════════════════════════════════════════════════════════
//  FinanceTracker — app.js
//  Credentials are in config.js — edit that file only.
// ══════════════════════════════════════════════════════════

// ── STATE ──
let sbClient    = null;
let currentUser = null;
let userProfile = null;
let appConfig   = {};
let txCache     = [];
let invCache    = [];
let salaryCache = { profile: null, components: [], slips: [] };
let mfaFactorId = null; // stores factor ID during MFA challenge

// ── CHARTS ──
let barChart, pieChart, nwChart, invPieChart, eqChart, allocChart;

// ── HELPERS ──
const fmt  = n => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
const fmtP = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// ── AMOUNT MASKING (applies to all users) ──
let amountsVisible = false; // hidden by default, toggle to reveal

// fmtA = format amount — masked with inline reveal button unless globally shown
const fmtA = (n, id) => {
  if (amountsVisible) return fmt(n);
  const uid = id || 'amt-' + Math.abs(Math.round(n));
  return `<span class="masked-amount" data-val="${Math.round(n)}" data-uid="${uid}">₹&nbsp;••••<button class="mask-inline-btn" onclick="revealOne(this)" title="Show amount">👁</button></span>`;
};

// fmtASign = signed amount (P&L)
const fmtASign = (n, id) => {
  if (amountsVisible) return (n >= 0 ? '+' : '') + fmt(n);
  const uid = id || 'sgn-' + Math.abs(Math.round(n));
  return `<span class="masked-amount" data-val="${Math.round(n)}" data-signed="1" data-uid="${uid}">${n >= 0 ? '+' : '-'}••••<button class="mask-inline-btn" onclick="revealOne(this)" title="Show amount">👁</button></span>`;
};

function revealOne(btn) {
  const span = btn.closest('.masked-amount');
  if (!span) return;
  const n = parseInt(span.dataset.val);
  const signed = span.dataset.signed;
  span.outerHTML = signed
    ? ((n >= 0 ? '+' : '') + fmt(Math.abs(n)))
    : fmt(Math.abs(n));
}

function toggleAmounts() {
  amountsVisible = !amountsVisible;
  const btn = document.getElementById('mask-btn');
  if (btn) btn.textContent = amountsVisible ? '👁' : '🙈';
  renderAll();
}

const TYPE_LABELS = {
  us_stock:'US Stock', indian_stock:'Indian Stock', mutual_fund:'Mutual Fund',
  ppf:'PPF', epf:'EPF', nps:'NPS', fd:'Fixed Deposit', rd:'Recurring Deposit',
  debt_fund:'Debt Fund', bond:'Bond/NCD', sgb:'SGB',
  liquid:'Liquid Fund', gold:'Gold', real_estate:'Real Estate', crypto:'Crypto'
};
const TYPE_BADGE = {
  us_stock:'badge-us', indian_stock:'badge-in', mutual_fund:'badge-mf',
  ppf:'badge-debt', epf:'badge-debt', nps:'badge-debt',
  fd:'badge-fixed', rd:'badge-fixed', debt_fund:'badge-debt', bond:'badge-debt', sgb:'badge-gold',
  liquid:'badge-liquid', gold:'badge-gold', real_estate:'badge-re', crypto:'badge-crypto'
};
const STANDARD_RATES = { ppf:7.1, epf:8.25, sgb:2.5 };
const AVATAR_COLORS  = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E'];

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════

window.addEventListener('load', boot);

// ── LOADER HELPERS ──
function hidePageLoader() {
  const el = document.getElementById('page-loader');
  if (el) el.classList.add('hidden');
}

function showSectionLoader(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? 'flex' : 'none';
}

function setBtn(id, loading, defaultText) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (loading) {
    btn.innerHTML = `<span class="spinner"></span>`;
    btn.disabled = true;
  } else {
    btn.innerHTML = defaultText;
    btn.disabled = false;
  }
}

async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.innerHTML = '<span class="spinner spinner-dark"></span>'; btn.disabled = true; }
  const ptr = document.getElementById('ptr-indicator');
  if (ptr) ptr.classList.add('visible');
  await loadData();
  renderAll();
  if (btn) { btn.innerHTML = '↻'; btn.disabled = false; }
  if (ptr) ptr.classList.remove('visible');
  toast('✓ Data refreshed');
}

function toggleTheme() {
  const html    = document.documentElement;
  const current = html.getAttribute('data-theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark  = current === 'dark' || (!current && systemDark);
  const next    = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ft_theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (!theme && systemDark);
  btn.textContent = isDark ? '☀ Light' : '🌙 Dark';
}

// called once the app screen is visible so button exists in DOM
function applyThemeToBtn() {
  const saved = localStorage.getItem('ft_theme');
  updateThemeBtn(saved);
}

async function boot() {
  const savedTheme = localStorage.getItem('ft_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeBtn(savedTheme);

  if (!APP_SUPABASE_URL || APP_SUPABASE_URL.includes('PASTE_YOUR')) {
    hidePageLoader(); showScreen('config'); return;
  }

  sbClient = window.supabase.createClient(APP_SUPABASE_URL, APP_SUPABASE_KEY);

  try {
    const { data } = await sbClient.from('app_config').select('key,value');
    if (data) data.forEach(r => { appConfig[r.key] = r.value; });
  } catch(e) {}

  try {
    const { data: { session } } = await sbClient.auth.getSession();
    hidePageLoader();

    if (session) {
      await enterApp(session.user);
    } else {
      showScreen('auth');
    }
  } catch(e) {
    hidePageLoader();
    showScreen('auth');
  }

  sbClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !currentUser) {
      await enterApp(session.user);
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      mfaFactorId = null;
      showScreen('auth');
    }
  });
}

// Single entry point after any successful password auth
async function enterApp(user) {

  // Set currentUser immediately — this blocks any duplicate SIGNED_IN events
  // from onAuthStateChange (!currentUser guard) while we handle this flow
  currentUser = user;

  try {
    const { data: aalData, error: aalErr } = await sbClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) throw aalErr;

    const { currentLevel, nextLevel } = aalData;

    if (currentLevel === 'aal1' && nextLevel === 'aal2') {
      const { data: factorData } = await sbClient.auth.mfa.listFactors();
      const verified = factorData?.totp?.find(f => f.status === 'verified');
      if (verified) {
        mfaFactorId = verified.id;
        showScreen('mfa-verify');
        // keep currentUser set — cleared only on sign out
        return;
      }
    }
  } catch(e) {
  }

  await onLogin(user);
  showScreen('app');
  setTimeout(() => renderAll(), 50);
}

// ══════════════════════════════════════════════════════════
//  SCREENS
// ══════════════════════════════════════════════════════════

function showScreen(name) {
  const screens = ['config','auth','mfa-verify','mfa-setup','app'];
  screens.forEach(s => {
    const el = document.getElementById(s === 'app' ? 'app-screen' : s + '-screen');
    if (!el) return;
    if (s === 'app') el.style.display = name === 'app' ? 'block' : 'none';
    else el.style.display = name === s ? 'flex' : 'none';
  });
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  // sync bottom nav
  syncBottomNav(id);
  renderAll();
}

function showPageMobile(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  // also highlight desktop nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.getAttribute('onclick')?.includes("'"+id+"'")) b.classList.add('active');
  });
  renderAll();
  // scroll to top on page change
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncBottomNav(id) {
  const map = { dashboard:'bnav-dashboard', transactions:'bnav-transactions', investments:'bnav-investments', salary:'bnav-salary', family:'bnav-family', allocation:null };
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  const btnId = map[id];
  if (btnId) {
    const el = document.getElementById(btnId);
    if (el) el.classList.add('active');
  }
}

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════

function switchTab(tab) {
  document.getElementById('tab-login').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('tab-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((b, i) =>
    b.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='signup'))
  );
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const msg   = document.getElementById('login-msg');
  msg.className = 'auth-msg'; msg.style.display = 'none';
  if (!email || !pass) { msg.className='auth-msg error'; msg.textContent='Please enter your email and password.'; return; }

  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="spinner"></span>Signing in...'; btn.disabled = true;

  const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });

  // Only reset button if we're still on the auth screen (mobile may have already navigated away)
  const authScreen = document.getElementById('auth-screen');
  if (authScreen && authScreen.style.display !== 'none') {
    btn.innerHTML = 'Sign in'; btn.disabled = false;
    if (error) { msg.className='auth-msg error'; msg.textContent=error.message; }
  }
  // If no error, onAuthStateChange fires SIGNED_IN → enterApp handles everything
}

async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  const msg   = document.getElementById('signup-msg');
  const btn   = document.getElementById('signup-btn');
  if (!name||!email||!pass) { msg.className='auth-msg error'; msg.textContent='Please fill all fields.'; return; }
  if (pass.length < 6) { msg.className='auth-msg error'; msg.textContent='Password must be at least 6 characters.'; return; }
  btn.innerHTML = '<span class="spinner"></span>Creating account...'; btn.disabled = true;
  const { error } = await sbClient.auth.signUp({ email, password: pass, options: { data: { full_name: name, role: 'member' } } });
  btn.innerHTML = 'Create account'; btn.disabled = false;
  if (error) { msg.className='auth-msg error'; msg.textContent=error.message; }
  else {
    msg.className='auth-msg success';
    msg.textContent='Account created! You can now sign in.';
    setTimeout(() => { switchTab('login'); document.getElementById('login-email').value = email; }, 2000);
  }
}

async function doForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { toast('Enter your email first'); return; }
  const { error } = await sbClient.auth.resetPasswordForEmail(email);
  toast(error ? 'Error: ' + error.message : 'Password reset email sent!');
}

async function doLogout() {
  currentUser = null;
  mfaFactorId = null;
  await sbClient.auth.signOut();
}

async function onLogin(user) {
  currentUser = user;
  const { data } = await sbClient.from('profiles').select('*').eq('id', user.id).single();
  userProfile = data;
  document.getElementById('topbar-user').textContent = userProfile?.full_name || user.email.split('@')[0];
  document.getElementById('tx-date').value  = new Date().toISOString().slice(0,10);
  document.getElementById('inv-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('share-link').value = window.location.href;
  await loadData();
  setTimeout(applyThemeToBtn, 50);
}

// ══════════════════════════════════════════════════════════
//  MFA — VERIFY (existing users with MFA enrolled)
// ══════════════════════════════════════════════════════════

async function doMfaVerify() {
  const code = document.getElementById('mfa-verify-code').value.trim();
  const msg  = document.getElementById('mfa-verify-msg');
  const btn  = document.getElementById('mfa-verify-btn');
  if (code.length !== 6) { msg.className='auth-msg error'; msg.textContent='Please enter a 6-digit code.'; return; }

  btn.innerHTML = '<span class="spinner"></span>Verifying...'; btn.disabled = true;
  msg.className = 'auth-msg'; msg.style.display = 'none';

  try {
    const { data: challenge, error: ce } = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (ce) throw ce;

    const { error: ve } = await sbClient.auth.mfa.verify({
      factorId: mfaFactorId, challengeId: challenge.id, code
    });
    if (ve) throw ve;

    btn.innerHTML = 'Verify'; btn.disabled = false;
    // currentUser was already set by enterApp — just load data and go in
    await onLogin(currentUser);
    showScreen('app');
    setTimeout(() => renderAll(), 50);

  } catch(e) {
    btn.innerHTML = 'Verify'; btn.disabled = false;
    msg.className = 'auth-msg error';
    msg.textContent = e.message?.includes('nvalid') ? 'Incorrect code. Please try again.' : (e.message || 'Verification failed.');
    document.getElementById('mfa-verify-code').value = '';
    document.getElementById('mfa-verify-code').focus();
  }
}

// ══════════════════════════════════════════════════════════
//  MFA — SETUP (new users setting up MFA for the first time)
// ══════════════════════════════════════════════════════════

async function startMfaSetup(inline = false) {
  if (inline) {
    // show inline modal inside the app — don't switch screens
    showMfaModal();
    return;
  }
  // full screen setup (called right after first login)
  showScreen('mfa-setup');
  document.getElementById('mfa-setup-msg').className = 'auth-msg';
  document.getElementById('mfa-setup-code').value = '';
  await loadMfaQr('mfa-qr-code', 'mfa-secret-key', 'mfa-setup-msg');
}

async function showMfaModal() {
  // create modal overlay if not already present
  let modal = document.getElementById('mfa-inline-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mfa-inline-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px';
    modal.innerHTML = `
      <div style="background:var(--bg);border-radius:var(--rl);padding:32px;max-width:440px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.2);position:relative">
        <button onclick="closeMfaModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;cursor:pointer;font-size:18px;color:var(--txt2)">✕</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:32px;height:32px;background:var(--txt);border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--bg);font-size:14px;font-weight:700">₹</div>
          <span style="font-size:16px;font-weight:700">Set up two-factor auth</span>
        </div>
        <p style="font-size:13px;color:var(--txt2);margin-bottom:16px">Scan this QR code with <strong>Google Authenticator</strong> or <strong>Authy</strong>, then enter the 6-digit code to activate.</p>
        <div id="mfa-modal-msg" style="padding:10px 13px;border-radius:var(--r);font-size:13px;margin-bottom:12px;display:none"></div>
        <div style="text-align:center;margin-bottom:16px">
          <div id="mfa-modal-qr" style="display:inline-block;padding:14px;background:#fff;border-radius:10px;border:0.5px solid var(--bdr)">
            <div style="width:180px;height:180px;background:var(--bg2);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--txt3);font-size:12px">Loading QR...</div>
          </div>
        </div>
        <div style="background:var(--bg2);border-radius:var(--r);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--txt2)">
          Manual entry code:<br>
          <code id="mfa-modal-secret" style="font-size:13px;font-weight:700;color:var(--txt);letter-spacing:2px;word-break:break-all">—</code>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:12px;font-weight:600;color:var(--txt2);margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px">6-digit code</label>
          <input type="text" id="mfa-modal-code" placeholder="000000" maxlength="6"
            style="width:100%;padding:10px 13px;border:0.5px solid var(--bdr2);border-radius:var(--r);background:var(--bg);color:var(--txt);font-size:22px;letter-spacing:8px;text-align:center;font-family:monospace;outline:none"
            oninput="this.value=this.value.replace(/\\D/g,'')"
            onkeydown="if(event.key==='Enter')doMfaModalVerify()">
        </div>
        <button class="btn btn-primary btn-full" id="mfa-modal-btn" onclick="doMfaModalVerify()">Activate 2FA</button>
      </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
    document.getElementById('mfa-modal-msg').style.display = 'none';
    document.getElementById('mfa-modal-code').value = '';
  }
  await loadMfaQr('mfa-modal-qr', 'mfa-modal-secret', 'mfa-modal-msg');
}

function closeMfaModal() {
  const modal = document.getElementById('mfa-inline-modal');
  if (modal) modal.style.display = 'none';
}

async function loadMfaQr(qrElId, secretElId, msgElId) {
  try {
    // unenroll any existing unverified factors first to avoid "already exists" error
    const { data: { totp } } = await sbClient.auth.mfa.listFactors();
    if (totp && totp.length > 0) {
      for (const factor of totp) {
        if (factor.status !== 'verified') {
          await sbClient.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
    }

    // now enroll fresh
    const { data, error } = await sbClient.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'FinanceTracker',
      friendlyName: 'FinanceTracker-' + Date.now() // unique name prevents collision
    });
    if (error) throw error;

    mfaFactorId = data.id;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.totp.uri)}`;
    document.getElementById(qrElId).innerHTML = `<img src="${qrUrl}" width="180" height="180" alt="QR Code" style="display:block;border-radius:4px">`;
    document.getElementById(secretElId).textContent = data.totp.secret;
  } catch(e) {
    const msgEl = document.getElementById(msgElId);
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.style.cssText = 'padding:10px 13px;border-radius:8px;font-size:13px;margin-bottom:12px;background:var(--red-bg);color:var(--red-txt)';
      msgEl.textContent = 'Error: ' + e.message;
    }
  }
}

async function doMfaModalVerify() {
  const code = document.getElementById('mfa-modal-code').value.trim();
  const msg  = document.getElementById('mfa-modal-msg');
  const btn  = document.getElementById('mfa-modal-btn');
  if (code.length !== 6) {
    msg.style.display='block'; msg.style.cssText='padding:10px 13px;border-radius:8px;font-size:13px;margin-bottom:12px;background:var(--red-bg);color:var(--red-txt)';
    msg.textContent='Please enter the 6-digit code.'; return;
  }
  btn.innerHTML = '<span class="spinner"></span>Activating...'; btn.disabled = true;
  try {
    const { data: challenge, error: ce } = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (ce) throw ce;
    const { error: ve } = await sbClient.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code });
    if (ve) throw ve;
    closeMfaModal();
    toast('✓ Two-factor authentication enabled!');
    renderMfaStatus();
  } catch(e) {
    msg.style.display='block'; msg.style.cssText='padding:10px 13px;border-radius:8px;font-size:13px;margin-bottom:12px;background:var(--red-bg);color:var(--red-txt)';
    msg.textContent = e.message?.includes('Invalid') ? 'Incorrect code. Try again.' : e.message;
    document.getElementById('mfa-modal-code').value = '';
  }
  btn.innerHTML = 'Activate 2FA'; btn.disabled = false;
}

async function doMfaSetupVerify() {
  const code = document.getElementById('mfa-setup-code').value.trim();
  const msg  = document.getElementById('mfa-setup-msg');
  const btn  = document.getElementById('mfa-setup-btn');
  if (code.length !== 6) { msg.className='auth-msg error'; msg.textContent='Please enter the 6-digit code from your app.'; return; }
  btn.innerHTML = '<span class="spinner"></span>Activating...'; btn.disabled = true;
  try {
    const { data: challenge, error: ce } = await sbClient.auth.mfa.challenge({ factorId: mfaFactorId });
    if (ce) throw ce;
    const { error: ve } = await sbClient.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code });
    if (ve) throw ve;
    toast('✓ Two-factor authentication enabled!');
    showScreen('app');
    renderAll();
    renderMfaStatus();
  } catch(e) {
    msg.className = 'auth-msg error';
    msg.textContent = e.message?.includes('Invalid') ? 'Incorrect code. Check your app and try again.' : e.message;
    document.getElementById('mfa-setup-code').value = '';
  }
  btn.innerHTML = 'Activate 2FA'; btn.disabled = false;
}

function skipMfaSetup() {
  showScreen('app');
  setTimeout(() => renderAll(), 50);
  toast('You can enable 2FA anytime from the Family tab.');
}

// ══════════════════════════════════════════════════════════
//  MFA STATUS (shown in Family tab)
// ══════════════════════════════════════════════════════════

async function renderMfaStatus() {
  const el = document.getElementById('mfa-status-block');
  if (!el) return;

  try {
    const { data: { totp } } = await sbClient.auth.mfa.listFactors();
    const enrolled = totp && totp.length > 0 && totp[0].status === 'verified';

    if (enrolled) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--green-bg);border-radius:var(--r);border:0.5px solid rgba(29,158,117,.3)">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--green-txt)">2FA is active</div>
            <div style="font-size:12px;color:var(--green-txt);opacity:.8;margin-top:2px">Your account is protected with an authenticator app</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="disableMfa('${totp[0].id}')">Remove 2FA</button>
        </div>`;
    } else {
      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--amber-bg);border-radius:var(--r);border:0.5px solid rgba(239,159,39,.3)">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--amber-txt)">2FA not enabled</div>
            <div style="font-size:12px;color:var(--amber-txt);opacity:.8;margin-top:2px">Enable for extra account security</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="startMfaSetup(true)">Enable 2FA</button>
        </div>`;
    }
  } catch(e) {
    el.innerHTML = `<div style="font-size:13px;color:var(--txt3)">Unable to load 2FA status.</div>`;
  }
}

async function disableMfa(factorId) {
  if (!confirm('Remove two-factor authentication? Your account will be less secure.')) return;
  const { error } = await sbClient.auth.mfa.unenroll({ factorId });
  if (error) { toast('Error: ' + error.message); return; }
  toast('2FA removed');
  renderMfaStatus();
}

// ══════════════════════════════════════════════════════════
//  DATA LAYER
// ══════════════════════════════════════════════════════════

async function loadData() {
  const uid = currentUser.id;
  const [{ data: txs }, { data: invs }, { data: sal }, { data: comps }, { data: slips }] = await Promise.all([
    sbClient.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sbClient.from('investments').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sbClient.from('salary_profiles').select('*').eq('user_id', uid).single(),
    sbClient.from('salary_components').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
    sbClient.from('salary_slips').select('*').eq('user_id', uid).order('year', { ascending: false }).order('month', { ascending: false })
  ]);
  txCache  = txs   || [];
  invCache = invs  || [];
  salaryCache.profile    = sal   || null;
  salaryCache.components = comps || [];
  salaryCache.slips      = slips || [];
}

// ── TRANSACTIONS ──
async function saveTx() {
  const type   = document.getElementById('tx-type').value;
  const date   = document.getElementById('tx-date').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const cat    = document.getElementById('tx-cat').value;
  const note   = document.getElementById('tx-note').value.trim();
  if (!date || !amount || amount <= 0) { toast('Enter valid date and amount'); return; }
  setBtn('tx-save-btn', true);
  const { error } = await sbClient.from('transactions').insert({ user_id: currentUser.id, type, date, amount, category: cat, note });
  setBtn('tx-save-btn', false, 'Save');
  if (error) { toast('Error: ' + error.message); return; }
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value   = '';
  toast('✓ Transaction saved');
  await loadData(); renderAll();
}

async function deleteTx(id) {
  if (!confirm('Delete this transaction?')) return;
  await sbClient.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderAll();
}

// ── INVESTMENTS ──
async function saveInv() {
  const type     = document.getElementById('inv-type').value;
  const name     = document.getElementById('inv-name').value.trim();
  const amount   = parseFloat(document.getElementById('inv-amount').value);
  const current  = parseFloat(document.getElementById('inv-current').value) || amount;
  const units    = parseFloat(document.getElementById('inv-units').value)    || 0;
  const avgprice = parseFloat(document.getElementById('inv-avgprice').value) || 0;
  const date     = document.getElementById('inv-date').value;
  const maturity = document.getElementById('inv-maturity').value || null;
  if (!name || !amount || amount <= 0) { toast('Enter name and invested amount'); return; }
  const extras = collectExtraFields(type);
  setBtn('inv-save-btn', true);
  const { error } = await sbClient.from('investments').insert({
    user_id: currentUser.id, asset_type: type, name,
    amount_invested: amount, current_value: current,
    units, avg_price: avgprice,
    purchase_date: date || null,
    maturity_date: maturity,
    extra_data: extras
  });
  setBtn('inv-save-btn', false, 'Save holding');
  if (error) { toast('Error: ' + error.message); return; }
  ['inv-name','inv-amount','inv-current','inv-units','inv-avgprice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inv-maturity').value        = '';
  document.getElementById('inv-extra-fields').innerHTML = '';
  toast('✓ Holding saved');
  await loadData(); renderAll();
}

async function deleteInv(id) {
  if (!confirm('Delete this holding?')) return;
  await sbClient.from('investments').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderAll();
}

// ── SALARY ──
async function saveSalaryProfile() {
  const employer    = document.getElementById('sal-employer').value.trim();
  const designation = document.getElementById('sal-designation').value.trim();
  const frequency   = document.getElementById('sal-frequency').value;
  const fy          = document.getElementById('sal-fy').value;
  const uid = currentUser.id;
  setBtn('sal-save-btn', true);
  if (salaryCache.profile) {
    await sbClient.from('salary_profiles').update({ employer, designation, frequency, financial_year: fy }).eq('user_id', uid);
  } else {
    await sbClient.from('salary_profiles').insert({ user_id: uid, employer, designation, frequency, financial_year: fy });
  }
  setBtn('sal-save-btn', false, 'Save');
  toast('✓ Salary profile saved');
  await loadData(); renderSalary();
}

async function saveComponent(kind) {
  const isEarning = kind === 'earning';
  const nameEl   = document.getElementById(isEarning ? 'comp-earn-name'    : 'comp-ded-name');
  const amtEl    = document.getElementById(isEarning ? 'comp-earn-amount'  : 'comp-ded-amount');
  const noteEl   = document.getElementById(isEarning ? 'comp-earn-note'    : 'comp-ded-note');
  const extraEl  = document.getElementById(isEarning ? 'comp-earn-taxable' : 'comp-ded-section');
  const name   = nameEl.value.trim();
  const amount = parseFloat(amtEl.value);
  if (!name || !amount || amount <= 0) { toast('Enter name and amount'); return; }
  const { error } = await sbClient.from('salary_components').insert({
    user_id: currentUser.id, kind, name, amount_monthly: amount,
    note: noteEl.value.trim(),
    taxable: isEarning ? extraEl.value : null,
    section: !isEarning ? extraEl.value : null
  });
  if (error) { toast('Error: ' + error.message); return; }
  toast('✓ Component saved');
  nameEl.value = ''; amtEl.value = ''; noteEl.value = '';
  cancelComponent(kind);
  await loadData(); renderSalary();
}

async function deleteSalaryComponent(id) {
  if (!confirm('Remove this component?')) return;
  await sbClient.from('salary_components').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Removed'); await loadData(); renderSalary();
}

async function saveSalarySlip() {
  const month      = parseInt(document.getElementById('slip-month').value);
  const year       = parseInt(document.getElementById('slip-year').value);
  const gross      = parseFloat(document.getElementById('slip-gross').value) || 0;
  const deductions = parseFloat(document.getElementById('slip-deductions').value) || 0;
  const net        = parseFloat(document.getElementById('slip-net').value) || (gross - deductions);
  const notes      = document.getElementById('slip-notes').value.trim();
  if (!gross) { toast('Enter gross earnings'); return; }

  // snapshot current components
  const components = salaryCache.components.map(c => ({
    name: c.name, kind: c.kind, amount: Number(c.amount_monthly),
    taxable: c.taxable, section: c.section, note: c.note
  }));

  setBtn('slip-save-btn', true);
  const { error } = await sbClient.from('salary_slips').upsert({
    user_id: currentUser.id, month, year,
    gross_earnings: gross, total_deductions: deductions,
    net_salary: net, notes, components
  }, { onConflict: 'user_id,month,year' });
  setBtn('slip-save-btn', false, 'Save slip');

  if (error) { toast('Error: ' + error.message); return; }
  toast(`✓ Salary slip saved for ${MONTH_NAMES[month-1]} ${year}`);
  await loadData(); renderSalary();
}

async function deleteSalarySlip(id) {
  if (!confirm('Delete this salary slip?')) return;
  await sbClient.from('salary_slips').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderSalary();
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ══════════════════════════════════════════════════════════
//  INVESTMENT EXTRA FIELDS
// ══════════════════════════════════════════════════════════

const EXTRA_FIELDS = {
  fd:  [{id:'rate',label:'Interest rate (%/yr)',type:'number',placeholder:'e.g. 7.5',step:'0.01'},{id:'tenure',label:'Tenure (months)',type:'number',placeholder:'e.g. 12'},{id:'bank',label:'Bank / Institution',type:'text',placeholder:'e.g. SBI'},{id:'compound',label:'Compounding',type:'select',options:['Quarterly','Monthly','Half-yearly','Annually','Simple Interest']}],
  rd:  [{id:'rate',label:'Interest rate (%/yr)',type:'number',placeholder:'e.g. 7.0',step:'0.01'},{id:'monthly_dep',label:'Monthly deposit (₹)',type:'number',placeholder:'e.g. 5000'},{id:'tenure',label:'Tenure (months)',type:'number',placeholder:'e.g. 24'},{id:'bank',label:'Bank / Institution',type:'text',placeholder:'e.g. Post Office'}],
  ppf: [{id:'rate',label:'Interest rate (%/yr)',type:'number',placeholder:'7.1',value:'7.1',step:'0.01'},{id:'yearly_dep',label:'Yearly deposit (₹)',type:'number',placeholder:'e.g. 150000'},{id:'bank',label:'Bank / Post office',type:'text',placeholder:'e.g. SBI'},{id:'account_no',label:'Account number',type:'text',placeholder:'Optional'}],
  epf: [{id:'rate',label:'Interest rate (%/yr)',type:'number',placeholder:'8.25',value:'8.25',step:'0.01'},{id:'employee_contrib',label:'Employee contrib/mo (₹)',type:'number',placeholder:'e.g. 1800'},{id:'employer_contrib',label:'Employer contrib/mo (₹)',type:'number',placeholder:'e.g. 1800'},{id:'uan',label:'UAN number',type:'text',placeholder:'Optional'}],
  nps: [{id:'tier',label:'Tier',type:'select',options:['Tier I','Tier II']},{id:'fund_mgr',label:'Fund manager',type:'text',placeholder:'e.g. SBI Pension Funds'},{id:'monthly_contrib',label:'Monthly contribution (₹)',type:'number',placeholder:'e.g. 5000'},{id:'pran',label:'PRAN number',type:'text',placeholder:'Optional'}],
  bond:[{id:'rate',label:'Coupon rate (%/yr)',type:'number',placeholder:'e.g. 8.0',step:'0.01'},{id:'face_value',label:'Face value (₹)',type:'number',placeholder:'e.g. 1000'},{id:'issuer',label:'Issuer',type:'text',placeholder:'e.g. RBI, NHAI'},{id:'isin',label:'ISIN',type:'text',placeholder:'Optional'}],
  sgb: [{id:'rate',label:'Interest rate (%/yr)',type:'number',placeholder:'2.5',value:'2.5',step:'0.01'},{id:'grams',label:'Quantity (grams)',type:'number',placeholder:'e.g. 10',step:'0.001'},{id:'series',label:'Series',type:'text',placeholder:'e.g. SGB 2023-24 Series I'},{id:'issue_price',label:'Issue price/gram (₹)',type:'number',placeholder:'e.g. 5900'}],
  us_stock:    [{id:'ticker',label:'Exchange',type:'select',options:['NYSE','NASDAQ','AMEX']}],
  indian_stock:[{id:'exchange',label:'Exchange',type:'select',options:['NSE','BSE']}],
  mutual_fund: [{id:'folio',label:'Folio number',type:'text',placeholder:'Optional'},{id:'category',label:'Fund category',type:'select',options:['Large Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Index','Sectoral','International']}],
  gold:        [{id:'grams',label:'Quantity (grams)',type:'number',placeholder:'e.g. 10',step:'0.001'},{id:'form',label:'Form',type:'select',options:['Coin','Bar','Jewellery','ETF']}]
};

function toggleInvFields() {
  const type = document.getElementById('inv-type').value;
  const container = document.getElementById('inv-extra-fields');
  const fields = EXTRA_FIELDS[type];
  if (!fields || fields.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div style="margin:8px 0 4px;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">
      ${TYPE_LABELS[type]||type} details
      ${STANDARD_RATES[type] ? `<span style="margin-left:8px;background:var(--blue-bg);color:var(--blue-txt);padding:2px 8px;border-radius:10px;font-size:11px">Standard rate: ${STANDARD_RATES[type]}% p.a.</span>` : ''}
    </div>
    <div class="form-row" id="extra-fields-row"></div>`;
  const row = document.getElementById('extra-fields-row');
  fields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'form-group-inline';
    div.style.minWidth = '140px';
    if (f.type === 'select') {
      div.innerHTML = `<label>${f.label}</label><select id="extra-${f.id}">${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else {
      div.innerHTML = `<label>${f.label}</label><input type="${f.type}" id="extra-${f.id}" placeholder="${f.placeholder||''}" ${f.step?`step="${f.step}"`:''}${f.value?` value="${f.value}"`:''}  min="0">`;
    }
    row.appendChild(div);
  });
}

function collectExtraFields(type) {
  const fields = EXTRA_FIELDS[type]; if (!fields) return {};
  const result = {};
  fields.forEach(f => { const el = document.getElementById('extra-'+f.id); if (el) result[f.id] = el.value; });
  return result;
}

function formatExtraDetails(type, extra) {
  if (!extra || Object.keys(extra).length === 0) return '—';
  const parts = [];
  if (extra.rate)           parts.push(`${extra.rate}% p.a.`);
  if (extra.bank)           parts.push(extra.bank);
  if (extra.tenure)         parts.push(`${extra.tenure}mo`);
  if (extra.grams)          parts.push(`${extra.grams}g`);
  if (extra.series)         parts.push(extra.series);
  if (extra.tier)           parts.push(extra.tier);
  if (extra.category)       parts.push(extra.category);
  if (extra.exchange||extra.ticker) parts.push(extra.exchange||extra.ticker);
  if (extra.compound)       parts.push(extra.compound);
  if (extra.fund_mgr)       parts.push(extra.fund_mgr);
  if (extra.monthly_contrib) parts.push(`₹${Number(extra.monthly_contrib).toLocaleString('en-IN')}/mo`);
  if (extra.monthly_dep)    parts.push(`₹${Number(extra.monthly_dep).toLocaleString('en-IN')}/mo`);
  if (extra.yearly_dep)     parts.push(`₹${Number(extra.yearly_dep).toLocaleString('en-IN')}/yr`);
  return parts.join(' · ') || '—';
}

// ══════════════════════════════════════════════════════════
//  SALARY COMPONENT UI
// ══════════════════════════════════════════════════════════

function addComponent(kind)    { document.getElementById(`add-${kind}-form`).style.display = 'block'; }
function cancelComponent(kind) { document.getElementById(`add-${kind}-form`).style.display = 'none'; }

// ══════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════

function renderAll() {
  renderDashboard();
  renderTransactions();
  renderInvestments();
  renderAllocation();
  renderSalary();
  renderFamilyPage();
}

function filteredTx() {
  const m = parseInt(document.getElementById('filter-month')?.value) || 0;
  const y = parseInt(document.getElementById('filter-year')?.value)  || 2026;
  return txCache.filter(t => {
    if (!m) return true;
    const d = new Date(t.date);
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });
}

// ── DASHBOARD ──
function renderDashboard() {
  const tx       = filteredTx();
  const income   = tx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expenses = tx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const savings  = tx.filter(t=>t.type==='saving').reduce((s,t)=>s+Number(t.amount),0);
  const totalInv = invCache.reduce((s,i)=>s+Number(i.current_value),0);
  const savRate  = income > 0 ? (income-expenses)/income*100 : 0;
  const netCash  = income - expenses + savings;

  const nwTot = document.getElementById('nw-total');
  if (nwTot) {
    nwTot.innerHTML = fmtA(netCash + totalInv);
    document.getElementById('nw-sub').innerHTML = `Cash: ${fmtA(netCash)} + Portfolio: ${fmtA(totalInv)}`;
    document.getElementById('nw-stats').innerHTML = `
      <div class="nw-stat"><div class="nw-label">Income</div><div style="font-size:17px;font-weight:700">${fmtA(income)}</div></div>
      <div class="nw-stat"><div class="nw-label">Expenses</div><div style="font-size:17px;font-weight:700">${fmtA(expenses)}</div></div>
      <div class="nw-stat"><div class="nw-label">Savings rate</div><div style="font-size:17px;font-weight:700">${savRate.toFixed(1)}%</div></div>`;
  }
  const sc = document.getElementById('summary-cards');
  if (sc) sc.innerHTML = `
    <div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">${fmtA(income)}</div></div>
    <div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">${fmtA(expenses)}</div></div>
    <div class="metric-card"><div class="metric-label">Savings</div><div class="metric-value c-blue">${fmtA(savings)}</div><div class="metric-sub">Rate: ${savRate.toFixed(1)}%</div></div>
    <div class="metric-card"><div class="metric-label">Portfolio</div><div class="metric-value">${fmtA(totalInv)}</div><div class="metric-sub">${invCache.length} holdings</div></div>`;
  renderDashCharts(tx);
  renderQuickInsights();
}

function renderDashCharts(tx) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const incM=Array(12).fill(0), expM=Array(12).fill(0), savM=Array(12).fill(0);
  txCache.forEach(t => {
    const m = new Date(t.date).getMonth();
    if(t.type==='income')  incM[m]+=Number(t.amount);
    if(t.type==='expense') expM[m]+=Number(t.amount);
    if(t.type==='saving')  savM[m]+=Number(t.amount);
  });
  const barCtx = document.getElementById('chart-bar');
  if (barCtx) {
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, { type:'bar', data:{ labels:months, datasets:[
      {label:'Income',  data:incM, backgroundColor:'#1D9E7555', borderColor:'#1D9E75', borderWidth:1, borderRadius:4},
      {label:'Expenses',data:expM, backgroundColor:'#E24B4A55', borderColor:'#E24B4A', borderWidth:1, borderRadius:4},
      {label:'Savings', data:savM, backgroundColor:'#185FA555', borderColor:'#185FA5', borderWidth:1, borderRadius:4}
    ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'rgba(0,0,0,0.04)'},
        ticks:{callback:function(v){if(!amountsVisible)return'---';return v>=1e5?'₹'+(v/1e5).toFixed(0)+'L':v>=1e3?'₹'+(v/1e3).toFixed(0)+'K':'₹'+v}}}}}});
  }
  const cats={};
  tx.filter(t=>t.type==='expense').forEach(t=>{cats[t.category]=(cats[t.category]||0)+Number(t.amount)});
  const cL=Object.keys(cats), cV=Object.values(cats);
  const cC=['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#D4537E','#BA7517','#5DCAA5','#F09995','#9FE1CB'];
  const pieCtx = document.getElementById('chart-pie');
  if (pieCtx && cL.length>0) {
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(pieCtx,{type:'doughnut',data:{labels:cL,datasets:[{data:cV,backgroundColor:cC.slice(0,cL.length),borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'62%'}});
    const tot=cV.reduce((a,b)=>a+b,0);
    document.getElementById('legend-cat').innerHTML=cL.map((l,i)=>`<span class="legend-item"><span class="legend-dot" style="background:${cC[i%cC.length]}"></span>${l} ${tot>0?(cV[i]/tot*100).toFixed(0):0}%</span>`).join('');
  }
  const nwCtx = document.getElementById('chart-nw');
  if (nwCtx && txCache.length>0) {
    const sorted=[...txCache].sort((a,b)=>new Date(a.date)-new Date(b.date));
    let run=0, nwL=[], nwV=[];
    sorted.forEach(t=>{
      if(t.type==='income')  run+=Number(t.amount);
      if(t.type==='expense') run-=Number(t.amount);
      if(t.type==='saving')  run+=Number(t.amount);
      nwL.push(t.date.slice(5)); nwV.push(Math.round(run));
    });
    if(nwChart) nwChart.destroy();
    nwChart=new Chart(nwCtx,{type:'line',data:{labels:nwL,datasets:[{data:nwV,borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,0.07)',fill:true,tension:.35,pointRadius:nwV.length<20?3:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{grid:{color:'rgba(0,0,0,0.04)'},
          ticks:{callback:function(v){if(!amountsVisible)return'---';return v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':v>=1e3?'₹'+(v/1e3).toFixed(0)+'K':'₹'+v}}}}}});
  }
}

// ── TRANSACTIONS ──
function renderTransactions() {
  const tbody=document.getElementById('tx-table'), empty=document.getElementById('tx-empty');
  if(!tbody) return;
  showSectionLoader('tx-loading', false); // hide loader once rendering
  const srch=(document.getElementById('tx-search')?.value||'').toLowerCase();
  const tf=document.getElementById('tx-type-filter')?.value||'all';
  const txs=txCache.filter(t=>{
    const ms=(t.note||'').toLowerCase().includes(srch)||(t.category||'').toLowerCase().includes(srch)||t.type.includes(srch)||String(t.amount).includes(srch);
    return ms&&(tf==='all'||t.type===tf);
  });
  if(txs.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';return}
  if(empty)empty.style.display='none';
  tbody.innerHTML=txs.map(t=>`<tr>
    <td style="color:var(--txt2);white-space:nowrap">${t.date}</td>
    <td><span class="tag tag-${t.type}">${t.type}</span></td>
    <td>${t.category||'—'}</td>
    <td style="color:var(--txt2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.note||'—'}</td>
    <td style="text-align:right;font-weight:700;color:${t.type==='income'?'var(--green)':t.type==='expense'?'var(--red)':'var(--blue)'}">${fmtA(t.amount)}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteTx(${t.id})">✕</button></td>
  </tr>`).join('');
}

// ── SALARY ──
function renderSalary() {
  if (salaryCache.profile) {
    const p = salaryCache.profile;
    document.getElementById('sal-employer').value    = p.employer    || '';
    document.getElementById('sal-designation').value = p.designation || '';
    document.getElementById('sal-frequency').value   = p.frequency   || 'monthly';
    document.getElementById('sal-fy').value          = p.financial_year || '2025-26';
  }
  const comps      = salaryCache.components;
  const earnings   = comps.filter(c=>c.kind==='earning');
  const deductions = comps.filter(c=>c.kind==='deduction');
  const earningTotal   = earnings.reduce((s,c)=>s+Number(c.amount_monthly),0);
  const deductionTotal = deductions.reduce((s,c)=>s+Number(c.amount_monthly),0);
  const netSalary      = earningTotal - deductionTotal;

  const earEl = document.getElementById('earnings-list');
  if(earEl) earEl.innerHTML = earnings.length===0
    ? '<div style="color:var(--txt3);font-size:13px;padding:8px 0">No earnings added yet.</div>'
    : earnings.map(c=>`<div class="salary-component-row">
        <div class="comp-name">${c.name}</div>
        <div><span class="comp-tag comp-earning">${c.taxable==='no'?'Exempt':c.taxable==='partial'?'Partial':c.taxable==='yes'?'Taxable':''}</span></div>
        <div style="font-size:11px;color:var(--txt3);flex:2">${c.note||''}</div>
        <div class="comp-amount c-green">${fmtA(c.amount_monthly)}<span style="font-size:10px;font-weight:400">/mo</span></div>
        <button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent(${c.id})" style="margin-left:6px">✕</button>
      </div>`).join('');

  const dedEl = document.getElementById('deductions-list');
  if(dedEl) dedEl.innerHTML = deductions.length===0
    ? '<div style="color:var(--txt3);font-size:13px;padding:8px 0">No deductions added yet.</div>'
    : deductions.map(c=>`<div class="salary-component-row">
        <div class="comp-name">${c.name}</div>
        <div><span class="comp-tag comp-deduction">${c.section||''}</span></div>
        <div style="font-size:11px;color:var(--txt3);flex:2">${c.note||''}</div>
        <div class="comp-amount c-red">${fmtA(c.amount_monthly)}<span style="font-size:10px;font-weight:400">/mo</span></div>
        <button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent(${c.id})" style="margin-left:6px">✕</button>
      </div>`).join('');

  // auto-fill slip form with component totals
  if (earningTotal > 0) {
    const grossEl = document.getElementById('slip-gross');
    const dedEl2  = document.getElementById('slip-deductions');
    const netEl   = document.getElementById('slip-net');
    if (grossEl && !grossEl.value) grossEl.value = earningTotal;
    if (dedEl2  && !dedEl2.value)  dedEl2.value  = deductionTotal;
    if (netEl   && !netEl.value)   netEl.value   = netSalary > 0 ? netSalary : '';
    // update preview
    const preview = document.getElementById('slip-preview');
    if (preview) preview.innerHTML = earningTotal > 0 ? `Based on components: Gross ${fmtA(earningTotal)} − Deductions ${fmtA(deductionTotal)} = Net ${fmtA(netSalary)}` : '';
  }

  // set current month in slip form
  const now = new Date();
  const slipMonthEl = document.getElementById('slip-month');
  const slipYearEl  = document.getElementById('slip-year');
  if (slipMonthEl && !slipMonthEl.dataset.set) {
    slipMonthEl.value = now.getMonth() + 1;
    if (slipYearEl) slipYearEl.value = now.getFullYear();
    slipMonthEl.dataset.set = '1';
  }

  // annual summary
  const sumEl = document.getElementById('salary-summary');
  if(sumEl) {
    const s80C = deductions.filter(c=>c.section==='80C').reduce((s,c)=>s+Number(c.amount_monthly)*12,0);
    const s80D = deductions.filter(c=>c.section==='80D').reduce((s,c)=>s+Number(c.amount_monthly)*12,0);
    const tds  = deductions.filter(c=>c.section==='TDS').reduce((s,c)=>s+Number(c.amount_monthly),0);
    // also sum from saved slips for actual vs expected
    const yearSlips = salaryCache.slips.filter(s => {
      const fy = (salaryCache.profile?.financial_year || '2025-26').split('-');
      const fyStart = parseInt('20' + (fy[0]?.slice(-2) || '25'));
      return (s.month >= 4 && s.year === fyStart) || (s.month < 4 && s.year === fyStart + 1);
    });
    const actualGross = yearSlips.reduce((s,sl)=>s+Number(sl.gross_earnings),0);
    const actualNet   = yearSlips.reduce((s,sl)=>s+Number(sl.net_salary),0);

    sumEl.innerHTML = `
      <div class="grid3" style="margin-bottom:16px">
        <div class="metric-card"><div class="metric-label">Expected gross/mo</div><div class="metric-value c-green">${fmtA(earningTotal)}</div><div class="metric-sub">${fmtA(earningTotal*12)}/yr</div></div>
        <div class="metric-card"><div class="metric-label">Expected deductions/mo</div><div class="metric-value c-red">${fmtA(deductionTotal)}</div><div class="metric-sub">${fmtA(deductionTotal*12)}/yr</div></div>
        <div class="metric-card"><div class="metric-label">Expected net/mo</div><div class="metric-value">${fmtA(netSalary)}</div><div class="metric-sub">${fmtA(netSalary*12)}/yr</div></div>
      </div>
      ${yearSlips.length > 0 ? `
      <div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Actual (from ${yearSlips.length} recorded slips)</div>
      <div class="grid2" style="margin-bottom:16px">
        <div class="metric-card"><div class="metric-label">Actual gross (FY)</div><div class="metric-value c-green">${fmtA(actualGross)}</div></div>
        <div class="metric-card"><div class="metric-label">Actual net (FY)</div><div class="metric-value">${fmtA(actualNet)}</div></div>
      </div>` : ''}
      ${s80C>0||s80D>0||tds>0?`
      <div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Tax summary</div>
      <div class="grid3">
        ${s80C>0?`<div class="metric-card"><div class="metric-label">80C/yr</div><div class="metric-value c-blue">${fmtA(s80C)}</div><div class="metric-sub">Limit: ₹1,50,000</div></div>`:''}
        ${s80D>0?`<div class="metric-card"><div class="metric-label">80D/yr</div><div class="metric-value c-blue">${fmtA(s80D)}</div><div class="metric-sub">Limit: ₹25,000–50,000</div></div>`:''}
        ${tds>0?`<div class="metric-card"><div class="metric-label">TDS/mo</div><div class="metric-value c-amber">${fmtA(tds)}</div><div class="metric-sub">${fmtA(tds*12)}/yr</div></div>`:''}
      </div>`:''}`;
  }

  renderSalarySlips();
}

function renderSalarySlips() {
  const el    = document.getElementById('salary-slips-list');
  const empty = document.getElementById('salary-slips-empty');
  if (!el) return;

  const yearFilter = parseInt(document.getElementById('slip-year-filter')?.value || new Date().getFullYear());
  const slips = salaryCache.slips.filter(s => s.year === yearFilter);

  if (slips.length === 0) {
    el.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // annual totals
  const totalGross = slips.reduce((s,sl)=>s+Number(sl.gross_earnings),0);
  const totalDed   = slips.reduce((s,sl)=>s+Number(sl.total_deductions),0);
  const totalNet   = slips.reduce((s,sl)=>s+Number(sl.net_salary),0);

  el.innerHTML = `
    <div class="grid3" style="margin-bottom:14px">
      <div class="metric-card"><div class="metric-label">Total gross (${yearFilter})</div><div class="metric-value c-green">${fmtA(totalGross)}</div><div class="metric-sub">${slips.length} months recorded</div></div>
      <div class="metric-card"><div class="metric-label">Total deductions</div><div class="metric-value c-red">${fmtA(totalDed)}</div></div>
      <div class="metric-card"><div class="metric-label">Total net pay</div><div class="metric-value">${fmtA(totalNet)}</div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Month</th><th>Gross (₹)</th><th>Deductions (₹)</th><th>Net take-home (₹)</th><th class="hide-mobile">Notes</th><th></th></tr></thead>
        <tbody>
          ${slips.map(sl => `<tr>
            <td style="font-weight:600">${MONTH_NAMES[sl.month-1]} ${sl.year}</td>
            <td class="c-green" style="font-weight:600">${fmtA(sl.gross_earnings)}</td>
            <td class="c-red">${fmtA(sl.total_deductions)}</td>
            <td style="font-weight:700">${fmtA(sl.net_salary)}</td>
            <td class="hide-mobile" style="font-size:12px;color:var(--txt2)">${sl.notes||'—'}</td>
            <td>
              <button class="btn btn-sm" onclick="prefillSlip(${sl.month},${sl.year},${sl.gross_earnings},${sl.total_deductions},${sl.net_salary})" title="Copy to form">✎</button>
              <button class="btn btn-sm btn-danger" onclick="deleteSalarySlip(${sl.id})">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function prefillSlip(month, year, gross, ded, net) {
  document.getElementById('slip-month').value      = month;
  document.getElementById('slip-year').value       = year;
  document.getElementById('slip-gross').value      = gross;
  document.getElementById('slip-deductions').value = ded;
  document.getElementById('slip-net').value        = net;
  // scroll to slip form
  document.getElementById('slip-save-btn')?.scrollIntoView({ behavior:'smooth', block:'center' });
  toast('Slip prefilled — edit and save to update');
}

// ── INVESTMENTS ──
function renderInvestments() {
  const tbody=document.getElementById('inv-table'), empty=document.getElementById('inv-empty');
  if(!tbody) return;
  const srch=(document.getElementById('inv-search')?.value||'').toLowerCase();
  const invs=invCache.filter(i=>i.name.toLowerCase().includes(srch)||(TYPE_LABELS[i.asset_type]||'').toLowerCase().includes(srch));
  if(invs.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';}
  else {
    if(empty)empty.style.display='none';
    tbody.innerHTML=invs.map(i=>{
      const pnl=Number(i.current_value)-Number(i.amount_invested);
      const pct=Number(i.amount_invested)>0?pnl/Number(i.amount_invested)*100:0;
      return `<tr>
        <td><div class="holding-name">${i.name}</div><div class="holding-meta">${i.units>0?i.units+' units':''} ${i.avg_price>0?'· avg ₹'+i.avg_price:''} ${i.purchase_date?'· '+i.purchase_date:''}</div></td>
        <td><span class="badge ${TYPE_BADGE[i.asset_type]||'badge-in'}">${TYPE_LABELS[i.asset_type]||i.asset_type}</span></td>
        <td style="font-size:12px;color:var(--txt2)">${formatExtraDetails(i.asset_type,i.extra_data||{})}</td>
        <td>${fmtA(i.amount_invested)}</td><td>${fmtA(i.current_value)}</td>
        <td style="text-align:right;font-weight:700;color:${pnl>=0?'var(--green)':'var(--red)'}">${fmtASign(pnl)}</td>
        <td style="text-align:right;color:${pct>=0?'var(--green)':'var(--red)'}">${fmtP(pct)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteInv(${i.id})">✕</button></td>
      </tr>`;
    }).join('');
  }
  const totalV=invCache.reduce((s,i)=>s+Number(i.current_value),0);
  const totalA=invCache.reduce((s,i)=>s+Number(i.amount_invested),0);
  const pnl=totalV-totalA, pct=totalA>0?pnl/totalA*100:0;
  const tc=document.getElementById('inv-top-cards');
  if(tc) tc.innerHTML=`
    <div class="metric-card"><div class="metric-label">Invested</div><div class="metric-value">${fmtA(totalA)}</div></div>
    <div class="metric-card"><div class="metric-label">Current value</div><div class="metric-value">${fmtA(totalV)}</div></div>
    <div class="metric-card"><div class="metric-label">P&L</div><div class="metric-value ${pnl>=0?'c-green':'c-red'}">${fmtASign(pnl)}</div><div class="metric-sub">${fmtP(pct)}</div></div>
    <div class="metric-card"><div class="metric-label">Holdings</div><div class="metric-value">${invCache.length}</div></div>`;
  renderInvCharts(totalV);
}

function renderInvCharts(total) {
  const byType={};
  invCache.forEach(i=>{byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value)});
  const invCtx=document.getElementById('chart-inv-pie'), legInv=document.getElementById('legend-inv');
  if(invCtx && invCache.length>0){
    const entries=Object.entries(byType).filter(([,v])=>v>0);
    const labels=entries.map(([k])=>TYPE_LABELS[k]||k), vals=entries.map(([,v])=>v);
    const cols=['#185FA5','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#BA7517','#5DCAA5','#9FE1CB','#F09995'];
    if(invPieChart) invPieChart.destroy();
    invPieChart=new Chart(invCtx,{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:cols.slice(0,labels.length),borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
    if(legInv) legInv.innerHTML=labels.map((l,i)=>`<span class="legend-item"><span class="legend-dot" style="background:${cols[i%cols.length]}"></span>${l} ${total>0?(vals[i]/total*100).toFixed(1):0}%</span>`).join('');
  }
  const eqCtx=document.getElementById('chart-eq-split'), legEq=document.getElementById('legend-eq');
  if(eqCtx){
    const us=byType.us_stock||0, indian=byType.indian_stock||0, mf=byType.mutual_fund||0;
    const eL=[],eV=[],eC=[];
    if(us>0){eL.push('US Stocks');eV.push(us);eC.push('#185FA5')}
    if(indian>0){eL.push('Indian Stocks');eV.push(indian);eC.push('#1D9E75')}
    if(mf>0){eL.push('Mutual Funds');eV.push(mf);eC.push('#EF9F27')}
    if(eL.length>0){
      if(eqChart) eqChart.destroy();
      eqChart=new Chart(eqCtx,{type:'doughnut',data:{labels:eL,datasets:[{data:eV,backgroundColor:eC,borderWidth:0}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'60%'}});
      const et=eV.reduce((a,b)=>a+b,0);
      if(legEq) legEq.innerHTML=eL.map((l,i)=>`<span class="legend-item"><span class="legend-dot" style="background:${eC[i]}"></span>${l} ${et>0?(eV[i]/et*100).toFixed(1):0}%</span>`).join('');
    }
  }
}

// ── ALLOCATION ──
function renderAllocation() {
  const total=invCache.reduce((s,i)=>s+Number(i.current_value),0);
  const byType={};
  invCache.forEach(i=>{byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value)});
  const equity=(byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0);
  const debt=(byType.ppf||0)+(byType.epf||0)+(byType.nps||0)+(byType.bond||0)+(byType.debt_fund||0);
  const fixed=(byType.fd||0)+(byType.rd||0);
  const liquid=byType.liquid||0, gold=(byType.gold||0)+(byType.sgb||0), re=byType.real_estate||0, crypto=byType.crypto||0;

  function prog(label,val,color,note=''){
    const pct=total>0?val/total*100:0;
    return `<div class="progress-wrap"><div class="progress-header"><span class="progress-label">${label}</span><span class="progress-value">${fmtA(val)} <strong>${pct.toFixed(1)}%</strong></span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    ${note?`<div style="font-size:11px;color:var(--txt3);margin-top:3px">${note}</div>`:''}</div>`;
  }

  const ab=document.getElementById('alloc-blocks');
  if(ab) ab.innerHTML=[
    equity>0?prog('Equity',equity,'#1D9E75','Stocks + Mutual Funds'):'',
    debt>0?prog('Debt',debt,'#EF9F27','PPF / EPF / NPS / Bonds'):'',
    fixed>0?prog('Fixed',fixed,'#E24B4A','FD / RD'):'',
    liquid>0?prog('Liquid',liquid,'#378ADD','Liquid funds'):'',
    gold>0?prog('Gold / SGB',gold,'#BA7517'):'',
    re>0?prog('Real Estate',re,'#5DCAA5'):'',
    crypto>0?prog('Crypto',crypto,'#7F77DD'):'',
    total===0?'<div class="empty-state"><div class="empty-icon">📊</div>Add investments to see allocation</div>':''
  ].join('');

  const gb=document.getElementById('geo-blocks');
  const us=byType.us_stock||0, indian=byType.indian_stock||0;
  if(gb) gb.innerHTML=us+indian>0?prog('US equities',us,'#185FA5')+prog('Indian equities',indian,'#1D9E75')
    :'<div style="color:var(--txt3);font-size:13px">No direct stock holdings.</div>';

  const lb=document.getElementById('liquidity-blocks');
  if(lb) lb.innerHTML=`<div class="grid2" style="margin-bottom:12px">
    <div class="metric-card"><div class="metric-label">Liquid</div><div class="metric-value c-blue">${fmtA(liquid)}</div><div class="metric-sub">Redeemable in 1–3 days</div></div>
    <div class="metric-card"><div class="metric-label">Fixed / Locked</div><div class="metric-value">${fmtA(fixed+debt)}</div><div class="metric-sub">FD, PPF, Bonds, NPS</div></div>
  </div>${prog('Liquid',liquid,'#378ADD')}${prog('Fixed/Locked',fixed+debt,'#EF9F27')}`;

  const inc=txCache.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=txCache.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const rate=inc>0?(inc-exp)/inc*100:0;
  const srb=document.getElementById('savings-rate-block');
  if(srb){
    const col=rate>=30?'var(--green)':rate>=20?'var(--amber)':'var(--red)';
    srb.innerHTML=`<div class="grid3" style="margin-bottom:16px">
      <div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">${fmtA(inc)}</div></div>
      <div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">${fmtA(exp)}</div></div>
      <div class="metric-card"><div class="metric-label">Savings rate</div><div class="metric-value" style="color:${col}">${rate.toFixed(1)}%</div></div>
    </div>
    <div class="progress-bar" style="height:10px;margin-bottom:8px"><div class="progress-fill" style="width:${Math.min(rate,100)}%;background:${col}"></div></div>
    <div style="font-size:12px;color:var(--txt2)">${rate>=30?'Excellent! On track for financial independence.':rate>=20?'Good — push towards 30%+.':'Below recommended. Aim to cut expenses or increase income.'}</div>`;
  }

  const debtH=invCache.filter(i=>['ppf','epf','nps','fd','rd','bond','debt_fund','sgb'].includes(i.asset_type));
  const dd=document.getElementById('debt-detail');
  if(dd){
    if(debtH.length===0){dd.innerHTML='<div style="color:var(--txt3);font-size:13px">No debt instruments tracked.</div>';return;}
    dd.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Details</th><th>Invested</th><th>Current</th><th>Return</th></tr></thead><tbody>${
      debtH.map(i=>{const pnl=Number(i.current_value)-Number(i.amount_invested);const pct=Number(i.amount_invested)>0?pnl/Number(i.amount_invested)*100:0;
        return `<tr><td>${i.name}</td><td><span class="badge badge-debt">${TYPE_LABELS[i.asset_type]}</span></td><td style="font-size:12px;color:var(--txt2)">${formatExtraDetails(i.asset_type,i.extra_data||{})}</td><td>${fmtA(i.amount_invested)}</td><td>${fmtA(i.current_value)}</td><td style="color:${pct>=0?'var(--green)':'var(--red)'}">${fmtP(pct)}</td></tr>`;
      }).join('')
    }</tbody></table></div>`;
  }

  const allocCtx=document.getElementById('chart-alloc'), legAlloc=document.getElementById('legend-alloc');
  if(allocCtx&&total>0){
    const aData=[{l:'Equity',v:equity,c:'#1D9E75'},{l:'Debt',v:debt,c:'#EF9F27'},{l:'Fixed',v:fixed,c:'#E24B4A'},{l:'Liquid',v:liquid,c:'#378ADD'},{l:'Gold',v:gold,c:'#BA7517'},{l:'Real Estate',v:re,c:'#5DCAA5'},{l:'Crypto',v:crypto,c:'#7F77DD'}].filter(d=>d.v>0);
    // convert to percentages for Y-axis (avoids showing rupee amounts on chart)
    const aDataPct = aData.map(d => ({ ...d, pct: parseFloat((d.v/total*100).toFixed(1)) }));
    if(allocChart) allocChart.destroy();
    allocChart=new Chart(allocCtx,{
      type:'bar',
      data:{
        labels: aDataPct.map(d=>d.l),
        datasets:[{
          data: aDataPct.map(d=>d.pct),
          backgroundColor: aDataPct.map(d=>d.c),
          borderRadius:6, borderSkipped:false
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label: ctx => `${ctx.parsed.y}% of portfolio`}}
        },
        scales:{
          x:{grid:{display:false}},
          y:{
            grid:{color:'rgba(0,0,0,0.04)'},
            ticks:{callback: v => v+'%'},
            max: 100
          }
        }
      }
    });
    if(legAlloc) legAlloc.innerHTML=aDataPct.map(d=>`<span class="legend-item"><span class="legend-dot" style="background:${d.c}"></span>${d.l} ${d.pct}%</span>`).join('');
  }
}

// ── QUICK INSIGHTS ──
function renderQuickInsights() {
  const el=document.getElementById('quick-insights'); if(!el) return;
  const insights=[];
  const inc=txCache.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=txCache.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const savRate=inc>0?(inc-exp)/inc*100:0;
  const totalInv=invCache.reduce((s,i)=>s+Number(i.current_value),0);
  const totalAmt=invCache.reduce((s,i)=>s+Number(i.amount_invested),0);
  const byType={};
  invCache.forEach(i=>{byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value)});
  const liquid=byType.liquid||0, monthlyExp=exp/12;
  const eqR=totalInv>0?((byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0))/totalInv:0;
  const pnl=totalInv-totalAmt;

  if(inc>0&&savRate>=30) insights.push({t:'good',title:'Excellent savings rate',desc:`Saving ${savRate.toFixed(1)}% of income — above 30% benchmark.`});
  else if(inc>0&&savRate<10) insights.push({t:'bad',title:'Critical: very low savings rate',desc:`${savRate.toFixed(1)}% savings rate. Risk of living paycheck-to-paycheck.`});
  else if(inc>0&&savRate<20) insights.push({t:'warn',title:'Low savings rate',desc:`${savRate.toFixed(1)}% savings rate. Target 20–30%+.`});
  if(inc>0&&monthlyExp>0&&liquid<monthlyExp*3) insights.push({t:'warn',title:'Emergency fund insufficient',desc:`Liquid assets (${fmtA(liquid)}) cover less than 3 months. Target: ${fmtA(monthlyExp*6)}.`});
  if(totalInv>0&&!(byType.us_stock>0)) insights.push({t:'info',title:'No US stock exposure',desc:'Consider US index ETFs for international diversification.'});
  if(totalInv>0&&eqR>0.85) insights.push({t:'warn',title:'High equity concentration',desc:`${(eqR*100).toFixed(0)}% in equities. Consider rebalancing.`});
  if(pnl>0&&totalAmt>0) insights.push({t:'good',title:'Portfolio in profit',desc:`Overall gain: ${fmtA(pnl)} (${fmtP(pnl/totalAmt*100)}).`});
  if(!(byType.ppf>0)&&!(byType.epf>0)) insights.push({t:'info',title:'No PPF/EPF tracked',desc:'Track PPF and EPF in Investments for a complete net worth picture.'});
  if(insights.length===0) insights.push({t:'info',title:'Add data for insights',desc:'Enter income, expenses, and investments to receive personalised insights.'});
  el.innerHTML=insights.map(i=>`<div class="insight-item insight-${i.t}"><div class="insight-title">${i.title}</div><div class="insight-desc">${i.desc}</div></div>`).join('');
}

// ── FAMILY ──
async function renderFamilyPage() {
  const el=document.getElementById('family-list'); if(!el||!currentUser) return;
  const mp=document.getElementById('my-profile');
  if(mp&&userProfile){
    const name=userProfile.full_name||currentUser.email;
    const initials=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    mp.innerHTML=`<div class="family-member-card">
      <div class="member-avatar" style="background:#185FA520;color:#185FA5">${initials}</div>
      <div class="member-info"><div class="member-name">${name}</div><div style="font-size:11px;color:var(--txt2)">${currentUser.email}</div></div>
      <span class="member-role role-member">member</span>
    </div>`;
  }
  await renderMfaStatus();
  const {data:profiles}=await sbClient.from('profiles').select('*');
  if(!profiles||profiles.length===0){el.innerHTML='<div style="color:var(--txt3);font-size:13px">Only your profile is visible.</div>';return;}
  el.innerHTML=profiles.map((p,idx)=>{
    const name=p.full_name||'—';
    const initials=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const col=AVATAR_COLORS[idx%AVATAR_COLORS.length];
    const isMe=p.id===currentUser.id;
    return `<div class="family-member-card">
      <div class="member-avatar" style="background:${col}22;color:${col}">${initials}</div>
      <div class="member-info"><div class="member-name">${name} ${isMe?'<span style="font-size:10px;color:var(--txt3)">(you)</span>':''}</div></div>
      <span class="member-role role-member">${p.role||'member'}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════

function exportExcel() {
  const wb=XLSX.utils.book_new();
  const inc=txCache.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=txCache.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const sav=txCache.filter(t=>t.type==='saving').reduce((s,t)=>s+Number(t.amount),0);
  const totalV=invCache.reduce((s,i)=>s+Number(i.current_value),0);
  const totalA=invCache.reduce((s,i)=>s+Number(i.amount_invested),0);
  const name=userProfile?.full_name||currentUser?.email||'User';
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ['PERSONAL FINANCE SUMMARY — '+name,''],['Generated',new Date().toLocaleDateString('en-IN')],['',''],
    ['Income (₹)',inc],['Expenses (₹)',exp],['Savings (₹)',sav],
    ['Savings Rate (%)',inc>0?parseFloat(((inc-exp)/inc*100).toFixed(2)):0],
    ['',''],['Portfolio Invested (₹)',totalA],['Current Value (₹)',totalV],
    ['P&L (₹)',totalV-totalA],['Return (%)',totalA>0?parseFloat(((totalV-totalA)/totalA*100).toFixed(2)):0]
  ]),'Summary');
  const txRows=[['Date','Type','Category','Note','Amount (₹)']];
  txCache.forEach(t=>txRows.push([t.date,t.type,t.category||'',t.note||'',Number(t.amount)]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(txRows),'Transactions');
  const invRows=[['Name','Type','Invested (₹)','Current (₹)','P&L (₹)','Return (%)','Units','Avg Price','Date','Maturity','Details']];
  invCache.forEach(i=>{const pnl=Number(i.current_value)-Number(i.amount_invested);const pct=Number(i.amount_invested)>0?parseFloat((pnl/Number(i.amount_invested)*100).toFixed(2)):0;
    invRows.push([i.name,TYPE_LABELS[i.asset_type]||i.asset_type,Number(i.amount_invested),Number(i.current_value),pnl,pct,i.units||0,i.avg_price||0,i.purchase_date||'',i.maturity_date||'',formatExtraDetails(i.asset_type,i.extra_data||{})]);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(invRows),'Investments');
  if(salaryCache.components.length>0){
    const salRows=[['Component','Kind','Amount/Month (₹)','Taxable/Section','Note']];
    salaryCache.components.forEach(c=>salRows.push([c.name,c.kind,Number(c.amount_monthly),c.taxable||c.section||'',c.note||'']));
    const et=salaryCache.components.filter(c=>c.kind==='earning').reduce((s,c)=>s+Number(c.amount_monthly),0);
    const dt=salaryCache.components.filter(c=>c.kind==='deduction').reduce((s,c)=>s+Number(c.amount_monthly),0);
    salRows.push(['','','','',''],['Gross/Month','',et,'',''],['Deductions/Month','',dt,'',''],['Net/Month','',et-dt,'','']);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(salRows),'Salary');
  }
  const byType={};invCache.forEach(i=>{byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value)});
  const tot=Object.values(byType).reduce((s,v)=>s+v,0);
  const allocRows=[['Type','Value (₹)','%']];
  Object.entries(byType).forEach(([k,v])=>allocRows.push([TYPE_LABELS[k]||k,Math.round(v),tot>0?parseFloat((v/tot*100).toFixed(2)):0]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(allocRows),'Allocation');
  XLSX.writeFile(wb,'FinanceTracker_'+name.replace(/\s/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('✓ Excel exported!');
}

function exportJSON() {
  const blob=new Blob([JSON.stringify({transactions:txCache,investments:invCache,salary:salaryCache},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FinanceBackup_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  toast('✓ Backup downloaded');
}

async function importJSON(event) {
  const file=event.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const d=JSON.parse(e.target.result);
      if(!d.transactions||!d.investments){toast('Invalid backup file');return}
      let txOk=0,invOk=0;
      for(const t of d.transactions){const{error}=await sbClient.from('transactions').insert({user_id:currentUser.id,type:t.type,date:t.date,amount:t.amount,category:t.cat||t.category||'Other',note:t.note||''});if(!error)txOk++;}
      for(const i of d.investments){const{error}=await sbClient.from('investments').insert({user_id:currentUser.id,asset_type:i.type||i.asset_type,name:i.name,amount_invested:i.amount||i.amount_invested,current_value:i.current||i.current_value,units:i.units||0,avg_price:i.avgprice||i.avg_price||0,purchase_date:i.date||i.purchase_date||null,extra_data:i.extra_data||{}});if(!error)invOk++;}
      await loadData(); renderAll();
      toast(`✓ Imported ${txOk} transactions, ${invOk} investments`);
    }catch(err){toast('Error: '+err.message)}
  };
  reader.readAsText(file);
  event.target.value='';
}

async function deleteAllMyData() {
  if(!confirm('Permanently delete ALL your data? Cannot be undone.')) return;
  if(!confirm('Final confirmation — delete everything?')) return;
  await Promise.all([
    sbClient.from('transactions').delete().eq('user_id',currentUser.id),
    sbClient.from('investments').delete().eq('user_id',currentUser.id),
    sbClient.from('salary_components').delete().eq('user_id',currentUser.id),
    sbClient.from('salary_profiles').delete().eq('user_id',currentUser.id),
    sbClient.from('salary_slips').delete().eq('user_id',currentUser.id)
  ]);
  await loadData(); renderAll(); toast('All data deleted');
}

function copyLink() {
  navigator.clipboard.writeText(document.getElementById('share-link').value).then(()=>toast('Link copied!')).catch(()=>toast('Copy the link manually'));
}

function toast(msg, dur=2400) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),dur);
}
