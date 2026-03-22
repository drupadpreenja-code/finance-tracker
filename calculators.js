// ══════════════════════════════════════════════════════════
//  calculators.js — all financial calculators
//  Independent of Supabase; reads invCache/txCache for
//  auto-fill features (rebalance, score, milestone).
// ══════════════════════════════════════════════════════════

// ── chart instances for calc page ──
var chartSIP = null, chartGoal = null, chartDD = null, chartNWP = null;

// ── TAB SWITCHER ──
function switchCalc(id, btn) {
  document.querySelectorAll('.calc-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.calc-tab').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('calc-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  // trigger first calculation when panel opens
  var triggers = {
    sip: calcSIP, goal: calcGoal, retirement: calcRetirement,
    emi: calcEMI, drawdown: calcDrawdown, cagr: function(){ calcCAGR(); calcCAGR2(); },
    networth: calcNetworth, rebalance: calcRebalance,
    milestone: calcMilestone, score: calcScore
  };
  if (triggers[id]) setTimeout(triggers[id], 30);
}

// ── HELPERS ──
function fmtC(n) {
  // compact formatter: L / Cr
  var abs = Math.abs(Math.round(n));
  if (abs >= 1e7) return '\u20b9' + (n/1e7).toFixed(2) + ' Cr';
  if (abs >= 1e5) return '\u20b9' + (n/1e5).toFixed(2) + ' L';
  return '\u20b9' + abs.toLocaleString('en-IN');
}
function fmtLakh(n) { return '\u20b9' + Math.abs(Math.round(n)).toLocaleString('en-IN'); }

function resultBox(items, insight) {
  var html = '<div class="calc-result-grid">';
  items.forEach(function(it){
    html += '<div class="calc-result-item"><div class="calc-result-label">' + it.label + '</div>'
          + '<div class="calc-result-val ' + (it.cls||'') + '">' + it.val + '</div></div>';
  });
  html += '</div>';
  if (insight) html += '<div class="calc-insight">' + insight + '</div>';
  return html;
}

function destroyCalcChart(chart, id) {
  if (chart) { try { chart.destroy(); } catch(e){} }
  var c = document.getElementById(id);
  if (c) { var ctx2d = c.getContext('2d'); ctx2d.clearRect(0,0,c.width,c.height); }
  return null;
}

// ── SHARED FAST CHART CONFIG ──
// All monetary data is pre-scaled (to L or Cr) before passing to Chart.js.
// This avoids Chart.js iterating over huge numbers for tick generation.
function scaleArr(arr) {
  var mx = Math.max.apply(null, arr.map(function(v){ return Math.abs(v); }));
  if (mx >= 1e7) return { data: arr.map(function(v){ return parseFloat((v/1e7).toFixed(3)); }), unit:'Cr' };
  return { data: arr.map(function(v){ return parseFloat((v/1e5).toFixed(2)); }), unit:'L' };
}
function fastChartOpts(unit, extraOpts) {
  var base = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { boxWidth: 10, font: { size: 11 } } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { maxTicksLimit: 6, font: { size: 10 },
        callback: function(v){ return '\u20b9' + v + unit; }
      }}
    }
  };
  if (extraOpts) {
    if (extraOpts.tooltip) base.plugins.tooltip = extraOpts.tooltip;
  }
  return base;
}

