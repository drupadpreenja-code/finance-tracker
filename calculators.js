// ══════════════════════════════════════════════════════════
//  calculators.js  — all financial calculators
//  Zero Chart.js. All visuals are pure inline SVG.
// ══════════════════════════════════════════════════════════

// ── TAB SWITCHER ──
function switchCalc(id, btn) {
  document.querySelectorAll('.calc-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.calc-tab').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('calc-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  var triggers = {
    sip: calcSIP, goal: calcGoal, retirement: calcRetirement,
    emi: calcEMI, drawdown: calcDrawdown,
    cagr: function(){ calcCAGR(); calcCAGR2(); },
    networth: calcNetworth, rebalance: calcRebalance,
    milestone: calcMilestone, score: calcScore
  };
  if (triggers[id]) {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(function(){ requestAnimationFrame(triggers[id]); });
    } else {
      setTimeout(triggers[id], 32);
    }
  }
}

// ══════════════════════════════════════════════════════════
//  FORMATTERS
// ══════════════════════════════════════════════════════════
function fmtC(n) {
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

// ══════════════════════════════════════════════════════════
//  SVG SPARKLINES — no Chart.js, instant render
// ══════════════════════════════════════════════════════════

// Grouped bar sparkline — no axes, year labels only at start/mid/end
function sparkBars(elId, datasets, labels) {
  var el = document.getElementById(elId);
  if (!el || !datasets[0] || !datasets[0].values.length) return;
  var W = el.offsetWidth || (el.parentNode && el.parentNode.offsetWidth) || 520, H = 100;
  var padL=4, padR=4, padT=18, padB=16;
  var chartW=W-padL-padR, chartH=H-padT-padB;
  var n=labels.length, nDs=datasets.length;
  var grpW=chartW/n, grpPad=Math.max(1,grpW*0.12);
  var barW=Math.max(2,(grpW-grpPad*2-(nDs-1))/nDs);
  var allVals=[];
  datasets.forEach(function(d){ d.values.forEach(function(v){ allVals.push(v); }); });
  var maxV=Math.max.apply(null,allVals)||1;
  var svg='<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">';
  for (var i=0;i<n;i++) {
    var grpX=padL+i*grpW+grpPad;
    for (var d=0;d<nDs;d++) {
      var v=datasets[d].values[i]||0;
      var bh=Math.max(2,(v/maxV)*chartH);
      var bx=grpX+d*(barW+1);
      var by=padT+chartH-bh;
      svg+='<rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="'+Math.min(2,barW/2)+'" fill="'+datasets[d].color+'" opacity="0.88"/>';
    }
  }
  [0,Math.floor(n/2),n-1].forEach(function(i){
    if(i<0||i>=n) return;
    var cx=padL+i*grpW+grpW/2;
    svg+='<text x="'+cx.toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" font-size="8.5" fill="var(--txt3)">'+labels[i]+'</text>';
  });
  var lx=padL;
  datasets.forEach(function(ds){
    svg+='<rect x="'+lx+'" y="4" width="8" height="8" rx="2" fill="'+ds.color+'" opacity="0.9"/>';
    svg+='<text x="'+(lx+11)+'" y="11.5" font-size="9" fill="var(--txt2)">'+ds.label+'</text>';
    lx+=ds.label.length*5.8+18;
  });
  svg+='</svg>';
  el.innerHTML=svg;
}

// Smooth area line sparkline — no axes, end-point labeled
function sparkLine(elId, datasets) {
  var el=document.getElementById(elId);
  if (!el||!datasets[0]||!datasets[0].values.length) return;
  var W=el.offsetWidth||(el.parentNode&&el.parentNode.offsetWidth)||520, H=90;
  var padL=4, padR=62, padT=18, padB=6;
  var chartW=W-padL-padR, chartH=H-padT-padB;
  var n=datasets[0].values.length;
  var allVals=[];
  datasets.forEach(function(d){ d.values.forEach(function(v){ allVals.push(v); }); });
  var maxV=Math.max.apply(null,allVals)||1;
  function px(i){ return padL+(i/Math.max(n-1,1))*chartW; }
  function py(v){ return padT+chartH-(v/maxV)*chartH; }
  var svg='<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="display:block">';
  datasets.forEach(function(ds,di){
    var area='M '+px(0).toFixed(1)+','+py(ds.values[0]).toFixed(1)+' '
      +ds.values.map(function(v,i){ return 'L'+px(i).toFixed(1)+' '+py(v).toFixed(1); }).join(' ')
      +' L'+px(n-1).toFixed(1)+' '+(padT+chartH)+' L'+padL+' '+(padT+chartH)+' Z';
    svg+='<path d="'+area+'" fill="'+ds.color+'" opacity="0.1"/>';
    var pts=ds.values.map(function(v,i){ return px(i).toFixed(1)+','+py(v).toFixed(1); });
    svg+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+ds.color+'" stroke-width="2"'+(ds.dashed?' stroke-dasharray="5,3"':'')+' stroke-linejoin="round" stroke-linecap="round"/>';
    var lastV=ds.values[n-1], ey=py(lastV);
    svg+='<circle cx="'+px(n-1).toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="3" fill="'+ds.color+'"/>';
    svg+='<text x="'+(px(n-1)+6).toFixed(1)+'" y="'+(ey+3.5).toFixed(1)+'" font-size="9" fill="'+ds.color+'" font-weight="700">'+fmtC(lastV)+'</text>';
  });
  var lx=padL;
  datasets.forEach(function(ds){
    svg+='<rect x="'+lx+'" y="4" width="8" height="8" rx="2" fill="'+ds.color+'" opacity="0.9"/>';
    svg+='<text x="'+(lx+11)+'" y="11.5" font-size="9" fill="var(--txt2)">'+ds.label+'</text>';
    lx+=ds.label.length*5.8+18;
  });
  svg+='</svg>';
  el.innerHTML=svg;
}

// Horizontal bar rows — used for drawdown recovery view
function sparkHBars(elId, bars) {
  var el=document.getElementById(elId);
  if (!el) return;
  var W=el.offsetWidth||(el.parentNode&&el.parentNode.offsetWidth)||520, rowH=22, pad=4;
  var labelW=46, valW=46, barAreaW=W-labelW-valW-pad*2;
  var H=bars.length*rowH+pad*2;
  var maxV=Math.max.apply(null,bars.map(function(b){ return b.value; }))||1;
  var svg='<svg width="100%" height="'+H+'" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="display:block">';
  bars.forEach(function(b,i){
    var y=pad+i*rowH, cy=y+rowH/2;
    var bw=Math.max(2,(b.value/maxV)*barAreaW);
    svg+='<rect x="'+(pad+labelW)+'" y="'+(cy-5)+'" width="'+barAreaW+'" height="10" rx="5" fill="var(--bdr)"/>';
    svg+='<rect x="'+(pad+labelW)+'" y="'+(cy-5)+'" width="'+bw.toFixed(1)+'" height="10" rx="5" fill="'+b.color+'" opacity="0.85"/>';
    svg+='<text x="'+pad+'" y="'+(cy+3.5)+'" font-size="9.5" fill="var(--txt2)">'+b.label+'</text>';
    svg+='<text x="'+(pad+labelW+barAreaW+5)+'" y="'+(cy+3.5)+'" font-size="9.5" font-weight="700" fill="'+b.color+'">'+b.value+'%</text>';
  });
  svg+='</svg>';
  el.innerHTML=svg;
}

// ══════════════════════════════════════════════════════════
//  1. SIP GROWTH
// ══════════════════════════════════════════════════════════
function calcSIP() {
  var sip=parseFloat(document.getElementById('sip-amount').value)||0;
  var rate=parseFloat(document.getElementById('sip-rate').value)||12;
  var years=parseInt(document.getElementById('sip-years').value)||10;
  var stepup=document.getElementById('sip-stepup').checked;
  var r=rate/100/12, labels=[], investedArr=[], valueArr=[];
  var total=0, invested=0, curSip=sip;
  for (var y=1;y<=years;y++) {
    if (stepup&&y>1) curSip*=1.10;
    for (var m=0;m<12;m++) { total=total*(1+r)+curSip; invested+=curSip; }
    labels.push('Yr'+y); investedArr.push(Math.round(invested)); valueArr.push(Math.round(total));
  }
  var gain=total-invested, mul=invested>0?total/invested:1;
  document.getElementById('sip-result').innerHTML=resultBox([
    {label:'Final Value',    val:fmtC(total),       cls:'c-green'},
    {label:'Total Invested', val:fmtC(invested)},
    {label:'Wealth Gained',  val:fmtC(gain),        cls:'c-blue'},
    {label:'Multiple',       val:mul.toFixed(1)+'x'}
  ],'Money grows <strong>'+mul.toFixed(1)+'x</strong> in '+years+' years.'+(stepup?' Step-up boosts corpus.':'')+' Gain: <strong>'+fmtC(gain)+'</strong>.');
  sparkBars('spark-sip',[{values:investedArr,color:'#185FA5',label:'Invested'},{values:valueArr,color:'#1D9E75',label:'Value'}],labels);
}

// ══════════════════════════════════════════════════════════
//  2. GOAL
// ══════════════════════════════════════════════════════════
function calcGoal() {
  var target=parseFloat(document.getElementById('goal-target').value)||0;
  var years=parseInt(document.getElementById('goal-years').value)||15;
  var rate=parseFloat(document.getElementById('goal-rate').value)||12;
  var r=rate/100/12, n=years*12;
  var sip=target*r/(Math.pow(1+r,n)-1);
  var invested=sip*n, gain=target-invested;
  var labels=[], iArr=[], vArr=[], t2=0, i2=0;
  for (var y=1;y<=years;y++) {
    for (var m=0;m<12;m++) { t2=t2*(1+r)+sip; i2+=sip; }
    labels.push('Yr'+y); iArr.push(Math.round(i2)); vArr.push(Math.round(t2));
  }
  document.getElementById('goal-result').innerHTML=resultBox([
    {label:'Required SIP/mo', val:fmtC(sip),      cls:'c-green'},
    {label:'Target Amount',   val:fmtC(target)},
    {label:'Total Invested',  val:fmtC(invested)},
    {label:'Wealth Gained',   val:fmtC(gain),     cls:'c-blue'}
  ],'To reach <strong>'+fmtC(target)+'</strong> in '+years+' years, SIP <strong>'+fmtC(sip)+'/mo</strong> today.');
  sparkBars('spark-goal',[{values:iArr,color:'#185FA5',label:'Invested'},{values:vArr,color:'#1D9E75',label:'Value'}],labels);
}

// ══════════════════════════════════════════════════════════
//  3. RETIREMENT
// ══════════════════════════════════════════════════════════
function calcRetirement() {
  var expenses=parseFloat(document.getElementById('ret-expenses').value)||50000;
  var years=parseInt(document.getElementById('ret-years').value)||25;
  var inflation=parseFloat(document.getElementById('ret-inflation').value)||6;
  var retReturn=parseFloat(document.getElementById('ret-return').value)||8;
  var duration=parseInt(document.getElementById('ret-duration').value)||25;
  var futureExp=expenses*Math.pow(1+inflation/100,years);
  var realRate=(retReturn-inflation)/100;
  var corpus=Math.abs(realRate)<0.001?futureExp*12*duration:futureExp*12*(1-Math.pow(1+realRate,-duration))/realRate;
  var r=12/100/12, nm=years*12;
  var sipNeeded=corpus*r/(Math.pow(1+r,nm)-1);
  var currentNW=invCache.reduce(function(s,i){ return s+Number(i.current_value); },0);
  var onTrack=currentNW>0?Math.min(Math.round(currentNW/corpus*100),100):0;
  document.getElementById('ret-result').innerHTML=resultBox([
    {label:'Future Monthly Exp', val:fmtC(futureExp)},
    {label:'Required Corpus',    val:fmtC(corpus),    cls:'c-green'},
    {label:'SIP Needed Now',     val:fmtC(sipNeeded), cls:'c-blue'},
    {label:'On Track',           val:onTrack+'%',     cls:onTrack>=80?'c-green':onTrack>=50?'c-amber':'c-red'}
  ],'Future expenses: <strong>'+fmtC(futureExp)+'</strong>. Corpus needed: <strong>'+fmtC(corpus)+'</strong>.'+(onTrack>0?' <strong>'+onTrack+'% on track.</strong>':''));
}

// ══════════════════════════════════════════════════════════
//  4. EMI vs INVEST
// ══════════════════════════════════════════════════════════
function calcEMI() {
  var loan=parseFloat(document.getElementById('emi-loan').value)||0;
  var loanRate=parseFloat(document.getElementById('emi-rate').value)||8.5;
  var tenure=parseInt(document.getElementById('emi-tenure').value)||20;
  var investRate=parseFloat(document.getElementById('emi-invest-rate').value)||12;
  var extra=parseFloat(document.getElementById('emi-extra').value)||0;
  var r=loanRate/100/12, n=tenure*12;
  var emi=loan*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
  var bal=loan, mo=0;
  while (bal>0&&mo<n) { bal=bal*(1+r)-emi-extra; mo++; }
  var interestSaved=emi*(n-mo);
  var ri=investRate/100/12;
  var investValue=extra*(Math.pow(1+ri,n)-1)/ri;
  var better=investValue>interestSaved?'invest':'prepay';
  document.getElementById('emi-result').innerHTML=resultBox([
    {label:'EMI',              val:fmtC(emi)},
    {label:'Months to Close',  val:mo+' mo'},
    {label:'Interest Saved',   val:fmtC(interestSaved), cls:'c-green'},
    {label:'Investment Value', val:fmtC(investValue),   cls:'c-blue'},
    {label:'Verdict',          val:better==='invest'?'Invest \ud83d\udcc8':'Prepay \ud83c\udfe0', cls:'c-green'}
  ],better==='invest'
    ?'\u2705 <strong>Invest ₹'+fmtLakh(extra)+'/mo</strong> — gain <strong>'+fmtC(investValue-extra*n)+'</strong> vs saving <strong>'+fmtC(interestSaved)+'</strong> interest.'
    :'\u2705 <strong>Prepay loan</strong> — save <strong>'+fmtC(interestSaved)+'</strong> interest vs investment gain of <strong>'+fmtC(investValue-extra*n)+'</strong>.');
}

// ══════════════════════════════════════════════════════════
//  5. DRAWDOWN
// ══════════════════════════════════════════════════════════
function calcDrawdown() {
  var drop=parseFloat(document.getElementById('dd-drop').value)||20;
  var recRate=parseFloat(document.getElementById('dd-recovery-rate').value)||12;
  var recovery=100/(100-drop)*100-100;
  var yrs=Math.log(1+recovery/100)/Math.log(1+recRate/100);
  var scenarios=[10,20,30,40,50,60].map(function(d){
    var rec=parseFloat((100/(100-d)*100-100).toFixed(1));
    var y=parseFloat((Math.log(1+rec/100)/Math.log(1+recRate/100)).toFixed(1));
    return {drop:d,recovery:rec,years:y};
  });
  var rows=scenarios.map(function(s){
    var hl=s.drop===Math.round(drop)?' style="background:var(--blue-bg)"':'';
    return '<tr'+hl+'><td>-'+s.drop+'%</td><td style="color:var(--red)">+'+s.recovery+'%</td><td>'+s.years+' yrs</td></tr>';
  }).join('');
  document.getElementById('dd-result').innerHTML=
    '<div class="calc-insight">A <strong>-'+drop+'% drop</strong> needs <strong>+'+recovery.toFixed(1)+'%</strong> recovery — takes <strong>~'+yrs.toFixed(1)+' years</strong> @ '+recRate+'%.</div>'+
    '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Drop</th><th>Recovery needed</th><th>Time @'+recRate+'%</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  sparkHBars('spark-dd',scenarios.map(function(s){
    return {label:'-'+s.drop+'%',value:s.recovery,color:s.drop<=20?'#1D9E75':s.drop<=40?'#EF9F27':'#E24B4A'};
  }));
}

