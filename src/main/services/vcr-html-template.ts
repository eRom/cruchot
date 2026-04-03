import type { VcrRecording } from '../../preload/types'

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function generateVcrHtml(recording: VcrRecording): string {
  const { header, events } = recording
  const duration = header.duration ?? (events.length > 0 ? events[events.length - 1].offsetMs : 0)
  const recordedAt = formatDate(header.startedAt)
  const durationStr = formatDuration(duration)
  const jsonData = JSON.stringify({ header, events })

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VCR — ${header.recordingId}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #09090b;
    --bg2: #18181b;
    --bg3: #27272a;
    --border: #3f3f46;
    --text: #e4e4e7;
    --text-muted: #71717a;
    --accent: #6366f1;
    --green: #22c55e;
    --red: #ef4444;
    --amber: #f59e0b;
    --blue: #3b82f6;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; }
  #app { display: flex; flex-direction: column; height: 100vh; }

  /* Header */
  #header {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: var(--bg2); border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  #header h1 { font-size: 14px; font-weight: 600; color: var(--accent); }
  .meta { font-size: 11px; color: var(--text-muted); margin-left: auto; display: flex; gap: 16px; }
  .meta span { display: flex; gap: 4px; align-items: center; }
  .badge { padding: 1px 6px; border-radius: 4px; background: var(--bg3); font-size: 10px; color: var(--text-muted); border: 1px solid var(--border); }

  /* Progress bar */
  #progress-bar-wrap {
    flex-shrink: 0; padding: 8px 16px; background: var(--bg2); border-bottom: 1px solid var(--border);
  }
  #progress-track {
    position: relative; height: 6px; background: var(--bg3); border-radius: 3px; cursor: pointer;
  }
  #progress-fill {
    height: 100%; background: var(--accent); border-radius: 3px; width: 0%; transition: width 0.1s linear;
    pointer-events: none;
  }
  .marker {
    position: absolute; top: -3px; width: 3px; height: 12px; border-radius: 2px; transform: translateX(-50%);
    pointer-events: none;
  }

  /* Controls */
  #controls {
    flex-shrink: 0; display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; background: var(--bg2); border-bottom: 1px solid var(--border);
  }
  button {
    background: var(--bg3); border: 1px solid var(--border); color: var(--text);
    padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit;
  }
  button:hover { background: var(--border); }
  button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  #time-display { font-size: 12px; color: var(--text-muted); margin-left: 4px; min-width: 80px; }
  select {
    background: var(--bg3); border: 1px solid var(--border); color: var(--text);
    padding: 4px 8px; border-radius: 4px; font-size: 12px; font-family: inherit; cursor: pointer;
  }

  /* Main content */
  #content { display: flex; flex: 1; overflow: hidden; }

  /* Sidebar */
  #sidebar {
    width: 320px; flex-shrink: 0; display: flex; flex-direction: column;
    border-right: 1px solid var(--border); overflow: hidden;
  }
  #sidebar-header { padding: 8px 12px; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
  #event-list { flex: 1; overflow-y: auto; }
  .event-item {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--bg3);
    transition: background 0.1s;
  }
  .event-item:hover { background: var(--bg3); }
  .event-item.active { background: var(--bg3); border-left: 3px solid var(--accent); padding-left: 9px; }
  .event-item.past { opacity: 0.5; }
  .event-type {
    font-size: 10px; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; margin-top: 1px;
    background: var(--bg3); border: 1px solid var(--border); color: var(--text-muted);
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  }
  .event-type.text-delta { color: var(--blue); border-color: var(--blue); background: #1e2d3d; }
  .event-type.tool-call { color: var(--amber); border-color: var(--amber); background: #2d2308; }
  .event-type.tool-result.success { color: var(--green); border-color: var(--green); background: #0d2618; }
  .event-type.tool-result.error { color: var(--red); border-color: var(--red); background: #2d0f0f; }
  .event-type.user-message { color: var(--accent); border-color: var(--accent); background: #1c1c3d; }
  .event-type.permission-decision { color: var(--amber); border-color: var(--amber); background: #2d2308; }
  .event-type.session-start, .event-type.session-stop { color: var(--text-muted); }
  .event-type.finish { color: var(--green); border-color: var(--green); background: #0d2618; }
  .event-summary { font-size: 11px; color: var(--text-muted); flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .event-time { font-size: 10px; color: var(--text-muted); flex-shrink: 0; margin-left: auto; }
  .event-batch { display: flex; flex-direction: column; }
  .event-batch-header { display: flex; align-items: center; gap: 8px; padding: 4px 12px; cursor: pointer; border-bottom: 1px solid var(--bg3); }
  .event-batch-header:hover { background: var(--bg3); }
  .event-batch-count { font-size: 10px; color: var(--text-muted); margin-left: auto; }
  .event-batch-items { display: none; }
  .event-batch-items.expanded { display: block; }

  /* Detail pane */
  #detail {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
  }
  #detail-header { padding: 8px 16px; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
  #detail-content { flex: 1; overflow: auto; padding: 16px; }
  #detail-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 13px; }
  pre {
    background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; overflow: auto; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
    color: var(--text);
  }
  .detail-field { margin-bottom: 12px; }
  .detail-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .detail-value { font-size: 12px; }

  /* Footer */
  #vcr-branding {
    flex-shrink: 0; padding: 6px 16px; background: var(--bg2); border-top: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted);
  }
  #vcr-branding a { color: var(--accent); text-decoration: none; }
  #vcr-branding a:hover { text-decoration: underline; }
  .dot { color: var(--border); }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>
</head>
<body>
<div id="app">

  <div id="header">
    <div>
      <h1>Cruchot VCR Player</h1>
    </div>
    <div class="meta">
      <span><span class="badge">${header.providerId}</span><span class="badge">${header.modelId}</span></span>
      <span>${recordedAt}</span>
      <span>${durationStr}</span>
      <span>${(header.eventCount ?? events.length)} events</span>
    </div>
  </div>

  <div id="progress-bar-wrap">
    <div id="progress-track">
      <div id="progress-fill"></div>
    </div>
  </div>

  <div id="controls">
    <button id="btn-play">&#9654; Play</button>
    <button id="btn-pause" style="display:none">&#9646;&#9646; Pause</button>
    <button id="btn-stop">&#9632; Stop</button>
    <span id="time-display">0:00 / ${durationStr}</span>
    <select id="speed-select">
      <option value="0.5">0.5x</option>
      <option value="1" selected>1x</option>
      <option value="2">2x</option>
      <option value="4">4x</option>
    </select>
  </div>

  <div id="content">
    <div id="sidebar">
      <div id="sidebar-header">Events (${events.length})</div>
      <div id="event-list"></div>
    </div>
    <div id="detail">
      <div id="detail-header">
        <span>Event Detail</span>
        <span id="detail-type-badge"></span>
      </div>
      <div id="detail-content">
        <div id="detail-empty">Select an event to inspect it</div>
        <div id="detail-data" style="display:none"></div>
      </div>
    </div>
  </div>

  <footer id="vcr-branding">
    Recorded with <a href="https://cruchot.romain-ecarnot.com" target="_blank">Cruchot</a>
    <span class="dot">·</span>
    ${recordedAt}
    <span class="dot">·</span>
    ${durationStr}
    ${header.workspacePath ? `<span class="dot">·</span><span title="${header.workspacePath}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${header.workspacePath}</span>` : ''}
  </footer>
</div>

<script type="application/json" id="vcr-data">${jsonData}</script>

<script>
(function() {
  // --- Data ---
  var raw = document.getElementById('vcr-data').textContent;
  var recording = JSON.parse(raw);
  var events = recording.events;
  var header = recording.header;
  var totalDuration = header.duration || (events.length > 0 ? events[events.length - 1].offsetMs : 0);

  // --- State ---
  var currentTime = 0;
  var playing = false;
  var speed = 1;
  var lastRealTime = null;
  var rafId = null;
  var selectedIndex = -1;

  // --- DOM ---
  var btnPlay = document.getElementById('btn-play');
  var btnPause = document.getElementById('btn-pause');
  var btnStop = document.getElementById('btn-stop');
  var progressFill = document.getElementById('progress-fill');
  var progressTrack = document.getElementById('progress-track');
  var timeDisplay = document.getElementById('time-display');
  var speedSelect = document.getElementById('speed-select');
  var eventList = document.getElementById('event-list');
  var detailEmpty = document.getElementById('detail-empty');
  var detailData = document.getElementById('detail-data');
  var detailTypeBadge = document.getElementById('detail-type-badge');

  // --- Helpers ---
  function fmtMs(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function eventSummary(ev) {
    var d = ev.data;
    switch (ev.type) {
      case 'user-message': return (d.content || '').slice(0, 60);
      case 'text-delta': return (d.text || '').slice(0, 60);
      case 'reasoning-delta': return '[reasoning] ' + (d.text || '').slice(0, 50);
      case 'tool-call': return (d.toolName || d.name || '') + ' ' + JSON.stringify(d.args || {}).slice(0, 40);
      case 'tool-result': return (d.toolName || d.name || '') + ' -> ' + JSON.stringify(d.result || '').slice(0, 40);
      case 'permission-decision': return (d.toolName || '') + ' [' + (d.decision || d.action || '') + ']';
      case 'file-diff': return (d.filePath || '');
      case 'finish': return 'tokens: ' + ((d.usage && d.usage.totalTokens) || '?');
      default: return JSON.stringify(d).slice(0, 60);
    }
  }

  function isToolError(ev) {
    if (ev.type !== 'tool-result') return false;
    var r = ev.data.result;
    if (typeof r === 'object' && r !== null) return !!r.error;
    if (typeof r === 'string') return r.toLowerCase().startsWith('error');
    return false;
  }

  // --- Build sidebar ---
  // Group consecutive text-delta events into batches
  var groups = [];
  var i = 0;
  while (i < events.length) {
    if (events[i].type === 'text-delta') {
      var batch = [];
      while (i < events.length && events[i].type === 'text-delta') {
        batch.push(i);
        i++;
      }
      groups.push({ kind: 'batch', indices: batch });
    } else {
      groups.push({ kind: 'single', index: i });
      i++;
    }
  }

  function buildTypeClass(ev) {
    if (ev.type === 'tool-result') {
      return 'event-type tool-result ' + (isToolError(ev) ? 'error' : 'success');
    }
    return 'event-type ' + ev.type.replace(/[^a-z-]/g, '');
  }

  groups.forEach(function(group, gi) {
    if (group.kind === 'single') {
      var ev = events[group.index];
      var item = document.createElement('div');
      item.className = 'event-item';
      item.dataset.index = group.index;
      item.innerHTML =
        '<span class="' + buildTypeClass(ev) + '">' + escHtml(ev.type) + '</span>' +
        '<span class="event-summary">' + escHtml(eventSummary(ev)) + '</span>' +
        '<span class="event-time">' + fmtMs(ev.offsetMs) + '</span>';
      item.addEventListener('click', function() { selectEvent(parseInt(this.dataset.index)); });
      eventList.appendChild(item);
    } else {
      // Batch of text-deltas
      var first = events[group.indices[0]];
      var last = events[group.indices[group.indices.length - 1]];
      var combinedText = group.indices.map(function(idx) { return events[idx].data.text || ''; }).join('');

      var batchEl = document.createElement('div');
      batchEl.className = 'event-batch';
      batchEl.dataset.groupIndex = gi;

      var batchHeader = document.createElement('div');
      batchHeader.className = 'event-batch-header event-item';
      batchHeader.innerHTML =
        '<span class="event-type text-delta">text-delta</span>' +
        '<span class="event-summary">' + escHtml(combinedText.slice(0, 60)) + '</span>' +
        '<span class="event-batch-count">' + group.indices.length + ' chunks</span>' +
        '<span class="event-time">' + fmtMs(first.offsetMs) + '-' + fmtMs(last.offsetMs) + '</span>';

      var batchItems = document.createElement('div');
      batchItems.className = 'event-batch-items';
      batchItems.dataset.batchGroupIndex = gi;

      group.indices.forEach(function(idx) {
        var ev = events[idx];
        var sub = document.createElement('div');
        sub.className = 'event-item';
        sub.dataset.index = idx;
        sub.style.paddingLeft = '28px';
        sub.innerHTML =
          '<span class="event-type text-delta">delta</span>' +
          '<span class="event-summary">' + escHtml((ev.data.text || '').slice(0, 50)) + '</span>' +
          '<span class="event-time">' + fmtMs(ev.offsetMs) + '</span>';
        sub.addEventListener('click', function(e) { e.stopPropagation(); selectEvent(parseInt(this.dataset.index)); });
        batchItems.appendChild(sub);
      });

      batchHeader.addEventListener('click', function() {
        var items = batchEl.querySelector('.event-batch-items');
        items.classList.toggle('expanded');
      });

      batchEl.appendChild(batchHeader);
      batchEl.appendChild(batchItems);
      eventList.appendChild(batchEl);
    }
  });

  // --- Progress markers ---
  events.forEach(function(ev, idx) {
    if (!totalDuration) return;
    var pct = (ev.offsetMs / totalDuration) * 100;
    var color = null;
    if (ev.type === 'tool-result') color = isToolError(ev) ? 'var(--red)' : 'var(--green)';
    if (ev.type === 'permission-decision') color = 'var(--amber)';
    if (ev.type === 'tool-call') color = 'var(--amber)';
    if (!color) return;
    var marker = document.createElement('div');
    marker.className = 'marker';
    marker.style.left = pct + '%';
    marker.style.background = color;
    marker.title = ev.type + ' @ ' + fmtMs(ev.offsetMs);
    marker.addEventListener('click', function(e) { e.stopPropagation(); seekTo(ev.offsetMs); });
    progressTrack.appendChild(marker);
  });

  // --- Event selection ---
  function selectEvent(idx) {
    selectedIndex = idx;
    // Update active class
    document.querySelectorAll('.event-item').forEach(function(el) {
      if (parseInt(el.dataset.index) === idx) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    var ev = events[idx];
    detailEmpty.style.display = 'none';
    detailData.style.display = 'block';
    detailTypeBadge.textContent = ev.type;

    var html = '<div class="detail-field"><div class="detail-label">Type</div><div class="detail-value">' + escHtml(ev.type) + '</div></div>';
    html += '<div class="detail-field"><div class="detail-label">Offset</div><div class="detail-value">' + fmtMs(ev.offsetMs) + ' (' + ev.offsetMs + 'ms)</div></div>';
    html += '<div class="detail-field"><div class="detail-label">Data</div><pre>' + escHtml(JSON.stringify(ev.data, null, 2)) + '</pre></div>';
    detailData.innerHTML = html;
  }

  // --- Playback ---
  function seekTo(ms) {
    currentTime = Math.max(0, Math.min(ms, totalDuration));
    updateUI();
  }

  function updateUI() {
    var pct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
    progressFill.style.width = pct + '%';
    timeDisplay.textContent = fmtMs(currentTime) + ' / ' + fmtMs(totalDuration);

    // Highlight events up to currentTime
    document.querySelectorAll('.event-item[data-index]').forEach(function(el) {
      var idx = parseInt(el.dataset.index);
      var ev = events[idx];
      if (ev.offsetMs <= currentTime) {
        el.classList.remove('past');
      } else {
        el.classList.add('past');
      }
    });
  }

  function tick(realNow) {
    if (!playing) return;
    if (lastRealTime === null) {
      lastRealTime = realNow;
    }
    var delta = (realNow - lastRealTime) * speed;
    lastRealTime = realNow;
    currentTime = Math.min(currentTime + delta, totalDuration);
    updateUI();

    if (currentTime >= totalDuration) {
      playing = false;
      btnPlay.style.display = '';
      btnPause.style.display = 'none';
      lastRealTime = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (currentTime >= totalDuration) currentTime = 0;
    playing = true;
    lastRealTime = null;
    btnPlay.style.display = 'none';
    btnPause.style.display = '';
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    lastRealTime = null;
    btnPlay.style.display = '';
    btnPause.style.display = 'none';
    if (rafId) cancelAnimationFrame(rafId);
  }

  function stop() {
    pause();
    currentTime = 0;
    updateUI();
  }

  btnPlay.addEventListener('click', play);
  btnPause.addEventListener('click', pause);
  btnStop.addEventListener('click', stop);
  speedSelect.addEventListener('change', function() { speed = parseFloat(this.value); });

  progressTrack.addEventListener('click', function(e) {
    var rect = progressTrack.getBoundingClientRect();
    var pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * totalDuration);
  });

  updateUI();
})();
</script>
</body>
</html>`
}