// ══════════════════════════════════════════════════════════
//  1. SIP GROWTH CALCULATOR
// ══════════════════════════════════════════════════════════
function calcSIP() {
  var sip    = parseFloat(document.getElementById('sip-amount').value) || 0;
  var rate   = parseFloat(document.getElementById('sip-rate').value)   || 12;
  var years  = parseInt(document.getElementById('sip-years').value)    || 10;
  var stepup = document.getElementById('sip-stepup').checked;
  var r      = rate / 100 / 12;
  var labels = [], investedArr = [], valueArr = [];
  var total  = 0, invested = 0, curSip = sip;

  for (var y = 1; y <= years; y++) {
    if (stepup && y > 1) curSip *= 1.10;
    for (var m = 0; m < 12; m++) { total = total * (1 + r) + curSip; invested += curSip; }
    labels.push('Yr ' + y);
    investedArr.push(Math.round(invested));
    valueArr.push(Math.round(total));
  }

  var gain = total - invested;
  var mul  = invested > 0 ? total / invested : 1;
  var insight = 'Your money grows <strong>' + mul.toFixed(1) + 'x</strong> in ' + years + ' years. '
    + (stepup ? 'Step-up SIP adds significant extra corpus. ' : '')
    + 'Wealth gained is <strong>' + fmtC(gain) + '</strong>.';

  document.getElementById('sip-result').innerHTML = resultBox([
    { label: 'Final Value',    val: fmtC(total),   cls: 'c-green' },
    { label: 'Total Invested', val: fmtC(invested) },
    { label: 'Wealth Gained',  val: fmtC(gain),    cls: 'c-blue' },
    { label: 'Return Multiple',val: mul.toFixed(1) + 'x' }
  ], insight);

  chartSIP = destroyCalcChart(chartSIP, 'chart-sip');
  var el = document.getElementById('chart-sip');
  if (el) {
    var si = scaleArr(investedArr), sv = scaleArr(valueArr);
    var unit = sv.unit;
    var opts = fastChartOpts(unit);
    opts.plugins.tooltip = { callbacks: { label: function(ctx){ return ctx.dataset.label + ': \u20b9' + ctx.parsed.y + unit; } } };
    chartSIP = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label:'Invested', data: si.data, backgroundColor:'#185FA555', borderColor:'#185FA5', borderWidth:1, borderRadius:3 },
        { label:'Value',    data: sv.data, backgroundColor:'#1D9E7555', borderColor:'#1D9E75', borderWidth:1, borderRadius:3 }
      ]},
      options: opts
    });
  }
}

// ══════════════════════════════════════════════════════════
//  2. GOAL CALCULATOR
// ══════════════════════════════════════════════════════════
function calcGoal() {
  var target = parseFloat(document.getElementById('goal-target').value) || 0;
  var years  = parseInt(document.getElementById('goal-years').value)    || 15;
  var rate   = parseFloat(document.getElementById('goal-rate').value)   || 12;
  var r      = rate / 100 / 12;
  var n      = years * 12;
  var sip    = target * r / (Math.pow(1+r, n) - 1);
  var invested = sip * n;
  var gain   = target - invested;

  var labels = [], investedArr = [], valueArr = [];
  var total2 = 0, inv2 = 0;
  for (var y = 1; y <= years; y++) {
    for (var m = 0; m < 12; m++) { total2 = total2*(1+r)+sip; inv2 += sip; }
    labels.push('Yr '+y); investedArr.push(Math.round(inv2)); valueArr.push(Math.round(total2));
  }

  var insight = 'To reach <strong>' + fmtC(target) + '</strong> in ' + years + ' years, start a SIP of <strong>' + fmtC(sip) + '/month</strong> today.';

  document.getElementById('goal-result').innerHTML = resultBox([
    { label: 'Required SIP/mo',  val: fmtC(sip),      cls: 'c-green' },
    { label: 'Target Amount',    val: fmtC(target) },
    { label: 'Total Invested',   val: fmtC(invested) },
    { label: 'Wealth Gained',    val: fmtC(gain),     cls: 'c-blue' }
  ], insight);

  chartGoal = destroyCalcChart(chartGoal, 'chart-goal');
  var el = document.getElementById('chart-goal');
  if (el) {
    var gi = scaleArr(investedArr), gv = scaleArr(valueArr);
    var unit = gv.unit;
    var opts = fastChartOpts(unit);
    opts.plugins.tooltip = { callbacks: { label: function(ctx){ return ctx.dataset.label + ': \u20b9' + ctx.parsed.y + unit; } } };
    chartGoal = new Chart(el.getContext('2d'), {
      type:'bar',
      data:{ labels:labels, datasets:[
        { label:'Invested', data:gi.data, backgroundColor:'#185FA555', borderColor:'#185FA5', borderWidth:1, borderRadius:3 },
        { label:'Value',    data:gv.data, backgroundColor:'#1D9E7555', borderColor:'#1D9E75', borderWidth:1, borderRadius:3 }
      ]},
      options: opts
    });
  }
}

