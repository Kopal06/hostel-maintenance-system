(function () {
  'use strict';
  const api = FacilityWatchAPI;
  const tbody = document.getElementById('log-body');
  const emptyMsg = document.getElementById('empty-msg');
  const searchInput = document.getElementById('search');
  const filterRow = document.getElementById('filter-row');

  let allEvents = [];
  let currentFilter = 'ALL';

  function statusLabel(evt) {
    if (evt.resolved_at) return 'Resolved';
    if (evt.acknowledged_at) return 'Acknowledged';
    return 'Active';
  }

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const rows = allEvents.filter((e) => {
      if (currentFilter !== 'ALL' && e.classification !== currentFilter) return false;
      if (!q) return true;
      return (
        e.node_id.toLowerCase().includes(q) ||
        e.facility.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q)
      );
    });

    tbody.innerHTML = '';
    emptyMsg.style.display = rows.length === 0 ? 'block' : 'none';

    rows.forEach((e) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${api.fmtDateTime(e.created_at)}</td>
        <td><span class="badge" style="background:${e.classification === 'FAULT' ? '#a3271f' : '#b3730a'};color:#fff;">${e.classification}</span></td>
        <td><span class="node-id">${e.node_id}</span></td>
        <td>${e.facility} — ${e.location}</td>
        <td>${e.sensor_type}: ${e.measured_value}${e.duration_seconds ? ` (${Math.round(e.duration_seconds)}s)` : ''}</td>
        <td>${e.fault_score != null ? Number(e.fault_score).toFixed(2) : '—'}</td>
        <td>${statusLabel(e)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  filterRow.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pill');
    if (!btn) return;
    filterRow.querySelectorAll('.pill').forEach((p) => p.classList.remove('pill--active'));
    btn.classList.add('pill--active');
    currentFilter = btn.getAttribute('data-filter');
    render();
  });

  searchInput.addEventListener('input', render);

  document.getElementById('export-btn').addEventListener('click', () => {
    const header = ['created_at', 'classification', 'node_id', 'facility', 'location', 'sensor_type', 'measured_value', 'duration_seconds', 'fault_score', 'status'];
    const lines = [header.join(',')];
    allEvents.forEach((e) => {
      lines.push([
        new Date(e.created_at).toISOString(), e.classification, e.node_id, `"${e.facility}"`, `"${e.location}"`,
        e.sensor_type, e.measured_value, e.duration_seconds || '', e.fault_score || '', statusLabel(e),
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'facility_watch_event_log.csv';
    a.click();
    api.showToast('CSV downloaded');
  });

  async function refresh() {
    allEvents = await api.allEvents(500);
    render();
  }

  refresh();
  api.onLiveUpdate(refresh);
})();
