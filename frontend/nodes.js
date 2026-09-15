(function () {
  'use strict';
  const api = FacilityWatchAPI;
  const grid = document.getElementById('node-grid');
  const emptyMsg = document.getElementById('empty-msg');

  function statusClass(n) {
    if (n.activeEvents > 0) {
      // We don't know severity of the active one without another lookup,
      // so approximate: any lifetime fault -> treat unresolved as alert-red,
      // otherwise amber (watching).
      return n.faultEvents > 0 ? 'node-status--alert' : 'node-status--watching';
    }
    return 'node-status--ok';
  }

  async function refresh() {
    const nodes = await api.nodes();
    grid.innerHTML = '';
    emptyMsg.style.display = nodes.length === 0 ? 'block' : 'none';

    nodes.forEach((n) => {
      const card = document.createElement('article');
      card.className = 'node-card';
      card.innerHTML = `
        <div class="node-card-top">
          <div>
            <p class="node-location">${n.location}</p>
            <p class="node-facility">${n.facility}</p>
          </div>
          <span class="node-status ${statusClass(n)}" title="${n.activeEvents > 0 ? 'Has active alert(s)' : 'Clear'}"></span>
        </div>
        <p class="node-id">${n.node_id} &middot; ${n.sensor_types.join(', ')}</p>
        <div class="node-stats">
          <div><b>${n.totalEvents}</b>total</div>
          <div><b style="color:#a3271f">${n.faultEvents}</b>faults</div>
          <div><b style="color:#b3730a">${n.suspiciousEvents}</b>suspicious</div>
          <div><b>${n.activeEvents}</b>active</div>
        </div>
        <p class="node-lastseen">Last seen ${api.relativeTime(n.last_seen)}</p>
      `;
      grid.appendChild(card);
    });
  }

  refresh();
  api.onLiveUpdate(refresh);
})();