// ══════════════════════════════════════════════════════════
//  3. RETIREMENT CALCULATOR
// ══════════════════════════════════════════════════════════
function calcRetirement() {
  var expenses  = parseFloat(document.getElementById('ret-expenses').value)  || 50000;
  var years     = parseInt(document.getElementById('ret-years').value)       || 25;
  var inflation = parseFloat(document.getElementById('ret-inflation').value) || 6;
  var retReturn = parseFloat(document.getElementById('ret-return').value)    || 8;
  var duration  = parseInt(document.getElementById('ret-duration').value)    || 25;

  // future monthly expenses at retirement
  var futureExp = expenses * Math.pow(1 + inflation/100, years);
  // corpus needed (present value of annuity at real rate)
  var realRate   = (retReturn - inflation) / 100;
  var corpus;
  if (Math.abs(realRate) < 0.001) {
    corpus = futureExp * 12 * duration;
  } else {
    corpus = futureExp * 12 * (1 - Math.pow(1+realRate, -duration)) / realRate;
  }
  // SIP required to build corpus
  var r = 12/100/12, n = years*12; // assume 12% return pre-retirement
  var sipNeeded = corpus * r / (Math.pow(1+r,n)-1);

  // check against current portfolio
  var currentNW = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var onTrack   = currentNW > 0 ? Math.min(Math.round(currentNW/corpus*100), 100) : 0;

  var insight = 'Your future monthly expenses will be <strong>' + fmtC(futureExp) + '</strong>. '
    + 'You need a corpus of <strong>' + fmtC(corpus) + '</strong>. '
    + (onTrack > 0 ? 'You are <strong>' + onTrack + '% on track</strong> based on current portfolio.' : '');

  document.getElementById('ret-result').innerHTML = resultBox([
    { label: 'Future Monthly Exp', val: fmtC(futureExp) },
    { label: 'Required Corpus',    val: fmtC(corpus),    cls: 'c-green' },
    { label: 'SIP Needed Now',     val: fmtC(sipNeeded), cls: 'c-blue' },
    { label: 'On Track',           val: onTrack + '%',   cls: onTrack>=80?'c-green':onTrack>=50?'c-amber':'c-red' }
  ], insight);
}

// ══════════════════════════════════════════════════════════
//  4. EMI vs INVEST
// ══════════════════════════════════════════════════════════
function calcEMI() {
  var loan       = parseFloat(document.getElementById('emi-loan').value)        || 0;
  var loanRate   = parseFloat(document.getElementById('emi-rate').value)        || 8.5;
  var tenure     = parseInt(document.getElementById('emi-tenure').value)        || 20;
  var investRate = parseFloat(document.getElementById('emi-invest-rate').value) || 12;
  var extra      = parseFloat(document.getElementById('emi-extra').value)       || 0;

  var r  = loanRate/100/12;
  var n  = tenure*12;
  var emi = loan * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);

  // Prepay scenario: extra goes to loan, reduces tenure
  var balPrepay = loan, monthsPrepay = 0;
  while (balPrepay > 0 && monthsPrepay < n) {
    balPrepay = balPrepay*(1+r) - emi - extra;
    monthsPrepay++;
  }
  var interestSaved = (emi * (n - monthsPrepay));

  // Invest scenario: extra invested at market rate for full tenure
  var ri = investRate/100/12;
  var investValue = extra * (Math.pow(1+ri,n)-1) / ri;
  var investGain  = investValue - extra*n;

  var better = investValue > interestSaved ? 'invest' : 'prepay';
  var insight = better === 'invest'
    ? '\u2705 <strong>Invest the extra ₹' + fmtLakh(extra) + '/mo</strong> — you gain <strong>' + fmtC(investGain) + '</strong> vs saving <strong>' + fmtC(interestSaved) + '</strong> in interest.'
    : '\u2705 <strong>Prepay the loan</strong> — you save <strong>' + fmtC(interestSaved) + '</strong> in interest vs investment gain of <strong>' + fmtC(investGain) + '</strong>.';

  document.getElementById('emi-result').innerHTML = resultBox([
    { label: 'EMI',                val: fmtC(emi) },
    { label: 'Months to Close',    val: monthsPrepay + ' mo (prepay)' },
    { label: 'Interest Saved',     val: fmtC(interestSaved), cls:'c-green' },
    { label: 'Investment Value',   val: fmtC(investValue),   cls:'c-blue' },
    { label: 'Verdict',            val: better === 'invest' ? 'Invest 📈' : 'Prepay 🏠', cls: 'c-green' }
  ], insight);
}

