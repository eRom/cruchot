/**
 * Default HTML template for VCR share files.
 *
 * This content is written to {userData}/template-vcr-share.html on first use.
 * The user can customize this file freely.
 *
 * IMPORTANT: The markers <!-- VCR_DATA_START --> and <!-- VCR_DATA_END -->
 * delimit the data injection zone. Do NOT remove or modify these markers.
 * Everything between them will be replaced with actual recording data at export time.
 *
 * CUSTOMIZATION GUIDE:
 * - "STYLE ZONE" (CSS): customize colors, fonts, layout freely
 * - "LAYOUT ZONE" (HTML structure): customize the UI layout freely
 * - "DATA ZONE" (between VCR_DATA markers): do NOT touch — auto-generated
 * - "SCRIPT ZONE" (JavaScript): customize behavior, but keep the data parsing intact
 */
export const DEFAULT_VCR_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cruchot VCR Recording</title>

<!-- ============================================================ -->
<!-- STYLE ZONE — Customize colors, fonts, layout freely          -->
<!-- ============================================================ -->
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Brand — change this to match your identity */
    --brand: oklch(49.107% 0.24121 264.248);
    --brand-soft: oklch(49.107% 0.24121 264.248 / 12%);

    /* Backgrounds */
    --bg: oklch(0.16 0.005 285);
    --bg-card: oklch(0.20 0.005 285);
    --bg-elevated: oklch(0.24 0.005 285);
    --bg-hover: oklch(0.22 0.005 285);

    /* Text */
    --text: oklch(0.93 0 0);
    --text-secondary: oklch(0.65 0.01 285);
    --text-muted: oklch(0.50 0.01 285);

    /* Borders */
    --border: oklch(1 0 0 / 8%);
    --border-strong: oklch(1 0 0 / 14%);

    /* Accent colors */
    --blue: oklch(0.62 0.19 264);
    --green: oklch(0.62 0.17 163);
    --amber: oklch(0.72 0.17 75);
    --red: oklch(0.60 0.21 25);
    --purple: oklch(0.58 0.22 293);
    --cyan: oklch(0.68 0.12 215);

    --radius: 0.5rem;
  }

  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background: var(--brand);
    color: white;
  }

  #app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  /* ---- Header ---- */
  #header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 16px;
  }

  #header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  #header h1 {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  #header h1 span {
    color: var(--brand);
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 500;
  }

  .pill-brand { background: var(--brand-soft); color: var(--brand); }
  .pill-muted { background: oklch(1 0 0 / 6%); color: var(--text-secondary); }

  .meta-text {
    font-size: 12px;
    color: var(--text-muted);
  }

  .meta-sep {
    color: var(--border-strong);
    font-size: 10px;
  }

  /* ---- Main Layout ---- */
  #content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ---- Sidebar ---- */
  #sidebar {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--bg);
    overflow: hidden;
  }

  #sidebar-header {
    padding: 10px 16px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }

  #event-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .event-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.12s ease;
    border-left: 3px solid transparent;
  }

  .event-item:hover {
    background: var(--bg-hover);
  }

  .event-item.active {
    background: var(--bg-elevated);
    border-left-color: var(--brand);
  }

  /* Event type badges — 10% opacity backgrounds */
  .event-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .tag-user-message   { background: oklch(0.62 0.19 264 / 12%); color: var(--blue); }
  .tag-text-delta     { background: oklch(0.68 0.12 215 / 12%); color: var(--cyan); }
  .tag-reasoning      { background: oklch(0.58 0.22 293 / 12%); color: var(--purple); }
  .tag-tool-call      { background: oklch(0.72 0.17 75 / 12%); color: var(--amber); }
  .tag-tool-ok        { background: oklch(0.62 0.17 163 / 12%); color: var(--green); }
  .tag-tool-err       { background: oklch(0.60 0.21 25 / 12%); color: var(--red); }
  .tag-permission     { background: oklch(0.72 0.17 75 / 12%); color: var(--amber); }
  .tag-finish         { background: oklch(0.62 0.17 163 / 12%); color: var(--green); }
  .tag-session        { background: oklch(1 0 0 / 6%); color: var(--text-muted); }
  .tag-file-diff      { background: oklch(0.58 0.22 293 / 12%); color: var(--purple); }

  .event-summary {
    flex: 1;
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .event-time {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  /* Batch (collapsed text-delta groups) */
  .event-batch-items {
    display: none;
  }

  .event-batch-items.expanded {
    display: block;
  }

  .event-batch-items .event-item {
    padding-left: 36px;
    opacity: 0.7;
  }

  .batch-count {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: auto;
    flex-shrink: 0;
  }

  .batch-chevron {
    font-size: 10px;
    color: var(--text-muted);
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }

  .event-batch-items.expanded ~ .event-item .batch-chevron,
  .expanded-chevron {
    transform: rotate(90deg);
  }

  /* ---- Detail Pane ---- */
  #detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }

  #detail-header {
    padding: 10px 20px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  #detail-content {
    flex: 1;
    overflow: auto;
    padding: 20px;
  }

  #detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 13px;
  }

  .detail-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin-bottom: 12px;
  }

  .detail-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }

  .detail-value {
    font-size: 13px;
    color: var(--text);
  }

  pre {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    overflow: auto;
    font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-secondary);
  }

  /* ---- Footer ---- */
  #vcr-branding {
    flex-shrink: 0;
    padding: 8px 20px;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  #vcr-branding a {
    color: var(--brand);
    text-decoration: none;
    font-weight: 500;
  }

  #vcr-branding a:hover { text-decoration: underline; }

  /* ---- Scrollbar ---- */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }

  /* ---- Responsive ---- */
  @media (max-width: 768px) {
    #sidebar { width: 260px; }
    .meta-row { flex-wrap: wrap; }
  }

  @media (max-width: 600px) {
    #content { flex-direction: column; }
    #sidebar { width: 100%; height: 40vh; border-right: none; border-bottom: 1px solid var(--border); }
    #detail { height: 60vh; }
  }
