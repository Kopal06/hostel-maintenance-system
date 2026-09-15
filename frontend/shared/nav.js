/**
 * nav.js
 * ---------------------------------------------------------------------------
 * Injects the same top navigation bar into every page.
 */
(function () {
  'use strict';

  const BASE = '/hostel-maintenance-system/';

  const isRootPage =
    window.location.pathname === BASE ||
    window.location.pathname === `${BASE}index.html`;

  const PAGES = [
    {
      href: `${BASE}index.html`,
      key: 'dashboard',
      label: 'Dashboard'
    },
    {
      href: `${BASE}frontend/alerts.html`,
      key: 'alerts',
      label: 'Active Alerts'
    },
    {
      href: `${BASE}frontend/log.html`,
      key: 'log',
      label: 'Event Log'
    },
    {
      href: `${BASE}frontend/nodes.html`,
      key: 'nodes',
      label: 'Nodes'
    },
    {
      href: `${BASE}frontend/metrics.html`,
      key: 'metrics',
      label: 'Metrics'
    },
    {
      href: `${BASE}frontend/about.html`,
      key: 'about',
      label: 'About'
    }
  ];

  function render() {
    const current =
      document.body.getAttribute('data-page') || 'dashboard';

    const mount = document.getElementById('nav-mount');

    if (!mount) return;

    const links = PAGES.map(
      (pg) =>
        `<a class="navlink${
          pg.key === current ? ' navlink--active' : ''
        }" href="${pg.href}">${pg.label}</a>`
    ).join('');

    mount.innerHTML = `
      <header class="topbar">
        <a class="brand" href="${BASE}index.html">
          <span class="brand-mark">FW</span>

          <div class="brand-text">
            <h1>Facility Watch</h1>
            <p>
              Context-aware maintenance alerts &middot;
              Block Wings A&ndash;D
            </p>
          </div>
        </a>

        <div class="status-line">
          <span id="conn-dot" class="dot dot--off"></span>
          <span id="conn-label">Connecting&hellip;</span>
        </div>
      </header>

      <nav class="navbar">
        ${links}
      </nav>
    `;
  }

  document.addEventListener('DOMContentLoaded', render);
})();