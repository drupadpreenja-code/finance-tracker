// ══════════════════════════════════════════════════════════
//  charts.js — all Chart.js chart rendering
//  Reads: amountsVisible, txCache, invCache (from state.js)
// ══════════════════════════════════════════════════════════

// Destroy a Chart.js instance and wipe its canvas cleanly
function destroyChart(chartVar, id) {
  if (chartVar) { try { chartVar.destroy(); } catch(e){} }
  var c = document.getElementById(id);
  if (c) { var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
  return null;
}

// ── DASHBOARD CHARTS ──
function renderDashCharts(tx) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var incM = Array(12).fill(0), expM = Array(12).fill(0), savM = Array(12).fill(0);
  txCache.forEach(function(t) {
    var m = new Date(t.date).getMonth();
    if (t.type==='income')  incM[m] += Number(t.amount);
    if (t.type==='expense') expM[m] += Number(t.amount);
    if (t.type==='saving')  savM[m] += Number(t.amount);
  });

  // ── BAR CHART ──
  barChart = destroyChart(barChart, 'chart-bar');
  var barEl = document.getElementById('chart-bar');
  if (barEl) {
    var maxVal = Math.max.apply(null, incM.concat(expM).concat(savM).concat([1]));
    var masked = !amountsVisible;
    // masked → convert to % of tallest bar so shapes are visible but values hidden
    var dInc = masked ? incM.map(function(v){ return Math.round(v/maxVal*100); }) : incM;
    var dExp = masked ? expM.map(function(v){ return Math.round(v/maxVal*100); }) : expM;
    var dSav = masked ? savM.map(function(v){ return Math.round(v/maxVal*100); }) : savM;
    barChart = new Chart(barEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label:'Income',   data:dInc, backgroundColor:'#1D9E7555', borderColor:'#1D9E75', borderWidth:1, borderRadius:4 },
          { label:'Expenses', data:dExp, backgroundColor:'#E24B4A55', borderColor:'#E24B4A', borderWidth:1, borderRadius:4 },
          { label:'Savings',  data:dSav, backgroundColor:'#185FA555', borderColor:'#185FA5', borderWidth:1, borderRadius:4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) {
            if (!masked) return ctx.dataset.label + ': \u20b9' + Math.round(ctx.parsed.y).toLocaleString('en-IN');
            return ctx.dataset.label + ': ' + ctx.parsed.y + '%';
          }}}
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { callback: function(v) {
              if (!masked) return v>=1e5 ? '\u20b9'+(v/1e5).toFixed(0)+'L' : v>=1e3 ? '\u20b9'+(v/1e3).toFixed(0)+'K' : '\u20b9'+v;
              return v + '%';
            }}
          }
        }
      }
    });
  }

  // ── SPENDING DONUT ──
  pieChart = destroyChart(pieChart, 'chart-pie');
  var cats = {};
  tx.filter(function(t){ return t.type==='expense'; }).forEach(function(t){
    cats[t.category] = (cats[t.category]||0) + Number(t.amount);
  });
  var cL = Object.keys(cats), cV = Object.values(cats);
  var cC = ['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#D4537E','#BA7517','#5DCAA5','#F09995','#9FE1CB'];
  var pieEl = document.getElementById('chart-pie');
  if (pieEl && cL.length > 0) {
    pieChart = new Chart(pieEl.getContext('2d'), {
      type: 'doughnut',
      data: { labels: cL, datasets: [{ data: cV, backgroundColor: cC.slice(0, cL.length), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '62%' }
    });
    var tot = cV.reduce(function(a,b){ return a+b; }, 0);
    var legEl = document.getElementById('legend-cat');
    if (legEl) legEl.innerHTML = cL.map(function(l,i){
      return '<span class="legend-item"><span class="legend-dot" style="background:' + cC[i%cC.length] + '"></span>' + l + ' ' + (tot>0 ? (cV[i]/tot*100).toFixed(0) : 0) + '%</span>';
    }).join('');
  }

  // ── CASHFLOW LINE CHART ──
  nwChart = destroyChart(nwChart, 'chart-nw');
  var nwEl = document.getElementById('chart-nw');
  if (nwEl && txCache.length > 0) {
    var sorted = [].concat(txCache).sort(function(a,b){ return new Date(a.date) - new Date(b.date); });
    var run = 0, nwL = [], nwV = [];
    sorted.forEach(function(t) {
      if (t.type==='income')  run += Number(t.amount);
      if (t.type==='expense') run -= Number(t.amount);
      if (t.type==='saving')  run += Number(t.amount);
      nwL.push(t.date.slice(5)); nwV.push(Math.round(run));
    });
    var maxAbs = Math.max.apply(null, nwV.map(function(v){ return Math.abs(v); }).concat([1]));
    var maskedNw = !amountsVisible;
    var dNw = maskedNw ? nwV.map(function(v){ return Math.round(v/maxAbs*100); }) : nwV;
    nwChart = new Chart(nwEl.getContext('2d'), {
      type: 'line',
      data: { labels: nwL, datasets: [{ data: dNw, borderColor:'#185FA5', backgroundColor:'rgba(24,95,165,0.07)', fill:true, tension:.35, pointRadius: nwV.length<20 ? 3 : 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) {
            if (!maskedNw) return 'Balance: \u20b9' + Math.round(ctx.parsed.y).toLocaleString('en-IN');
            return 'Trend: ' + ctx.parsed.y + '%';
          }}}
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { callback: function(v) {
              if (!maskedNw) return v>=1e5 ? '\u20b9'+(v/1e5).toFixed(1)+'L' : v>=1e3 ? '\u20b9'+(v/1e3).toFixed(0)+'K' : '\u20b9'+v;
              return v + '%';
            }}
          }
        }
      }
    });
  }
}