// ══════════════════════════════════════════════════════════
//  5. DRAWDOWN CALCULATOR
// ══════════════════════════════════════════════════════════
function calcDrawdown() {
  var drop     = parseFloat(document.getElementById('dd-drop').value)          || 20;
  var recRate  = parseFloat(document.getElementById('dd-recovery-rate').value) || 12;
  var recovery = 100/(100-drop)*100 - 100;
  var years    = Math.log(1+recovery/100) / Math.log(1+recRate/100);

  var insight = 'A <strong>' + drop + '% drop</strong> requires a <strong>' + recovery.toFixed(1) + '% recovery</strong> just to break even — '
    + 'that takes <strong>~' + years.toFixed(1) + ' years</strong> at ' + recRate + '% annual return.';

  // Scenario table: common drawdowns
  var scenarios = [10,20,30,40,50,60].map(function(d){
    var r = 100/(100-d)*100-100;
    var y = Math.log(1+r/100)/Math.log(1+recRate/100);
    return { drop:d, recovery:r.toFixed(1), years:y.toFixed(1) };
  });

  var rows = scenarios.map(function(s){
    return '<tr' + (s.drop===Math.round(drop)?' style="background:var(--blue-bg)"':'') + '>'
      + '<td>-' + s.drop + '%</td><td style="color:var(--red)">+' + s.recovery + '%</td><td>' + s.years + ' yrs</td></tr>';
  }).join('');

  document.getElementById('dd-result').innerHTML =
    '<div class="calc-insight">' + insight + '</div>' +
    '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Drop</th><th>Recovery Needed</th><th>Time (@' + recRate + '%)</th></tr></thead><tbody>' + rows + '</tbody></table></div>';

  // Bar chart: recovery % per drop scenario
  chartDD = destroyCalcChart(chartDD, 'chart-dd');
  var el = document.getElementById('chart-dd');
  if (el) chartDD = new Chart(el.getContext('2d'), {
    type:'bar',
    data:{ labels:scenarios.map(function(s){ return '-'+s.drop+'%'; }),
      datasets:[{ label:'Recovery needed %', data:scenarios.map(function(s){ return parseFloat(s.recovery); }), backgroundColor:'#E24B4A88', borderColor:'#E24B4A', borderWidth:1, borderRadius:4 }]
    },
    options:{ animation:false, responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{grid:{display:false}, ticks:{font:{size:10}}}, y:{ ticks:{ maxTicksLimit:6, callback:function(v){ return v+'%'; }, font:{size:10} } } }
    }
  });
}

// ══════════════════════════════════════════════════════════
//  6. CAGR CALCULATOR
// ══════════════════════════════════════════════════════════
function calcCAGR() {
  var initial = parseFloat(document.getElementById('cagr-initial').value) || 0;
  var final   = parseFloat(document.getElementById('cagr-final').value)   || 0;
  var years   = parseFloat(document.getElementById('cagr-years').value)   || 1;
  if (initial <= 0 || final <= 0 || years <= 0) return;
  var cagr    = (Math.pow(final/initial, 1/years)-1)*100;
  var xirr_approx = cagr; // simple CAGR
  var gain    = final - initial;
  var mul     = final/initial;

  var insight = fmtC(initial) + ' grew to ' + fmtC(final) + ' in ' + years + ' years — a CAGR of <strong>' + cagr.toFixed(2) + '%</strong>.';

  document.getElementById('cagr-result').innerHTML = resultBox([
    { label:'CAGR',          val: cagr.toFixed(2) + '%', cls:'c-green' },
    { label:'Total Gain',    val: fmtC(gain) },
    { label:'Return',        val: mul.toFixed(2) + 'x' }
  ], insight);
}

function calcCAGR2() {
  var initial = parseFloat(document.getElementById('cagr2-initial').value) || 0;
  var rate    = parseFloat(document.getElementById('cagr2-rate').value)    || 0;
  var years   = parseFloat(document.getElementById('cagr2-years').value)   || 0;
  if (!initial || !rate || !years) return;
  var final  = initial * Math.pow(1+rate/100, years);
  var gain   = final - initial;
  document.getElementById('cagr2-result').innerHTML = resultBox([
    { label:'Final Value', val: fmtC(final),    cls:'c-green' },
    { label:'Gain',        val: fmtC(gain),     cls:'c-blue' },
    { label:'Multiple',    val: (final/initial).toFixed(2)+'x' }
  ]);
}