// ══════════════════════════════════════════════════════════
//  6. CAGR
// ══════════════════════════════════════════════════════════
function calcCAGR() {
  var initial=parseFloat(document.getElementById('cagr-initial').value)||0;
  var final=parseFloat(document.getElementById('cagr-final').value)||0;
  var years=parseFloat(document.getElementById('cagr-years').value)||1;
  if (initial<=0||final<=0||years<=0) return;
  var cagr=(Math.pow(final/initial,1/years)-1)*100;
  document.getElementById('cagr-result').innerHTML=resultBox([
    {label:'CAGR',       val:cagr.toFixed(2)+'%', cls:'c-green'},
    {label:'Total Gain', val:fmtC(final-initial)},
    {label:'Multiple',   val:(final/initial).toFixed(2)+'x'}
  ],fmtC(initial)+' grew to '+fmtC(final)+' in '+years+' years — CAGR <strong>'+cagr.toFixed(2)+'%</strong>.');
}
function calcCAGR2() {
  var initial=parseFloat(document.getElementById('cagr2-initial').value)||0;
  var rate=parseFloat(document.getElementById('cagr2-rate').value)||0;
  var years=parseFloat(document.getElementById('cagr2-years').value)||0;
  if (!initial||!rate||!years) return;
  var final=initial*Math.pow(1+rate/100,years);
  document.getElementById('cagr2-result').innerHTML=resultBox([
    {label:'Final Value', val:fmtC(final),         cls:'c-green'},
    {label:'Gain',        val:fmtC(final-initial),  cls:'c-blue'},
    {label:'Multiple',    val:(final/initial).toFixed(2)+'x'}
  ]);
}

