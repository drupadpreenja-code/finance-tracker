// ══════════════════════════════════════════════════════════
//  state.js — shared state, constants, helpers
//  All other modules read from / write to these variables.
// ══════════════════════════════════════════════════════════

// ── AUTH / SESSION ──
var sbClient    = null;
var currentUser = null;
var userProfile = null;
var appConfig   = {};
var mfaFactorId = null;

// ── DATA CACHE ──
var txCache     = [];
var invCache    = [];
var salaryCache = { profile: null, components: [], slips: [] };

// ── CHART INSTANCES ──
var barChart, pieChart, nwChart, invPieChart, eqChart, allocChart;

// ── AMOUNT MASKING ──
var amountsVisible = false;

// ── FORMATTERS ──
function fmt(n)  { return '\u20b9' + Math.abs(Math.round(n)).toLocaleString('en-IN'); }
function fmtP(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

function fmtA(n) {
  if (amountsVisible) return fmt(n);
  var val = Math.round(n);
  return '<span class="masked-amount" data-val="' + val + '">'
    + '\u20b9\u00a0\u2022\u2022\u2022\u2022'
    + '<button class="mask-inline-btn" onclick="revealOne(this)" title="Show">\ud83d\udc41\ufe0f</button>'
    + '</span>';
}

function fmtASign(n) {
  if (amountsVisible) return (n >= 0 ? '+' : '') + fmt(n);
  var val  = Math.round(n);
  var sign = n >= 0 ? '+' : '-';
  return '<span class="masked-amount" data-val="' + val + '" data-signed="1">'
    + sign + '\u2022\u2022\u2022\u2022'
    + '<button class="mask-inline-btn" onclick="revealOne(this)" title="Show">\ud83d\udc41\ufe0f</button>'
    + '</span>';
}

// ── LOOKUP TABLES ──
var TYPE_LABELS = {
  us_stock:'US Stock', indian_stock:'Indian Stock', mutual_fund:'Mutual Fund',
  ppf:'PPF', epf:'EPF', nps:'NPS', fd:'Fixed Deposit', rd:'Recurring Deposit',
  debt_fund:'Debt Fund', bond:'Bond/NCD', sgb:'SGB',
  liquid:'Liquid Fund', gold:'Gold', real_estate:'Real Estate', crypto:'Crypto'
};
var TYPE_BADGE = {
  us_stock:'badge-us', indian_stock:'badge-in', mutual_fund:'badge-mf',
  ppf:'badge-debt', epf:'badge-debt', nps:'badge-debt',
  fd:'badge-fixed', rd:'badge-fixed', debt_fund:'badge-debt', bond:'badge-debt', sgb:'badge-gold',
  liquid:'badge-liquid', gold:'badge-gold', real_estate:'badge-re', crypto:'badge-crypto'
};
var STANDARD_RATES = { ppf:7.1, epf:8.25, sgb:2.5 };
var AVATAR_COLORS  = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E'];
var MONTH_NAMES    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
