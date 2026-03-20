// ══════════════════════════════════════════════════════════
//  ui.js — UI utilities
//  Masking, toast, theme, loaders, screen & page navigation
// ══════════════════════════════════════════════════════════

// ── TOAST ──
function toast(msg, dur) {
  dur = dur || 2400;
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, dur);
}

// ── LOADERS / BUTTONS ──
function hidePageLoader() {
  var el = document.getElementById('page-loader');
  if (el) el.classList.add('hidden');
}
function showSectionLoader(id, show) {
  var el = document.getElementById(id);
  if (el) el.style.display = show ? 'flex' : 'none';
}
function setBtn(id, loading, defaultText) {
  var btn = document.getElementById(id);
  if (!btn) return;
  if (loading) { btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true; }
  else         { btn.innerHTML = defaultText; btn.disabled = false; }
}

// ── SCREENS ──
function showScreen(name) {
  ['config','auth','mfa-verify','mfa-setup','app'].forEach(function(s) {
    var el = document.getElementById(s === 'app' ? 'app-screen' : s + '-screen');
    if (!el) return;
    if (s === 'app') el.style.display = name === 'app' ? 'block' : 'none';
    else             el.style.display = name === s    ? 'flex'  : 'none';
  });
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  syncBottomNav(id);
  renderAll();
}

function showPageMobile(id, btn) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function(b){
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + id + "'")) b.classList.add('active');
  });
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncBottomNav(id) {
  var map = { dashboard:'bnav-dashboard', transactions:'bnav-transactions', investments:'bnav-investments', salary:'bnav-salary', family:'bnav-family' };
  document.querySelectorAll('.bottom-nav-btn').forEach(function(b){ b.classList.remove('active'); });
  if (map[id]) { var el = document.getElementById(map[id]); if (el) el.classList.add('active'); }
}

// ── THEME ──
function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = current === 'dark' || (!current && systemDark);
  var next = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ft_theme', next);
  updateThemeBtn(next);
}
function updateThemeBtn(theme) {
  var btn = document.getElementById('theme-btn');
  if (!btn) return;
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isDark = theme === 'dark' || (!theme && systemDark);
  btn.textContent = isDark ? '\u2600 Light' : '\ud83c\udf19 Dark';
}
function applyThemeToBtn() {
  updateThemeBtn(localStorage.getItem('ft_theme'));
}

// ── AMOUNT MASKING ──
function toggleAmounts() {
  amountsVisible = !amountsVisible;
  var btn = document.getElementById('mask-btn');
  if (btn) btn.textContent = amountsVisible ? '\ud83d\udc41\ufe0f' : '\ud83d\ude48';
  renderAll();
}

function revealOne(btn) {
  var span = btn.closest('.masked-amount');
  if (!span) return;
  var n      = parseInt(span.dataset.val);
  var signed = span.dataset.signed;
  var display = signed ? ((n >= 0 ? '+' : '') + fmt(Math.abs(n))) : fmt(Math.abs(n));
  var newSpan = document.createElement('span');
  newSpan.className = 'revealed-amount';
  newSpan.dataset.val    = n;
  newSpan.dataset.signed = signed || '';
  newSpan.innerHTML = display + '<button class="mask-inline-btn" onclick="hideOne(this)" title="Hide">\ud83d\ude48</button>';
  span.parentNode.replaceChild(newSpan, span);
}

function hideOne(btn) {
  var span = btn.closest('.revealed-amount');
  if (!span) return;
  var n      = parseInt(span.dataset.val);
  var signed = span.dataset.signed;
  var sign   = signed && n < 0 ? '-' : (signed ? '+' : '');
  var newSpan = document.createElement('span');
  newSpan.className = 'masked-amount';
  newSpan.dataset.val    = n;
  newSpan.dataset.signed = signed || '';
  newSpan.innerHTML = (signed ? sign : '\u20b9\u00a0')
    + '\u2022\u2022\u2022\u2022'
    + '<button class="mask-inline-btn" onclick="revealOne(this)" title="Show">\ud83d\udc41\ufe0f</button>';
  span.parentNode.replaceChild(newSpan, span);
}

// ── REFRESH ──
async function refreshData() {
  var btn = document.getElementById('refresh-btn');
  if (btn) { btn.innerHTML = '<span class="spinner spinner-dark"></span>'; btn.disabled = true; }
  var ptr = document.getElementById('ptr-indicator');
  if (ptr) ptr.classList.add('visible');
  await loadData(); renderAll();
  if (btn) { btn.innerHTML = '\u21bb'; btn.disabled = false; }
  if (ptr) ptr.classList.remove('visible');
  toast('\u2713 Data refreshed');
}