// ══════════════════════════════════════════════════════════
//  7. NET WORTH PROJECTION
// ══════════════════════════════════════════════════════════
function calcNetworth() {
  var current=parseFloat(document.getElementById('nwp-current').value)||0;
  var monthly=parseFloat(document.getElementById('nwp-monthly').value)||0;
  var rate=parseFloat(document.getElementById('nwp-rate').value)||12;
  var years=parseInt(document.getElementById('nwp-years').value)||20;
  var r=rate/100/12, labels=[], vNW=[], vInv=[];
  var total=current, totalInv=current;
  for (var y=1;y<=years;y++) {
    for (var m=0;m<12;m++) { total=total*(1+r)+monthly; totalInv+=monthly; }
    labels.push('Yr'+y); vNW.push(Math.round(total)); vInv.push(Math.round(totalInv));
  }
  var milestones=[1e6,5e6,1e7,5e7,1e8,5e8,1e9], hits=[], t2=current;
  for (var mo=1;mo<=years*12;mo++) {
    t2=t2*(1+r)+monthly;
    milestones.forEach(function(ms){
      if (t2>=ms&&!hits.find(function(h){ return h.ms===ms; })) hits.push({ms:ms,yr:(mo/12).toFixed(1)});
    });
  }
  var msHtml=hits.length?hits.map(function(h){ return '\u2022 '+fmtC(h.ms)+' in '+h.yr+'yr'; }).join(' &nbsp;'):'';
  document.getElementById('nwp-result').innerHTML=resultBox([
    {label:'Final Net Worth', val:fmtC(vNW[vNW.length-1]), cls:'c-green'},
    {label:'Total Invested',  val:fmtC(totalInv)},
    {label:'Wealth Gained',   val:fmtC(total-totalInv),     cls:'c-blue'},
    {label:'Multiple',        val:(total/Math.max(totalInv,1)).toFixed(1)+'x'}
  ],'Reaches <strong>'+fmtC(vNW[vNW.length-1])+'</strong> in '+years+' years.'+(msHtml?'<br><span style="font-size:11px;opacity:.85">'+msHtml+'</span>':''));
  sparkLine('spark-nwp',[
    {values:vNW,  color:'#1D9E75',label:'Net Worth'},
    {values:vInv, color:'#185FA5',label:'Invested', dashed:true}
  ]);
}

