// ══════════════════════════════════════════════════════════
//  OWNER: Fill in your Supabase credentials below
//  (anon key is public by design — safe to commit to GitHub)
// ══════════════════════════════════════════════════════════
const APP_SUPABASE_URL = 'https://wrfklddhrtotzremoepp.supabase.co';
const APP_SUPABASE_KEY = 'sb_publishable_2C7JVxn65eFuauj-fvUQpg_pGwNKnEx';
// hCaptcha sitekey is stored in your Supabase app_config table
// ══════════════════════════════════════════════════════════

// ── STATE ──
let sbClient     = null;
let currentUser  = null;
let userProfile  = null;
let appConfig    = {};
let txCache      = [];
let invCache     = [];
let salaryCache  = { profile: null, components: [] };
let loginCaptchaId  = null;
let signupCaptchaId = null;

// ── CHARTS ──
let barChart, pieChart, nwChart, invPieChart, eqChart, allocChart;

// ── CONSTANTS ──
const fmt  = n => '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
const fmtP = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

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

// Standard rates for government instruments
const STANDARD_RATES = {
  ppf: 7.1,
  epf: 8.25,
  nps: null, // market-linked
  sgb: 2.5   // fixed interest on issue price
};

const AVATAR_COLORS = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E'];

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════

window.addEventListener('load', boot);

async function boot() {
  const url = APP_SUPABASE_URL;
  const key = APP_SUPABASE_KEY;
  if (!url || url.includes('PASTE_YOUR') || !key || key.includes('PASTE_YOUR')) {
    showScreen('config'); return;
  }

  // init client FIRST
  sbClient = window.supabase.createClient(url, key);

  // fetch app_config (hcaptcha sitekey etc.) — fail silently
  try {
    const { data } = await sbClient.from('app_config').select('key, value');
    if (data) data.forEach(r => { appConfig[r.key] = r.value; });
  } catch(e) { console.warn('app_config not ready:', e.message); }

  // auth
  try {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) await onLogin(session.user);
    else showScreen('auth');

    sbClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) await onLogin(session.user);
      if (event === 'SIGNED_OUT') { currentUser = null; showScreen('auth'); }
    });
  } catch(e) { console.error('Auth boot error:', e); showScreen('auth'); }
}

// ══════════════════════════════════════════════════════════
//  SCREEN & NAV
// ══════════════════════════════════════════════════════════

function showScreen(name) {
  document.getElementById('config-screen').style.display = name === 'config' ? 'flex' : 'none';
  document.getElementById('auth-screen').style.display   = name === 'auth'   ? 'flex' : 'none';
  document.getElementById('app-screen').style.display    = name === 'app'    ? 'block' : 'none';
  if (name === 'auth') initCaptchas();
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  renderAll();
}

// ══════════════════════════════════════════════════════════
//  CAPTCHA
// ══════════════════════════════════════════════════════════

function initCaptchas() {
  if (!window.hcaptcha) { setTimeout(initCaptchas, 300); return; }
  const sitekey = appConfig.hcaptcha_sitekey || '10000000-ffff-ffff-ffff-000000000001';
  try {
    if (loginCaptchaId !== null)  { window.hcaptcha.reset(loginCaptchaId);  loginCaptchaId  = null; }
    if (signupCaptchaId !== null) { window.hcaptcha.reset(signupCaptchaId); signupCaptchaId = null; }
    document.getElementById('login-captcha').innerHTML  = '';
    document.getElementById('signup-captcha').innerHTML = '';
    loginCaptchaId  = window.hcaptcha.render('login-captcha',  { sitekey });
    signupCaptchaId = window.hcaptcha.render('signup-captcha', { sitekey });
  } catch(e) { console.warn('hCaptcha init error:', e); }
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
  const btn   = document.getElementById('login-btn');
  msg.className = 'auth-msg'; msg.style.display = 'none';
  if (!email || !pass) { msg.className='auth-msg error'; msg.textContent='Please enter your email and password.'; return; }

  if (loginCaptchaId !== null && window.hcaptcha) {
    const token = window.hcaptcha.getResponse(loginCaptchaId);
    if (!token) { msg.className='auth-msg error'; msg.textContent='Please complete the captcha check first.'; return; }
  }

  btn.innerHTML = '<span class="spinner"></span>Signing in...'; btn.disabled = true;
  const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });
  btn.innerHTML = 'Sign in'; btn.disabled = false;
  if (window.hcaptcha && loginCaptchaId !== null) window.hcaptcha.reset(loginCaptchaId);
  if (error) { msg.className='auth-msg error'; msg.textContent=error.message; }
}

