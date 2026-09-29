
const $ = id => document.getElementById(id);
const API = p => 'api/' + p;

/* ================= Passcode + API helper ================= */


function fmt(n){
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', {maximumFractionDigits:0});
}

/* ================= Navigation ================= */
document.querySelectorAll('nav button[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function showView(v){
  if (!v) return;
  document.querySelectorAll('nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-'+v));
  if(v === 'plans'){ initProbBoard(); }
  if(v === 'journal'){ loadJournal(); loadStrategies(); }
  if(v === 'cockpit') initCockpit();
}

/* ================= Identity ================= */
let identity = localStorage.getItem('cockpit-identity');
function paintIdChip(){
  const c = $('idChip');
  c.className = 'id-chip ' + (identity || '');
  c.textContent = identity ? 'You are: ' + identity.toUpperCase() + ' (switch)' : 'who am I?';
}
$('idChip').addEventListener('click', () => { identity = null; localStorage.removeItem('cockpit-identity'); paintIdChip(); showView('cockpit'); });
paintIdChip();

/* ================= VIEW 1 — Impact SL calculator ================= */
/* ================= Impact SL — 2-column calculator ================= */
const COLS = ['A','B'];
const colDir = {A:'LONG', B:'LONG'};
let impactSaveTimer = null, impactPollTimer = null;

function impactGetState(){
  const state = {};
  COLS.forEach(c=>{
    const id = colIds(c);
    state[c] = {
      dir: colDir[c],
      entry: $(id.entry)?.value||'', lots: $(id.lots)?.value||'',
      vpp: $(id.vpp)?.value||'', flatSL: $(id.flatSL)?.value||'',
      p1: $(id.p1)?.value||'', sl1: $(id.sl1)?.value||'',
      p2: $(id.p2)?.value||'', sl2: $(id.sl2)?.value||'',
      p3: $(id.p3)?.value||'', sl3: $(id.sl3)?.value||''
    };
  });
  return state;
}

function impactSetState(state){
  if(!state) return;
  COLS.forEach(c=>{
    const s = state[c]; if(!s) return;
    const id = colIds(c);
    colDir[c] = s.dir||'LONG';
    // Update direction buttons
    document.querySelectorAll(`#view-impact .dir-btn[data-col="${c}"]`).forEach(b=>b.classList.toggle('active', b.dataset.dir===colDir[c]));
    const fields = ['entry','lots','vpp','flatSL','p1','sl1','p2','sl2','p3','sl3'];
    fields.forEach(f=>{ const el=$(id[f]); if(el && document.activeElement!==el) el.value=s[f]||''; });
    renderCol(c);
  });
}

async function impactSave(){
  try { await api('impactsl.php','POST', impactGetState()); } catch(e){}
}

async function impactLoad(silent){
  try {
    const remote = await api('impactsl.php');
    if(remote && (remote.A||remote.B)) impactSetState(remote);
  } catch(e){ if(!silent) console.log('impactLoad error',e); }
}

function impactScheduleSave(){
  if(impactSaveTimer) clearTimeout(impactSaveTimer);
  impactSaveTimer = setTimeout(impactSave, 800);
}

document.querySelector('nav button[data-view=impact]').addEventListener('click', ()=>{
  impactLoad(true);
  if(!impactPollTimer) impactPollTimer = setInterval(()=>{
    if(document.querySelector('#view-impact')?.classList.contains('active')) impactLoad(true);
  }, 4000);
});

function colIds(c){ const l=c.toLowerCase(); return {
  entry: l+'Entry', lots: l+'Lots', vpp: l+'Vpp', flatSL: l+'FlatSL',
  p1: l+'P1', sl1: l+'SL1', p2: l+'P2', sl2: l+'SL2', p3: l+'P3', sl3: l+'SL3',
  pctWarn: l+'PctWarning', ticketTitle: l+'TicketTitle', ticketBody: l+'TicketBody',
  breakdown: l+'Breakdown', copyBtn: l+'CopyTicket'
}; }

function computeCol(c){
  const id = colIds(c);
  const dir = colDir[c];
  const entry = parseFloat($(id.entry).value)||0;
  const lots  = parseFloat($(id.lots).value)||0;
  const vpp   = parseFloat($(id.vpp).value)||0;
  const flat  = parseFloat($(id.flatSL).value)||0;
  const priceDir = dir==='LONG' ? -1 : 1;
  const exitAction = dir==='LONG' ? 'SELL' : 'BUY';
  const tiers = [
    { pct:parseFloat($(id.p1).value)||0, sl:parseFloat($(id.sl1).value)||0, color:'var(--t1)', label:'Tier 1' },
    { pct:parseFloat($(id.p2).value)||0, sl:parseFloat($(id.sl2).value)||0, color:'var(--t2)', label:'Tier 2' },
    { pct:parseFloat($(id.p3).value)||0, sl:parseFloat($(id.sl3).value)||0, color:'var(--t3)', label:'Tier 3' },
  ];
  const pctSum = tiers.reduce((a,t)=>a+t.pct,0);
  $(id.pctWarn).style.display = Math.abs(pctSum-100)>0.01 ? 'block' : 'none';
  let impactLoss = 0;
  const rows = tiers.map(t=>{
    const tlots = lots*(t.pct/100);
    const loss = tlots*t.sl*vpp;
    impactLoss += loss;
    return {...t, lots:tlots, loss, exitPrice: entry+(priceDir*t.sl)};
  });
  return { dir, entry, lots, vpp, flat, rows, exitAction, impactLoss };
}

function renderCol(c){
  const id = colIds(c);
  const { dir, entry, lots, vpp, flat, rows, exitAction, impactLoss } = computeCol(c);

  // Ticket
  $(id.ticketTitle).textContent = 'Order Ticket — Position '+c+' ('+dir+')';
  const tb = $(id.ticketBody); tb.innerHTML='';
  rows.forEach(r=>{
    if(r.pct<=0) return;
    const row = document.createElement('div');
    row.className='ticket-row';
    row.innerHTML='<div><span class="lot-badge"><span class="swatch" style="background:'+r.color+'"></span>'+r.label+'</span></div>'
      +'<div><span class="action-tag '+exitAction+'">'+exitAction+'</span></div>'
      +'<div class="num">'+r.exitPrice.toLocaleString('en-US',{maximumFractionDigits:2})+'</div>'
      +'<div class="num">'+r.lots.toLocaleString('en-US',{maximumFractionDigits:1})+'</div>';
    tb.appendChild(row);
  });

  // Tier breakdown
  const bd = $(id.breakdown);
  if(bd){
    bd.innerHTML='';
    rows.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML='<td><span class="lot-badge"><span class="swatch" style="background:'+r.color+'"></span>'+r.label+'</span></td>'
        +'<td class="num">'+r.lots.toLocaleString('en-US',{maximumFractionDigits:1})+'</td>'
        +'<td class="num">'+r.sl+'</td>'
        +'<td class="num" style="color:var(--danger)">'+fmt(-r.loss)+'</td>';
      bd.appendChild(tr);
    });
    const tot=document.createElement('tr');
    tot.innerHTML='<td><b>Total</b></td><td class="num">'+rows.reduce((a,r)=>a+r.lots,0).toLocaleString('en-US',{maximumFractionDigits:1})+'</td><td></td><td class="num" style="color:var(--accent)"><b>'+fmt(-impactLoss)+'</b></td>';
    bd.appendChild(tot);
  }

  // Flat vs Impact savings
  const l = c.toLowerCase();
  const directLoss = lots * flat * vpp;
  const saved = directLoss - impactLoss;
  const savedPct = directLoss > 0 ? (saved/directLoss*100) : 0;
  if($(l+'FlatLoss')){
    $(l+'FlatLoss').textContent = fmt(-directLoss);
    $(l+'ImpLoss').textContent = fmt(-impactLoss);
    $(l+'Saved').textContent = fmt(Math.abs(saved)) + ' (' + savedPct.toFixed(1) + '%)';
  }

  // Store for copy
  window['__ticket'+c] = { c, dir, entry, exitAction, rows:rows.filter(r=>r.pct>0), lots, impactLoss };
}