// ══════════════════════════════════════════════════════════
//  8. REBALANCER
// ══════════════════════════════════════════════════════════
function calcRebalance() {
  var total=invCache.reduce(function(s,i){ return s+Number(i.current_value); },0);
  var bt={};
  invCache.forEach(function(i){ bt[i.asset_type]=(bt[i.asset_type]||0)+Number(i.current_value); });
  var classes=[
    {key:'equity', label:'Equity',      current:(bt.us_stock||0)+(bt.indian_stock||0)+(bt.mutual_fund||0), def:60},
    {key:'debt',   label:'Debt',        current:(bt.ppf||0)+(bt.epf||0)+(bt.nps||0)+(bt.bond||0)+(bt.debt_fund||0), def:20},
    {key:'fixed',  label:'Fixed (FD)',  current:(bt.fd||0)+(bt.rd||0), def:10},
    {key:'gold',   label:'Gold/SGB',    current:(bt.gold||0)+(bt.sgb||0), def:5},
    {key:'liquid', label:'Liquid',      current:bt.liquid||0, def:5}
  ];
  var body=document.getElementById('rebalance-body');
  if (!body) return;
  if (!body.innerHTML||body.innerHTML.trim()==='') {
    var html='<div class="calc-grid" style="margin-bottom:16px">';
    classes.forEach(function(cl){
      var cp=total>0?(cl.current/total*100).toFixed(1):'0.0';
      html+='<div class="calc-field"><label>'+cl.label+' <span style="color:var(--txt3);font-size:11px">(now '+cp+'%)</span></label>'
        +'<input type="number" id="rb-target-'+cl.key+'" value="'+cl.def+'" min="0" max="100" step="1" oninput="calcRebalance()"></div>';
    });
    html+='</div>'; body.innerHTML=html;
  }
  var sumT=0;
  var targets=classes.map(function(cl){
    var t=parseFloat((document.getElementById('rb-target-'+cl.key)||{}).value)||0;
    sumT+=t; return {label:cl.label,current:cl.current,target:t/100*total};
  });
  if (Math.abs(sumT-100)>0.5) {
    document.getElementById('rebalance-result').innerHTML=
      '<div class="calc-insight" style="background:var(--red-bg);color:var(--red-txt)">\u26a0\ufe0f Targets must sum to 100%. Currently: '+sumT+'%</div>';
    return;
  }
  var rows=targets.map(function(t){
    var diff=t.target-t.current;
    var action=Math.abs(diff)<500?'<span style="color:var(--txt3)">\u2713 OK</span>'
      :diff>0?'<span class="c-green">BUY '+fmtC(diff)+'</span>':'<span class="c-red">SELL '+fmtC(Math.abs(diff))+'</span>';
    return '<tr><td>'+t.label+'</td><td>'+fmtC(t.current)+'</td><td>'+fmtC(t.target)+'</td><td>'+action+'</td></tr>';
  }).join('');
  document.getElementById('rebalance-result').innerHTML=
    '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Current</th><th>Target</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="calc-insight">Rebalancing aligns risk to your target allocation.</div>';
}

