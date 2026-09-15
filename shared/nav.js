/**
 * nav.js
 * ---------------------------------------------------------------------------
 * Injects the same top navigation bar into every page of the (multi-page,
 * not single-page) dashboard. Each page sets <body data-page="..."> so the
 * matching nav link gets highlighted.
 */
(function () {
  'use strict';

  const PAGES = [
    { href: 'index.html', key: 'dashboard', label: 'Dashboard' },
    { href: 'alerts.html', key: 'alerts', label: 'Active Alerts' },
    { href: 'log.html', key: 'log', label: 'Event Log' },
    { href: 'nodes.html', key: 'nodes', label: 'Nodes' },
    { href: 'metrics.html', key: 'metrics', label: 'Metrics' },
    { href: 'about.html', key: 'about', label: 'About' },
  ];

  function render() {
    const current = document.body.getAttribute('data-page') || 'dashboard';
    const mount = document.getElementById('nav-mount');
    if (!mount) return;

    const links = PAGES.map(
      (pg) =>
        `<a class="navlink${pg.key === current ? ' navlink--active' : ''}" href="${pg.href}">${pg.label}</a>`
    ).join('');

    mount.innerHTML = `
      <header class="topbar">
        <a class="brand" href="index.html">
          <span class="brand-mark">FW</span>
          <div class="brand-text">
            <h1>Facility Watch</h1>
            <p>Context-aware maintenance alerts &middot; Block Wings A&ndash;D</p>
          </div>
        </a>
        <div class="status-line">
          <span id="conn-dot" class="dot dot--off"></span>
          <span id="conn-label">Connecting&hellip;</span>
        </div>
      </header>
      <nav class="navbar">${links}</nav>
    `;
  }

  document.addEventListener('DOMContentLoaded', render);
})();