// Direction buttons
document.querySelectorAll('#view-impact .dir-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    document.querySelectorAll('#view-impact .dir-btn[data-col="'+col+'"]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    colDir[col] = btn.dataset.dir;
    renderCol(col); impactScheduleSave();
  });
});

// Preset buttons
document.querySelectorAll('#view-impact .preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    if(!col) return;
    document.querySelectorAll('#view-impact .preset[data-col="'+col+'"]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const p = btn.dataset.p;
    if(p && p!=='custom'){
      const [a,b,c2] = p.split(',').map(Number);
      $(col+'P1').value=a; $(col+'P2').value=b; $(col+'P3').value=c2;
    }
    renderCol(col); impactScheduleSave();
  });
});

COLS.forEach(c => {
  ['Entry','Lots','Vpp','FlatSL','P1','SL1','P2','SL2','P3','SL3'].forEach(f => {
    const el = $(c.toLowerCase()+f);
    if(el) el.addEventListener('input', ()=>{ renderCol(c); impactScheduleSave(); });
  });
});

// Copy buttons
['A','B'].forEach(c => {
  const copyBtn = $(c+'CopyTicket'); if(!copyBtn) return;
  copyBtn.addEventListener('click', () => {
    const d = window['__ticket'+c];
    if(!d) return;
    let text = 'IMPACT SL — POSITION '+d.c+' ('+d.dir+') @ '+d.entry+'\n\n';
    d.rows.forEach(r => {
      text += r.label+': '+d.exitAction+' '+r.lots.toFixed(1)+' lot @ '+r.exitPrice.toLocaleString('en-US',{maximumFractionDigits:2})+'  (SL '+r.sl+' pts)\n';
    });
    text += '\nTotal impact loss: '+fmt(-d.impactLoss);
    navigator.clipboard.writeText(text).then(()=>{
      const orig = copyBtn.textContent;
      copyBtn.textContent='Copied ✓'; setTimeout(()=>copyBtn.textContent=orig,1500);
    });
  });
});

// Initial render — deferred so elements exist in DOM
window.addEventListener('DOMContentLoaded', () => { renderCol('A'); renderCol('B'); });


/* ================= VIEW 2b -- Team Bias / Reversal Confluence ================= */
const FACTOR_DEFS = [
  { key:'srLevel',   label:'Major support / resistance nearby' },
  { key:'liquidity', label:'Liquidity sweep / stop hunt seen' },
  { key:'trendline', label:'Trendline break' },
  { key:'orderBlock',label:'Order block / demand-supply zone reaction' },
  { key:'fib',       label:'Fibonacci golden zone reaction' },
  { key:'volume',    label:'Volume spike against the move' },
  { key:'news',      label:'Unexpected news / headline' },
  { key:'round',     label:'Round number / psychological level' },
  { key:'prevDay',   label:"Previous day's high / low reaction" },
  { key:'session',   label:'Session-open reversal (London / NY)' },
  { key:'prevSessionLiq', label:'Previous session liquidity not swept' },
  { key:'gutFeel',   label:'Someone has a strong gut feeling' },
];
let probBoard = null, probStarted = false, probSaveTimer = null, probPollTimer = null;
function defaultProbBoard(){
  const factors = {};
  FACTOR_DEFS.forEach(f => factors[f.key] = 'none');
  return { comment:'', decision:'none', factors };
}
function buildFactorGrid(){
  const host = $('factorGrid');
  if(host.childElementCount) return;
  host.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:10px;';
  FACTOR_DEFS.forEach(f => {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px; padding:10px 12px; background:var(--panel-2); border:1px solid var(--line); border-radius:7px;';
    div.innerHTML = '<span style="font-size:13px;"></span><select data-key="'+f.key+'"><option value="none">Not present</option><option value="watch">Weak</option><option value="strong">Strong — could reverse</option></select>';
    div.querySelector('span').textContent = f.label;
    div.querySelector('select').style.cssText = 'width:auto; min-width:130px; flex-shrink:0;';
    div.querySelector('select').addEventListener('change', (e) => {
      if(!probBoard) return;
      probBoard.factors[f.key] = e.target.value;
      renderProbBoard(); saveProbBoard();
    });
    host.appendChild(div);
  });
}
function initProbBoard(){
  buildFactorGrid();
  if(probStarted) return;
  probStarted = true;
  loadProbBoard(true);
  probPollTimer = setInterval(() => {
    if(document.querySelector('#view-plans').classList.contains('active')) loadProbBoard(false);
  }, 4000);
}
async function loadProbBoard(first){
  try {
    const remote = await api('probability.php');
    const editing = document.activeElement && document.querySelector('#view-plans').contains(document.activeElement) && document.activeElement.tagName === 'SELECT';
    if(first || (!editing && JSON.stringify(remote) !== JSON.stringify(probBoard))){
      probBoard = remote && remote.factors ? remote : defaultProbBoard();
      renderProbBoard();
    }
    $('probSync').textContent = '\u25cf synced'; $('probSync').className = 'sync ok';
  } catch(e){
    if(first){ probBoard = defaultProbBoard(); renderProbBoard(); }
    $('probSync').textContent = '\u25cf offline (local only)'; $('probSync').className = 'sync';
  }
}
function saveProbBoard(){
  if(probSaveTimer) clearTimeout(probSaveTimer);
  probSaveTimer = setTimeout(async () => {
    try { await api('probability.php','POST',probBoard); $('probSync').textContent='\u25cf synced'; $('probSync').className='sync ok'; }
    catch(e){ $('probSync').textContent='\u25cf save failed'; $('probSync').className='sync'; }
  }, 400);
}
function renderProbBoard(){
  if(!probBoard) return;
  document.querySelectorAll('#factorGrid select').forEach(sel => {
    const k = sel.dataset.key;
    if(document.activeElement !== sel) sel.value = probBoard.factors[k] || 'none';
  });
  const n = FACTOR_DEFS.length;
  const score = FACTOR_DEFS.reduce((a,f) => {
    const v = probBoard.factors[f.key];
    return a + (v==='strong' ? 2 : v==='watch' ? 1 : 0);
  }, 0);
  const pct = n ? Math.round((score/(n*2))*100) : 0;
  $('reversalPct').textContent = pct + '%';
  $('reversalPct').style.color = pct < 20 ? 'var(--accent)' : pct < 45 ? 'var(--t1)' : pct < 70 ? 'var(--t2)' : 'var(--danger)';
  $('reversalVerdict').textContent =
    pct < 20 ? 'Low -- nothing major is fighting the trade idea.' :
    pct < 45 ? 'Moderate -- a few signals worth watching before committing.' :
    pct < 70 ? 'High -- real chance of reversal. Consider trimming size or tightening SL.' :
    'Extreme -- multiple strong reversal signals. Strongly consider skipping this trade.';
  const flagged = FACTOR_DEFS.filter(f => probBoard.factors[f.key] !== 'none');
  $('reversalFlags').innerHTML = '';
  if(!flagged.length){ $('reversalFlags').textContent = 'No reversal signals flagged yet.'; }
  flagged.forEach(f => {
    const v = probBoard.factors[f.key];
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    div.innerHTML = (v==='strong' ? '\ud83d\udd34 ' : '\ud83d\udfe1 ') + '<b></b> -- ' + (v==='strong' ? 'strong' : 'weak, watching');
    div.querySelector('b').textContent = f.label;
    $('reversalFlags').appendChild(div);
  });
}

