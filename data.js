// ══════════════════════════════════════════════════════════
//  data.js — Supabase data layer (load + CRUD)
// ══════════════════════════════════════════════════════════

// ── LOAD ALL ──
async function loadData() {
  var uid = currentUser.id;
  var results = await Promise.all([
    sbClient.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sbClient.from('investments').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sbClient.from('salary_profiles').select('*').eq('user_id', uid).single(),
    sbClient.from('salary_components').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
    sbClient.from('salary_slips').select('*').eq('user_id', uid).order('year', { ascending: false }).order('month', { ascending: false })
  ]);
  txCache             = results[0].data || [];
  invCache            = results[1].data || [];
  salaryCache.profile    = results[2].data || null;
  salaryCache.components = results[3].data || [];
  salaryCache.slips      = results[4].data || [];
}

// ── TRANSACTIONS ──
async function saveTx() {
  var type   = document.getElementById('tx-type').value;
  var date   = document.getElementById('tx-date').value;
  var amount = parseFloat(document.getElementById('tx-amount').value);
  var cat    = document.getElementById('tx-cat').value;
  var note   = document.getElementById('tx-note').value.trim();
  if (!date || !amount || amount <= 0) { toast('Enter valid date and amount'); return; }
  setBtn('tx-save-btn', true);
  var res = await sbClient.from('transactions').insert({ user_id: currentUser.id, type: type, date: date, amount: amount, category: cat, note: note });
  setBtn('tx-save-btn', false, 'Save');
  if (res.error) { toast('Error: ' + res.error.message); return; }
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-note').value   = '';
  toast('\u2713 Transaction saved');
  await loadData(); renderAll();
}

async function deleteTx(id) {
  if (!confirm('Delete this transaction?')) return;
  await sbClient.from('transactions').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderAll();
}

// ── INVESTMENTS ──
async function saveInv() {
  var type     = document.getElementById('inv-type').value;
  var name     = document.getElementById('inv-name').value.trim();
  var amount   = parseFloat(document.getElementById('inv-amount').value);
  var current  = parseFloat(document.getElementById('inv-current').value) || amount;
  var units    = parseFloat(document.getElementById('inv-units').value)    || 0;
  var avgprice = parseFloat(document.getElementById('inv-avgprice').value) || 0;
  var date     = document.getElementById('inv-date').value;
  var maturity = document.getElementById('inv-maturity').value || null;
  if (!name || !amount || amount <= 0) { toast('Enter name and invested amount'); return; }
  var extras = collectExtraFields(type);
  setBtn('inv-save-btn', true);
  var res = await sbClient.from('investments').insert({
    user_id: currentUser.id, asset_type: type, name: name,
    amount_invested: amount, current_value: current,
    units: units, avg_price: avgprice, purchase_date: date||null, maturity_date: maturity, extra_data: extras
  });
  setBtn('inv-save-btn', false, 'Save holding');
  if (res.error) { toast('Error: ' + res.error.message); return; }
  ['inv-name','inv-amount','inv-current','inv-units','inv-avgprice'].forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('inv-maturity').value = '';
  document.getElementById('inv-extra-fields').innerHTML = '';
  toast('\u2713 Holding saved');
  await loadData(); renderAll();
}

async function deleteInv(id) {
  if (!confirm('Delete this holding?')) return;
  await sbClient.from('investments').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderAll();
}

// ── SALARY PROFILE ──
async function saveSalaryProfile() {
  var employer    = document.getElementById('sal-employer').value.trim();
  var designation = document.getElementById('sal-designation').value.trim();
  var frequency   = document.getElementById('sal-frequency').value;
  var fy          = document.getElementById('sal-fy').value;
  var uid = currentUser.id;
  setBtn('sal-save-btn', true);
  if (salaryCache.profile) {
    await sbClient.from('salary_profiles').update({ employer: employer, designation: designation, frequency: frequency, financial_year: fy }).eq('user_id', uid);
  } else {
    await sbClient.from('salary_profiles').insert({ user_id: uid, employer: employer, designation: designation, frequency: frequency, financial_year: fy });
  }
  setBtn('sal-save-btn', false, 'Save');
  toast('\u2713 Salary profile saved');
  await loadData(); renderSalary();
}

