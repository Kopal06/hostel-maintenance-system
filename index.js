(function () {
  'use strict';
  const api = FacilityWatchAPI;
  const template = document.getElementById('alert-card-template');

  function severityClass(c) { return c === 'FAULT' ? 'severity-fault' : 'severity-suspicious'; }

  function renderAlertCard(evt) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(severityClass(evt.classification));
    node.querySelector('.badge').textContent = evt.classification;
    node.querySelector('.card-node').textContent = evt.node_id;
    node.querySelector('.card-location').textContent = `${evt.facility} — ${evt.location}`;
    node.querySelector('.card-detail').textContent =
      `${evt.sensor_type} reading ${evt.measured_value}${evt.duration_seconds ? ` sustained for ${Math.round(evt.duration_seconds)}s` : ''}.`;
    node.querySelector('.card-time').textContent = api.fmtTime(evt.created_at);
    node.querySelector('.card-score').textContent = evt.fault_score ? `FS ${Number(evt.fault_score).toFixed(2)}` : '';
    return node;
  }

  async function refresh() {
    const [active, nodes, metrics] = await Promise.all([api.activeEvents(), api.nodes(), api.metrics()]);

    document.getElementById('active-count').textContent = active.length;
    const preview = document.getElementById('active-preview');
    preview.innerHTML = '';
    if (active.length === 0) {
      preview.innerHTML = '<p class="empty-state">No active alerts. Every monitored facility is reading Normal Usage.</p>';
    } else {
      active.slice(0, 3).forEach((e) => preview.appendChild(renderAlertCard(e)));
    }

    const nodePreview = document.getElementById('node-preview');
    nodePreview.innerHTML = '';
    if (nodes.length === 0) {
      nodePreview.innerHTML = '<p class="empty-state">No nodes have reported in yet.</p>';
    } else {
      nodes.slice(0, 4).forEach((n) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<p class="card-location">${n.facility} — ${n.location}</p>
          <p class="card-detail">${n.node_id} &middot; last seen ${api.relativeTime(n.last_seen)}</p>`;
        nodePreview.appendChild(div);
      });
    }

    document.getElementById('m-total').textContent = metrics.totalEvents;
    document.getElementById('m-fault').textContent = metrics.faultEvents;
    document.getElementById('m-susp').textContent = metrics.suspiciousEvents;
    document.getElementById('m-mtta').textContent = metrics.avgResponseTimeSeconds
      ? `${Math.round(metrics.avgResponseTimeSeconds)}s` : '—';
  }

  refresh();
  api.onLiveUpdate(refresh);
})();