// ── INVESTMENT CHARTS ──
function renderInvCharts(total) {
  var byType = {};
  invCache.forEach(function(i){ byType[i.asset_type] = (byType[i.asset_type]||0) + Number(i.current_value); });
  var cols = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#E24B4A','#D4537E','#BA7517','#5DCAA5','#9FE1CB','#F09995'];

  // Portfolio donut
  invPieChart = destroyChart(invPieChart, 'chart-inv-pie');
  var invEl = document.getElementById('chart-inv-pie'), legInv = document.getElementById('legend-inv');
  if (invEl && invCache.length > 0) {
    var entries = Object.entries(byType).filter(function(e){ return e[1]>0; });
    var labels = entries.map(function(e){ return TYPE_LABELS[e[0]]||e[0]; });
    var vals   = entries.map(function(e){ return e[1]; });
    invPieChart = new Chart(invEl.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: vals, backgroundColor: cols.slice(0, labels.length), borderWidth: 0 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, cutout:'60%' }
    });
    if (legInv) legInv.innerHTML = labels.map(function(l,i){
      return '<span class="legend-item"><span class="legend-dot" style="background:'+cols[i%cols.length]+'"></span>'+l+' '+(total>0?(vals[i]/total*100).toFixed(1):0)+'%</span>';
    }).join('');
  }

  // Equity split donut
  eqChart = destroyChart(eqChart, 'chart-eq-split');
  var eqEl = document.getElementById('chart-eq-split'), legEq = document.getElementById('legend-eq');
  if (eqEl) {
    var us = byType.us_stock||0, indian = byType.indian_stock||0, mf = byType.mutual_fund||0;
    var eL=[], eV=[], eC=[];
    if (us>0)     { eL.push('US Stocks');     eV.push(us);     eC.push('#185FA5'); }
    if (indian>0) { eL.push('Indian Stocks'); eV.push(indian); eC.push('#1D9E75'); }
    if (mf>0)     { eL.push('Mutual Funds');  eV.push(mf);     eC.push('#EF9F27'); }
    if (eL.length > 0) {
      eqChart = new Chart(eqEl.getContext('2d'), {
        type: 'doughnut',
        data: { labels: eL, datasets: [{ data: eV, backgroundColor: eC, borderWidth: 0 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, cutout:'60%' }
      });
      var et = eV.reduce(function(a,b){ return a+b; }, 0);
      if (legEq) legEq.innerHTML = eL.map(function(l,i){
        return '<span class="legend-item"><span class="legend-dot" style="background:'+eC[i]+'"></span>'+l+' '+(et>0?(eV[i]/et*100).toFixed(1):0)+'%</span>';
      }).join('');
    }
  }
}

// ── ALLOCATION CHART ──
function renderAllocChart(aData) {
  allocChart = destroyChart(allocChart, 'chart-alloc');
  var allocEl = document.getElementById('chart-alloc'), legAlloc = document.getElementById('legend-alloc');
  if (allocEl && aData.length > 0) {
    allocChart = new Chart(allocEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels: aData.map(function(d){ return d.l; }),
        datasets: [{ data: aData.map(function(d){ return d.pct; }), backgroundColor: aData.map(function(d){ return d.c; }), borderRadius: 6, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx){ return ctx.parsed.y + '% of portfolio'; } }}
        },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: function(v){ return v+'%'; } }, max: 100 }
        }
      }
    });
    if (legAlloc) legAlloc.innerHTML = aData.map(function(d){
      return '<span class="legend-item"><span class="legend-dot" style="background:'+d.c+'"></span>'+d.l+' '+d.pct+'%</span>';
    }).join('');
  }
}