// ══════════════════════════════════════════════════════════
//  9. MILESTONE
// ══════════════════════════════════════════════════════════
function calcMilestone() {
  var current=parseFloat(document.getElementById('ms-current').value)||0;
  var sip=parseFloat(document.getElementById('ms-sip').value)||0;
  var rate=parseFloat(document.getElementById('ms-rate').value)||12;
  var r=rate/100/12, total=current, months=0;
  var milestones=[1e6,5e6,1e7,5e7,1e8,5e8,1e9], results=[], remaining=milestones.slice();
  while (remaining.length>0&&months<600) {
    total=total*(1+r)+sip; months++;
    remaining=remaining.filter(function(ms){
      if (total>=ms){ results.push({ms:ms,months:months}); return false; } return true;
    });
  }
  if (!results.length) {
    document.getElementById('ms-result').innerHTML='<div class="calc-insight">\u26a0\ufe0f Increase SIP or return to reach milestones within 50 years.</div>';
    return;
  }
  var rows=results.map(function(r2){ return '<tr><td>'+fmtC(r2.ms)+'</td><td><strong>'+(r2.months/12).toFixed(1)+' yrs</strong></td></tr>'; }).join('');
  document.getElementById('ms-result').innerHTML=
    '<div class="calc-insight">From '+fmtC(current)+' with '+fmtC(sip)+'/mo @ '+rate+'%.</div>'+
    '<div class="table-wrap"><table><thead><tr><th>Milestone</th><th>Time to reach</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

// ══════════════════════════════════════════════════════════
//  10. SCORE
// ══════════════════════════════════════════════════════════
function calcScore() {
  var inc=txCache.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount); },0);
  var exp=txCache.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); },0);
  var totalV=invCache.reduce(function(s,i){ return s+Number(i.current_value); },0);
  var totalA=invCache.reduce(function(s,i){ return s+Number(i.amount_invested); },0);
  var bt={};
  invCache.forEach(function(i){ bt[i.asset_type]=(bt[i.asset_type]||0)+Number(i.current_value); });
  var savRate=inc>0?(inc-exp)/inc*100:0;
  var liquid=bt.liquid||0, monthlyExp=exp/12;
  var equity=(bt.us_stock||0)+(bt.indian_stock||0)+(bt.mutual_fund||0);
  var equityPct=totalV>0?equity/totalV*100:0;
  var portReturn=totalA>0?(totalV-totalA)/totalA*100:0;
  var emos=monthlyExp>0?liquid/monthlyExp:0;
  var pillars=[
    {label:'Savings Rate',     score:savRate>=30?25:savRate>=20?18:savRate>=10?10:savRate>0?5:0,   max:25, detail:savRate.toFixed(1)+'% '+(savRate>=30?'(Excellent)':savRate>=20?'(Good)':savRate>=10?'(Average)':'(Needs work)')},
    {label:'Emergency Fund',   score:emos>=6?25:emos>=3?18:emos>=1?10:0,                           max:25, detail:emos.toFixed(1)+' months '+(emos>=6?'(Excellent)':emos>=3?'(Adequate)':'(Insufficient)')},
    {label:'Asset Allocation', score:equityPct>=40&&equityPct<=75?25:equityPct>=30&&equityPct<=85?18:totalV>0?8:0, max:25, detail:equityPct.toFixed(0)+'% equity '+(equityPct>=40&&equityPct<=75?'(Balanced)':equityPct>75?'(High)':totalV>0?'(Low)':'(No investments)')},
    {label:'Portfolio Growth', score:portReturn>=15?25:portReturn>=10?20:portReturn>=0?12:portReturn>-10?5:0, max:25, detail:portReturn.toFixed(1)+'% '+(portReturn>=15?'(Strong)':portReturn>=10?'(Good)':portReturn>=0?'(Positive)':'(Negative)')}
  ];
  var total=pillars.reduce(function(s,p){ return s+p.score; },0);
  var grade=total>=85?'Excellent \ud83c\udfc6':total>=70?'Good \ud83d\udc4d':total>=50?'Average \u26a0\ufe0f':'Needs Work \ud83d\udd34';
  var arc=document.getElementById('score-arc');
  if (arc) arc.style.strokeDashoffset=String(314-(314*total/100));
  var pctEl=document.getElementById('score-pct'); if (pctEl) pctEl.textContent=total;
  var valEl=document.getElementById('score-value'); if (valEl) valEl.textContent=total+'/100';
  var tagEl=document.getElementById('score-tag'); if (tagEl) tagEl.textContent=grade;
  document.getElementById('score-breakdown').innerHTML=pillars.map(function(p){
    var pct=p.score/p.max*100, col=pct>=80?'var(--green)':pct>=60?'var(--amber)':'var(--red)';
    return '<div class="score-row"><div class="score-row-label">'+p.label+'</div>'
      +'<div class="score-bar-wrap"><div class="score-bar-fill" style="width:'+pct+'%;background:'+col+'"></div></div>'
      +'<div class="score-row-pts">'+p.score+'/'+p.max+'</div>'
      +'<div class="score-row-detail">'+p.detail+'</div></div>';
  }).join('');
  document.getElementById('score-result').innerHTML=resultBox([
    {label:'Score',val:total+' / 100',cls:'c-green'},{label:'Grade',val:grade}
  ]);
}

function initCalculators() {
  // defer spark rendering until after first paint so offsetWidth is available
  calcScore();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(function(){ requestAnimationFrame(calcSIP); });
  } else {
    setTimeout(calcSIP, 80);
  }
}
