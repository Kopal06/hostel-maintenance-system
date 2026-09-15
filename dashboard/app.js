(function () {
  'use strict';

  const activeList = document.getElementById('active-list');
  const logList = document.getElementById('log-list');
  const activeCountEl = document.getElementById('active-count');
  const template = document.getElementById('alert-card-template');
  const connDot = document.getElementById('conn-dot');
  const connLabel = document.getElementById('conn-label');

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function severityClass(c) {
    return c === 'FAULT' ? 'severity-fault' : 'severity-suspicious';
  }

  function renderCard(evt, { compact = false } = {}) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(severityClass(evt.classification));
    if (evt.resolved_at) node.classList.add('state-resolved');
    node.setAttribute('data-event-id', evt.id);

    node.querySelector('.badge').textContent = evt.classification;
    node.querySelector('.card-node').textContent = evt.node_id;
    node.querySelector('.card-location').textContent = `${evt.facility} — ${evt.location}`;
    node.querySelector('.card-detail').textContent =
      `${evt.sensor_type} reading ${evt.measured_value} sustained${
        evt.duration_seconds ? ` for ${Math.round(evt.duration_seconds)}s` : ''
      } with no occupancy overlap.`;
    node.querySelector('.card-time').textContent = fmtTime(evt.created_at);
    node.querySelector('.card-score').textContent = evt.fault_score
      ? `FS ${Number(evt.fault_score).toFixed(2)}`
      : '';

    const ackBtn = node.querySelector('[data-action="acknowledge"]');
    const resolveBtn = node.querySelector('[data-action="resolve"]');

    if (compact) {
      node.querySelector('.card-actions').remove();
    } else {
      if (evt.acknowledged_at) {
        ackBtn.textContent = 'Acknowledged';
        ackBtn.disabled = true;
      }
      if (evt.resolved_at) {
        resolveBtn.textContent = 'Resolved';
        resolveBtn.disabled = true;
        ackBtn.disabled = true;
      }
      ackBtn.addEventListener('click', () => postAction(evt.id, 'acknowledge'));
      resolveBtn.addEventListener('click', () => postAction(evt.id, 'resolve'));
    }

    return node;
  }

  async function postAction(id, action) {
    // Immediate visual feedback so a click doesn't feel like nothing happened
    // — the WebSocket refresh that follows can take a beat.
    const card = document.querySelector(`[data-event-id="${id}"]`);
    if (card) {
      const btn = card.querySelector(`[data-action="${action}"]`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = action === 'resolve' ? 'Resolving…' : 'Acknowledging…';
      }
      card.style.transition = 'opacity 0.3s ease';
    }
    showToast(action === 'resolve' ? 'Alert marked resolved' : 'Alert acknowledged');
    await fetch(`/api/events/${id}/${action}`, { method: 'POST' });
    // The WebSocket broadcast will trigger a re-render.
  }

  let toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 2200);
  }

  async function refreshAll() {
    const [active, log, metrics] = await Promise.all([
      fetch('/api/events/active').then((r) => r.json()),
      fetch('/api/events?limit=40').then((r) => r.json()),
      fetch('/api/metrics').then((r) => r.json()),
    ]);
    renderActive(active);
    renderLog(log);
    renderMetrics(metrics);
  }

  function renderActive(events) {
    activeCountEl.textContent = events.length;
    activeList.innerHTML = '';
    if (events.length === 0) {
      activeList.innerHTML =
        '<p class="empty-state">No active alerts. Every monitored facility is reading Normal Usage.</p>';
      return;
    }
    events.forEach((evt) => activeList.appendChild(renderCard(evt)));
  }

  function renderLog(events) {
    logList.innerHTML = '';
    events.forEach((evt) => logList.appendChild(renderCard(evt, { compact: true })));
  }

  function renderMetrics(m) {
    document.getElementById('m-total').textContent = m.totalEvents;
    document.getElementById('m-fault').textContent = m.faultEvents;
    document.getElementById('m-susp').textContent = m.suspiciousEvents;
    document.getElementById('m-mtta').textContent = m.avgResponseTimeSeconds
      ? `${Math.round(m.avgResponseTimeSeconds)}s`
      : '—';
  }

  function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      connDot.classList.remove('dot--off');
      connDot.classList.add('dot--on');
      connLabel.textContent = 'Live';
    });
    ws.addEventListener('close', () => {
      connDot.classList.remove('dot--on');
      connDot.classList.add('dot--off');
      connLabel.textContent = 'Reconnecting…';
      setTimeout(connectWebSocket, 2000);
    });
    ws.addEventListener('message', () => {
      // Any event message (new / acknowledged / resolved) — just refetch.
      // Simpler and safer than trying to patch DOM state from partial
      // payloads, and cheap enough given the low event volume by design.
      refreshAll();
    });
  }

  refreshAll();
  connectWebSocket();
  setInterval(refreshAll, 15000); // safety-net poll in case a WS message is missed
})();