async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  const msg   = document.getElementById('signup-msg');
  const btn   = document.getElementById('signup-btn');
  if (!name||!email||!pass) { msg.className='auth-msg error'; msg.textContent='Please fill all fields.'; return; }
  if (pass.length < 6) { msg.className='auth-msg error'; msg.textContent='Password must be at least 6 characters.'; return; }

  const captchaToken = window.hcaptcha && signupCaptchaId !== null ? window.hcaptcha.getResponse(signupCaptchaId) : null;
  if (signupCaptchaId !== null && !captchaToken) { msg.className='auth-msg error'; msg.textContent='Please complete the captcha check first.'; return; }

  btn.innerHTML = '<span class="spinner"></span>Creating account...'; btn.disabled = true;
  const opts = { data: { full_name: name, role: 'member' } };
  if (captchaToken) opts.captchaToken = captchaToken;
  const { error } = await sbClient.auth.signUp({ email, password: pass, options: opts });
  btn.innerHTML = 'Create account'; btn.disabled = false;
  if (window.hcaptcha && signupCaptchaId !== null) window.hcaptcha.reset(signupCaptchaId);
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
  if (error) toast('Error: ' + error.message);
  else toast('Password reset email sent!');
}

async function doLogout() { await sbClient.auth.signOut(); }