</style>
</head>
<body>

<!-- ============================================================ -->
<!-- LAYOUT ZONE — Customize the HTML structure freely            -->
<!-- ============================================================ -->
<div id="app">

  <div id="header">
    <div id="header-left">
      <h1><span>Cruchot</span> VCR</h1>
    </div>
    <div class="meta-row" id="meta-info"></div>
  </div>

  <div id="content">
    <div id="sidebar">
      <div id="sidebar-header">Events</div>
      <div id="event-list"></div>
    </div>
    <div id="detail">
      <div id="detail-header">
        <span>Event Detail</span>
        <span id="detail-type-badge" class="event-tag tag-session"></span>
      </div>
      <div id="detail-content">
        <div id="detail-empty">Selectionner un evenement pour l'inspecter</div>
        <div id="detail-data" style="display:none"></div>
      </div>
    </div>
  </div>

  <footer id="vcr-branding">
    Recorded with <a href="https://cruchot.romain-ecarnot.com" target="_blank">Cruchot</a>
  </footer>
</div>

<!-- ============================================================ -->
<!-- DATA ZONE — Do NOT modify between these markers              -->
<!-- The recording data is injected here automatically            -->
<!-- ============================================================ -->
<!-- VCR_DATA_START -->
<script type="application/json" id="vcr-data">{}</script>
<!-- VCR_DATA_END -->

