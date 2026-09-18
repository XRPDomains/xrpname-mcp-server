/**
 * stats-page.ts — the dashboard served at GET /mcp/stats.
 *
 * Single self-contained page. Fetches /mcp/stats.json (passing ?token= through
 * for the detailed view). Brand-matched to xrpdomains.xyz (near-black + Satoshi
 * + cyan). Every data panel HIDES itself when it has no data, so the page never
 * shows hollow/empty blocks. Mobile: data tables collapse to labelled cards.
 *
 * Kept as a plain string (no build step). The client script deliberately avoids
 * backticks and ${} so this TS template literal stays trivially correct.
 */
export const STATS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index, follow" />
<title>XRPName · MCP usage &amp; x402 activity</title>
<meta name="description" content="Live usage and x402 on-chain activity for the XRPName MCP server on the XRP Ledger." />
<meta property="og:title" content="XRPName · MCP usage &amp; x402 activity" />
<meta property="og:description" content="Live MCP usage and x402 payments settled on XRPL mainnet — installs, tool calls, domains minted, and a per-request audit trail." />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<link rel="preconnect" href="https://api.fontshare.com" crossorigin />
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
<style>
  :root{
    --bg:#050608; --surface:rgba(255,255,255,.025); --surface2:rgba(255,255,255,.04);
    --line:rgba(255,255,255,.08); --line2:rgba(255,255,255,.14);
    --ink:#ffffff; --sub:#aab3c5; --muted:#6f7a90;
    --accent:#33bbff; --accent2:#22d3ee; --ok:#3ad29f; --bad:#ff6470;
    --r:16px; --sans:"Satoshi",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:
      radial-gradient(900px 480px at 82% -8%,rgba(51,187,255,.10),transparent 60%),
      radial-gradient(700px 420px at 0% 0%,rgba(34,211,238,.06),transparent 55%),
      var(--bg);
    color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55;
    -webkit-font-smoothing:antialiased;letter-spacing:-.01em;overflow-x:hidden}
  .wrap{max-width:1160px;margin:0 auto;padding:22px 20px 72px;overflow-x:hidden}
  a{color:var(--accent);text-decoration:none}
  a:hover{color:#7fd4ff}
  .mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
  .top{display:flex;align-items:center;gap:14px;padding:8px 0 20px;flex-wrap:wrap}
  .logo{display:flex;align-items:center;gap:11px}
  .mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
    background:linear-gradient(150deg,rgba(51,187,255,.22),rgba(34,211,238,.10));border:1px solid var(--line2)}
  .mark svg{width:16px;height:16px}
  .name{font-weight:900;font-size:19px;letter-spacing:-.02em}
  .name b{color:var(--accent)}
  .name span{color:var(--muted);font-weight:500;font-size:13px;margin-left:6px}
  .live{display:inline-flex;align-items:center;gap:7px;color:var(--sub);font-size:12.5px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);animation:pulse 2.4s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(58,210,159,.45)}70%{box-shadow:0 0 0 7px rgba(58,210,159,0)}100%{box-shadow:0 0 0 0 rgba(58,210,159,0)}}
  .grow{flex:1}
  .seg{display:inline-flex;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:3px}
  .seg button{background:transparent;border:0;color:var(--muted);font-family:inherit;font-size:13px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer;transition:.15s}
  .seg button.on{background:var(--accent);color:#04121f}
  .btn{background:var(--surface);border:1px solid var(--line);color:var(--sub);font-family:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:11px;cursor:pointer}
  .btn:hover{border-color:var(--line2);color:var(--ink)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
  .chip{display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12.5px;color:var(--sub)}
  .chip:hover{border-color:var(--accent);color:var(--ink)}
  .chip b{color:var(--ink);font-weight:700}
  .hdot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:1px}
  .btnmini{background:var(--surface);border:1px solid var(--line);color:var(--sub);font-family:inherit;font-size:12px;font-weight:600;padding:5px 11px;border-radius:9px;cursor:pointer;margin-left:12px}
  .btnmini:hover{border-color:var(--line2);color:var(--ink)}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
  .kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:17px 18px}
  .kpi .lab{color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.02em}
  .kpi .val{font-size:30px;font-weight:900;letter-spacing:-.03em;margin-top:8px;line-height:1}
  .kpi .val b{font-size:16px;font-weight:700;color:var(--sub);margin-left:2px}
  .kpi .d{color:var(--sub);font-size:12.5px;margin-top:7px}
  .hikpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:16px}
  .kpi.x{border-color:rgba(51,187,255,.28);background:linear-gradient(180deg,rgba(51,187,255,.06),var(--surface))}
  .kpi.x .val{color:var(--accent);font-size:26px}
  code.embed{display:block;background:#070c17;border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-top:6px;font-family:var(--mono);font-size:12px;color:#9fb4d8;word-break:break-all}
  .panel{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px 18px 16px;margin-bottom:16px}
  .ph{display:flex;align-items:center;gap:10px;margin:0 0 14px;flex-wrap:wrap}
  .ph h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em}
  .ph .tag{font-size:11px;font-weight:700;color:var(--accent);background:rgba(51,187,255,.10);border:1px solid rgba(51,187,255,.25);border-radius:999px;padding:2px 9px;text-transform:uppercase;letter-spacing:.04em}
  .ph .new{color:var(--accent2);background:rgba(34,211,238,.10);border-color:rgba(34,211,238,.28)}
  .ph .r{margin-left:auto;color:var(--muted);font-size:12.5px}
  .mini{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:14px}
  .mini > div{min-width:110px}
  .mini .v{font-size:22px;font-weight:900;letter-spacing:-.02em}
  .mini .l{color:var(--muted);font-size:12px;margin-top:2px}
  .tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top;white-space:normal;word-break:break-word}
  th{color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  tr:last-child td{border-bottom:0}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600;border:1px solid var(--line2);color:var(--sub);background:var(--surface2)}
  .pill.ok{color:var(--ok);border-color:rgba(58,210,159,.3);background:rgba(58,210,159,.08)}
  .pill.bad{color:var(--bad);border-color:rgba(255,100,112,.3);background:rgba(255,100,112,.08)}
  .pill.reg{color:var(--accent);border-color:rgba(51,187,255,.3);background:rgba(51,187,255,.08)}
  .pill.pay{color:var(--accent2);border-color:rgba(34,211,238,.3);background:rgba(34,211,238,.08)}
  .cid{font-family:var(--mono);font-size:12px;color:var(--sub)}
  .hash{font-family:var(--mono);font-size:12px;color:var(--muted)}
  .args{font-family:var(--mono);font-size:12px;color:#9fb4d8;word-break:break-word}
  .subhead{font-size:12.5px;font-weight:700;color:var(--sub);display:flex;align-items:center;gap:8px;margin:4px 0 8px}
  .bars{display:flex;flex-direction:column;gap:9px}
  .bar{display:grid;grid-template-columns:150px 1fr 52px;align-items:center;gap:10px}
  .bar .t{color:var(--sub);font-family:var(--mono);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .track{height:9px;background:var(--surface2);border-radius:6px;overflow:hidden}
  .fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:6px}
  .bar .n{text-align:right;color:var(--sub);font-variant-numeric:tabular-nums;font-size:12.5px}
  .cols{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}
  .cols > .panel{min-width:0}
  .tw{max-width:100%}
  .agentcols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px 24px}
  .chart{width:100%;height:190px;display:block}
  .legend{display:flex;gap:16px;color:var(--muted);font-size:12px;margin-top:8px}
  .legend i{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
  .foot{color:var(--muted);font-size:12px;margin-top:18px;line-height:1.7}
  .empty{color:var(--muted);text-align:center;padding:20px 0;font-size:13px}
  @media(max-width:900px){ .cols{grid-template-columns:1fr} }
  @media(max-width:680px){
    .kpis{grid-template-columns:1fr 1fr}
    table.resp{min-width:0}
    table.resp thead{display:none}
    table.resp tr{display:block;border:1px solid var(--line);border-radius:12px;margin-bottom:10px;padding:6px 12px;background:var(--surface2)}
    table.resp td{display:flex;justify-content:space-between;gap:14px;border:0;padding:7px 0;white-space:normal}
    table.resp td::before{content:attr(data-l);color:var(--muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;flex:0 0 auto}
    table.resp td.args{max-width:none;text-align:right}
    .args{max-width:none;white-space:normal;word-break:break-all}
  }
  @media(prefers-reduced-motion:reduce){ .dot{animation:none} *{transition:none!important} }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="logo">
      <div class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l7 6-7 14-7-14 7-6z" stroke="#33bbff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.2" fill="#22d3ee"/></svg></div>
      <div class="name"><b>XRP</b>Name <span>· MCP usage</span></div>
    </div>
    <span class="live"><span class="dot"></span> <span id="sub">loading…</span></span>
    <div class="grow"></div>
    <div class="seg" id="seg"><button data-g="day" class="on">Daily</button><button data-g="week">Weekly</button><button data-g="month">Monthly</button></div>
    <button class="btn" id="refresh">Refresh</button>
  </div>

  <div class="chips">
    <span class="chip" id="healthchip" style="display:none"></span>
    <a class="chip" href="https://www.npmjs.com/package/@xrpname/xrpname-mcp" target="_blank" rel="noopener">npm · <b>@xrpname/xrpname-mcp</b></a>
    <a class="chip" href="https://github.com/XRPDomains/xrpname-mcp-server" target="_blank" rel="noopener">GitHub</a>
    <a class="chip" href="https://www.pulsemcp.com/servers/xrpname" target="_blank" rel="noopener">PulseMCP</a>
    <a class="chip" href="https://mcpsentinel.dev/servers/xrpname" target="_blank" rel="noopener">MCP Sentinel</a>
    <a class="chip" href="https://policylayer.com/token-cost/io-github-xrpdomains-xrpname-mcp-server" target="_blank" rel="noopener">PolicyLayer · <b>1,908 tok</b></a>
    <a class="chip" href="https://xrpdomains.xyz/agent" target="_blank" rel="noopener">xrpdomains.xyz/agent</a>
  </div>

  <div class="kpis" id="kpis"></div>
  <div class="hikpis" id="x402hi" style="display:none"></div>

  <div class="panel" id="x402panel" style="display:none">
    <div class="ph"><h3>x402 on-chain activity</h3><span class="tag">XRPL mainnet</span><a class="btnmini" style="margin-left:auto" href="https://github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register" target="_blank" rel="noopener">Buy a domain via x402 →</a></div>
    <div id="x402trend"></div>
    <div class="tw" id="x402recent"></div>
  </div>

  <div class="panel">
    <div class="ph"><h3>How agents pay</h3><span class="r">x402 · non-custodial</span></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btnmini" style="margin-left:0" href="https://github.com/XRPDomains/xrpname-mcp-server/tree/main/skills/xrpname-register" target="_blank" rel="noopener">Agent skill</a>
      <a class="btnmini" style="margin-left:0" href="https://xrpdomains.xyz/mcp/x402/register" target="_blank" rel="noopener">Endpoint /mcp/x402/register</a>
      <a class="btnmini" style="margin-left:0" href="https://xrpdomains.xyz/agent" target="_blank" rel="noopener">/agent</a>
    </div>
    <div style="color:var(--muted);font-size:12.5px;margin-top:10px;max-width:70ch">Any x402-capable agent registers a domain in one flow: request price (HTTP 402) → sign the XRP Payment → sign the NFTokenAcceptOffer. No key ever leaves the agent; funds settle payer → merchant.</div>
  </div>

  <div class="panel" id="auditpanel" style="display:none">
    <div class="ph"><h3>Audit trail</h3><span class="tag new">verifiable</span><span class="r">one row per request · tamper-evident</span><button class="btnmini" id="auditexport">Export JSON</button></div>
    <div class="tw" id="auditbody"></div>
  </div>

  <div class="cols">
    <div class="panel" id="chartpanel" style="display:none">
      <div class="ph"><h3>Connections &amp; tool calls</h3><span class="r" id="chartrange"></span></div>
      <div id="chartbox"></div>
      <div class="legend"><span><i style="background:#33bbff"></i>Connections</span><span><i style="background:#22d3ee"></i>Tool calls</span></div>
    </div>
    <div class="panel" id="toolpanel" style="display:none">
      <div class="ph"><h3>Tool calls by tool</h3></div>
      <div class="bars" id="toolbars"></div>
    </div>
  </div>

  <div class="panel" id="recentpanel" style="display:none">
    <div class="ph"><h3>Recent tool calls</h3></div>
    <div class="tw" id="recent"></div>
  </div>
  <div class="panel" id="agentspanel" style="display:none">
    <div class="ph"><h3>Clients &amp; probes</h3></div>
    <div id="agents"></div>
  </div>

  <div class="panel">
    <div class="ph"><h3>Context efficiency</h3></div>
    <div style="color:var(--sub);font-size:13.5px;max-width:70ch">These 10 tool definitions cost about <b style="color:var(--ink)">1,908 tokens</b> — roughly 1% of a 200k context window, around the median MCP server. Independently measured by <a href="https://policylayer.com/token-cost/io-github-xrpdomains-xrpname-mcp-server" target="_blank" rel="noopener">PolicyLayer</a>.</div>
  </div>

  <div class="panel">
    <div class="ph"><h3>Embed badge</h3></div>
    <img src="/mcp/badge.svg" alt="x402 on XRPL — live stats" style="display:block;margin-bottom:8px"/>
    <div style="color:var(--muted);font-size:12.5px">Show live x402 stats anywhere:</div>
    <code class="embed">&lt;img src="https://xrpdomains.xyz/mcp/badge.svg" alt="XRPName x402"&gt;</code>
  </div>

  <div class="foot" id="foot"></div>
</div>

<script>
(function(){
  var token = new URLSearchParams(location.search).get('token');
  var base = location.pathname.replace(/\\/+$/, '');
  var jsonUrl = base + '.json' + (token ? '?token=' + encodeURIComponent(token) : '');
  var healthUrl = base.replace(/\\/stats$/, '/health');
  var gran = 'day';
  var data = null;

  function n(x){ return (x||0).toLocaleString(); }
  function fx(x){ return (Math.round((x||0)*1e6)/1e6).toLocaleString(); }
  function el(id){ return document.getElementById(id); }
  function show(id,on){ var e=el(id); if(e) e.style.display = on ? '' : 'none'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ago(ts){ var d=Math.max(0,(Date.now()-ts)/1000);
    if(d<60) return Math.floor(d)+'s ago'; if(d<3600) return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; }
  function fmtUptime(s){ s=s||0; var h=Math.floor(s/3600), m=Math.floor((s%3600)/60); if(h>=24) return Math.floor(h/24)+'d '+(h%24)+'h'; return h>0?(h+'h '+m+'m'):(m+'m'); }
  function loadHealth(){
    fetch(healthUrl,{cache:'no-store'}).then(function(r){return r.json();}).then(function(h){
      var ok=h.xrpl==='ok'; var c=el('healthchip'); if(!c) return;
      c.style.display='';
      c.innerHTML='<span class="hdot" style="background:'+(ok?'var(--ok)':'var(--bad)')+'"></span> v'+esc(h.version||'')+' · XRPL '+(ok?'ok':'down')+' · up '+fmtUptime(h.uptime_s);
    }).catch(function(){});
  }
  function exportAudit(){
    var a=(data&&data.audit)||[];
    var blob=new Blob([JSON.stringify(a,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var link=document.createElement('a');
    link.href=url; link.download='xrpname-audit-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function weekKey(d){ var dt=new Date(d+'T00:00:00Z'); var day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day); return dt.toISOString().slice(0,10); }
  function rollup(series, g){
    if(g==='day') return (series||[]).map(function(p){ return {label:p.date,connections:p.connections,toolCalls:p.toolCalls}; });
    var map={};
    (series||[]).forEach(function(p){
      var key = g==='month' ? p.date.slice(0,7) : weekKey(p.date);
      if(!map[key]) map[key]={label:key,connections:0,toolCalls:0};
      map[key].connections+=p.connections; map[key].toolCalls+=p.toolCalls;
    });
    return Object.keys(map).sort().map(function(k){ return map[k]; });
  }

  function renderKpis(){
    var t=data.totals||{};
    var real=(t.realConnections!=null?t.realConnections:t.connections);
    var probeN=(t.probeConnections!=null?t.probeConnections:0);
    var errRate=t.toolCalls?(((t.errors||0)/(t.toolCalls+(t.connections||0)))*100):0;
    var cards=[
      {k:'Client connections',v:n(real),d:'real clients · excl. '+n(probeN)+' probes'},
      {k:'Unique clients',v:n(t.uniqueClientsLast30d),d:'last 30 days'},
      {k:'Client tool calls',v:n(t.clientToolCalls!=null?t.clientToolCalls:t.toolCalls),d:n(t.toolCalls)+' total incl. probes'},
      {k:'Error rate',v:errRate.toFixed(1)+'<b>%</b>',d:n(t.errors)+' errors total'}
    ];
    el('kpis').innerHTML = cards.map(function(c){
      return '<div class="kpi"><div class="lab">'+c.k+'</div><div class="val">'+c.v+'</div><div class="d">'+c.d+'</div></div>';
    }).join('');
  }

  function x402ChartSVG(series){
    var W=800,H=90,pad=4,maxV=1,i;
    for(i=0;i<series.length;i++){ maxV=Math.max(maxV, series[i].xrp); }
    var pts=series.map(function(s,idx){
      var xx = series.length===1 ? W/2 : (idx/(series.length-1))*(W-2*pad)+pad;
      var yy = (H-pad) - (s.xrp/maxV)*(H-2*pad);
      return xx.toFixed(1)+','+yy.toFixed(1);
    }).join(' ');
    var area='M '+pad+' '+(H-pad)+' L '+pts.split(' ').join(' L ')+' L '+(W-pad)+' '+(H-pad)+' Z';
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="height:90px;margin-bottom:6px">'+
      '<defs><linearGradient id="xg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".3"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#xg)"/>'+
      '<polyline points="'+pts+'" fill="none" stroke="#22d3ee" stroke-width="2"/></svg>';
  }
  function renderX402(){
    var x=data.x402;
    if(!x || !x.payments){ show('x402panel',false); show('x402hi',false); return; }
    show('x402panel',true); show('x402hi',true);
    var hi=[
      {k:'x402 payments', v:n(x.payments)},
      {k:'XRP settled', v:fx(x.xrpVolume)},
      {k:'Domains minted', v:n(x.minted)},
      {k:'Unique payers', v:n(x.uniquePayers)},
      {k:'Register / Pay', v:n(x.regs)+' / '+n(x.pays)}
    ];
    el('x402hi').innerHTML = hi.map(function(c){ return '<div class="kpi x"><div class="lab">'+c.k+'</div><div class="val">'+c.v+'</div></div>'; }).join('');
    var series=x.series||[];
    el('x402trend').innerHTML = series.length>=2 ? x402ChartSVG(series) : '';
    var rows=(x.recent||[]).map(function(e){
      var kindPill='<span class="pill '+(e.kind==='pay'?'pay':'reg')+'">'+esc(e.kind)+'</span>';
      var item = (e.kind==='register' && e.item) ? '<a href="https://xrpdomains.xyz/name/'+encodeURIComponent(e.item)+'" target="_blank" rel="noopener">'+esc(e.item)+'</a>' : esc(e.item);
      var tx=e.tx?'<a class="mono" href="https://livenet.xrpl.org/transactions/'+esc(e.tx)+'" target="_blank" rel="noopener">'+esc(String(e.tx).slice(0,10))+'…</a>':'—';
      return '<tr><td data-l="When" style="color:var(--muted)">'+ago(e.ts)+'</td>'+
        '<td data-l="Item">'+kindPill+' '+item+'</td>'+
        '<td data-l="Amount" class="num">'+fx(e.amountXrp)+' XRP</td>'+
        '<td data-l="Payer" class="cid">'+esc(e.payer)+'</td>'+
        '<td data-l="Tx">'+tx+'</td></tr>';
    }).join('');
    el('x402recent').innerHTML = rows
      ? '<table class="resp"><thead><tr><th>When</th><th>Item</th><th class="num">Amount</th><th>Payer</th><th>Tx</th></tr></thead><tbody>'+rows+'</tbody></table>'
      : '<div class="empty">No x402 payments yet.</div>';
  }

  function stateHtml(st){
    st=String(st||'');
    if(st.indexOf('tx:')===0){ var h=st.slice(3); return '<a class="pill ok" href="https://livenet.xrpl.org/transactions/'+esc(h)+'" target="_blank" rel="noopener">tx '+esc(h.slice(0,10))+'…</a>'; }
    if(st.indexOf('refused:')===0){ return '<span class="pill bad">refused · '+esc(st.slice(8))+'</span>'; }
    if(st==='error'){ return '<span class="pill bad">error</span>'; }
    return '<span class="pill ok">ok</span>';
  }
  function renderAudit(){
    var a=data.audit||[];
    if(!a.length){ show('auditpanel',false); return; }
    show('auditpanel',true);
    var rows=a.map(function(e){
      return '<tr>'+
        '<td data-l="Client" class="cid">'+esc(e.cid)+'</td>'+
        '<td data-l="Action"><b>'+esc(e.action)+'</b></td>'+
        '<td data-l="Terms" class="mono">'+esc(e.terms||'—')+'</td>'+
        '<td data-l="State">'+stateHtml(e.state)+'</td>'+
        '<td data-l="Tokens" class="num">'+(e.tokens==null?'—':n(e.tokens))+'</td>'+
        '<td data-l="Hash" class="hash">'+(e.hash?'sha256:'+esc(e.hash):'—')+'</td>'+
        '</tr>';
    }).join('');
    el('auditbody').innerHTML='<table class="resp"><thead><tr><th>Client</th><th>Action</th><th>x402 terms</th><th>State</th><th class="num">Tokens</th><th>Result hash</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  function chartSVG(rows){
    var W=800,H=190,pad=6,maxV=1,i;
    for(i=0;i<rows.length;i++){ maxV=Math.max(maxV,rows[i].connections,rows[i].toolCalls); }
    function pts(key){
      return rows.map(function(r,idx){
        var x = rows.length===1 ? W/2 : (idx/(rows.length-1))*(W-2*pad)+pad;
        var y = (H-pad) - (r[key]/maxV)*(H-2*pad);
        return x.toFixed(1)+','+y.toFixed(1);
      }).join(' ');
    }
    var conn=pts('connections'), calls=pts('toolCalls');
    var area='M '+pad+' '+(H-pad)+' L '+conn.split(' ').join(' L ')+' L '+(W-pad)+' '+(H-pad)+' Z';
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
      '<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33bbff" stop-opacity=".28"/><stop offset="1" stop-color="#33bbff" stop-opacity="0"/></linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#ag)"/>'+
      '<polyline points="'+conn+'" fill="none" stroke="#33bbff" stroke-width="2"/>'+
      '<polyline points="'+calls+'" fill="none" stroke="#22d3ee" stroke-width="2" stroke-opacity=".9"/>'+
      '</svg>';
  }
  function renderChart(){
    var rows=rollup(data.series||[], gran);
    if(!rows.length){ show('chartpanel',false); return; }
    show('chartpanel',true);
    el('chartrange').textContent = rows.length + ' ' + (gran==='day'?'days':gran==='week'?'weeks':'months');
    el('chartbox').innerHTML = chartSVG(rows);
  }

  function renderTools(){
    var tools=(data.tools||[]).slice(0,10);
    if(!tools.length){ show('toolpanel',false); return; }
    show('toolpanel',true);
    var max=tools[0].total||1;
    el('toolbars').innerHTML = tools.map(function(t){
      var w=Math.max(3,Math.round((t.total/max)*100));
      return '<div class="bar"><span class="t">'+esc(t.name)+'</span><span class="track"><span class="fill" style="width:'+w+'%"></span></span><span class="n">'+n(t.total)+'</span></div>';
    }).join('');
  }

  function renderRecent(){
    var r=data.recent||[];
    if(!r.length){ show('recentpanel',false); return; }
    show('recentpanel',true);
    var rows=r.slice(0,20).map(function(x){
      var badge=x.outcome==='error'?'<span class="pill bad">error</span>':'';
      return '<tr><td data-l="When" style="white-space:nowrap;color:var(--muted)">'+ago(x.ts)+'</td>'+
        '<td data-l="Tool"><b>'+esc(x.tool)+'</b> '+badge+'</td>'+
        '<td data-l="Client" class="cid">'+esc(x.agent||'—')+'</td>'+
        '<td data-l="Arguments" class="args">'+esc(x.args||'')+'</td></tr>';
    }).join('');
    el('recent').innerHTML='<table class="resp"><thead><tr><th>When</th><th>Tool</th><th>Client</th><th>Arguments</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  function agentTable(list){
    var rows=list.slice(0,12).map(function(x){
      return '<tr><td data-l="Agent">'+esc(x.name)+'</td><td data-l="Calls" class="num">'+n(x.toolCalls||0)+'</td><td data-l="Conns" class="num">'+n(x.connections)+'</td></tr>';
    }).join('');
    return '<div class="tw"><table class="resp"><thead><tr><th>Agent</th><th class="num">Calls</th><th class="num">Conns</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function renderAgents(){
    var clients=data.clients, probes=data.probes;
    if(!clients||!probes){ var a=data.agents||[]; clients=[]; probes=[]; a.forEach(function(x){ (x.kind==='probe'?probes:clients).push(x); }); }
    if(!clients.length && !probes.length){ show('agentspanel',false); return; }
    show('agentspanel',true);
    var parts=[];
    if(clients.length) parts.push('<div><div class="subhead">Clients <span class="pill ok">real usage</span></div>'+agentTable(clients)+'</div>');
    if(probes.length) parts.push('<div><div class="subhead">Directory / health probes</div>'+agentTable(probes)+'</div>');
    el('agents').innerHTML='<div class="agentcols">'+parts.join('')+'</div>';
  }

  function setFoot(){
    var when=data.generatedAt?new Date(data.generatedAt).toLocaleString():'';
    el('foot').innerHTML='Updated '+when+' · since '+(data.since||'—')+(token?' · detailed view':'')+' · read-only, no PII stored · client ids are opaque salted hashes, payer addresses shortened, x402 tx hashes are public on-ledger.<br/>Public JSON: <a href="'+base+'.json">'+base+'.json</a> · <a href="https://xrpdomains.xyz/agent">xrpdomains.xyz/agent</a>';
  }

  function renderAll(){ renderKpis(); renderX402(); renderAudit(); renderChart(); renderTools(); renderRecent(); renderAgents(); setFoot(); }

  function load(){
    el('sub').textContent='loading…';
    fetch(jsonUrl,{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){ data=j; renderAll(); })
      .catch(function(e){ el('sub').textContent='failed to load'; el('kpis').innerHTML='<div class="kpi"><div class="lab">Error</div><div class="val">—</div><div class="d">'+esc(String(e))+'</div></div>'; });
  }

  el('seg').addEventListener('click', function(ev){
    var b=ev.target.closest('button'); if(!b) return;
    gran=b.getAttribute('data-g');
    Array.prototype.forEach.call(el('seg').children,function(c){ c.classList.toggle('on', c===b); });
    if(data) renderChart();
  });
  el('refresh').addEventListener('click', function(){ load(); loadHealth(); });
  var xp=el('auditexport'); if(xp) xp.addEventListener('click', exportAudit);
  function tick(){ if(data && data.generatedAt) el('sub').textContent='live · updated '+ago(Date.parse(data.generatedAt)); }
  setInterval(tick, 1000);
  setInterval(function(){ load(); loadHealth(); }, 45000);
  load(); loadHealth();
})();
</script>
</body>
</html>`;
