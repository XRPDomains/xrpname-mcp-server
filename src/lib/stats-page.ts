/**
 * stats-page.ts — the lightweight HTML dashboard served at GET /mcp/stats.
 *
 * Single self-contained page. Fetches /mcp/stats.json (passing through any
 * ?token= for the detailed view), then rolls the daily series up to
 * daily / weekly / monthly entirely client-side. Chart.js from CDN (the only
 * external dependency, and only for rendering).
 *
 * Kept as a plain string so there is no build/templating step; the client
 * script deliberately avoids backticks and ${} so this TS template literal
 * stays trivially correct.
 */
export const STATS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>XRPName MCP · Usage</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  :root{
    --bg:#0b0f19; --panel:#131a2a; --panel2:#0f1626; --line:#233047;
    --txt:#e8edf7; --muted:#8b98b0; --accent:#5b8cff; --accent2:#22c58b;
    --warn:#f2b544; --danger:#ef5f6b; --radius:14px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);
    font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
  .wrap{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
  header{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-bottom:22px}
  .brand{font-size:20px;font-weight:700;letter-spacing:.2px}
  .brand span{color:var(--accent)}
  .sub{color:var(--muted);font-size:13px}
  .spacer{flex:1}
  .seg{display:inline-flex;background:var(--panel2);border:1px solid var(--line);
    border-radius:10px;overflow:hidden}
  .seg button{background:transparent;border:0;color:var(--muted);padding:8px 14px;
    font-size:13px;font-weight:600;cursor:pointer}
  .seg button.on{background:var(--accent);color:#fff}
  .ghost{background:var(--panel2);border:1px solid var(--line);color:var(--muted);
    border-radius:10px;padding:8px 12px;font-size:13px;cursor:pointer}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
  @media(max-width:760px){.cards{grid-template-columns:repeat(2,1fr)}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:16px 18px}
  .card .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.6px}
  .card .v{font-size:28px;font-weight:750;margin-top:6px}
  .card .d{font-size:12px;color:var(--muted);margin-top:4px}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:18px;margin-bottom:18px}
  .panel h3{margin:0 0 14px;font-size:14px;font-weight:700;color:var(--txt)}
  .grid2{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}
  @media(max-width:760px){.grid2{grid-template-columns:1fr}}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;background:var(--panel2);border:1px solid var(--line);
    border-radius:999px;padding:2px 10px;font-size:12px;color:var(--muted)}
  .subhead{font-size:13px;font-weight:700;color:var(--txt);margin:2px 0 8px;
    display:flex;align-items:center;gap:8px}
  .scrolly{max-height:340px;overflow-y:auto;overflow-x:hidden}
  .scrolly thead th{position:sticky;top:0;background:var(--panel);z-index:1}
  .scrolly::-webkit-scrollbar{width:8px}
  .scrolly::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
  .foot{color:var(--muted);font-size:12px;margin-top:16px}
  a{color:var(--accent);text-decoration:none}
  .empty{color:var(--muted);text-align:center;padding:40px 0}
  canvas{max-height:280px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <div class="brand">XRP<span>Name</span> · MCP usage</div>
      <div class="sub" id="sub">loading…</div>
    </div>
    <div class="spacer"></div>
    <div class="seg" id="seg">
      <button data-g="day" class="on">Daily</button>
      <button data-g="week">Weekly</button>
      <button data-g="month">Monthly</button>
    </div>
    <button class="ghost" id="refresh">Refresh</button>
  </header>

  <div class="cards" id="cards"></div>

  <div class="panel">
    <h3>Connections &amp; tool calls over time</h3>
    <canvas id="lineChart" height="110"></canvas>
    <div class="empty" id="lineEmpty" style="display:none">No data yet.</div>
  </div>

  <div class="panel">
    <h3>Recent tool calls</h3>
    <div id="recent" class="scrolly"></div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h3>Tool calls by tool</h3>
      <canvas id="toolChart" height="180"></canvas>
      <div class="empty" id="toolEmpty" style="display:none">No tool calls yet.</div>
    </div>
    <div class="panel">
      <h3>Clients &amp; probes</h3>
      <div id="agents" class="scrolly"></div>
    </div>
  </div>

  <div class="foot" id="foot"></div>
</div>

<script>
(function(){
  var token = new URLSearchParams(location.search).get('token');
  var base = location.pathname.replace(/\\/+$/, '');
  var jsonUrl = base + '.json' + (token ? '?token=' + encodeURIComponent(token) : '');
  var gran = 'day';
  var data = null;
  var lineChart = null, toolChart = null;

  function n(x){ return (x||0).toLocaleString(); }
  function el(id){ return document.getElementById(id); }

  // ---- roll daily series up to week / month ----
  function weekKey(d){
    var dt = new Date(d + 'T00:00:00Z');
    var day = (dt.getUTCDay() + 6) % 7;           // Mon=0
    dt.setUTCDate(dt.getUTCDate() - day);         // back to Monday
    return dt.toISOString().slice(0,10);
  }
  function rollup(series, g){
    if(g === 'day') return series.map(function(p){ return {label:p.date, connections:p.connections, toolCalls:p.toolCalls, errors:p.errors}; });
    var map = {};
    series.forEach(function(p){
      var key = g === 'month' ? p.date.slice(0,7) : weekKey(p.date);
      if(!map[key]) map[key] = {label:key, connections:0, toolCalls:0, errors:0};
      map[key].connections += p.connections;
      map[key].toolCalls   += p.toolCalls;
      map[key].errors      += p.errors;
    });
    return Object.keys(map).sort().map(function(k){ return map[k]; });
  }

  function renderCards(){
    var t = data.totals || {};
    var real = (t.realConnections!=null? t.realConnections : t.connections);
    var probeN = (t.probeConnections!=null? t.probeConnections : 0);
    var errRate = t.toolCalls ? ((t.errors||0)/ (t.toolCalls+ (t.connections||0)) *100) : 0;
    var cards = [
      {k:'Client connections', v:n(real), d:'real clients · excl. '+n(probeN)+' probe conns'},
      {k:'Unique clients', v:n(t.uniqueClientsLast30d), d:'last 30 days'},
      {k:'Client tool calls', v:n(t.clientToolCalls!=null? t.clientToolCalls : t.toolCalls), d:n(t.toolCalls)+' total incl. probes'},
      {k:'Error rate', v:errRate.toFixed(1)+'%', d:n(t.errors)+' errors total'}
    ];
    el('cards').innerHTML = cards.map(function(c){
      return '<div class="card"><div class="k">'+c.k+'</div><div class="v">'+c.v+'</div><div class="d">'+c.d+'</div></div>';
    }).join('');
  }

  function renderLine(){
    var rows = rollup(data.series||[], gran);
    var show = rows.length > 0;
    el('lineEmpty').style.display = show ? 'none':'block';
    el('lineChart').style.display = show ? 'block':'none';
    if(!show){ if(lineChart){lineChart.destroy();lineChart=null;} return; }
    var labels = rows.map(function(r){return r.label;});
    var conn = rows.map(function(r){return r.connections;});
    var calls = rows.map(function(r){return r.toolCalls;});
    if(lineChart) lineChart.destroy();
    lineChart = new Chart(el('lineChart'), {
      type:'line',
      data:{ labels:labels, datasets:[
        {label:'Connections', data:conn, borderColor:'#5b8cff', backgroundColor:'rgba(91,140,255,.12)', fill:true, tension:.3, borderWidth:2, pointRadius:2},
        {label:'Tool calls', data:calls, borderColor:'#22c58b', backgroundColor:'rgba(34,197,139,.10)', fill:true, tension:.3, borderWidth:2, pointRadius:2}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8b98b0',usePointStyle:true,boxWidth:8}}},
        scales:{ x:{ticks:{color:'#8b98b0',maxRotation:0,autoSkip:true,maxTicksLimit:10},grid:{color:'#1c2740'}},
                 y:{beginAtZero:true,ticks:{color:'#8b98b0',precision:0},grid:{color:'#1c2740'}} } }
    });
  }

  function renderTools(){
    var tools = (data.tools||[]).slice(0,12);
    var show = tools.length > 0;
    el('toolEmpty').style.display = show ? 'none':'block';
    el('toolChart').style.display = show ? 'block':'none';
    if(!show){ if(toolChart){toolChart.destroy();toolChart=null;} return; }
    if(toolChart) toolChart.destroy();
    toolChart = new Chart(el('toolChart'), {
      type:'bar',
      data:{ labels:tools.map(function(t){return t.name;}),
        datasets:[{ label:'calls', data:tools.map(function(t){return t.total;}),
          backgroundColor:'#5b8cff', borderRadius:5 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{ x:{beginAtZero:true,ticks:{color:'#8b98b0',precision:0},grid:{color:'#1c2740'}},
                 y:{ticks:{color:'#8b98b0'},grid:{display:false}} } }
    });
  }

  function agentTable(list){
    var rows = list.slice(0,15).map(function(x){
      return '<tr><td>'+x.name+'</td><td class="num">'+n(x.toolCalls||0)+'</td><td class="num">'+n(x.connections)+'</td></tr>';
    }).join('');
    return '<table><thead><tr><th>Agent</th><th class="num">Tool calls</th><th class="num">Conns</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function renderAgents(){
    // prefer server-split lists; fall back to classifying the flat list here
    var clients = data.clients, probes = data.probes;
    if(!clients || !probes){
      var a = data.agents||[]; clients=[]; probes=[];
      a.forEach(function(x){ (x.kind==='probe'?probes:clients).push(x); });
    }
    var html = '';
    html += '<div class="subhead">✅ Clients <span class="pill">real usage</span></div>';
    html += (clients.length? agentTable(clients) : '<div class="empty">No client traffic yet.</div>');
    html += '<div class="subhead" style="margin-top:18px">🤖 Directory / health probes</div>';
    html += (probes.length? agentTable(probes) : '<div class="empty">None.</div>');
    el('agents').innerHTML = html;
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ago(ts){
    var d=Math.max(0,(Date.now()-ts)/1000);
    if(d<60) return Math.floor(d)+'s ago';
    if(d<3600) return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago';
    return Math.floor(d/86400)+'d ago';
  }
  function renderRecent(){
    var r = data.recent||[];
    if(r.length===0){ el('recent').innerHTML='<div class="empty">No tool calls yet.</div>'; return; }
    var rows = r.slice(0,20).map(function(x){
      var badge = x.outcome==='error' ? '<span class="pill" style="color:var(--danger)">error</span>' : '';
      return '<tr><td style="white-space:nowrap;color:var(--muted)">'+ago(x.ts)+'</td>'+
        '<td><strong>'+esc(x.tool)+'</strong> '+badge+'</td>'+
        '<td style="color:var(--muted)">'+esc(x.agent||'—')+'</td>'+
        '<td><code style="font-size:12px;color:#9fb4d8;word-break:break-all">'+esc(x.args||'')+'</code></td></tr>';
    }).join('');
    el('recent').innerHTML='<table><thead><tr><th>When</th><th>Tool</th><th>Client</th><th>Arguments</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function renderAll(){
    renderCards(); renderLine(); renderTools(); renderAgents(); renderRecent();
    var when = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '';
    el('sub').textContent = 'since ' + (data.since||'—') + (token ? ' · detailed view' : '');
    el('foot').innerHTML = 'Updated ' + when + ' · endpoint <a href="https://xrpdomains.xyz/agent">xrpdomains.xyz/agent</a> · read-only, no PII stored.';
  }

  function load(){
    el('sub').textContent = 'loading…';
    fetch(jsonUrl, {cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
      data = j; renderAll();
    }).catch(function(e){
      el('sub').textContent = 'failed to load stats';
      el('cards').innerHTML = '<div class="card"><div class="k">Error</div><div class="v">—</div><div class="d">'+String(e)+'</div></div>';
    });
  }

  el('seg').addEventListener('click', function(ev){
    var b = ev.target.closest('button'); if(!b) return;
    gran = b.getAttribute('data-g');
    Array.prototype.forEach.call(el('seg').children, function(c){ c.classList.toggle('on', c===b); });
    if(data) renderLine();
  });
  el('refresh').addEventListener('click', load);
  load();
})();
</script>
</body>
</html>`;