<!-- ============================================================ -->
<!-- SCRIPT ZONE — Customize behavior, keep data parsing intact   -->
<!-- ============================================================ -->
<script>
(function() {
  var raw = document.getElementById('vcr-data').textContent;
  var recording = JSON.parse(raw);
  var events = recording.events || [];
  var header = recording.header || {};
  var totalDuration = header.duration || (events.length > 0 ? events[events.length - 1].offsetMs : 0);

  /* ---- Helpers ---- */
  function fmtMs(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function fmtDuration(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('fr-FR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function summary(ev) {
    var d = ev.data;
    switch (ev.type) {
      case 'user-message': return (d.content || '').slice(0, 60);
      case 'text-delta': return (d.text || '').slice(0, 60);
      case 'reasoning-delta': return (d.text || '').slice(0, 50);
      case 'tool-call': return (d.toolName || '') + '(' + JSON.stringify(d.args || {}).slice(0, 30) + ')';
      case 'tool-result': {
        var res = typeof d.result === 'string' ? d.result.slice(0, 40) : JSON.stringify(d.result || '').slice(0, 40);
        return '-> ' + res;
      }
      case 'permission-decision': return (d.decision || '') + (d.rule ? ' [' + d.rule + ']' : '');
      case 'file-diff': return d.filePath || '';
      case 'finish': return (d.tokensIn || 0) + ' in / ' + (d.tokensOut || 0) + ' out';
      default: return JSON.stringify(d).slice(0, 50);
    }
  }

  function isError(ev) {
    if (ev.type !== 'tool-result') return false;
    return ev.data.status === 'error' || (typeof ev.data.result === 'string' && ev.data.result.toLowerCase().startsWith('error'));
  }

  function tagClass(ev) {
    switch (ev.type) {
      case 'user-message': return 'tag-user-message';
      case 'text-delta': return 'tag-text-delta';
      case 'reasoning-delta': return 'tag-reasoning';
      case 'tool-call': return 'tag-tool-call';
      case 'tool-result': return isError(ev) ? 'tag-tool-err' : 'tag-tool-ok';
      case 'permission-decision': case 'permission-response': return 'tag-permission';
      case 'finish': return 'tag-finish';
      case 'file-diff': return 'tag-file-diff';
      default: return 'tag-session';
    }
  }

  function tagLabel(ev) {
    switch (ev.type) {
      case 'user-message': return 'message';
      case 'text-delta': return 'texte';
      case 'reasoning-delta': return 'reasoning';
      case 'tool-call': return ev.data.toolName || 'tool';
      case 'tool-result': return isError(ev) ? 'erreur' : 'resultat';
      case 'permission-decision': return 'permission';
      case 'permission-response': return 'reponse';
      case 'finish': return 'fin';
      case 'file-diff': return 'diff';
      case 'session-start': return 'debut';
      case 'session-stop': return 'fin session';
      default: return ev.type;
    }
  }

  /* ---- Header ---- */
  var toolCalls = events.filter(function(e) { return e.type === 'tool-call'; }).length;
  document.getElementById('meta-info').innerHTML =
    '<span class="pill pill-brand">' + esc(header.providerId || '') + '</span>' +
    '<span class="pill pill-brand">' + esc(header.modelId || '') + '</span>' +
    '<span class="meta-sep">|</span>' +
    '<span class="meta-text">' + fmtDate(header.startedAt) + '</span>' +
    '<span class="meta-sep">|</span>' +
    '<span class="meta-text">' + fmtDuration(totalDuration) + '</span>' +
    '<span class="meta-sep">|</span>' +
    '<span class="meta-text">' + events.length + ' events</span>' +
    (toolCalls > 0 ? '<span class="meta-sep">|</span><span class="meta-text">' + toolCalls + ' tools</span>' : '');

  document.getElementById('sidebar-header').textContent = 'Events (' + events.length + ')';

  /* ---- Build sidebar ---- */
  var eventList = document.getElementById('event-list');
  var detailEmpty = document.getElementById('detail-empty');
  var detailData = document.getElementById('detail-data');
  var detailTypeBadge = document.getElementById('detail-type-badge');

  // Group consecutive text-delta / reasoning-delta
  var groups = [];
  var i = 0;
  while (i < events.length) {
    var type = events[i].type;
    if (type === 'text-delta' || type === 'reasoning-delta') {
      var batch = [];
      while (i < events.length && events[i].type === type) { batch.push(i); i++; }
      groups.push({ kind: 'batch', type: type, indices: batch });
    } else {
      groups.push({ kind: 'single', index: i });
      i++;
    }
  }

  groups.forEach(function(group) {
    if (group.kind === 'single') {
      var ev = events[group.index];
      var item = document.createElement('div');
      item.className = 'event-item';
      item.dataset.index = group.index;
      item.innerHTML =
        '<span class="event-tag ' + tagClass(ev) + '">' + esc(tagLabel(ev)) + '</span>' +
        '<span class="event-summary">' + esc(summary(ev)) + '</span>' +
        '<span class="event-time">' + fmtMs(ev.offsetMs) + '</span>';
      item.addEventListener('click', function() { selectEvent(parseInt(this.dataset.index)); });
      eventList.appendChild(item);
    } else {
      var first = events[group.indices[0]];
      var last = events[group.indices[group.indices.length - 1]];
      var combined = group.indices.map(function(idx) { return events[idx].data.text || ''; }).join('');
      var tc = group.type === 'text-delta' ? 'tag-text-delta' : 'tag-reasoning';
      var label = group.type === 'text-delta' ? 'texte' : 'reasoning';

      var batchEl = document.createElement('div');
      batchEl.className = 'event-batch';

      var batchHeader = document.createElement('div');
      batchHeader.className = 'event-item';
      batchHeader.innerHTML =
        '<span class="batch-chevron">&#9654;</span>' +
        '<span class="event-tag ' + tc + '">' + label + '</span>' +
        '<span class="event-summary">' + esc(combined.slice(0, 60)) + '</span>' +
        '<span class="batch-count">' + group.indices.length + ' chunks</span>' +
        '<span class="event-time">' + fmtMs(first.offsetMs) + '</span>';

      var batchItems = document.createElement('div');
      batchItems.className = 'event-batch-items';
      var chevronEl = batchHeader.querySelector('.batch-chevron');

      group.indices.forEach(function(idx) {
        var ev = events[idx];
        var sub = document.createElement('div');
        sub.className = 'event-item';
        sub.dataset.index = idx;
        sub.innerHTML =
          '<span class="event-tag ' + tc + '" style="font-size:9px">chunk</span>' +
          '<span class="event-summary">' + esc((ev.data.text || '').slice(0, 50)) + '</span>' +
          '<span class="event-time">' + fmtMs(ev.offsetMs) + '</span>';
        sub.addEventListener('click', function(e) { e.stopPropagation(); selectEvent(parseInt(this.dataset.index)); });
        batchItems.appendChild(sub);
      });

      batchHeader.addEventListener('click', function() {
        var expanded = batchItems.classList.toggle('expanded');
        chevronEl.style.transform = expanded ? 'rotate(90deg)' : '';
      });

      batchEl.appendChild(batchHeader);
      batchEl.appendChild(batchItems);
      eventList.appendChild(batchEl);
    }
  });

  /* ---- Event selection ---- */
  function selectEvent(idx) {
    document.querySelectorAll('.event-item').forEach(function(el) {
      el.classList.toggle('active', parseInt(el.dataset.index) === idx);
    });

    var ev = events[idx];
    detailEmpty.style.display = 'none';
    detailData.style.display = 'block';
    detailTypeBadge.className = 'event-tag ' + tagClass(ev);
    detailTypeBadge.textContent = tagLabel(ev);

    var html =
      '<div class="detail-card">' +
        '<div class="detail-label">Type</div>' +
        '<div class="detail-value">' + esc(ev.type) + '</div>' +
      '</div>' +
      '<div class="detail-card">' +
        '<div class="detail-label">Offset</div>' +
        '<div class="detail-value">' + fmtMs(ev.offsetMs) + ' <span style="color:var(--text-muted)">(' + ev.offsetMs + 'ms)</span></div>' +
      '</div>' +
      '<div class="detail-card">' +
        '<div class="detail-label">Data</div>' +
        '<pre>' + esc(JSON.stringify(ev.data, null, 2)) + '</pre>' +
      '</div>';

    detailData.innerHTML = html;
  }
})();
</script>
</body>
</html>`