// ── SALARY COMPONENTS ──
async function saveComponent(kind) {
  var isE    = kind === 'earning';
  var nameEl = document.getElementById(isE ? 'comp-earn-name'    : 'comp-ded-name');
  var amtEl  = document.getElementById(isE ? 'comp-earn-amount'  : 'comp-ded-amount');
  var noteEl = document.getElementById(isE ? 'comp-earn-note'    : 'comp-ded-note');
  var extEl  = document.getElementById(isE ? 'comp-earn-taxable' : 'comp-ded-section');
  var name = nameEl.value.trim(), amount = parseFloat(amtEl.value);
  if (!name || !amount || amount <= 0) { toast('Enter name and amount'); return; }
  var res = await sbClient.from('salary_components').insert({
    user_id: currentUser.id, kind: kind, name: name, amount_monthly: amount,
    note: noteEl.value.trim(), taxable: isE ? extEl.value : null, section: !isE ? extEl.value : null
  });
  if (res.error) { toast('Error: ' + res.error.message); return; }
  toast('\u2713 Component saved');
  nameEl.value = ''; amtEl.value = ''; noteEl.value = '';
  cancelComponent(kind); await loadData(); renderSalary();
}

async function deleteSalaryComponent(id) {
  if (!confirm('Remove this component?')) return;
  await sbClient.from('salary_components').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Removed'); await loadData(); renderSalary();
}

function addComponent(kind)    { document.getElementById('add-' + kind + '-form').style.display = 'block'; }
function cancelComponent(kind) { document.getElementById('add-' + kind + '-form').style.display = 'none'; }

// ── SALARY SLIPS ──
async function saveSalarySlip() {
  var month = parseInt(document.getElementById('slip-month').value);
  var year  = parseInt(document.getElementById('slip-year').value);
  var gross = parseFloat(document.getElementById('slip-gross').value) || 0;
  var ded   = parseFloat(document.getElementById('slip-deductions').value) || 0;
  var net   = parseFloat(document.getElementById('slip-net').value) || (gross - ded);
  var notes = document.getElementById('slip-notes').value.trim();
  if (!gross) { toast('Enter gross earnings'); return; }
  var components = salaryCache.components.map(function(c){ return { name:c.name, kind:c.kind, amount:Number(c.amount_monthly), taxable:c.taxable, section:c.section, note:c.note }; });
  setBtn('slip-save-btn', true);
  var res = await sbClient.from('salary_slips').upsert({
    user_id: currentUser.id, month: month, year: year, gross_earnings: gross, total_deductions: ded, net_salary: net, notes: notes, components: components
  }, { onConflict: 'user_id,month,year' });
  setBtn('slip-save-btn', false, 'Save slip');
  if (res.error) { toast('Error: ' + res.error.message); return; }
  toast('\u2713 Salary slip saved for ' + MONTH_NAMES[month-1] + ' ' + year);
  await loadData(); renderSalary();
}

async function deleteSalarySlip(id) {
  if (!confirm('Delete this salary slip?')) return;
  await sbClient.from('salary_slips').delete().eq('id', id).eq('user_id', currentUser.id);
  toast('Deleted'); await loadData(); renderSalary();
}

function prefillSlip(month, year, gross, ded, net) {
  document.getElementById('slip-month').value      = month;
  document.getElementById('slip-year').value       = year;
  document.getElementById('slip-gross').value      = gross;
  document.getElementById('slip-deductions').value = ded;
  document.getElementById('slip-net').value        = net;
  var btn = document.getElementById('slip-save-btn');
  if (btn) btn.scrollIntoView({ behavior:'smooth', block:'center' });
  toast('Slip prefilled \u2014 edit and save to update');
}

