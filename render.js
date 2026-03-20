// ══════════════════════════════════════════════════════════
//  render.js — all DOM rendering (dashboard, transactions,
//              investments, salary, allocation, family,
//              quick insights)
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
  var m = parseInt(document.getElementById('filter-month') && document.getElementById('filter-month').value) || 0;
  var y = parseInt(document.getElementById('filter-year')  && document.getElementById('filter-year').value)  || new Date().getFullYear();
  return txCache.filter(function(t) {
    if (!m) return true;
    var d = new Date(t.date);
    return d.getMonth() + 1 === m && d.getFullYear() === y;
  });
}

// ── DASHBOARD ──
function renderDashboard() {
  var tx       = filteredTx();
  var income   = tx.filter(function(t){ return t.type==='income';  }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var expenses = tx.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var savings  = tx.filter(function(t){ return t.type==='saving';  }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var totalInv = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var savRate  = income > 0 ? (income-expenses)/income*100 : 0;
  var netCash  = income - expenses + savings;

  var nwTot = document.getElementById('nw-total');
  if (nwTot) {
    nwTot.innerHTML = fmtA(netCash + totalInv);
    document.getElementById('nw-sub').innerHTML = 'Cash: ' + fmtA(netCash) + ' + Portfolio: ' + fmtA(totalInv);
    document.getElementById('nw-stats').innerHTML =
      '<div class="nw-stat"><div class="nw-label">Income</div><div style="font-size:17px;font-weight:700">' + fmtA(income) + '</div></div>' +
      '<div class="nw-stat"><div class="nw-label">Expenses</div><div style="font-size:17px;font-weight:700">' + fmtA(expenses) + '</div></div>' +
      '<div class="nw-stat"><div class="nw-label">Savings rate</div><div style="font-size:17px;font-weight:700">' + savRate.toFixed(1) + '%</div></div>';
  }
  var sc = document.getElementById('summary-cards');
  if (sc) sc.innerHTML =
    '<div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">'   + fmtA(income)   + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">'   + fmtA(expenses) + '</div></div>' +
    '<div class="metric-card"><div class="metric-label">Savings</div><div class="metric-value c-blue">'   + fmtA(savings)  + '</div><div class="metric-sub">Rate: ' + savRate.toFixed(1) + '%</div></div>' +
    '<div class="metric-card"><div class="metric-label">Portfolio</div><div class="metric-value">'        + fmtA(totalInv) + '</div><div class="metric-sub">' + invCache.length + ' holdings</div></div>';

  renderDashCharts(tx);
  renderQuickInsights();
}

// ── QUICK INSIGHTS ──
function renderQuickInsights() {
  var el = document.getElementById('quick-insights'); if (!el) return;
  var insights = [];
  var inc    = txCache.filter(function(t){ return t.type==='income';  }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var exp    = txCache.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var totalInv = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var totalAmt = invCache.reduce(function(s,i){ return s+Number(i.amount_invested); }, 0);
  var byType = {};
  invCache.forEach(function(i){ byType[i.asset_type] = (byType[i.asset_type]||0) + Number(i.current_value); });
  var liquid    = byType.liquid || 0;
  var monthlyExp = exp / 12;
  var savRate   = inc > 0 ? (inc-exp)/inc*100 : 0;
  var eqR       = totalInv > 0 ? ((byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0)) / totalInv : 0;
  var pnl       = totalInv - totalAmt;

  if (inc>0 && savRate>=30)  insights.push({t:'good', title:'Excellent savings rate',          desc:'Saving '+savRate.toFixed(1)+'% of income \u2014 above 30% benchmark.'});
  else if (inc>0 && savRate<10) insights.push({t:'bad',  title:'Critical: very low savings rate', desc:savRate.toFixed(1)+'% savings rate. Risk of living paycheck-to-paycheck.'});
  else if (inc>0 && savRate<20) insights.push({t:'warn', title:'Low savings rate',                desc:savRate.toFixed(1)+'% savings rate. Target 20\u201330%+.'});
  if (inc>0 && monthlyExp>0 && liquid<monthlyExp*3) insights.push({t:'warn', title:'Emergency fund insufficient',  desc:'Liquid assets cover less than 3 months of expenses.'});
  if (totalInv>0 && !(byType.us_stock>0))           insights.push({t:'info', title:'No US stock exposure',         desc:'Consider US index ETFs for international diversification.'});
  if (totalInv>0 && eqR>0.85)                        insights.push({t:'warn', title:'High equity concentration',    desc:(eqR*100).toFixed(0)+'% in equities. Consider rebalancing.'});
  if (pnl>0 && totalAmt>0)                           insights.push({t:'good', title:'Portfolio in profit',          desc:'Overall return: '+fmtP(pnl/totalAmt*100)+'.'});
  if (!(byType.ppf>0) && !(byType.epf>0))            insights.push({t:'info', title:'No PPF/EPF tracked',           desc:'Track PPF and EPF for a complete net worth picture.'});
  if (insights.length === 0)                          insights.push({t:'info', title:'Add data for insights',        desc:'Enter income, expenses, and investments to receive personalised insights.'});

  el.innerHTML = insights.map(function(i){
    return '<div class="insight-item insight-'+i.t+'"><div class="insight-title">'+i.title+'</div><div class="insight-desc">'+i.desc+'</div></div>';
  }).join('');
}

// ── TRANSACTIONS ──
function renderTransactions() {
  var tbody = document.getElementById('tx-table'), empty = document.getElementById('tx-empty');
  if (!tbody) return;
  showSectionLoader('tx-loading', false);
  var srch = ((document.getElementById('tx-search') && document.getElementById('tx-search').value) || '').toLowerCase();
  var tf   = (document.getElementById('tx-type-filter') && document.getElementById('tx-type-filter').value) || 'all';
  var txs  = txCache.filter(function(t){
    var ms = (t.note||'').toLowerCase().includes(srch) || (t.category||'').toLowerCase().includes(srch) || t.type.includes(srch) || String(t.amount).includes(srch);
    return ms && (tf==='all' || t.type===tf);
  });
  if (txs.length === 0) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = txs.map(function(t){
    return '<tr><td style="color:var(--txt2);white-space:nowrap">'+t.date+'</td>' +
      '<td><span class="tag tag-'+t.type+'">'+t.type+'</span></td>' +
      '<td>'+(t.category||'\u2014')+'</td>' +
      '<td class="hide-mobile" style="color:var(--txt2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(t.note||'\u2014')+'</td>' +
      '<td style="text-align:right;font-weight:700;color:'+(t.type==='income'?'var(--green)':t.type==='expense'?'var(--red)':'var(--blue)')+'">'+fmtA(t.amount)+'</td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="deleteTx('+t.id+')">\u2715</button></td></tr>';
  }).join('');
}

// ── INVESTMENTS ──
function renderInvestments() {
  var tbody = document.getElementById('inv-table'), empty = document.getElementById('inv-empty');
  if (!tbody) return;
  var srch = ((document.getElementById('inv-search') && document.getElementById('inv-search').value) || '').toLowerCase();
  var invs = invCache.filter(function(i){ return i.name.toLowerCase().includes(srch) || (TYPE_LABELS[i.asset_type]||'').toLowerCase().includes(srch); });
  if (invs.length === 0) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; }
  else {
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = invs.map(function(i){
      var pnl = Number(i.current_value) - Number(i.amount_invested);
      var pct = Number(i.amount_invested)>0 ? pnl/Number(i.amount_invested)*100 : 0;
      return '<tr>' +
        '<td><div class="holding-name">'+i.name+'</div><div class="holding-meta">'+(i.units>0?i.units+' units':'')+' '+(i.avg_price>0?'\u00b7 avg \u20b9'+i.avg_price:'')+' '+(i.purchase_date?'\u00b7 '+i.purchase_date:'')+'</div></td>' +
        '<td><span class="badge '+(TYPE_BADGE[i.asset_type]||'badge-in')+'">'+(TYPE_LABELS[i.asset_type]||i.asset_type)+'</span></td>' +
        '<td class="hide-mobile" style="font-size:12px;color:var(--txt2)">'+formatExtraDetails(i.asset_type, i.extra_data||{})+'</td>' +
        '<td>'+fmtA(i.amount_invested)+'</td>' +
        '<td class="hide-mobile">'+fmtA(i.current_value)+'</td>' +
        '<td style="text-align:right;font-weight:700">'+fmtASign(pnl)+'</td>' +
        '<td style="text-align:right" class="hide-mobile"><span style="color:'+(pct>=0?'var(--green)':'var(--red)')+'">'+fmtP(pct)+'</span></td>' +
        '<td><button class="btn btn-sm btn-danger" onclick="deleteInv('+i.id+')">\u2715</button></td>' +
      '</tr>';
    }).join('');
  }
  var totalV = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var totalA = invCache.reduce(function(s,i){ return s+Number(i.amount_invested); }, 0);
  var pnl    = totalV - totalA, pct = totalA>0 ? pnl/totalA*100 : 0;
  var tc = document.getElementById('inv-top-cards');
  if (tc) tc.innerHTML =
    '<div class="metric-card"><div class="metric-label">Invested</div><div class="metric-value">'+fmtA(totalA)+'</div></div>' +
    '<div class="metric-card"><div class="metric-label">Current value</div><div class="metric-value">'+fmtA(totalV)+'</div></div>' +
    '<div class="metric-card"><div class="metric-label">P&amp;L</div><div class="metric-value '+(pnl>=0?'c-green':'c-red')+'">'+fmtASign(pnl)+'</div><div class="metric-sub">'+fmtP(pct)+'</div></div>' +
    '<div class="metric-card"><div class="metric-label">Holdings</div><div class="metric-value">'+invCache.length+'</div></div>';
  renderInvCharts(totalV);
}

// ── SALARY ──
function renderSalary() {
  if (salaryCache.profile) {
    var p = salaryCache.profile;
    document.getElementById('sal-employer').value    = p.employer    || '';
    document.getElementById('sal-designation').value = p.designation || '';
    document.getElementById('sal-frequency').value   = p.frequency   || 'monthly';
    document.getElementById('sal-fy').value          = p.financial_year || '2025-26';
  }
  var comps      = salaryCache.components;
  var earnings   = comps.filter(function(c){ return c.kind==='earning'; });
  var deductions = comps.filter(function(c){ return c.kind==='deduction'; });
  var earningTotal   = earnings.reduce(function(s,c){ return s+Number(c.amount_monthly); }, 0);
  var deductionTotal = deductions.reduce(function(s,c){ return s+Number(c.amount_monthly); }, 0);
  var netSalary      = earningTotal - deductionTotal;

  var earEl = document.getElementById('earnings-list');
  if (earEl) earEl.innerHTML = earnings.length===0
    ? '<div style="color:var(--txt3);font-size:13px;padding:8px 0">No earnings added yet.</div>'
    : earnings.map(function(c){
        return '<div class="salary-component-row">' +
          '<div class="comp-name">'+c.name+'</div>' +
          '<div><span class="comp-tag comp-earning">'+(c.taxable==='no'?'Exempt':c.taxable==='partial'?'Partial':c.taxable==='yes'?'Taxable':'')+'</span></div>' +
          '<div style="font-size:11px;color:var(--txt3);flex:2">'+(c.note||'')+'</div>' +
          '<div class="comp-amount c-green">'+fmtA(c.amount_monthly)+'<span style="font-size:10px;font-weight:400">/mo</span></div>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent('+c.id+')" style="margin-left:6px">\u2715</button>' +
        '</div>';
      }).join('');

  var dedEl = document.getElementById('deductions-list');
  if (dedEl) dedEl.innerHTML = deductions.length===0
    ? '<div style="color:var(--txt3);font-size:13px;padding:8px 0">No deductions added yet.</div>'
    : deductions.map(function(c){
        return '<div class="salary-component-row">' +
          '<div class="comp-name">'+c.name+'</div>' +
          '<div><span class="comp-tag comp-deduction">'+(c.section||'')+'</span></div>' +
          '<div style="font-size:11px;color:var(--txt3);flex:2">'+(c.note||'')+'</div>' +
          '<div class="comp-amount c-red">'+fmtA(c.amount_monthly)+'<span style="font-size:10px;font-weight:400">/mo</span></div>' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSalaryComponent('+c.id+')" style="margin-left:6px">\u2715</button>' +
        '</div>';
      }).join('');

  if (earningTotal > 0) {
    var gEl = document.getElementById('slip-gross'), dEl = document.getElementById('slip-deductions'), nEl = document.getElementById('slip-net');
    if (gEl && !gEl.value) gEl.value = earningTotal;
    if (dEl && !dEl.value) dEl.value = deductionTotal;
    if (nEl && !nEl.value) nEl.value = netSalary > 0 ? netSalary : '';
    var preview = document.getElementById('slip-preview');
    if (preview) preview.innerHTML = 'Based on components: Gross ' + fmtA(earningTotal) + ' \u2212 Deductions ' + fmtA(deductionTotal) + ' = Net ' + fmtA(netSalary);
  }

  var slipMonthEl = document.getElementById('slip-month');
  if (slipMonthEl && !slipMonthEl.dataset.set) {
    var now = new Date();
    slipMonthEl.value = now.getMonth() + 1;
    var slipYearEl = document.getElementById('slip-year');
    if (slipYearEl) slipYearEl.value = now.getFullYear();
    slipMonthEl.dataset.set = '1';
  }

  var sumEl = document.getElementById('salary-summary');
  if (sumEl) {
    var s80C = deductions.filter(function(c){ return c.section==='80C'; }).reduce(function(s,c){ return s+Number(c.amount_monthly)*12; }, 0);
    var s80D = deductions.filter(function(c){ return c.section==='80D'; }).reduce(function(s,c){ return s+Number(c.amount_monthly)*12; }, 0);
    var tds  = deductions.filter(function(c){ return c.section==='TDS'; }).reduce(function(s,c){ return s+Number(c.amount_monthly); }, 0);
    var fy   = ((salaryCache.profile && salaryCache.profile.financial_year) || '2025-26').split('-');
    var fyStart = parseInt('20' + (fy[0] ? fy[0].slice(-2) : '25'));
    var yearSlips = salaryCache.slips.filter(function(s){ return (s.month >= 4 && s.year === fyStart) || (s.month < 4 && s.year === fyStart + 1); });
    var actualGross = yearSlips.reduce(function(s,sl){ return s+Number(sl.gross_earnings); }, 0);
    var actualNet   = yearSlips.reduce(function(s,sl){ return s+Number(sl.net_salary); }, 0);
    sumEl.innerHTML =
      '<div class="grid3" style="margin-bottom:16px">' +
        '<div class="metric-card"><div class="metric-label">Expected gross/mo</div><div class="metric-value c-green">'+fmtA(earningTotal)+'</div><div class="metric-sub">'+fmtA(earningTotal*12)+'/yr</div></div>' +
        '<div class="metric-card"><div class="metric-label">Expected deductions/mo</div><div class="metric-value c-red">'+fmtA(deductionTotal)+'</div><div class="metric-sub">'+fmtA(deductionTotal*12)+'/yr</div></div>' +
        '<div class="metric-card"><div class="metric-label">Expected net/mo</div><div class="metric-value">'+fmtA(netSalary)+'</div><div class="metric-sub">'+fmtA(netSalary*12)+'/yr</div></div>' +
      '</div>' +
      (yearSlips.length > 0 ?
        '<div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Actual (from '+yearSlips.length+' recorded slips)</div>' +
        '<div class="grid2" style="margin-bottom:16px">' +
          '<div class="metric-card"><div class="metric-label">Actual gross (FY)</div><div class="metric-value c-green">'+fmtA(actualGross)+'</div></div>' +
          '<div class="metric-card"><div class="metric-label">Actual net (FY)</div><div class="metric-value">'+fmtA(actualNet)+'</div></div>' +
        '</div>' : '') +
      (s80C>0||s80D>0||tds>0 ?
        '<div style="font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Tax summary</div>' +
        '<div class="grid3">' +
          (s80C>0 ? '<div class="metric-card"><div class="metric-label">80C/yr</div><div class="metric-value c-blue">'+fmtA(s80C)+'</div><div class="metric-sub">Limit: \u20b91,50,000</div></div>' : '') +
          (s80D>0 ? '<div class="metric-card"><div class="metric-label">80D/yr</div><div class="metric-value c-blue">'+fmtA(s80D)+'</div><div class="metric-sub">Limit: \u20b925,000\u201350,000</div></div>' : '') +
          (tds>0  ? '<div class="metric-card"><div class="metric-label">TDS/mo</div><div class="metric-value c-amber">'+fmtA(tds)+'</div><div class="metric-sub">'+fmtA(tds*12)+'/yr</div></div>' : '') +
        '</div>' : '');
  }
  renderSalarySlips();
}

function renderSalarySlips() {
  var el    = document.getElementById('salary-slips-list');
  var empty = document.getElementById('salary-slips-empty');
  if (!el) return;
  var yearFilter = parseInt((document.getElementById('slip-year-filter') && document.getElementById('slip-year-filter').value) || new Date().getFullYear());
  var slips = salaryCache.slips.filter(function(s){ return s.year === yearFilter; });
  if (slips.length === 0) { el.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  var totalGross = slips.reduce(function(s,sl){ return s+Number(sl.gross_earnings); }, 0);
  var totalDed   = slips.reduce(function(s,sl){ return s+Number(sl.total_deductions); }, 0);
  var totalNet   = slips.reduce(function(s,sl){ return s+Number(sl.net_salary); }, 0);
  el.innerHTML =
    '<div class="grid3" style="margin-bottom:14px">' +
      '<div class="metric-card"><div class="metric-label">Total gross ('+yearFilter+')</div><div class="metric-value c-green">'+fmtA(totalGross)+'</div><div class="metric-sub">'+slips.length+' months recorded</div></div>' +
      '<div class="metric-card"><div class="metric-label">Total deductions</div><div class="metric-value c-red">'+fmtA(totalDed)+'</div></div>' +
      '<div class="metric-card"><div class="metric-label">Total net pay</div><div class="metric-value">'+fmtA(totalNet)+'</div></div>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>Month</th><th>Gross</th><th>Deductions</th><th>Net</th><th class="hide-mobile">Notes</th><th></th></tr></thead><tbody>' +
    slips.map(function(sl){
      return '<tr>' +
        '<td style="font-weight:600">'+MONTH_NAMES[sl.month-1]+' '+sl.year+'</td>' +
        '<td class="c-green" style="font-weight:600">'+fmtA(sl.gross_earnings)+'</td>' +
        '<td class="c-red">'+fmtA(sl.total_deductions)+'</td>' +
        '<td style="font-weight:700">'+fmtA(sl.net_salary)+'</td>' +
        '<td class="hide-mobile" style="font-size:12px;color:var(--txt2)">'+(sl.notes||'\u2014')+'</td>' +
        '<td>' +
          '<button class="btn btn-sm" onclick="prefillSlip('+sl.month+','+sl.year+','+sl.gross_earnings+','+sl.total_deductions+','+sl.net_salary+')" title="Copy">\u270e</button> ' +
          '<button class="btn btn-sm btn-danger" onclick="deleteSalarySlip('+sl.id+')">\u2715</button>' +
        '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

// ── ALLOCATION ──
function renderAllocation() {
  var total  = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var byType = {};
  invCache.forEach(function(i){ byType[i.asset_type] = (byType[i.asset_type]||0) + Number(i.current_value); });
  var equity = (byType.us_stock||0)+(byType.indian_stock||0)+(byType.mutual_fund||0);
  var debt   = (byType.ppf||0)+(byType.epf||0)+(byType.nps||0)+(byType.bond||0)+(byType.debt_fund||0);
  var fixed  = (byType.fd||0)+(byType.rd||0);
  var liquid = byType.liquid||0, gold=(byType.gold||0)+(byType.sgb||0), re=byType.real_estate||0, crypto=byType.crypto||0;

  function prog(label, val, color, note) {
    var pct = total > 0 ? val/total*100 : 0;
    return '<div class="progress-wrap"><div class="progress-header"><span class="progress-label">'+label+'</span>' +
      '<span class="progress-value">'+fmtA(val)+' <strong>'+pct.toFixed(1)+'%</strong></span></div>' +
      '<div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%;background:'+color+'"></div></div>' +
      (note ? '<div style="font-size:11px;color:var(--txt3);margin-top:3px">'+note+'</div>' : '') + '</div>';
  }

  var ab = document.getElementById('alloc-blocks');
  if (ab) ab.innerHTML = [
    equity>0  ? prog('Equity',     equity,'#1D9E75','Stocks + Mutual Funds') : '',
    debt>0    ? prog('Debt',       debt,  '#EF9F27','PPF / EPF / NPS / Bonds') : '',
    fixed>0   ? prog('Fixed',      fixed, '#E24B4A','FD / RD') : '',
    liquid>0  ? prog('Liquid',     liquid,'#378ADD','Liquid funds') : '',
    gold>0    ? prog('Gold / SGB', gold,  '#BA7517') : '',
    re>0      ? prog('Real Estate',re,    '#5DCAA5') : '',
    crypto>0  ? prog('Crypto',     crypto,'#7F77DD') : '',
    total===0 ? '<div class="empty-state"><div class="empty-icon">\ud83d\udcca</div>Add investments to see allocation</div>' : ''
  ].join('');

  var gb = document.getElementById('geo-blocks');
  var us = byType.us_stock||0, indian = byType.indian_stock||0;
  if (gb) gb.innerHTML = us+indian > 0
    ? prog('US equities', us, '#185FA5') + prog('Indian equities', indian, '#1D9E75')
    : '<div style="color:var(--txt3);font-size:13px">No direct stock holdings.</div>';

  var lb = document.getElementById('liquidity-blocks');
  if (lb) lb.innerHTML =
    '<div class="grid2" style="margin-bottom:12px">' +
      '<div class="metric-card"><div class="metric-label">Liquid</div><div class="metric-value c-blue">'+fmtA(liquid)+'</div><div class="metric-sub">Redeemable in 1\u20133 days</div></div>' +
      '<div class="metric-card"><div class="metric-label">Fixed / Locked</div><div class="metric-value">'+fmtA(fixed+debt)+'</div><div class="metric-sub">FD, PPF, Bonds, NPS</div></div>' +
    '</div>' + prog('Liquid', liquid, '#378ADD') + prog('Fixed/Locked', fixed+debt, '#EF9F27');

  var inc  = txCache.filter(function(t){ return t.type==='income';  }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var exp  = txCache.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var rate = inc > 0 ? (inc-exp)/inc*100 : 0;
  var srb  = document.getElementById('savings-rate-block');
  if (srb) {
    var col = rate>=30 ? 'var(--green)' : rate>=20 ? 'var(--amber)' : 'var(--red)';
    srb.innerHTML =
      '<div class="grid3" style="margin-bottom:16px">' +
        '<div class="metric-card"><div class="metric-label">Income</div><div class="metric-value c-green">'+fmtA(inc)+'</div></div>' +
        '<div class="metric-card"><div class="metric-label">Expenses</div><div class="metric-value c-red">'+fmtA(exp)+'</div></div>' +
        '<div class="metric-card"><div class="metric-label">Savings rate</div><div class="metric-value" style="color:'+col+'">'+rate.toFixed(1)+'%</div></div>' +
      '</div>' +
      '<div class="progress-bar" style="height:10px;margin-bottom:8px"><div class="progress-fill" style="width:'+Math.min(rate,100)+'%;background:'+col+'"></div></div>' +
      '<div style="font-size:12px;color:var(--txt2)">'+(rate>=30?'Excellent! On track for financial independence.':rate>=20?'Good \u2014 push towards 30%+.':'Below recommended. Aim to cut expenses or increase income.')+'</div>';
  }

  var debtH = invCache.filter(function(i){ return ['ppf','epf','nps','fd','rd','bond','debt_fund','sgb'].includes(i.asset_type); });
  var dd = document.getElementById('debt-detail');
  if (dd) {
    if (debtH.length === 0) { dd.innerHTML = '<div style="color:var(--txt3);font-size:13px">No debt instruments tracked.</div>'; return; }
    dd.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Details</th><th>Invested</th><th>Current</th><th>Return</th></tr></thead><tbody>' +
      debtH.map(function(i){
        var pnl = Number(i.current_value)-Number(i.amount_invested);
        var pct = Number(i.amount_invested)>0 ? pnl/Number(i.amount_invested)*100 : 0;
        return '<tr><td>'+i.name+'</td><td><span class="badge badge-debt">'+TYPE_LABELS[i.asset_type]+'</span></td>' +
          '<td style="font-size:12px;color:var(--txt2)">'+formatExtraDetails(i.asset_type, i.extra_data||{})+'</td>' +
          '<td>'+fmtA(i.amount_invested)+'</td><td>'+fmtA(i.current_value)+'</td>' +
          '<td style="color:'+(pct>=0?'var(--green)':'var(--red)')+'">'+fmtP(pct)+'</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Allocation chart — always uses % Y-axis, never shows rupee amounts
  var aData = [
    {l:'Equity',      v:equity, c:'#1D9E75'},
    {l:'Debt',        v:debt,   c:'#EF9F27'},
    {l:'Fixed',       v:fixed,  c:'#E24B4A'},
    {l:'Liquid',      v:liquid, c:'#378ADD'},
    {l:'Gold',        v:gold,   c:'#BA7517'},
    {l:'Real Estate', v:re,     c:'#5DCAA5'},
    {l:'Crypto',      v:crypto, c:'#7F77DD'}
  ].filter(function(d){ return d.v > 0; }).map(function(d){
    return { l:d.l, v:d.v, c:d.c, pct: parseFloat((d.v/total*100).toFixed(1)) };
  });
  renderAllocChart(aData);
}

// ── FAMILY ──
async function renderFamilyPage() {
  var el = document.getElementById('family-list'); if (!el || !currentUser) return;
  var mp = document.getElementById('my-profile');
  if (mp && userProfile) {
    var name = userProfile.full_name || currentUser.email;
    var initials = name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
    mp.innerHTML = '<div class="family-member-card">' +
      '<div class="member-avatar" style="background:#185FA520;color:#185FA5">'+initials+'</div>' +
      '<div class="member-info"><div class="member-name">'+name+'</div><div style="font-size:11px;color:var(--txt2)">'+currentUser.email+'</div></div>' +
      '<span class="member-role role-member">member</span>' +
    '</div>';
  }
  await renderMfaStatus();
  var res = await sbClient.from('profiles').select('*');
  var profiles = res.data;
  if (!profiles || profiles.length === 0) { el.innerHTML = '<div style="color:var(--txt3);font-size:13px">Only your profile is visible.</div>'; return; }
  el.innerHTML = profiles.map(function(p, idx){
    var name = p.full_name || '\u2014';
    var initials = name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
    var col = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    var isMe = p.id === currentUser.id;
    return '<div class="family-member-card">' +
      '<div class="member-avatar" style="background:'+col+'22;color:'+col+'">'+initials+'</div>' +
      '<div class="member-info"><div class="member-name">'+name+(isMe?' <span style="font-size:10px;color:var(--txt3)">(you)</span>':'')+'</div></div>' +
      '<span class="member-role role-member">'+(p.role||'member')+'</span>' +
    '</div>';
  }).join('');
}