/* ================= VIEW 3 -- Journal ================= */
$('jDate').valueAsDate = new Date();

/* Strategies list */
async function loadStrategies(){
  try {
    const list = await api('strategies.php');
    const chipHost = $('stratList');
    chipHost.innerHTML = '';
    const sel = $('jStrategy');
    const prevVal = sel.value;
    sel.innerHTML = '<option value="">— none —</option>';
    list.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name; opt.textContent = s.name;
      sel.appendChild(opt);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<span></span><button>\u2715</button>';
      chip.querySelector('span').textContent = s.name;
      chip.querySelector('button').addEventListener('click', async () => {
        if(!confirm('Remove strategy "'+s.name+'"? Past journal entries keep the tag as text.')) return;
        try { await api('strategies.php','DELETE',{id:s.id}); loadStrategies(); } catch(e){}
      });
      chipHost.appendChild(chip);
    });
    sel.value = prevVal;
  } catch(e){
    $('stratList').innerHTML = '<span class="plans-status">Storage not connected — set up api/config.php and the database first.</span>';
  }
}
$('stratAdd').addEventListener('click', async () => {
  const name = $('stratName').value.trim();
  if(!name) return;
  try { await api('strategies.php','POST',{name}); $('stratName').value=''; loadStrategies(); }
  catch(e){ alert('Could not add strategy — '+e.message); }
});

/* Chart screenshot -> base64 */
let pendingChart = null;
$('jChart').addEventListener('change', async () => {
  const file = $('jChart').files[0];
  pendingChart = null;
  if(!file) return;
  try {
    const prepared = await prepareChartImage(file);
    pendingChart = prepared.dataUrl;
    $('jStatus').textContent = 'Chart ready.';
  } catch (error) {
    $('jChart').value = '';
    $('jStatus').textContent = error.message || 'The chart could not be read.';
  }
});