// ── EXPORT / IMPORT ──
function exportExcel() {
  var wb = XLSX.utils.book_new();
  var inc = txCache.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var exp = txCache.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var sav = txCache.filter(function(t){ return t.type==='saving'; }).reduce(function(s,t){ return s+Number(t.amount); }, 0);
  var totalV = invCache.reduce(function(s,i){ return s+Number(i.current_value); }, 0);
  var totalA = invCache.reduce(function(s,i){ return s+Number(i.amount_invested); }, 0);
  var name = (userProfile && userProfile.full_name) || (currentUser && currentUser.email) || 'User';
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['PERSONAL FINANCE SUMMARY \u2014 '+name,''], ['Generated', new Date().toLocaleDateString('en-IN')], ['',''],
    ['Income (\u20b9)', inc], ['Expenses (\u20b9)', exp], ['Savings (\u20b9)', sav],
    ['Savings Rate (%)', inc>0 ? parseFloat(((inc-exp)/inc*100).toFixed(2)) : 0],
    ['',''], ['Portfolio Invested (\u20b9)', totalA], ['Current Value (\u20b9)', totalV],
    ['P&L (\u20b9)', totalV-totalA], ['Return (%)', totalA>0 ? parseFloat(((totalV-totalA)/totalA*100).toFixed(2)) : 0]
  ]), 'Summary');
  var txRows = [['Date','Type','Category','Note','Amount (\u20b9)']];
  txCache.forEach(function(t){ txRows.push([t.date, t.type, t.category||'', t.note||'', Number(t.amount)]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), 'Transactions');
  var invRows = [['Name','Type','Invested','Current','P&L','Return (%)','Units','Avg Price','Date','Maturity','Details']];
  invCache.forEach(function(i){
    var pnl = Number(i.current_value)-Number(i.amount_invested);
    var pct = Number(i.amount_invested)>0 ? parseFloat((pnl/Number(i.amount_invested)*100).toFixed(2)) : 0;
    invRows.push([i.name, TYPE_LABELS[i.asset_type]||i.asset_type, Number(i.amount_invested), Number(i.current_value), pnl, pct, i.units||0, i.avg_price||0, i.purchase_date||'', i.maturity_date||'', formatExtraDetails(i.asset_type, i.extra_data||{})]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'Investments');
  if (salaryCache.components.length > 0) {
    var salRows = [['Component','Kind','Amount/Month (\u20b9)','Taxable/Section','Note']];
    salaryCache.components.forEach(function(c){ salRows.push([c.name, c.kind, Number(c.amount_monthly), c.taxable||c.section||'', c.note||'']); });
    var et = salaryCache.components.filter(function(c){ return c.kind==='earning'; }).reduce(function(s,c){ return s+Number(c.amount_monthly); }, 0);
    var dt = salaryCache.components.filter(function(c){ return c.kind==='deduction'; }).reduce(function(s,c){ return s+Number(c.amount_monthly); }, 0);
    salRows.push(['','','','',''], ['Gross/Month','',et,'',''], ['Deductions/Month','',dt,'',''], ['Net/Month','',et-dt,'','']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salRows), 'Salary');
  }
  var byType = {};
  invCache.forEach(function(i){ byType[i.asset_type] = (byType[i.asset_type]||0) + Number(i.current_value); });
  var tot = Object.values(byType).reduce(function(s,v){ return s+v; }, 0);
  var allocRows = [['Type','Value (\u20b9)','%']];
  Object.entries(byType).forEach(function(kv){ allocRows.push([TYPE_LABELS[kv[0]]||kv[0], Math.round(kv[1]), tot>0 ? parseFloat((kv[1]/tot*100).toFixed(2)) : 0]); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allocRows), 'Allocation');
  XLSX.writeFile(wb, 'FinanceTracker_' + name.replace(/\s/g,'_') + '_' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('\u2713 Excel exported!');
}

function exportJSON() {
  var blob = new Blob([JSON.stringify({ transactions: txCache, investments: invCache, salary: salaryCache }, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'FinanceBackup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  toast('\u2713 Backup downloaded');
}

async function importJSON(event) {
  var file = event.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = async function(e) {
    try {
      var d = JSON.parse(e.target.result);
      if (!d.transactions || !d.investments) { toast('Invalid backup file'); return; }
      var txOk = 0, invOk = 0;
      for (var i = 0; i < d.transactions.length; i++) {
        var t = d.transactions[i];
        var res = await sbClient.from('transactions').insert({ user_id:currentUser.id, type:t.type, date:t.date, amount:t.amount, category:t.cat||t.category||'Other', note:t.note||'' });
        if (!res.error) txOk++;
      }
      for (var j = 0; j < d.investments.length; j++) {
        var inv = d.investments[j];
        var res2 = await sbClient.from('investments').insert({ user_id:currentUser.id, asset_type:inv.type||inv.asset_type, name:inv.name, amount_invested:inv.amount||inv.amount_invested, current_value:inv.current||inv.current_value, units:inv.units||0, avg_price:inv.avgprice||inv.avg_price||0, purchase_date:inv.date||inv.purchase_date||null, extra_data:inv.extra_data||{} });
        if (!res2.error) invOk++;
      }
      await loadData(); renderAll();
      toast('\u2713 Imported ' + txOk + ' transactions, ' + invOk + ' investments');
    } catch(err) { toast('Error: ' + err.message); }
  };
  reader.readAsText(file); event.target.value = '';
}

async function deleteAllMyData() {
  if (!confirm('Permanently delete ALL your data? Cannot be undone.')) return;
  if (!confirm('Final confirmation \u2014 delete everything?')) return;
  await Promise.all([
    sbClient.from('transactions').delete().eq('user_id', currentUser.id),
    sbClient.from('investments').delete().eq('user_id', currentUser.id),
    sbClient.from('salary_components').delete().eq('user_id', currentUser.id),
    sbClient.from('salary_profiles').delete().eq('user_id', currentUser.id),
    sbClient.from('salary_slips').delete().eq('user_id', currentUser.id)
  ]);
  await loadData(); renderAll(); toast('All data deleted');
}

function copyLink() {
  navigator.clipboard.writeText(document.getElementById('share-link').value)
    .then(function(){ toast('Link copied!'); }).catch(function(){ toast('Copy the link manually'); });
}
