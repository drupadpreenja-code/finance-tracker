// ══════════════════════════════════════════════════════════
//  investments.js — investment extra fields helpers
// ══════════════════════════════════════════════════════════

var EXTRA_FIELDS = {
  fd:  [
    {id:'rate',    label:'Interest rate (%/yr)', type:'number', placeholder:'e.g. 7.5', step:'0.01'},
    {id:'tenure',  label:'Tenure (months)',       type:'number', placeholder:'e.g. 12'},
    {id:'bank',    label:'Bank',                  type:'text',   placeholder:'e.g. SBI'},
    {id:'compound',label:'Compounding',           type:'select', options:['Quarterly','Monthly','Half-yearly','Annually','Simple Interest']}
  ],
  rd:  [
    {id:'rate',       label:'Interest rate (%/yr)', type:'number', placeholder:'e.g. 7.0', step:'0.01'},
    {id:'monthly_dep',label:'Monthly deposit',      type:'number', placeholder:'e.g. 5000'},
    {id:'tenure',     label:'Tenure (months)',       type:'number', placeholder:'e.g. 24'},
    {id:'bank',       label:'Bank',                  type:'text',   placeholder:'e.g. Post Office'}
  ],
  ppf: [
    {id:'rate',       label:'Interest rate (%/yr)', type:'number', placeholder:'7.1',       value:'7.1', step:'0.01'},
    {id:'yearly_dep', label:'Yearly deposit',        type:'number', placeholder:'e.g. 150000'},
    {id:'bank',       label:'Bank',                  type:'text',   placeholder:'e.g. SBI'},
    {id:'account_no', label:'Account number',        type:'text',   placeholder:'Optional'}
  ],
  epf: [
    {id:'rate',            label:'Interest rate (%/yr)',   type:'number', placeholder:'8.25', value:'8.25', step:'0.01'},
    {id:'employee_contrib',label:'Employee contrib/mo',    type:'number', placeholder:'e.g. 1800'},
    {id:'employer_contrib',label:'Employer contrib/mo',    type:'number', placeholder:'e.g. 1800'},
    {id:'uan',             label:'UAN',                    type:'text',   placeholder:'Optional'}
  ],
  nps: [
    {id:'tier',           label:'Tier',                type:'select', options:['Tier I','Tier II']},
    {id:'fund_mgr',       label:'Fund manager',        type:'text',   placeholder:'e.g. SBI Pension'},
    {id:'monthly_contrib',label:'Monthly contribution',type:'number', placeholder:'e.g. 5000'},
    {id:'pran',           label:'PRAN',                type:'text',   placeholder:'Optional'}
  ],
  bond:[
    {id:'rate',       label:'Coupon rate (%/yr)', type:'number', placeholder:'e.g. 8.0', step:'0.01'},
    {id:'face_value', label:'Face value',          type:'number', placeholder:'e.g. 1000'},
    {id:'issuer',     label:'Issuer',              type:'text',   placeholder:'e.g. RBI'},
    {id:'isin',       label:'ISIN',                type:'text',   placeholder:'Optional'}
  ],
  sgb: [
    {id:'rate',        label:'Interest rate (%/yr)', type:'number', placeholder:'2.5', value:'2.5', step:'0.01'},
    {id:'grams',       label:'Quantity (grams)',      type:'number', placeholder:'e.g. 10',         step:'0.001'},
    {id:'series',      label:'Series',               type:'text',   placeholder:'e.g. SGB 2023-24 Series I'},
    {id:'issue_price', label:'Issue price/gram',     type:'number', placeholder:'e.g. 5900'}
  ],
  us_stock:     [{id:'ticker',   label:'Exchange',       type:'select', options:['NYSE','NASDAQ','AMEX']}],
  indian_stock: [{id:'exchange', label:'Exchange',       type:'select', options:['NSE','BSE']}],
  mutual_fund:  [
    {id:'folio',    label:'Folio number',  type:'text',   placeholder:'Optional'},
    {id:'category', label:'Fund category', type:'select', options:['Large Cap','Mid Cap','Small Cap','Flexi Cap','ELSS','Index','Sectoral','International']}
  ],
  gold: [
    {id:'grams', label:'Quantity (grams)', type:'number', placeholder:'e.g. 10', step:'0.001'},
    {id:'form',  label:'Form',             type:'select', options:['Coin','Bar','Jewellery','ETF']}
  ]
};

function toggleInvFields() {
  var type = document.getElementById('inv-type').value;
  var container = document.getElementById('inv-extra-fields');
  var fields = EXTRA_FIELDS[type];
  if (!fields || fields.length === 0) { container.innerHTML = ''; return; }
  var html = '<div style="margin:8px 0 4px;font-size:12px;font-weight:700;color:var(--txt2);text-transform:uppercase;letter-spacing:.5px">'
    + (TYPE_LABELS[type]||type) + ' details';
  if (STANDARD_RATES[type]) html += ' <span style="background:var(--blue-bg);color:var(--blue-txt);padding:2px 8px;border-radius:10px;font-size:11px">Standard rate: ' + STANDARD_RATES[type] + '% p.a.</span>';
  html += '</div><div class="form-row" id="extra-fields-row"></div>';
  container.innerHTML = html;
  var row = document.getElementById('extra-fields-row');
  fields.forEach(function(f) {
    var div = document.createElement('div');
    div.className = 'form-group-inline'; div.style.minWidth = '140px';
    if (f.type === 'select') {
      div.innerHTML = '<label>' + f.label + '</label><select id="extra-' + f.id + '">' + f.options.map(function(o){ return '<option>' + o + '</option>'; }).join('') + '</select>';
    } else {
      div.innerHTML = '<label>' + f.label + '</label><input type="' + f.type + '" id="extra-' + f.id + '" placeholder="' + (f.placeholder||'') + '" '
        + (f.step ? 'step="'+f.step+'"' : '') + (f.value ? ' value="'+f.value+'"' : '') + ' min="0">';
    }
    row.appendChild(div);
  });
}

function collectExtraFields(type) {
  var fields = EXTRA_FIELDS[type]; if (!fields) return {};
  var result = {};
  fields.forEach(function(f) {
    var el = document.getElementById('extra-' + f.id);
    if (el) result[f.id] = el.value;
  });
  return result;
}

function formatExtraDetails(type, extra) {
  if (!extra || Object.keys(extra).length === 0) return '\u2014';
  var parts = [];
  if (extra.rate)            parts.push(extra.rate + '% p.a.');
  if (extra.bank)            parts.push(extra.bank);
  if (extra.tenure)          parts.push(extra.tenure + 'mo');
  if (extra.grams)           parts.push(extra.grams + 'g');
  if (extra.series)          parts.push(extra.series);
  if (extra.tier)            parts.push(extra.tier);
  if (extra.category)        parts.push(extra.category);
  if (extra.exchange||extra.ticker) parts.push(extra.exchange||extra.ticker);
  if (extra.compound)        parts.push(extra.compound);
  if (extra.fund_mgr)        parts.push(extra.fund_mgr);
  if (extra.monthly_contrib) parts.push('\u20b9' + Number(extra.monthly_contrib).toLocaleString('en-IN') + '/mo');
  if (extra.monthly_dep)     parts.push('\u20b9' + Number(extra.monthly_dep).toLocaleString('en-IN') + '/mo');
  if (extra.yearly_dep)      parts.push('\u20b9' + Number(extra.yearly_dep).toLocaleString('en-IN') + '/yr');
  return parts.join(' \u00b7 ') || '\u2014';
}