$('jAdd').addEventListener('click', async () => {
  const body = {
    account: $('jAccount').value,
    pair: $('jPair').value.trim() || 'Trade',
    buy_price: +$('jBuyPrice').value||0,
    sell_price: +$('jSellPrice').value||0,
    planned_target: +$('jPlannedTarget').value||0,
    actual_target: +$('jActualTarget').value||0,
    position: $('jPosition').value,
    trade_date: $('jDate').value || new Date().toISOString().slice(0,10),
    strategy: $('jStrategy').value,
    outcome: $('jOutcome').value,
    pnl_pct: +$('jPnlPct').value || 0,
    chart_image: await sharedChart(pendingChart),
    notes: $('jNotes').value.trim()
  };
  try {
    $('jStatus').textContent = 'Saving…';
    await api('journal.php','POST',body);
    $('jStatus').textContent = 'Logged ✓';
    $('jPair').value=''; $('jPnlPct').value=''; $('jNotes').value=''; $('jChart').value=''; pendingChart=null;
    $('jBuyPrice').value=''; $('jSellPrice').value=''; $('jPlannedTarget').value=''; $('jActualTarget').value='';
    $('jDate').valueAsDate = new Date();
    setTimeout(()=>$('jStatus').textContent='',3000);
    loadJournal();
  } catch(e){ $('jStatus').textContent = 'Could not save — '+e.message; }
});
async function loadJournal(){
  try {
    const rows = await api('journal.php');
    const body = $('jBody'); body.innerHTML = '';
    let wins=0, losses=0, net=0, winSum=0, lossSum=0;
    rows.forEach(r => {
      const pnl = +r.pnl_pct;
      net += pnl;
      if(r.outcome==='win'){wins++; winSum+=pnl;}
      if(r.outcome==='loss'){losses++; lossSum+=pnl;}
      const posClass = r.position==='Short' ? 'short' : 'long';
      const outClass = r.outcome==='win' ? 'win' : r.outcome==='loss' ? 'loss' : 'be';
      const dateStr = r.trade_date ? new Date(r.trade_date+'T00:00:00').toLocaleDateString('en-US',{month:'short', day:'2-digit', year:'numeric'}) : '';
      const accColors = {Lucid:'var(--accent)',FundingPip:'var(--kp)',Salary:'var(--t1)'};
      const accColor = accColors[r.account]||'var(--muted)';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><span style="font-size:11px;font-weight:700;color:${accColor};font-family:'JetBrains Mono',monospace;"></span></td>
        <td></td>
        <td><span class="badge ${posClass}"></span></td>
        <td class="num" style="white-space:nowrap;">${dateStr}</td>
        <td>${r.strategy ? '<span class="badge strategy"></span>' : ''}</td>
        <td><span class="badge ${outClass}"></span></td>
        <td class="num ${pnl>=0?'pnl-pos':'pnl-neg'}">${fmt(pnl)}</td>
        <td></td>
        <td><button class="plan-act del">✕</button></td>`;
      tr.children[0].querySelector('span').textContent = r.account||'';
      tr.children[1].textContent = r.pair;
      tr.children[2].querySelector('.badge').textContent = r.position;
      if(r.strategy) tr.children[4].querySelector('.badge').textContent = r.strategy;
      tr.children[5].querySelector('.badge').textContent = r.outcome.toUpperCase();
      if(r.notes) tr.children[1].title = r.notes;
      if(r.chart_image){
        const img = document.createElement('img');
        img.className = 'chart-thumb'; img.src = r.chart_image;
        img.addEventListener('click', () => openChart(r.chart_image));
        tr.children[7].appendChild(img);
      }
      tr.querySelector('.del').addEventListener('click', async () => {
        if(!confirm('Delete this journal entry?')) return;
        try { await api('journal.php','DELETE',{id:r.id}); loadJournal(); } catch(e){}
      });
      body.appendChild(tr);
    });
    const total = rows.length;
    const wr = total ? (wins/total*100).toFixed(0) : 0;
    const netClass = net>=0?'pnl-pos':'pnl-neg';
    $('jStats').innerHTML = `
      <div class="jstat"><div class="label">Trades</div><div class="value num">${total}</div></div>
      <div class="jstat"><div class="label">Win rate</div><div class="value num">${wr}%</div></div>
      <div class="jstat"><div class="label">Net PnL</div><div class="value num ${netClass}">${fmt(net)}</div></div>
      <div class="jstat"><div class="label">Avg win</div><div class="value num pnl-pos">${fmt(wins?winSum/wins:0)}</div></div>
      <div class="jstat"><div class="label">Avg loss</div><div class="value num pnl-neg">${fmt(losses?lossSum/losses:0)}</div></div>`;
    if(!total) $('jBody').innerHTML = '<tr><td colspan="8" style="color:var(--muted);">No trades logged yet.</td></tr>';
    initCalendar(rows);
  } catch(e){
    $('jStats').innerHTML = '';
    $('jBody').innerHTML = '<tr><td colspan="8" style="color:var(--muted);">Storage not connected — set up api/config.php and the database first.</td></tr>';
  }
}

/* ================= Calendar ================= */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calData = {}; // keyed by 'YYYY-MM-DD' -> {pnl, trades}

function buildCalData(rows){
  calData = {};
  rows.forEach(r => {
    const key = r.trade_date ? r.trade_date.slice(0,10) : '';
    if(!key) return;
    if(!calData[key]) calData[key] = { pnl:0, trades:0, accounts:{} };
    const pnl = +r.pnl_pct;
    calData[key].pnl += pnl;
    calData[key].trades++;
    const acc = r.account||'Other';
    calData[key].accounts[acc] = (calData[key].accounts[acc]||0) + pnl;
  });
}

function renderCalendar(){
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('calTitle').textContent = months[calMonth] + ' ' + calYear;
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const grid = $('calGrid'); grid.innerHTML = '';

  // blank cells before first day
  for(let i=0; i<firstDay; i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  let monthPnl = 0, monthDays = 0;
  const weeks = {};

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const dayOfWeek = new Date(calYear, calMonth, d).getDay();
    const weekNum = Math.floor((firstDay + d - 1) / 7);
    const info = calData[dateStr];
    const cell = document.createElement('div');
    const isToday = dateStr === todayStr;
    cell.className = 'cal-cell' + (isToday ? ' today' : '') + (info ? (info.pnl >= 0 ? ' win-day' : ' loss-day') : '');
    cell.innerHTML = '<div class="cal-day">'+d+'</div>';
    if(info){
      monthPnl += info.pnl; monthDays++;
      cell.innerHTML += '<div class="cal-trades">'+info.trades+' trade'+(info.trades>1?'s':'')+'</div>';
      cell.innerHTML += '<div class="cal-pnl '+(info.pnl>=0?'pnl-pos':'pnl-neg')+'">'+fmt(info.pnl)+'</div>';
      const accColors = {Lucid:'var(--accent)',FundingPip:'var(--kp)',Salary:'var(--t1)'};
      Object.entries(info.accounts||{}).forEach(([acc,pnl])=>{
        cell.innerHTML += '<div style="font-size:9px;font-family:JetBrains Mono,monospace;color:'+( accColors[acc]||'var(--muted)')+';">'+acc+': '+fmt(pnl)+'</div>';
      });
      if(!weeks[weekNum]) weeks[weekNum] = {pnl:0, days:0, start:dateStr};
      weeks[weekNum].pnl += info.pnl; weeks[weekNum].days++;
      weeks[weekNum].end = dateStr;
    }
    grid.appendChild(cell);
  }

  // Monthly totals
  $('calMonthPnl').textContent = fmt(monthPnl);
  $('calMonthPnl').className = 'num ' + (monthPnl >= 0 ? 'pnl-pos' : 'pnl-neg');
  $('calMonthDays').textContent = monthDays;

  // Weekly summary
  const weekly = $('calWeekly'); weekly.innerHTML = '';
  const weekLabels = ['Week One','Week Two','Week Three','Week Four','Week Five'];
  const totalWeeks = Math.ceil((firstDay + daysInMonth) / 7);
  for(let w=0; w<totalWeeks; w++){
    const info = weeks[w];
    const startD = new Date(calYear, calMonth, 1 - firstDay + w*7).getDate();
    const endD = Math.min(new Date(calYear, calMonth, 1 - firstDay + w*7 + 6).getDate(), daysInMonth);
    const startM = months[calMonth].slice(0,3);
    const row = document.createElement('div');
    row.className = 'week-row';
    row.innerHTML = '<div class="wlabel">'+(weekLabels[w]||'Week '+(w+1))+'</div>'
      + (info
        ? '<div class="wpnl '+(info.pnl>=0?'pnl-pos':'pnl-neg')+'">'+fmt(info.pnl)+'</div><div class="wdays">Days: '+info.days+'</div>'
        : '<div class="wdays" style="margin-top:4px;">No trades</div>');
    weekly.appendChild(row);
  }
}

function initCalendar(rows){
  buildCalData(rows);
  renderCalendar();
}
$('calPrev').addEventListener('click', ()=>{ calMonth--; if(calMonth<0){calMonth=11; calYear--;} renderCalendar(); });
$('calNext').addEventListener('click', ()=>{ calMonth++; if(calMonth>11){calMonth=0; calYear++;} renderCalendar(); });
$('calToday').addEventListener('click', ()=>{ calYear=new Date().getFullYear(); calMonth=new Date().getMonth(); renderCalendar(); });

/* ================= VIEW 4 — Cockpit (shared board) ================= */
const ITEM_DEFS = [
  { step:1, key:'news',       label:'High-impact news checked' },
  { step:1, key:'vol',        label:'Volatility acceptable' },
  { step:1, key:'prepTime',   label:'Adequate prep time taken before trade' },
  { step:2, key:'trend',      label:'Trend identified' },
  { step:2, key:'structure',  label:'Market structure confirmed' },
  { step:2, key:'sr',         label:'Major support/resistance marked' },
  { step:2, key:'fibDone',    label:'Fibonacci completed' },
  { step:2, key:'liquidity',  label:'Liquidity mapped' },
  { step:2, key:'entryZone',  label:'Entry zone marked' },
  { step:2, key:'riskDefined',label:'Risk level defined' },
  { step:4, key:'trap',       label:'Use advanced logic trap' },
  { step:4, key:'slHunt',     label:'SL hunt zone identified' },
  { step:5, key:'d1Bias',     label:'Daily bias & key levels marked' },
  { step:5, key:'d1News',     label:"Tomorrow's news calendar reviewed" },
  { step:5, key:'d1Review',   label:'Previous day reviewed' },
  { step:6, key:'h3Structure',label:'Session structure mapped (H1/H4)' },
  { step:6, key:'h3Liquidity',label:'Liquidity zones updated' },
  { step:6, key:'h3Bias',     label:'Bias still valid on higher timeframe' },
  { step:7, key:'m30Entry',   label:'Entry zone active & alerts set' },
  { step:7, key:'m30Spread',  label:'Spread / volatility acceptable' },
  { step:7, key:'m30Risk',    label:'Risk defined — lots & SL tiers ready' },
];
let board = null, cockpitStarted = false, saveTimer = null, pollTimer = null;
const firedLocally = new Set();
let audioCtx = null;

function defaultBoard(){
  const marks = {};
  ITEM_DEFS.forEach(i => marks[i.key] = {vd:'unset', kp:'unset'});
  return {
    startedAt:Date.now(), marks,
    notes:{vd:'',kp:''}, alarms:[],
    accounts:[
      {name:'Lucid 25K', balance:25000, goal:27500, today:0, maxDailyLoss:130},
      {name:'Funding Pip 100K', balance:100000, goal:108000, today:0, maxDailyLoss:350},
      {name:'Salary Account 10K', balance:10000, goal:11000, today:0, maxDailyLoss:60}
    ],
    selectedAccount:0,
    ready:{vd:false, kp:false, skipped:false}
  };
}
function initCockpit(){
  if(!identity){ $('cockpitGate').style.display='block'; $('cockpitMain').style.display='none'; return; }
  $('cockpitGate').style.display='none';
  if(cockpitStarted){ $('cockpitMain').style.display='block'; return; }
  cockpitStarted = true;
  loadBoard(true);
  pollTimer = setInterval(() => {
    if(document.querySelector('#view-cockpit').classList.contains('active')) loadBoard(false);
  }, 4000);
  setInterval(tickTimer, 1000);
  setInterval(checkAlarms, 1000);
}
$('pickVd').addEventListener('click', ()=>{ identity='vd'; localStorage.setItem('cockpit-identity','vd'); paintIdChip(); initCockpit(); });
$('pickKp').addEventListener('click', ()=>{ identity='kp'; localStorage.setItem('cockpit-identity','kp'); paintIdChip(); initCockpit(); });

async function loadBoard(first){
  try {
    const remote = await api('board.php');
    const editing = document.activeElement && document.querySelector('#view-cockpit').contains(document.activeElement) && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(first || (!editing && JSON.stringify(remote) !== JSON.stringify(board))){
      board = remote && remote.marks ? remote : defaultBoard();
      if(!board.accounts) board.accounts = defaultBoard().accounts;
      if(!board.ready) board.ready = {vd:false, kp:false, skipped:false};
      renderCockpit();
    }
    $('cockpitMain').style.display='block'; $('cockpitOffline').style.display='none';
    paintSync(true);
  } catch(e){
    if(first){ $('cockpitOffline').style.display='block'; }
    paintSync(false);
  }
}
function saveBoard(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await api('board.php','POST',board); paintSync(true); }
    catch(e){ paintSync(false); }
  }, 400);
}
function tickTimer(){
  if(!board || !board.startedAt) return;
  const s = Math.floor((Date.now()-board.startedAt)/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0'), ss = String(s%60).padStart(2,'0');
  $('prepTimer').textContent = 'Session: '+mm+':'+ss + (s >= 1800 ? ' ✓ prep done' : ' (30 min prep rec.)');
}
function renderCockpit(){
  if(!board) return;

  // Account cards
  const g = $('accGrid'); g.innerHTML='';
  (board.accounts||[]).forEach((a,i)=>{
    const rem = Math.max(a.maxDailyLoss + a.today, 0);
    const hit = rem <= 0;
    const progress = a.goal > 0 ? Math.min((a.balance/a.goal)*100,100) : 0;
    const gl = Math.max(a.goal - a.balance, 0);
    const div = document.createElement('div');
    div.className = 'acc' + (board.selectedAccount===i?' sel':'');
    div.innerHTML = `<div class="aname"></div>
      <div class="arow">
        <div><label>Balance</label><input type="number" data-f="balance"></div>
        <div><label>Goal</label><input type="number" data-f="goal"></div>
        <div><label>Daily cap</label><input type="number" data-f="maxDailyLoss"></div>
      </div>
      <div class="acc-bar"><div style="width:${progress.toFixed(1)}%"></div></div>
      <div style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-bottom:8px;">${gl>0?'$'+gl.toFixed(0)+' left to goal':'🎉 Goal reached'}</div>
      <div class="afoot ${hit?'cap':''}">
        <span>Today: ${a.today>=0?'+':''}${a.today.toFixed(0)}</span>
        <span>${hit?'CAP REACHED':'$'+rem.toFixed(0)+' left today'}</span>
        <button class="linklike">reset today</button>
      </div>`;
    div.querySelector('.aname').textContent = a.name;
    div.addEventListener('click', ()=>{ board.selectedAccount=i; saveBoard(); renderCockpit(); });
    div.querySelectorAll('input').forEach(inp=>{
      inp.value = a[inp.dataset.f];
      inp.addEventListener('click', e=>e.stopPropagation());
      inp.addEventListener('change', ()=>{ a[inp.dataset.f]=+inp.value||0; saveBoard(); renderCockpit(); });
    });
    div.querySelector('.linklike').addEventListener('click', e=>{ e.stopPropagation(); a.today=0; saveBoard(); renderCockpit(); });
    g.appendChild(div);
  });

  // Ready buttons
  const ready = board.ready || {vd:false, kp:false, skipped:false};
  const bothReady = (ready.vd && ready.kp) || ready.skipped;
  const vdBtn = $('vdReadyBtn'), kpBtn = $('kpReadyBtn');
  vdBtn.textContent = ready.vd ? 'VD: Ready ✓' : 'VD: Ready?';
  vdBtn.style.borderColor = ready.vd ? 'var(--vd)' : 'var(--line)';
  vdBtn.style.color = ready.vd ? 'var(--vd)' : 'var(--muted)';
  vdBtn.style.background = ready.vd ? 'rgba(61,220,151,0.08)' : 'var(--panel-2)';
  kpBtn.textContent = ready.kp ? 'KP: Ready ✓' : 'KP: Ready?';
  kpBtn.style.borderColor = ready.kp ? 'var(--kp)' : 'var(--line)';
  kpBtn.style.color = ready.kp ? 'var(--kp)' : 'var(--muted)';
  kpBtn.style.background = ready.kp ? 'rgba(78,161,245,0.08)' : 'var(--panel-2)';
  $('bothReadyMsg').style.display = bothReady ? 'block' : 'none';
  $('prepStatusMsg').textContent = ready.skipped ? 'Skipped by agreement.' : bothReady ? 'Both ready — you\'re good to go.' : 'Mark ready when prep is complete.';
  vdBtn.disabled = identity !== 'vd';
  kpBtn.disabled = identity !== 'kp';
  // Checklist
  [[1,'ckStep1'],[2,'ckStep2'],[4,'ckStep4'],[5,'ckDay'],[6,'ck3h'],[7,'ck30m']].forEach(([step,hostId])=>{
    const host = $(hostId); host.innerHTML='';
    ITEM_DEFS.filter(i=>i.step===step).forEach(item=>{
      const m = board.marks[item.key] || {vd:'unset',kp:'unset'};
      const row = document.createElement('div');
      row.className = 'check-row';
      row.innerHTML = `<span class="lbl"></span>
        <span class="mk-tag" style="color:var(--vd)">VD</span><button class="mk" data-who="vd"></button>
        <span class="mk-tag" style="color:var(--kp)">KP</span><button class="mk" data-who="kp"></button>`;
      row.querySelector('.lbl').textContent = item.label;
      row.querySelectorAll('.mk').forEach(btn=>{
        const who = btn.dataset.who, st = m[who];
        btn.textContent = st==='check' ? '✓' : st==='cross' ? '✕' : '';
        btn.style.color = st==='check' ? (who==='vd'?'var(--vd)':'var(--kp)') : st==='cross' ? 'var(--danger)' : 'var(--muted)';
        if(st!=='unset') btn.classList.add('check');
        btn.disabled = identity !== who;
        btn.addEventListener('click', ()=>{
          const next = {unset:'check', check:'cross', cross:'unset'};
          if(!board.marks[item.key]) board.marks[item.key] = {vd:'unset', kp:'unset'};
          board.marks[item.key][who] = next[st];
          saveBoard(); renderCockpit();
        });
      });
      host.appendChild(row);
    });
  });
  // Disagreement banner
  const dis = ITEM_DEFS.filter(i=>{ const m=board.marks[i.key]; return m.vd!=='unset' && m.kp!=='unset' && m.vd!==m.kp; });
  const crosses = ITEM_DEFS.filter(i=>{ const m=board.marks[i.key]; return m.vd==='cross'||m.kp==='cross'; });
  if(dis.length){
    $('avoidBanner').style.display='block';
    $('avoidBanner').textContent = '⚠ You two disagree on: ' + dis.map(d=>d.label).join(', ') + (dis.length>crosses.length ? ' — consider avoiding this trade.' : '');
  } else $('avoidBanner').style.display='none';
  // Notes
  if(document.activeElement!==$('noteVd')) $('noteVd').value = board.notes.vd||'';
  if(document.activeElement!==$('noteKp')) $('noteKp').value = board.notes.kp||'';
  $('noteVd').disabled = identity!=='vd';
  $('noteKp').disabled = identity!=='kp';
  // Alarms
  renderAlarms();
}
let noteTimer=null;
[['noteVd','vd'],['noteKp','kp']].forEach(([id,who])=>{
  $(id).addEventListener('input', ()=>{
    if(!board) return;
    board.notes[who] = $(id).value;
    if(noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(saveBoard, 700);
  });
});
$('newSession').addEventListener('click', ()=>{
  if(!board || !confirm('Start a new session? This clears all ticks and the timer. Accounts, alarms, and notes stay.')) return;
  ITEM_DEFS.forEach(i=> board.marks[i.key] = {vd:'unset',kp:'unset'});
  board.startedAt = Date.now();
  board.ready = {vd:false, kp:false, skipped:false};
  saveBoard(); renderCockpit();
});
window.addEventListener('DOMContentLoaded', ()=>{
  const vdR=$('vdReadyBtn'), kpR=$('kpReadyBtn'), sk=$('skipPrep');
  if(vdR) vdR.addEventListener('click', ()=>{ if(!board||identity!=='vd') return; board.ready.vd=!board.ready.vd; saveBoard(); renderCockpit(); });
  if(kpR) kpR.addEventListener('click', ()=>{ if(!board||identity!=='kp') return; board.ready.kp=!board.ready.kp; saveBoard(); renderCockpit(); });
  if(sk) sk.addEventListener('click', ()=>{ if(!board) return; board.ready.skipped=!board.ready.skipped; saveBoard(); renderCockpit(); });
});
/* Alarms */
function playBeep(){
  try{
    if(!audioCtx){ const C = window.AudioContext||window.webkitAudioContext; if(C) audioCtx = new C(); }
    if(!audioCtx) return;
    if(audioCtx.state==='suspended') audioCtx.resume();
    [0,400,800].forEach(d=>setTimeout(()=>{
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='sine'; o.frequency.value=880; g.gain.value=0.15;
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.25);
    },d));
  }catch(e){}
}
$('enableAlerts').addEventListener('click', ()=>{
  if(typeof Notification!=='undefined') Notification.requestPermission();
  playBeep();
});
$('alAdd').addEventListener('click', ()=>{
  if(!board) return;
  const label = $('alLabel').value.trim(), t = $('alTime').value;
  if(!label || !t) return;
  board.alarms.push({id:String(Date.now()+Math.random()), label, datetime:new Date(t).toISOString(), fired:false});
  $('alLabel').value=''; $('alTime').value='';
  saveBoard(); renderAlarms();
});
function renderAlarms(){
  const host = $('alList'); host.innerHTML='';
  const alarms = (board.alarms||[]).slice().sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  if(!alarms.length){ host.innerHTML = '<div class="plans-status">No alarms set.</div>'; return; }
  alarms.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'alarm-row'+(a.fired?' fired':'');
    div.innerHTML = `<span><b></b> <span class="num" style="color:var(--muted);margin-left:8px;">${new Date(a.datetime).toLocaleString()}</span>${a.fired?' <span style="color:var(--muted)">(fired)</span>':''}</span><button class="plan-act del">✕</button>`;
    div.querySelector('b').textContent = a.label;
    div.querySelector('.del').addEventListener('click', ()=>{
      board.alarms = board.alarms.filter(x=>x.id!==a.id);
      saveBoard(); renderAlarms();
    });
    host.appendChild(div);
  });
}
function checkAlarms(){
  if(!board) return;
  const now = Date.now();
  (board.alarms||[]).forEach(a=>{
    if(!a.fired && !firedLocally.has(a.id) && new Date(a.datetime).getTime() <= now){
      firedLocally.add(a.id);
      playBeep();
      if(typeof Notification!=='undefined' && Notification.permission==='granted') new Notification('⏰ Cockpit Alarm',{body:a.label});
      else alert('⏰ Alarm: '+a.label);
      a.fired = true;
      saveBoard(); renderAlarms();
    }
  });
}


/* ================= Probability Board (synced) ================= */
let pbTrades = [], pbCurrentId = null, pbPollTimer = null, pbSaveTimer = null;

function pbUid(){ return 't'+Date.now()+Math.random().toString(36).slice(2,6); }

function pbBlank(){
  return { id:pbUid(), title:'Untitled trade', symbol:'', direction:'long', image:null, discussion:'', decision:'none', updatedAt:Date.now() };
}

function pbResizeImage(dataUrl, cb){
  const img=new Image();
  img.onload=()=>{
    const maxW=1000, scale=Math.min(1,maxW/img.width);
    const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
    const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    cb(canvas.toDataURL('image/jpeg',0.82));
  };
  img.src=dataUrl;
}




function pbScheduleSave(){
  if(pbSaveTimer) clearTimeout(pbSaveTimer);
  pbSaveTimer = setTimeout(pbSaveAll, 600);
}

function pbCurrent(){ return pbTrades.find(t=>t.id===pbCurrentId)||null; }

function pbRenderRail(){
  const rail=document.getElementById('pbRail'); if(!rail) return;
  if(!pbTrades.length){ rail.innerHTML='<div class="pb-rail-empty">No trades yet \u2014 click "+ new trade" to start.</div>'; return; }
  const sorted=[...pbTrades].sort((a,b)=>b.updatedAt-a.updatedAt);
  rail.innerHTML = sorted.map(t=>{
    const d=new Date(t.updatedAt);
    const ds=(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    const icon = t.decision==='priority'?'&#128293; ':t.decision==='skip'?'&#9940; ':'';
    const activeClass = t.id===pbCurrentId?' active':'';
    const borderSt = t.decision==='priority'?'border-left:3px solid var(--accent);':t.decision==='skip'?'border-left:3px solid var(--danger);opacity:0.55;':'';
    const symHtml = t.symbol?('<span style="color:var(--muted);font-size:10px;">'+pbEscHtml(t.symbol)+'</span> \u2014 '):'';
    return '<div class="pb-rail-item'+activeClass+'" data-id="'+t.id+'" style="'+borderSt+'">'
      +'<div class="pbt">'+icon+symHtml+pbEscHtml(t.title)+'</div>'
      +'<div class="pbm">'+ds+'</div></div>';
  }).join('');
  // Priority summary at top
  const prioTrades = pbTrades.filter(t=>t.decision==='priority');
  if(prioTrades.length){
    let summary = '<div style="padding:10px 14px;background:rgba(0,217,160,0.08);border-bottom:1px solid var(--line);font-size:11px;">'
      +'<div style="color:var(--accent);font-weight:700;margin-bottom:4px;">&#128293; '+prioTrades.length+' Priority Trade'+(prioTrades.length>1?'s':'')+'</div>'
      +prioTrades.map(t=>'<div style="color:var(--muted);">'+(t.symbol||'\u2014')+' '+t.direction.toUpperCase()+'</div>').join('')
      +'</div>';
    rail.innerHTML = summary + rail.innerHTML;
  }
  rail.querySelectorAll('.pb-rail-item').forEach(el=>{
    el.addEventListener('click', ()=>{ pbCurrentId=el.dataset.id; pbRenderRail(); pbRenderMain(); });
  });
}

function pbEsc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function pbEscHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }





function pbNew(silent){
  const t=pbBlank();
  pbTrades.unshift(t);
  pbCurrentId=t.id;
  if(!silent) pbSaveAll();
  pbRenderRail(); pbRenderMain();
}

document.addEventListener('DOMContentLoaded', ()=>{
  const newBtn=document.getElementById('pbNew');
  if(newBtn) newBtn.addEventListener('click', ()=>pbNew(false));
});

document.querySelector('nav button[data-view=probboard]').addEventListener('click', ()=>{
  pbLoad(true);
  if(!pbPollTimer) pbPollTimer=setInterval(()=>{
    if(document.querySelector('#view-probboard')?.classList.contains('active')) pbLoad(true);
  }, 4000);
});

/* Shared desk: charts are files both people load, not private browser data. */
let apiMode = "local";
const OS_KEY = "hochsternn-os-v1";

function osRead() {
  const base = { impact: {}, probability: null, strategies: [], journal: [], board: null, probboard: { trades: [] } };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(OS_KEY) || "null") };
  } catch (error) {
    return base;
  }
}
function osWrite(state) {
  localStorage.setItem(OS_KEY, JSON.stringify(state));
}
function localApi(endpoint, method, body) {
  const state = osRead();
  const name = endpoint.replace(/^\//, "");
  if (name === "impactsl.php") {
    if (method === "POST") { state.impact = body; osWrite(state); return { ok: true }; }
    return state.impact || {};
  }
  if (name === "probability.php") {
    if (method === "POST") { state.probability = body; osWrite(state); return { ok: true }; }
    return state.probability || {};
  }
  if (name === "board.php") {
    if (method === "POST") { state.board = body; osWrite(state); return { ok: true }; }
    return state.board || {};
  }
  if (name === "probboard.php") {
    if (method === "POST") { state.probboard = { trades: body.trades || [] }; osWrite(state); return { ok: true }; }
    return state.probboard || { trades: [] };
  }
  if (name === "strategies.php") {
    state.strategies = state.strategies || [];
    if (method === "POST") {
      const row = { id: "s" + Date.now(), name: body.name };
      state.strategies.push(row);
      osWrite(state);
      return row;
    }
    if (method === "DELETE") {
      state.strategies = state.strategies.filter((row) => row.id !== body.id);
      osWrite(state);
      return { ok: true };
    }
    return state.strategies;
  }
  if (name === "journal.php") {
    state.journal = state.journal || [];
    if (method === "POST") {
      const row = { ...body, id: "j" + Date.now() };
      state.journal.unshift(row);
      osWrite(state);
      return row;
    }
    if (method === "DELETE") {
      state.journal = state.journal.filter((row) => row.id !== body.id);
      osWrite(state);
      return { ok: true };
    }
    return state.journal;
  }
  throw new Error("Unknown desk endpoint");
}

function paintSync(ok) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  if (!ok) {
    el.textContent = "not saved";
    el.className = "sync";
    return;
  }
  el.textContent = apiMode === "remote" ? "shared desk" : "this browser";
  el.className = apiMode === "remote" ? "sync ok" : "sync";
}

async function detectApi() {
  try {
    const res = await fetch("api/health", { cache: "no-store" });
    if (res.ok) apiMode = "remote";
  } catch (error) {
    apiMode = "local";
  }
  paintSync(true);
  if (apiMode === "remote" && !window.__hochsternnLive) {
    window.__hochsternnLive = setInterval(() => {
      if (document.querySelector("#view-journal")?.classList.contains("active")) {
        loadJournal();
        loadStrategies();
      }
      if (document.querySelector("#view-impact")?.classList.contains("active")) impactLoad(true);
      if (document.querySelector("#view-plans")?.classList.contains("active")) loadProbBoard(false);
      if (document.querySelector("#view-cockpit")?.classList.contains("active") && board) loadBoard(false);
      if (document.querySelector("#view-probboard")?.classList.contains("active")) pbLoad();
    }, 4000);
  }
}

function getKey() { return ""; }

async function api(endpoint, method = "GET", body = null) {
  if (apiMode === "remote") {
    const res = await fetch("api/" + endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The shared desk could not save.");
    return data;
  }
  try {
    return localApi(endpoint, method, body);
  } catch (error) {
    if (error && error.name === "QuotaExceededError") {
      throw new Error("This chart is too large to keep in this browser.");
    }
    throw error;
  }
}

function openChart(src) {
  let box = document.getElementById("chart-lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "chart-lightbox";
    box.innerHTML = '<button type="button">Close</button><img alt="Shared trade chart">';
    document.body.appendChild(box);
    box.addEventListener("click", (event) => {
      if (event.target === box || event.target.tagName === "BUTTON") box.hidden = true;
    });
  }
  const img = box.querySelector("img");
  img.src = src;
  box.hidden = false;
}

function prepareChartImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Use a PNG or JPG screenshot."));
      return;
    }
    if (file.type === "image/heic" || file.type === "image/heif") {
      reject(new Error("Export this photo as PNG or JPG first."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The chart could not be read."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const img = new Image();
      img.onload = () => {
        const maxEdge = 2200;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale === 1 && file.size <= 2500000) {
          resolve({ dataUrl, blob: file, mime: file.type });
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("The chart could not be prepared."));
            return;
          }
          const out = new FileReader();
          out.onerror = () => reject(new Error("The chart could not be prepared."));
          out.onload = () => resolve({ dataUrl: String(out.result || ""), blob, mime: "image/jpeg" });
          out.readAsDataURL(blob);
        }, "image/jpeg", 0.92);
      };
      img.onerror = () => reject(new Error("This file is not a readable image. Use PNG or JPG."));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadChart(blob, mime) {
  const res = await fetch("api/media", { method: "POST", headers: { "Content-Type": mime || blob.type || "application/octet-stream" }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "The chart could not be shared.");
  return data.url;
}

function imageSig(image) {
  if (!image) return "";
  if (image.startsWith("data:")) return "data:" + image.length;
  return image;
}

function tradesForSave() {
  return pbTrades.map((trade) => {
    const next = { ...trade };
    delete next._uploading;
    if (apiMode === "remote" && typeof next.image === "string" && next.image.startsWith("data:")) {
      delete next.image;
    }
    return next;
  });
}

async function pbSaveAll() {
  const status = document.getElementById("pbImageStatus");
  try {
    await api("probboard.php", "POST", { trades: tradesForSave() });
    return true;
  } catch (error) {
    if (status && !status.textContent) status.textContent = error.message || "The shared desk could not save.";
    return false;
  }
}

function pbRenderShot(trade) {
  const shot = document.getElementById("pbShot");
  const status = document.getElementById("pbImageStatus");
  if (!shot || !trade) return;
  shot.replaceChildren();
  if (!trade.image) {
    const hint = document.createElement("div");
    hint.innerHTML = 'Click here, then paste a screenshot (Ctrl+V)<br>or <u id="pbUpTrig">choose a file</u>';
    shot.appendChild(hint);
    const trig = document.getElementById("pbUpTrig");
    if (trig) trig.addEventListener("click", (event) => {
      event.stopPropagation();
      document.getElementById("pbUpFile").click();
    });
    return;
  }
  const img = document.createElement("img");
  img.alt = "Shared trade chart";
  img.src = trade.image;
  img.addEventListener("click", (event) => {
    event.stopPropagation();
    openChart(trade.image);
  });
  img.addEventListener("error", () => {
    if (status) status.textContent = "The chart did not load. It will be requested again.";
    img.alt = "Chart failed to load";
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "pb-rm";
  remove.id = "pbRmShot";
  remove.textContent = "remove";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    trade.image = null;
    trade.updatedAt = Date.now();
    pbScheduleSave();
    pbRenderMain();
  });
  shot.appendChild(img);
  shot.appendChild(remove);
}

async function pbSetChart(file) {
  const status = document.getElementById("pbImageStatus");
  const trade = pbCurrent();
  if (!trade || !file) return;
  trade._uploading = true;
  if (status) status.textContent = "Preparing chart…";
  try {
    const prepared = await prepareChartImage(file);
    trade.image = prepared.dataUrl;
    trade.updatedAt = Date.now();
    pbRenderShot(trade);
    if (apiMode === "remote") {
      if (status) status.textContent = "Sharing with your friend…";
      trade.image = await uploadChart(prepared.blob, prepared.mime);
      trade.updatedAt = Date.now();
      pbRenderShot(trade);
      const saved = await pbSaveAll();
      if (status) status.textContent = saved ? "Your friend can see this chart." : "The chart is on your screen, but the shared desk did not store it.";
    } else {
      const saved = await pbSaveAll();
      if (status) status.textContent = saved ? "Saved in this browser. Serve the shared desk for your friend to see it." : "This chart is too large to save in this browser.";
    }
  } catch (error) {
    if (status) status.textContent = error.message || "The chart could not be added.";
  } finally {
    trade._uploading = false;
  }
}

function pbBindMain(trade) {
  const g = (id) => document.getElementById(id);
  const update = (key, val) => { trade[key] = val; trade.updatedAt = Date.now(); pbScheduleSave(); };
  g("pbTitle").addEventListener("input", (event) => { update("title", event.target.value); });
  g("pbSymbol").addEventListener("input", (event) => { update("symbol", event.target.value.toUpperCase()); });
  g("pbLong").addEventListener("click", () => { update("direction", "long"); pbRenderMain(); pbRenderRail(); });
  g("pbShort").addEventListener("click", () => { update("direction", "short"); pbRenderMain(); pbRenderRail(); });
  g("pbDiscussion").addEventListener("input", (event) => { update("discussion", event.target.value); });
  g("pbDecPri").addEventListener("click", () => {
    const newDec = trade.decision === "priority" ? "none" : "priority";
    const priorityCount = pbTrades.filter((row) => row.decision === "priority" && row.id !== trade.id).length;
    if (newDec === "priority" && priorityCount >= 2) {
      const status = g("pbImageStatus");
      if (status) status.textContent = "Two priority trades are already marked.";
      return;
    }
    update("decision", newDec);
    pbRenderMain();
    pbRenderRail();
  });
  g("pbDecSkip").addEventListener("click", () => { update("decision", trade.decision === "skip" ? "none" : "skip"); pbRenderMain(); pbRenderRail(); });
  g("pbDelete").addEventListener("click", () => {
    if (!confirm("Delete: " + trade.title + "?")) return;
    pbTrades = pbTrades.filter((row) => row.id !== trade.id);
    pbCurrentId = pbTrades.length ? pbTrades[0].id : null;
    if (!pbCurrentId) pbNew(true);
    else { pbRenderRail(); pbRenderMain(); }
    pbSaveAll();
  });
  const shot = g("pbShot");
  shot.addEventListener("paste", (event) => {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith("image"));
    if (!item) return;
    event.preventDefault();
    pbSetChart(item.getAsFile());
  });
  shot.addEventListener("click", () => { if (!trade.image) g("pbUpFile")?.click(); });
  g("pbUpFile").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) pbSetChart(file);
  });
  pbRenderShot(trade);
}

function pbRenderMain() {
  const main = document.getElementById("pbMain");
  if (!main) return;
  const trade = pbCurrent();
  if (!trade) {
    main.textContent = "Select a trade from the left, or create a new one.";
    return;
  }
  const activeL = trade.direction === "long" ? " on long" : "";
  const activeS = trade.direction === "short" ? " on short" : "";
  const activePri = trade.decision === "priority" ? " active" : "";
  const activeSkip = trade.decision === "skip" ? " active" : "";
  const decMsg = trade.decision === "priority"
    ? '<div class="pb-call priority">Priority — going for it</div>'
    : trade.decision === "skip"
      ? '<div class="pb-call skip">Skipped — sitting this one out</div>'
      : "";
  main.innerHTML =
    '<div class="pb-field-row">'
    + '<input class="pb-input title" id="pbTitle" placeholder="Trade title" value="' + pbEsc(trade.title) + '">'
    + '<input class="pb-input" id="pbSymbol" placeholder="Symbol" style="width:110px" value="' + pbEsc(trade.symbol) + '">'
    + '<div class="pb-dirwrap">'
    + '<button type="button" class="pb-dirbtn' + activeL + '" id="pbLong">▲ Long</button>'
    + '<button type="button" class="pb-dirbtn' + activeS + '" id="pbShort">▼ Short</button>'
    + "</div></div>"
    + '<div class="pb-slabel">Chart</div>'
    + '<div class="pb-shot" id="pbShot" tabindex="0"></div>'
    + '<input type="file" id="pbUpFile" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">'
    + '<div class="plans-status" id="pbImageStatus"></div>'
    + '<div class="pb-slabel">Discussion</div>'
    + '<textarea class="pb-discussion" id="pbDiscussion" placeholder="What does the chart tell you? What invalidates this setup?">' + pbEscHtml(trade.discussion) + "</textarea>"
    + '<div class="pb-slabel">Trade decision <span style="font-size:10px;color:var(--muted);font-weight:400;">(max 2 priority trades)</span></div>'
    + '<div class="pb-decision">'
    + '<button type="button" class="pb-dec-btn priority' + activePri + '" id="pbDecPri">Priority trade</button>'
    + '<button type="button" class="pb-dec-btn skip' + activeSkip + '" id="pbDecSkip">Skip</button>'
    + "</div>"
    + decMsg
    + '<div class="pb-footer"><span id="pbShareNote"></span><button type="button" class="pb-delboard" id="pbDelete">delete this trade</button></div>';
  const note = document.getElementById("pbShareNote");
  if (note) note.textContent = apiMode === "remote" ? "Your friend sees this chart on the shared desk." : "Saved in this browser until the shared desk is running.";
  pbBindMain(trade);
}

async function pbLoad() {
  try {
    const remote = await api("probboard.php");
    const remoteTrades = remote && Array.isArray(remote.trades) ? remote.trades : [];
    const localById = new Map(pbTrades.map((trade) => [trade.id, trade]));
    const editing = document.activeElement && document.getElementById("pbMain")?.contains(document.activeElement);
    let changed = remoteTrades.length !== pbTrades.length;
    const merged = remoteTrades.map((remoteTrade) => {
      const local = localById.get(remoteTrade.id);
      const next = { ...remoteTrade };
      if (local && local._uploading && local.image) next.image = local.image;
      else if (remoteTrade.image) next.image = remoteTrade.image;
      else if (local && local.image && (local.updatedAt || 0) > (remoteTrade.updatedAt || 0)) next.image = local.image;
      if (!local || imageSig(local.image) !== imageSig(next.image) || JSON.stringify({ ...local, image: "", _uploading: false }) !== JSON.stringify({ ...next, image: "", _uploading: false })) {
        changed = true;
      }
      return next;
    });
    if (changed || pbTrades.length === 0) {
      const current = pbCurrent();
      const previousImage = current ? imageSig(current.image) : "";
      pbTrades = merged;
      if (!pbCurrentId && pbTrades.length) pbCurrentId = pbTrades[0].id;
      if (pbCurrentId && !pbTrades.find((trade) => trade.id === pbCurrentId) && pbTrades.length) pbCurrentId = pbTrades[0].id;
      pbRenderRail();
      const now = pbCurrent();
      const shot = document.getElementById("pbShot");
      if (!editing) pbRenderMain();
      else if (now && imageSig(now.image) !== previousImage && shot) pbRenderShot(now);
    }
  } catch (error) {
    const status = document.getElementById("pbImageStatus");
    if (status) status.textContent = error.message || "The shared desk could not be read.";
  }
  if (!pbTrades.length) pbNew(true);
}

const originalJournalAdd = null;
async function sharedChart(dataUrl) {
  if (!dataUrl) return "";
  if (apiMode !== "remote") return dataUrl;
  if (!String(dataUrl).startsWith("data:")) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  return uploadChart(blob, blob.type || "image/jpeg");
}

detectApi().then(() => {
  initCockpit();
  pbLoad();
});