// ══════════════════════════════════════════════════════════
//  7. NET WORTH PROJECTION
// ══════════════════════════════════════════════════════════
function calcNetworth() {
  var current = parseFloat(document.getElementById('nwp-current').value) || 0;
  var monthly = parseFloat(document.getElementById('nwp-monthly').value) || 0;
  var rate    = parseFloat(document.getElementById('nwp-rate').value)    || 12;
  var years   = parseInt(document.getElementById('nwp-years').value)     || 20;
  var r       = rate/100/12;

  var labels=[], vals=[], inv=[];
  var total=current, totalInv=current;
  for (var y=1; y<=years; y++) {
    for (var m=0; m<12; m++) { total=total*(1+r)+monthly; totalInv+=monthly; }
    labels.push('Yr '+y); vals.push(Math.round(total)); inv.push(Math.round(totalInv));
  }

  // milestones
  var milestones = [1e7,5e7,1e8,5e8,1e9];
  var hits = [];
  var t2=current, ti=current;
  for (var mo=1; mo<=years*12; mo++) {
    t2=t2*(1+r)+monthly; ti+=monthly;
    milestones.forEach(function(ms){
      if (t2>=ms && !hits.find(function(h){ return h.ms===ms; }))
        hits.push({ ms:ms, yr:(mo/12).toFixed(1) });
    });
  }

  var msHtml = hits.length ? hits.map(function(h){ return '\u2022 ' + fmtC(h.ms) + ' in ' + h.yr + ' yrs'; }).join(' &nbsp; ') : '';
  var insight = 'Your net worth reaches <strong>' + fmtC(vals[vals.length-1]) + '</strong> in ' + years + ' years.'
    + (msHtml ? '<br><span style="font-size:12px;opacity:.85">' + msHtml + '</span>' : '');

  document.getElementById('nwp-result').innerHTML = resultBox([
    { label:'Final Net Worth',  val: fmtC(vals[vals.length-1]), cls:'c-green' },
    { label:'Total Invested',   val: fmtC(totalInv) },
    { label:'Wealth Gained',    val: fmtC(total-totalInv),      cls:'c-blue' },
    { label:'Growth Multiple',  val: (total/Math.max(totalInv,1)).toFixed(1)+'x' }
  ], insight);

  chartNWP = destroyCalcChart(chartNWP, 'chart-nwp');
  var el = document.getElementById('chart-nwp');
  if (el) {
    var nv = scaleArr(vals), ni = scaleArr(inv);
    var unit = nv.unit;
    var opts = fastChartOpts(unit);
    opts.plugins.tooltip = { callbacks: { label: function(ctx){ return ctx.dataset.label + ': \u20b9' + ctx.parsed.y + unit; } } };
    chartNWP = new Chart(el.getContext('2d'), {
      type:'line',
      data:{ labels:labels, datasets:[
        { label:'Net Worth', data:nv.data, borderColor:'#1D9E75', backgroundColor:'rgba(29,158,117,.1)', fill:true, tension:.3, pointRadius:0, borderWidth:2 },
        { label:'Invested',  data:ni.data, borderColor:'#185FA5', backgroundColor:'rgba(24,95,165,.05)', fill:true, tension:.3, pointRadius:0, borderWidth:1.5, borderDash:[5,3] }
      ]},
      options: opts
    });
  }
}