async function onLogin(user) {
  currentUser = user;
  const { data } = await sbClient.from('profiles').select('*').eq('id', user.id).single();
  userProfile = data;
  document.getElementById('topbar-user').textContent = userProfile?.full_name || user.email.split('@')[0];
  document.getElementById('tx-date').value  = new Date().toISOString().slice(0,10);
  document.getElementById('inv-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('share-link').value = window.location.href;
  await loadData();
  showScreen('app');
  renderAll();
}

// ══════════════════════════════════════════════════════════
//  DATA LAYER
// ══════════════════════════════════════════════════════════

async function loadData() {
  const uid = currentUser.id;
  const [{ data: txs }, { data: invs }, { data: sal }, { data: comps }] = await Promise.all([
    sbClient.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sbClient.from('investments').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sbClient.from('salary_profiles').select('*').eq('user_id', uid).single(),
    sbClient.from('salary_components').select('*').eq('user_id', uid).order('created_at', { ascending: true })
  ]);
  txCache  = txs   || [];
  invCache = invs  || [];
  salaryCache.profile    = sal  || null;
  salaryCache.components = comps || [];
}

// ── TRANSACTIONS ──
async function saveTx() {
  const type   = document.getElementById('tx-type').value;
  const date   = document.getElementById('tx-date').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const cat    = document.getElementById('tx-cat').value;
  const note   = document.getElementById('tx-note').value.trim();
  if (!date || !amount || amount <= 0) { toast('Enter valid date and amount'); return; }
  const btn = document.getElementById('tx-save-btn');
  btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
  const { error } = await sbClient.from('transactions').insert({ user_id: currentUser.id, type, date, amount, category: cat, note });
  btn.innerHTML = 'Save'; btn.disabled = false;
  if (error) { toast('Error: ' + error.message); return; }
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value = '';
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

  // collect extra fields
  const extras = collectExtraFields(type);

  const btn = document.getElementById('inv-save-btn');
  btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
  const { error } = await sbClient.from('investments').insert({
    user_id: currentUser.id, asset_type: type, name,
    amount_invested: amount, current_value: current,
    units, avg_price: avgprice,
    purchase_date: date || null,
    maturity_date: maturity,
    extra_data: extras
  });
  btn.innerHTML = 'Save holding'; btn.disabled = false;
  if (error) { toast('Error: ' + error.message); return; }
  // clear fields
  ['inv-name','inv-amount','inv-current','inv-units','inv-avgprice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inv-maturity').value = '';
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
  const employer     = document.getElementById('sal-employer').value.trim();
  const designation  = document.getElementById('sal-designation').value.trim();
  const frequency    = document.getElementById('sal-frequency').value;
  const fy           = document.getElementById('sal-fy').value;
  const uid = currentUser.id;

  if (salaryCache.profile) {
    await sbClient.from('salary_profiles').update({ employer, designation, frequency, financial_year: fy }).eq('user_id', uid);
  } else {
    await sbClient.from('salary_profiles').insert({ user_id: uid, employer, designation, frequency, financial_year: fy });
  }
  toast('✓ Salary profile saved');
  await loadData(); renderSalary();
}

async function saveComponent(kind) {
  const isEarning = kind === 'earning';
  const nameEl    = document.getElementById(isEarning ? 'comp-earn-name'    : 'comp-ded-name');
  const amountEl  = document.getElementById(isEarning ? 'comp-earn-amount'  : 'comp-ded-amount');
  const noteEl    = document.getElementById(isEarning ? 'comp-earn-note'    : 'comp-ded-note');
  const extraEl   = document.getElementById(isEarning ? 'comp-earn-taxable' : 'comp-ded-section');

  const name   = nameEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const note   = noteEl.value.trim();
  const extra  = extraEl.value;

  if (!name || !amount || amount <= 0) { toast('Enter name and amount'); return; }

  const row = {
    user_id: currentUser.id, kind, name, amount_monthly: amount, note,
    taxable: isEarning ? extra : null,
    section: !isEarning ? extra : null
  };

  const { error } = await sbClient.from('salary_components').insert(row);
  if (error) { toast('Error: ' + error.message); return; }
  toast('✓ Component saved');
  nameEl.value = ''; amountEl.value = ''; noteEl.value = '';
  cancelComponent(kind);
  await loadData(); renderSalary();
}

async function deleteSalaryComponent(id) {
  if (!confirm('Remove this component?')) return;
  await sbClient.from('salary_components').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Removed'); await loadData(); renderSalary();
}

// ══════════════════════════════════════════════════════════
//  INVESTMENT EXTRA FIELDS
// ══════════════════════════════════════════════════════════

const EXTRA_FIELDS = {
  fd: [
    { id:'rate',    label:'Interest rate (%/yr)', type:'number', placeholder:'e.g. 7.5', step:'0.01' },
    { id:'tenure',  label:'Tenure (months)',       type:'number', placeholder:'e.g. 12' },
    { id:'bank',    label:'Bank / Institution',    type:'text',   placeholder:'e.g. SBI, HDFC' },
    { id:'compound',label:'Compounding',           type:'select', options:['Quarterly','Monthly','Half-yearly','Annually','Simple Interest'] }
  ],
  rd: [
    { id:'rate',       label:'Interest rate (%/yr)',  type:'number', placeholder:'e.g. 7.0', step:'0.01' },
    { id:'monthly_dep',label:'Monthly deposit (₹)',   type:'number', placeholder:'e.g. 5000' },
    { id:'tenure',     label:'Tenure (months)',        type:'number', placeholder:'e.g. 24' },
    { id:'bank',       label:'Bank / Institution',     type:'text',   placeholder:'e.g. Post Office' }
  ],
  ppf: [
    { id:'rate',        label:'Interest rate (%/yr)', type:'number', placeholder:'7.1', value:'7.1', step:'0.01' },
    { id:'yearly_dep',  label:'Yearly deposit (₹)',   type:'number', placeholder:'e.g. 150000' },
    { id:'account_no',  label:'Account number',       type:'text',   placeholder:'Optional' },
    { id:'bank',        label:'Bank / Post office',   type:'text',   placeholder:'e.g. SBI' }
  ],
  epf: [
    { id:'rate',        label:'Interest rate (%/yr)', type:'number', placeholder:'8.25', value:'8.25', step:'0.01' },
    { id:'employee_contrib', label:'Employee contrib/month (₹)', type:'number', placeholder:'e.g. 1800' },
    { id:'employer_contrib', label:'Employer contrib/month (₹)', type:'number', placeholder:'e.g. 1800' },
    { id:'uan',         label:'UAN number',           type:'text',   placeholder:'Optional' }
  ],
  nps: [
    { id:'tier',       label:'Tier',                  type:'select', options:['Tier I','Tier II'] },
    { id:'pran',       label:'PRAN number',           type:'text',   placeholder:'Optional' },
    { id:'fund_mgr',   label:'Fund manager',          type:'text',   placeholder:'e.g. SBI Pension Funds' },
    { id:'monthly_contrib', label:'Monthly contribution (₹)', type:'number', placeholder:'e.g. 5000' }
  ],
  bond: [
    { id:'rate',       label:'Coupon rate (%/yr)',    type:'number', placeholder:'e.g. 8.0', step:'0.01' },
    { id:'face_value', label:'Face value (₹)',        type:'number', placeholder:'e.g. 1000' },
    { id:'issuer',     label:'Issuer',                type:'text',   placeholder:'e.g. RBI, NHAI' },
    { id:'isin',       label:'ISIN',                  type:'text',   placeholder:'Optional' }
  ],
  sgb: [
    { id:'rate',       label:'Interest rate (%/yr)', type:'number', placeholder:'2.5', value:'2.5', step:'0.01' },
    { id:'grams',      label:'Quantity (grams)',      type:'number', placeholder:'e.g. 10', step:'0.001' },
    { id:'series',     label:'Series',               type:'text',   placeholder:'e.g. SGB 2023-24 Series I' },
    { id:'issue_price',label:'Issue price/gram (₹)', type:'number', placeholder:'e.g. 5900' }
  ],
  us_stock:     [{ id:'ticker', label:'Exchange',    type:'select', options:['NYSE','NASDAQ','AMEX'] }],
  indian_stock: [{ id:'exchange', label:'Exchange',  type:'select', options:['NSE','BSE'] }],
  mutual_fund:  [
    { id:'folio',    label:'Folio number',  type:'text',   placeholder:'Optional' },
    { id:'category', label:'Fund category', type:'select', options:['Large Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Index','Sectoral','International'] }
  ],
  gold: [
    { id:'grams',  label:'Quantity (grams)', type:'number', placeholder:'e.g. 10', step:'0.001' },
    { id:'form',   label:'Form',             type:'select', options:['Coin','Bar','Jewellery','ETF'] }
  ]
};

function toggleInvFields() {
  const type = document.getElementById('inv-type').value;
  const container = document.getElementById('inv-extra-fields');
  const fields = EXTRA_FIELDS[type];
  if (!fields || fields.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div style="margin:8px 0 4px;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">
      ${TYPE_LABELS[type] || type} details
      ${STANDARD_RATES[type] ? `<span style="margin-left:8px;background:var(--blue-bg);color:var(--blue-txt);padding:2px 8px;border-radius:10px;font-size:11px">Standard rate: ${STANDARD_RATES[type]}% p.a.</span>` : ''}
    </div>
    <div class="form-row" id="extra-fields-row"></div>
  `;

  const row = document.getElementById('extra-fields-row');
  fields.forEach(f => {
    const div = document.createElement('div');
    div.className = 'form-group-inline';
    div.style.minWidth = '140px';
    if (f.type === 'select') {
      div.innerHTML = `<label>${f.label}</label>
        <select id="extra-${f.id}">${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`;
    } else {
      div.innerHTML = `<label>${f.label}</label>
        <input type="${f.type}" id="extra-${f.id}" placeholder="${f.placeholder||''}" 
          ${f.step?`step="${f.step}"`:''}
          ${f.value?`value="${f.value}"`:''}
          min="0">`;
    }
    row.appendChild(div);
  });
}

function collectExtraFields(type) {
  const fields = EXTRA_FIELDS[type];
  if (!fields) return {};
  const result = {};
  fields.forEach(f => {
    const el = document.getElementById('extra-' + f.id);
    if (el) result[f.id] = el.value;
  });
  return result;
}

function formatExtraDetails(type, extra) {
  if (!extra || Object.keys(extra).length === 0) return '—';
  const parts = [];
  if (extra.rate)          parts.push(`${extra.rate}% p.a.`);
  if (extra.bank)          parts.push(extra.bank);
  if (extra.tenure)        parts.push(`${extra.tenure}mo`);
  if (extra.grams)         parts.push(`${extra.grams}g`);
  if (extra.series)        parts.push(extra.series);
  if (extra.tier)          parts.push(extra.tier);
  if (extra.category)      parts.push(extra.category);
  if (extra.exchange)      parts.push(extra.exchange);
  if (extra.compound)      parts.push(extra.compound);
  if (extra.fund_mgr)      parts.push(extra.fund_mgr);
  if (extra.monthly_contrib) parts.push(`₹${Number(extra.monthly_contrib).toLocaleString('en-IN')}/mo`);
  if (extra.monthly_dep)   parts.push(`₹${Number(extra.monthly_dep).toLocaleString('en-IN')}/mo`);
  if (extra.yearly_dep)    parts.push(`₹${Number(extra.yearly_dep).toLocaleString('en-IN')}/yr`);
  return parts.join(' · ') || '—';
}

// ══════════════════════════════════════════════════════════
//  SALARY COMPONENT UI
// ══════════════════════════════════════════════════════════

function addComponent(kind) {
  document.getElementById(`add-${kind}-form`).style.display = 'block';
}
function cancelComponent(kind) {
  document.getElementById(`add-${kind}-form`).style.display = 'none';
}

// ══════════════════════════════════════════════════════════
//  RENDER ALL
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
    nwTot.textContent = fmt(netCash + totalInv);
    document.getElementById('nw-sub').textContent = `Cash: ${fmt(netCash)} + Portfolio: ${fmt(totalInv)}`;
    document.getElementById('nw-stats').innerHTML = `
      <div class="nw-stat"><div class="nw-label">Income</div><div style="font-size:17px;font-weight:700">${fmt(income)}</div></div>
      <div class="nw-stat"><div class="nw-label">Expenses</div><div style="font-size:17px;font-weight:700">${fmt(expenses)}</div></div>
      <div class="nw-stat"><div class="nw-label">Savings rate</div><div style="font-size:17px;font-weight:700">${savRate.toFixed(1)}%</div></div>
    `;
  }

  const sc = document.getElementById('summary-cards');
  if (sc) sc.innerHTML = `
    <div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">${fmt(income)}</div></div>
    <div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">${fmt(expenses)}</div></div>
    <div class="metric-card"><div class="metric-label">Savings</div><div class="metric-value c-blue">${fmt(savings)}</div><div class="metric-sub">Rate: ${savRate.toFixed(1)}%</div></div>
    <div class="metric-card"><div class="metric-label">Portfolio</div><div class="metric-value">${fmt(totalInv)}</div><div class="metric-sub">${invCache.length} holdings</div></div>
  `;

  renderDashCharts(tx);
  renderQuickInsights();
}

function renderDashCharts(tx) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const incM=Array(12).fill(0), expM=Array(12).fill(0), savM=Array(12).fill(0);
  txCache.forEach(t => {
    const m = new Date(t.date).getMonth();
    if (t.type==='income') incM[m]+=Number(t.amount);
    if (t.type==='expense') expM[m]+=Number(t.amount);
    if (t.type==='saving') savM[m]+=Number(t.amount);
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
        ticks:{callback:v=>v>=1e5?'₹'+(v/1e5).toFixed(0)+'L':v>=1e3?'₹'+(v/1e3).toFixed(0)+'K':'₹'+v}}} }
    });
  }

  const cats={};
  tx.filter(t=>t.type==='expense').forEach(t=>{cats[t.category]=(cats[t.category]||0)+Number(t.amount)});
  const cL=Object.keys(cats), cV=Object.values(cats);
  const cC=['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#D4537E','#BA7517','#5DCAA5','#F09995','#9FE1CB'];
  const pieCtx=document.getElementById('chart-pie');
  if (pieCtx && cL.length>0) {
    if (pieChart) pieChart.destroy();
    pieChart=new Chart(pieCtx,{type:'doughnut',data:{labels:cL,datasets:[{data:cV,backgroundColor:cC.slice(0,cL.length),borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'62%'}});
    const tot=cV.reduce((a,b)=>a+b,0);
    document.getElementById('legend-cat').innerHTML=cL.map((l,i)=>`<span class="legend-item"><span class="legend-dot" style="background:${cC[i%cC.length]}"></span>${l} ${tot>0?(cV[i]/tot*100).toFixed(0):0}%</span>`).join('');
  }

  const nwCtx=document.getElementById('chart-nw');
  if (nwCtx && txCache.length>0) {
    const sorted=[...txCache].sort((a,b)=>new Date(a.date)-new Date(b.date));
    let run=0, nwL=[], nwV=[];
    sorted.forEach(t=>{
      if(t.type==='income') run+=Number(t.amount);
      if(t.type==='expense') run-=Number(t.amount);
      if(t.type==='saving') run+=Number(t.amount);
      nwL.push(t.date.slice(5)); nwV.push(Math.round(run));
    });
    if(nwChart) nwChart.destroy();
    nwChart=new Chart(nwCtx,{type:'line',data:{labels:nwL,datasets:[{data:nwV,borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,0.07)',fill:true,tension:.35,pointRadius:nwV.length<20?3:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{grid:{color:'rgba(0,0,0,0.04)'},
          ticks:{callback:v=>v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':v>=1e3?'₹'+(v/1e3).toFixed(0)+'K':'₹'+v}}}}});
  }
}

// ── TRANSACTIONS ──
function renderTransactions() {
  const tbody=document.getElementById('tx-table'), empty=document.getElementById('tx-empty');
  if (!tbody) return;
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
    <td style="text-align:right;font-weight:700;color:${t.type==='income'?'var(--green)':t.type==='expense'?'var(--red)':'var(--blue)'}">${fmt(t.amount)}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteTx(${t.id})">✕</button></td>
  </tr>`).join('');
}

// ── SALARY ──
function renderSalary() {
  // pre-fill profile fields
  if (salaryCache.profile) {
    const p = salaryCache.profile;
    document.getElementById('sal-employer').value    = p.employer    || '';
    document.getElementById('sal-designation').value = p.designation || '';
    document.getElementById('sal-frequency').value   = p.frequency   || 'monthly';
    document.getElementById('sal-fy').value          = p.financial_year || '2025-26';
  }

  const comps = salaryCache.components;
  const earnings   = comps.filter(c=>c.kind==='earning');
  const deductions = comps.filter(c=>c.kind==='deduction');

  const earningTotal   = earnings.reduce((s,c)=>s+Number(c.amount_monthly),0);
  const deductionTotal = deductions.reduce((s,c)=>s+Number(c.amount_monthly),0);
  const netSalary      = earningTotal - deductionTotal;

  // render earnings list
  const earEl = document.getElementById('earnings-list');
  if (earEl) {
    if (earnings.length===0) { earEl.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:8px 0">No earnings added yet.</div>'; }
    else earEl.innerHTML = earnings.map(c=>`
      <div class="salary-component-row">
        <div class="comp-name">${c.name}</div>
        <div><span class="comp-tag comp-earning">${c.taxable==='no'?'Exempt':c.taxable==='partial'?'Partial':''}</span></div>
        <div style="font-size:11px;color:var(--txt3);flex:2">${c.note||''}</div>
        <div class="comp-amount c-green">${fmt(c.amount_monthly)}<span style="font-size:10px;font-weight:400">/mo</span></div>
        <button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent(${c.id})" style="margin-left:8px">✕</button>
      </div>`).join('');
  }

  // render deductions list
  const dedEl = document.getElementById('deductions-list');
  if (dedEl) {
    if (deductions.length===0) { dedEl.innerHTML='<div style="color:var(--txt3);font-size:13px;padding:8px 0">No deductions added yet.</div>'; }
    else dedEl.innerHTML = deductions.map(c=>`
      <div class="salary-component-row">
        <div class="comp-name">${c.name}</div>
        <div><span class="comp-tag comp-deduction">${c.section||''}</span></div>
        <div style="font-size:11px;color:var(--txt3);flex:2">${c.note||''}</div>
        <div class="comp-amount c-red">${fmt(c.amount_monthly)}<span style="font-size:10px;font-weight:400">/mo</span></div>
        <button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent(${c.id})" style="margin-left:8px">✕</button>
      </div>`).join('');
  }

  // salary summary
  const sumEl = document.getElementById('salary-summary');
  if (sumEl) {
    const section80C = deductions.filter(c=>c.section==='80C').reduce((s,c)=>s+Number(c.amount_monthly)*12,0);
    const section80D = deductions.filter(c=>c.section==='80D').reduce((s,c)=>s+Number(c.amount_monthly)*12,0);
    const tds        = deductions.filter(c=>c.section==='TDS').reduce((s,c)=>s+Number(c.amount_monthly),0);

    sumEl.innerHTML = `
      <div class="grid3" style="margin-bottom:16px">
        <div class="metric-card"><div class="metric-label">Gross earnings/mo</div><div class="metric-value c-green">${fmt(earningTotal)}</div><div class="metric-sub">${fmt(earningTotal*12)}/yr</div></div>
        <div class="metric-card"><div class="metric-label">Total deductions/mo</div><div class="metric-value c-red">${fmt(deductionTotal)}</div><div class="metric-sub">${fmt(deductionTotal*12)}/yr</div></div>
        <div class="metric-card"><div class="metric-label">Net take-home/mo</div><div class="metric-value">${fmt(netSalary)}</div><div class="metric-sub">${fmt(netSalary*12)}/yr</div></div>
      </div>
      ${section80C>0||section80D>0||tds>0 ? `
      <div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Tax summary</div>
      <div class="grid3">
        ${section80C>0?`<div class="metric-card"><div class="metric-label">80C investments/yr</div><div class="metric-value c-blue">${fmt(section80C)}</div><div class="metric-sub">Limit: ₹1,50,000</div></div>`:''}
        ${section80D>0?`<div class="metric-card"><div class="metric-label">80D premium/yr</div><div class="metric-value c-blue">${fmt(section80D)}</div><div class="metric-sub">Limit: ₹25,000–50,000</div></div>`:''}
        ${tds>0?`<div class="metric-card"><div class="metric-label">TDS/mo</div><div class="metric-value c-amber">${fmt(tds)}</div><div class="metric-sub">${fmt(tds*12)}/yr</div></div>`:''}
      </div>` : ''}
    `;
  }
}

// ── INVESTMENTS ──
function renderInvestments() {
  const tbody=document.getElementById('inv-table'), empty=document.getElementById('inv-empty');
  if (!tbody) return;
  const srch=(document.getElementById('inv-search')?.value||'').toLowerCase();
  const invs=invCache.filter(i=>i.name.toLowerCase().includes(srch)||(TYPE_LABELS[i.asset_type]||'').toLowerCase().includes(srch));

  if(invs.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';}
  else {
    if(empty)empty.style.display='none';
    tbody.innerHTML=invs.map(i=>{
      const pnl=Number(i.current_value)-Number(i.amount_invested);
      const pct=Number(i.amount_invested)>0?pnl/Number(i.amount_invested)*100:0;
      const extra = i.extra_data || {};
      return `<tr>
        <td><div class="holding-name">${i.name}</div>
          <div class="holding-meta">${i.units>0?i.units+' units':''} ${i.avg_price>0?'· avg ₹'+i.avg_price:''} ${i.purchase_date?'· '+i.purchase_date:''}</div>
        </td>
        <td><span class="badge ${TYPE_BADGE[i.asset_type]||'badge-in'}">${TYPE_LABELS[i.asset_type]||i.asset_type}</span></td>
        <td style="font-size:12px;color:var(--txt2)">${formatExtraDetails(i.asset_type, extra)}</td>
        <td>${fmt(i.amount_invested)}</td>
        <td>${fmt(i.current_value)}</td>
        <td style="text-align:right;font-weight:700;color:${pnl>=0?'var(--green)':'var(--red)'}">${pnl>=0?'+':''}${fmt(pnl)}</td>
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
    <div class="metric-card"><div class="metric-label">Invested</div><div class="metric-value">${fmt(totalA)}</div></div>
    <div class="metric-card"><div class="metric-label">Current value</div><div class="metric-value">${fmt(totalV)}</div></div>
    <div class="metric-card"><div class="metric-label">P&L</div><div class="metric-value ${pnl>=0?'c-green':'c-red'}">${pnl>=0?'+':''}${fmt(pnl)}</div><div class="metric-sub">${fmtP(pct)}</div></div>
    <div class="metric-card"><div class="metric-label">Holdings</div><div class="metric-value">${invCache.length}</div></div>
  `;
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

  const equity = (byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0);
  const debt   = (byType.ppf||0)+(byType.epf||0)+(byType.nps||0)+(byType.bond||0)+(byType.debt_fund||0);
  const fixed  = (byType.fd||0)+(byType.rd||0);
  const liquid = byType.liquid||0;
  const gold   = (byType.gold||0)+(byType.sgb||0);
  const re     = byType.real_estate||0;
  const crypto = byType.crypto||0;

  function prog(label,val,color,note=''){
    const pct=total>0?val/total*100:0;
    return `<div class="progress-wrap">
      <div class="progress-header"><span class="progress-label">${label}</span><span class="progress-value">${fmt(val)} <strong>${pct.toFixed(1)}%</strong></span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      ${note?`<div style="font-size:11px;color:var(--txt3);margin-top:3px">${note}</div>`:''}
    </div>`;
  }

  const ab=document.getElementById('alloc-blocks');
  if(ab) ab.innerHTML=[
    equity>0 ? prog('Equity',equity,'#1D9E75','Stocks + Mutual Funds') : '',
    debt>0   ? prog('Debt',debt,'#EF9F27','PPF / EPF / NPS / Bonds') : '',
    fixed>0  ? prog('Fixed',fixed,'#E24B4A','FD / RD') : '',
    liquid>0 ? prog('Liquid',liquid,'#378ADD','Liquid funds') : '',
    gold>0   ? prog('Gold / SGB',gold,'#BA7517') : '',
    re>0     ? prog('Real Estate',re,'#5DCAA5') : '',
    crypto>0 ? prog('Crypto',crypto,'#7F77DD') : '',
    total===0 ? '<div class="empty-state"><div class="empty-icon">📊</div>Add investments to see allocation</div>' : ''
  ].join('');

  const gb=document.getElementById('geo-blocks');
  const us=byType.us_stock||0, indian=byType.indian_stock||0;
  if(gb) gb.innerHTML = us+indian>0 ? prog('US equities',us,'#185FA5')+prog('Indian equities',indian,'#1D9E75')
    : '<div style="color:var(--txt3);font-size:13px">No direct stock holdings.</div>';

  const lb=document.getElementById('liquidity-blocks');
  if(lb) lb.innerHTML=`
    <div class="grid2" style="margin-bottom:12px">
      <div class="metric-card"><div class="metric-label">Liquid</div><div class="metric-value c-blue">${fmt(liquid)}</div><div class="metric-sub">Redeemable in 1–3 days</div></div>
      <div class="metric-card"><div class="metric-label">Fixed / Locked</div><div class="metric-value">${fmt(fixed+debt)}</div><div class="metric-sub">FD, PPF, Bonds, NPS</div></div>
    </div>${prog('Liquid',liquid,'#378ADD')}${prog('Fixed/Locked',fixed+debt,'#EF9F27')}`;

  const inc=txCache.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const exp=txCache.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const rate=inc>0?(inc-exp)/inc*100:0;
  const srb=document.getElementById('savings-rate-block');
  if(srb){
    const col=rate>=30?'var(--green)':rate>=20?'var(--amber)':'var(--red)';
    srb.innerHTML=`
      <div class="grid3" style="margin-bottom:16px">
        <div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">${fmt(inc)}</div></div>
        <div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">${fmt(exp)}</div></div>
        <div class="metric-card"><div class="metric-label">Savings rate</div><div class="metric-value" style="color:${col}">${rate.toFixed(1)}%</div></div>
      </div>
      <div class="progress-bar" style="height:10px;margin-bottom:8px"><div class="progress-fill" style="width:${Math.min(rate,100)}%;background:${col}"></div></div>
      <div style="font-size:12px;color:var(--txt2)">${rate>=30?'Excellent! On track for financial independence.':rate>=20?'Good — push towards 30%+ for faster wealth creation.':'Below recommended. Aim to cut expenses or increase income.'}</div>`;
  }

  const debtHoldings=invCache.filter(i=>['ppf','epf','nps','fd','rd','bond','debt_fund','sgb'].includes(i.asset_type));
  const dd=document.getElementById('debt-detail');
  if(dd){
    if(debtHoldings.length===0){dd.innerHTML='<div style="color:var(--txt3);font-size:13px">No debt instruments tracked.</div>';}
    else dd.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Details</th><th>Invested</th><th>Current</th><th>Return</th></tr></thead><tbody>${
      debtHoldings.map(i=>{
        const pnl=Number(i.current_value)-Number(i.amount_invested);
        const pct=Number(i.amount_invested)>0?pnl/Number(i.amount_invested)*100:0;
        const extra=i.extra_data||{};
        return `<tr>
          <td>${i.name}</td>
          <td><span class="badge badge-debt">${TYPE_LABELS[i.asset_type]}</span></td>
          <td style="font-size:12px;color:var(--txt2)">${formatExtraDetails(i.asset_type,extra)}</td>
          <td>${fmt(i.amount_invested)}</td><td>${fmt(i.current_value)}</td>
          <td style="color:${pct>=0?'var(--green)':'var(--red)'}">${fmtP(pct)}</td>
        </tr>`;
      }).join('')
    }</tbody></table></div>`;
  }

  const allocCtx=document.getElementById('chart-alloc'), legAlloc=document.getElementById('legend-alloc');
  if(allocCtx&&total>0){
    const aData=[{l:'Equity',v:equity,c:'#1D9E75'},{l:'Debt',v:debt,c:'#EF9F27'},{l:'Fixed',v:fixed,c:'#E24B4A'},{l:'Liquid',v:liquid,c:'#378ADD'},{l:'Gold',v:gold,c:'#BA7517'},{l:'Real Estate',v:re,c:'#5DCAA5'},{l:'Crypto',v:crypto,c:'#7F77DD'}].filter(d=>d.v>0);
    if(allocChart) allocChart.destroy();
    allocChart=new Chart(allocCtx,{type:'bar',data:{labels:aData.map(d=>d.l),datasets:[{data:aData.map(d=>d.v),backgroundColor:aData.map(d=>d.c),borderRadius:6,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(0,0,0,0.04)'},
          ticks:{callback:v=>v>=1e5?'₹'+(v/1e5).toFixed(1)+'L':v>=1e3?'₹'+(v/1e3).toFixed(0)+'K':'₹'+v}}}}});
    if(legAlloc) legAlloc.innerHTML=aData.map(d=>`<span class="legend-item"><span class="legend-dot" style="background:${d.c}"></span>${d.l} ${total>0?(d.v/total*100).toFixed(1):0}%</span>`).join('');
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
  const liquid=(byType.liquid||0), monthlyExp=exp/12;
  const eqR=totalInv>0?((byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0))/totalInv:0;
  const pnl=totalInv-totalAmt;

  if(inc>0&&savRate>=30) insights.push({t:'good',title:'Excellent savings rate',desc:`Saving ${savRate.toFixed(1)}% of income — above 30% benchmark.`});
  else if(inc>0&&savRate<10) insights.push({t:'bad',title:'Critical: very low savings rate',desc:`${savRate.toFixed(1)}% savings rate. Risk of living paycheck-to-paycheck.`});
  else if(inc>0&&savRate<20) insights.push({t:'warn',title:'Low savings rate',desc:`${savRate.toFixed(1)}% savings rate. Target 20–30%+. Automate via SIP.`});
  if(inc>0&&monthlyExp>0&&liquid<monthlyExp*3) insights.push({t:'warn',title:'Emergency fund insufficient',desc:`Liquid assets (${fmt(liquid)}) cover less than 3 months of expenses. Target: ${fmt(monthlyExp*6)}.`});
  if(totalInv>0&&!(byType.us_stock>0)) insights.push({t:'info',title:'No US stock exposure',desc:'Consider US index ETFs via Vested or INDmoney for international diversification.'});
  if(totalInv>0&&eqR>0.85) insights.push({t:'warn',title:'High equity concentration',desc:`${(eqR*100).toFixed(0)}% in equities. Consider rebalancing with debt/gold.`});
  if(pnl>0&&totalAmt>0) insights.push({t:'good',title:'Portfolio in profit',desc:`Overall gain: ${fmt(pnl)} (${fmtP(pnl/totalAmt*100)}).`});
  if(!(byType.ppf>0)&&!(byType.epf>0)) insights.push({t:'info',title:'No PPF/EPF tracked',desc:'Track your PPF and EPF in Investments → PPF/EPF for a complete net worth picture.'});
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

  const invRows=[['Name','Type','Invested (₹)','Current (₹)','P&L (₹)','Return (%)','Units','Avg Price','Date','Maturity','Extra Details']];
  invCache.forEach(i=>{
    const pnl=Number(i.current_value)-Number(i.amount_invested);
    const pct=Number(i.amount_invested)>0?parseFloat((pnl/Number(i.amount_invested)*100).toFixed(2)):0;
    const extra=formatExtraDetails(i.asset_type,i.extra_data||{});
    invRows.push([i.name,TYPE_LABELS[i.asset_type]||i.asset_type,Number(i.amount_invested),Number(i.current_value),pnl,pct,i.units||0,i.avg_price||0,i.purchase_date||'',i.maturity_date||'',extra]);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(invRows),'Investments');

  // Salary sheet
  if(salaryCache.components.length>0){
    const salRows=[['Component','Kind','Amount/Month (₹)','Taxable/Section','Note']];
    salaryCache.components.forEach(c=>salRows.push([c.name,c.kind,Number(c.amount_monthly),c.taxable||c.section||'',c.note||'']));
    const earnings=salaryCache.components.filter(c=>c.kind==='earning').reduce((s,c)=>s+Number(c.amount_monthly),0);
    const deductions=salaryCache.components.filter(c=>c.kind==='deduction').reduce((s,c)=>s+Number(c.amount_monthly),0);
    salRows.push(['','','','',''],['Gross Earnings/Month','',earnings,'',''],['Total Deductions/Month','',deductions,'',''],['Net Take-Home/Month','',earnings-deductions,'','']);
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
      for(const t of d.transactions){
        const{error}=await sbClient.from('transactions').insert({user_id:currentUser.id,type:t.type,date:t.date,amount:t.amount,category:t.cat||t.category||'Other',note:t.note||''});
        if(!error) txOk++;
      }
      for(const i of d.investments){
        const{error}=await sbClient.from('investments').insert({user_id:currentUser.id,asset_type:i.type||i.asset_type,name:i.name,amount_invested:i.amount||i.amount_invested,current_value:i.current||i.current_value,units:i.units||0,avg_price:i.avgprice||i.avg_price||0,purchase_date:i.date||i.purchase_date||null,extra_data:i.extra_data||{}});
        if(!error) invOk++;
      }
      await loadData(); renderAll();
      toast(`✓ Imported ${txOk} transactions, ${invOk} investments`);
    }catch(err){toast('Error: '+err.message)}
  };
  reader.readAsText(file);
  event.target.value='';
}

async function deleteAllMyData() {
  if(!confirm('Permanently delete ALL your transactions and investments? This cannot be undone.')) return;
  if(!confirm('Final confirmation — delete everything?')) return;
  await Promise.all([
    sbClient.from('transactions').delete().eq('user_id',currentUser.id),
    sbClient.from('investments').delete().eq('user_id',currentUser.id),
    sbClient.from('salary_components').delete().eq('user_id',currentUser.id),
    sbClient.from('salary_profiles').delete().eq('user_id',currentUser.id)
  ]);
  await loadData(); renderAll(); toast('All data deleted');
}

function copyLink() {
  navigator.clipboard.writeText(document.getElementById('share-link').value).then(()=>toast('Link copied!')).catch(()=>toast('Copy the link manually'));
}

function toast(msg,dur=2400) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),dur);
}
