(function () {
  'use strict';
  const api = FacilityWatchAPI;
  const template = document.getElementById('alert-card-template');
  const list = document.getElementById('active-list');

  function severityClass(c) { return c === 'FAULT' ? 'severity-fault' : 'severity-suspicious'; }

  function renderCard(evt) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(severityClass(evt.classification));
    node.setAttribute('data-event-id', evt.id);

    node.querySelector('.badge').textContent = evt.classification;
    node.querySelector('.card-node').textContent = evt.node_id;
    node.querySelector('.card-location').textContent = `${evt.facility} — ${evt.location}`;
    node.querySelector('.card-detail').textContent =
      `${evt.sensor_type} reading ${evt.measured_value} sustained${evt.duration_seconds ? ` for ${Math.round(evt.duration_seconds)}s` : ''} with no occupancy overlap.`;
    node.querySelector('.card-time').textContent = api.fmtDateTime(evt.created_at);
    node.querySelector('.card-score').textContent = evt.fault_score ? `FS ${Number(evt.fault_score).toFixed(2)}` : '';

    const ackBtn = node.querySelector('[data-action="acknowledge"]');
    const resolveBtn = node.querySelector('[data-action="resolve"]');
    if (evt.acknowledged_at) { ackBtn.textContent = 'Acknowledged'; ackBtn.disabled = true; }

    ackBtn.addEventListener('click', async () => {
      ackBtn.disabled = true;
      ackBtn.textContent = 'Acknowledging…';
      api.showToast('Alert acknowledged');
      await api.acknowledge(evt.id);
    });
    resolveBtn.addEventListener('click', async () => {
      ackBtn.disabled = true;
      resolveBtn.disabled = true;
      resolveBtn.textContent = 'Resolving…';
      api.showToast('Alert marked resolved — moved to Event Log');
      await api.resolve(evt.id);
    });

    return node;
  }

  async function refresh() {
    const events = await api.activeEvents();
    list.innerHTML = '';
    if (events.length === 0) {
      list.innerHTML = '<p class="empty-state">No active alerts. Every monitored facility is reading Normal Usage.</p>';
      return;
    }
    events.forEach((evt) => list.appendChild(renderCard(evt)));
  }

  refresh();
  api.onLiveUpdate(refresh);
})();