// ══════════════════════════════════════════════════════════
//  8. REBALANCER
// ══════════════════════════════════════════════════════════
function calcRebalance() {
  var total = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var byType={};
  invCache.forEach(function(i){ byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value); });

  var classes = [
    { key:'equity',      label:'Equity (Stocks+MF)',  current: ((byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0)), targetDefault:60, color:'#1D9E75' },
    { key:'debt',        label:'Debt (PPF/EPF/NPS)',  current: ((byType.ppf||0)+(byType.epf||0)+(byType.nps||0)+(byType.bond||0)+(byType.debt_fund||0)), targetDefault:20, color:'#EF9F27' },
    { key:'fixed',       label:'Fixed (FD/RD)',       current: ((byType.fd||0)+(byType.rd||0)), targetDefault:10, color:'#E24B4A' },
    { key:'gold',        label:'Gold / SGB',          current: ((byType.gold||0)+(byType.sgb||0)), targetDefault:5,  color:'#BA7517' },
    { key:'liquid',      label:'Liquid Fund',         current: (byType.liquid||0), targetDefault:5,  color:'#378ADD' }
  ];

  var body = document.getElementById('rebalance-body');
  if (!body) return;
  if (!body.innerHTML || body.innerHTML.trim()==='') {
    var html = '<div class="calc-grid" style="margin-bottom:16px">';
    classes.forEach(function(cl){
      var curPct = total>0 ? (cl.current/total*100).toFixed(1) : '0.0';
      html += '<div class="calc-field">'
        + '<label>' + cl.label + ' <span style="color:var(--txt3);font-size:11px">(now ' + curPct + '%)</span></label>'
        + '<input type="number" id="rb-target-' + cl.key + '" value="' + cl.targetDefault + '" min="0" max="100" step="1" oninput="calcRebalance()">'
        + '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  // read targets
  var totalTarget = 0;
  var targets = classes.map(function(cl){
    var t = parseFloat(document.getElementById('rb-target-' + cl.key) && document.getElementById('rb-target-' + cl.key).value) || 0;
    totalTarget += t;
    return { label:cl.label, current:cl.current, target:t/100*total, targetPct:t, color:cl.color };
  });

  if (Math.abs(totalTarget - 100) > 0.5) {
    document.getElementById('rebalance-result').innerHTML =
      '<div class="calc-insight" style="background:var(--red-bg);color:var(--red-txt)">⚠️ Target allocations must add up to 100%. Currently: ' + totalTarget + '%</div>';
    return;
  }

  var rows = targets.map(function(t){
    var diff = t.target - t.current;
    var action = Math.abs(diff) < 500 ? '<span style="color:var(--txt3)">✓ Balanced</span>'
      : diff > 0 ? '<span class="c-green">BUY ' + fmtC(diff) + '</span>'
      : '<span class="c-red">SELL ' + fmtC(Math.abs(diff)) + '</span>';
    return '<tr><td>' + t.label + '</td><td>' + fmtC(t.current) + '</td>'
      + '<td>' + fmtC(t.target) + '</td><td>' + action + '</td></tr>';
  }).join('');

  document.getElementById('rebalance-result').innerHTML =
    '<div class="table-wrap"><table><thead><tr><th>Asset Class</th><th>Current</th><th>Target</th><th>Action</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="calc-insight">Rebalancing keeps your portfolio aligned to your target allocation and manages risk.</div>';
}

// ══════════════════════════════════════════════════════════
//  9. MILESTONE — WHEN WILL I HIT ₹X Cr?
// ══════════════════════════════════════════════════════════
function calcMilestone() {
  var current = parseFloat(document.getElementById('ms-current').value) || 0;
  var sip     = parseFloat(document.getElementById('ms-sip').value)     || 0;
  var rate    = parseFloat(document.getElementById('ms-rate').value)    || 12;
  var r       = rate/100/12;

  var milestones = [1e6,5e6,1e7,5e7,1e8,5e8,1e9];
  var results = [];
  var total=current, months=0;
  var MAX = 600; // 50 years cap

  // build month-by-month until all milestones hit or 50yr cap
  var remaining = milestones.slice();
  while (remaining.length>0 && months<MAX) {
    total=total*(1+r)+sip; months++;
    remaining = remaining.filter(function(ms){
      if (total>=ms) { results.push({ ms:ms, months:months }); return false; }
      return true;
    });
  }

  if (results.length === 0) {
    document.getElementById('ms-result').innerHTML = '<div class="calc-insight">⚠️ With current SIP and return, milestones may take very long. Increase SIP or return rate.</div>';
    return;
  }

  var rows = results.map(function(r2){
    var yr = (r2.months/12).toFixed(1);
    return '<tr><td>' + fmtC(r2.ms) + '</td><td><strong>' + yr + ' years</strong></td><td style="color:var(--txt3)">' + r2.months + ' months</td></tr>';
  }).join('');

  var insight = 'With ' + fmtC(sip) + '/mo SIP at ' + rate + '% return, starting from ' + fmtC(current) + '.';

  document.getElementById('ms-result').innerHTML =
    '<div class="calc-insight">' + insight + '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Milestone</th><th>Time to reach</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// ══════════════════════════════════════════════════════════
//  10. FINANCIAL HEALTH SCORE
// ══════════════════════════════════════════════════════════
function calcScore() {
  var inc  = txCache.filter(function(t){ return t.type==='income';  }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var exp  = txCache.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var totalV = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var totalA = invCache.reduce(function(s,i){ return s+Number(i.amount_invested); }, 0);
  var byType={};
  invCache.forEach(function(i){ byType[i.asset_type]=(byType[i.asset_type]||0)+Number(i.current_value); });

  var savRate    = inc>0 ? (inc-exp)/inc*100 : 0;
  var liquid     = byType.liquid||0;
  var monthlyExp = exp/12;
  var equity     = ((byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0));
  var equityPct  = totalV>0 ? equity/totalV*100 : 0;
  var portfolioReturn = totalA>0 ? (totalV-totalA)/totalA*100 : 0;
  var emergencyMonths = monthlyExp>0 ? liquid/monthlyExp : 0;

  // Score components (each out of 25)
  var scores = [
    {
      label: 'Savings Rate',
      score: savRate>=30?25 : savRate>=20?18 : savRate>=10?10 : savRate>0?5:0,
      max: 25,
      detail: 'Savings rate: ' + savRate.toFixed(1) + '% ' + (savRate>=30?'(Excellent)':savRate>=20?'(Good)':savRate>=10?'(Average)':'(Needs work)')
    },
    {
      label: 'Emergency Fund',
      score: emergencyMonths>=6?25 : emergencyMonths>=3?18 : emergencyMonths>=1?10:0,
      max: 25,
      detail: 'Liquid covers ' + emergencyMonths.toFixed(1) + ' months of expenses ' + (emergencyMonths>=6?'(Excellent)':emergencyMonths>=3?'(Adequate)':'(Insufficient)')
    },
    {
      label: 'Asset Allocation',
      score: equityPct>=40&&equityPct<=75?25 : equityPct>=30&&equityPct<=85?18 : totalV>0?8:0,
      max: 25,
      detail: 'Equity: ' + equityPct.toFixed(0) + '% of portfolio ' + (equityPct>=40&&equityPct<=75?'(Balanced)':equityPct>75?'(High equity)':equityPct<30&&totalV>0?'(Low equity)':'(No investments yet)')
    },
    {
      label: 'Portfolio Growth',
      score: portfolioReturn>=15?25 : portfolioReturn>=10?20 : portfolioReturn>=0?12 : portfolioReturn>-10?5:0,
      max: 25,
      detail: 'Portfolio return: ' + portfolioReturn.toFixed(1) + '% ' + (portfolioReturn>=15?'(Strong)':portfolioReturn>=10?'(Good)':portfolioReturn>=0?'(Positive)':'(Negative)')
    }
  ];

  var total = scores.reduce(function(s,sc){ return s+sc.score; }, 0);
  var grade = total>=85?'Excellent 🏆' : total>=70?'Good 👍' : total>=50?'Average ⚠️' : 'Needs Work 🔴';

  // Update score banner
  var arc = document.getElementById('score-arc');
  var pct = document.getElementById('score-pct');
  var tag = document.getElementById('score-tag');
  var val = document.getElementById('score-value');
  if (arc) arc.style.strokeDashoffset = 314 - (314 * total/100);
  if (pct) pct.textContent = total;
  if (val) val.textContent = total + '/100';
  if (tag) tag.textContent = grade;

  var breakdown = scores.map(function(sc){
    var pct2 = sc.score/sc.max*100;
    var col = pct2>=80?'var(--green)':pct2>=60?'var(--amber)':'var(--red)';
    return '<div class="score-row">'
      + '<div class="score-row-label">' + sc.label + '</div>'
      + '<div class="score-bar-wrap"><div class="score-bar-fill" style="width:'+pct2+'%;background:'+col+'"></div></div>'
      + '<div class="score-row-pts">' + sc.score + '/' + sc.max + '</div>'
      + '<div class="score-row-detail">' + sc.detail + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('score-breakdown').innerHTML = breakdown;
  document.getElementById('score-result').innerHTML =
    '<div class="calc-result-grid">'
    + '<div class="calc-result-item"><div class="calc-result-label">Score</div><div class="calc-result-val c-green">' + total + ' / 100</div></div>'
    + '<div class="calc-result-item"><div class="calc-result-label">Grade</div><div class="calc-result-val">' + grade + '</div></div>'
    + '</div>';
}

// Auto-run score on page load when calculators tab is opened
// (called from switchCalc → score is auto-triggered)

// ── INIT: run default calcs when calculators page first renders ──
function initCalculators() {
  calcSIP();
  calcScore();
}
