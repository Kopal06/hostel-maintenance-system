(function () {
  'use strict';
  const api = FacilityWatchAPI;

  function renderTimeline(rows) {
    const el = document.getElementById('timeline-chart');
    el.innerHTML = '';
    if (rows.length === 0) {
      el.innerHTML = '<p class="empty-state">No events in the last 14 days.</p>';
      return;
    }
    const max = Math.max(...rows.map((r) => r.fault + r.suspicious), 1);
    rows.forEach((r) => {
      const total = r.fault + r.suspicious;
      const faultPct = total ? (r.fault / max) * 100 : 0;
      const suspPct = total ? (r.suspicious / max) * 100 : 0;
      const group = document.createElement('div');
      group.className = 'bar-group';
      group.title = `${r.date}: ${r.fault} fault, ${r.suspicious} suspicious`;
      group.innerHTML = `
        <div class="bar-stack" style="height:${Math.max(faultPct + suspPct, 2)}%">
          <div class="bar-seg bar-seg--fault" style="height:${total ? (r.fault / total) * 100 : 0}%"></div>
          <div class="bar-seg bar-seg--susp" style="height:${total ? (r.suspicious / total) * 100 : 0}%"></div>
        </div>
        <span class="bar-label">${r.date.slice(5)}</span>
      `;
      el.appendChild(group);
    });
  }

  function renderSensorBreakdown(rows) {
    const el = document.getElementById('sensor-chart');
    el.innerHTML = '';
    if (rows.length === 0) {
      el.innerHTML = '<p class="empty-state">No events yet.</p>';
      return;
    }
    const max = Math.max(...rows.map((r) => r.total), 1);
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'hbar-row';
      row.innerHTML = `
        <span class="hbar-label">${r.sensor_type}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(r.total / max) * 100}%; background:${r.faults > 0 ? '#a3271f' : '#b3730a'};"></div></div>
        <span class="hbar-count">${r.total}</span>
      `;
      el.appendChild(row);
    });
  }

  async function refresh() {
    const [metrics, timeline, bySensor] = await Promise.all([
      api.metrics(), api.metricsTimeline(14), api.metricsBySensor(),
    ]);
    document.getElementById('m-total').textContent = metrics.totalEvents;
    document.getElementById('m-fault').textContent = metrics.faultEvents;
    document.getElementById('m-susp').textContent = metrics.suspiciousEvents;
    document.getElementById('m-mtta').textContent = metrics.avgResponseTimeSeconds
      ? `${Math.round(metrics.avgResponseTimeSeconds)}s` : '—';
    renderTimeline(timeline);
    renderSensorBreakdown(bySensor);
  }

  refresh();
  api.onLiveUpdate(refresh);
})();
