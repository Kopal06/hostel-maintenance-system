/**
 * api.js
 * ---------------------------------------------------------------------------
 * Small shared layer so every page doesn't reimplement fetch calls and the
 * WebSocket reconnect loop. Pages register a callback via onLiveUpdate() to
 * be told when something changed, and re-fetch whatever that page needs.
 */
const FacilityWatchAPI = (function () {
  'use strict';

  async function getJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }

  const activeEvents = () => getJSON('/api/events/active');
  const allEvents = (limit = 200) => getJSON(`/api/events?limit=${limit}`);
  const metrics = () => getJSON('/api/metrics');
  const nodes = () => getJSON('/api/nodes');
  const metricsBySensor = () => getJSON('/api/metrics/by-sensor');
  const metricsTimeline = (days = 14) => getJSON(`/api/metrics/timeline?days=${days}`);

  async function acknowledge(id) {
    await fetch(`/api/events/${id}/acknowledge`, { method: 'POST' });
  }
  async function resolve(id) {
    await fetch(`/api/events/${id}/resolve`, { method: 'POST' });
  }

  const liveListeners = [];
  function onLiveUpdate(fn) {
    liveListeners.push(fn);
  }

  let ws;
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');

    ws.addEventListener('open', () => {
      if (dot) { dot.classList.remove('dot--off'); dot.classList.add('dot--on'); }
      if (label) label.textContent = 'Live';
    });
    ws.addEventListener('close', () => {
      if (dot) { dot.classList.remove('dot--on'); dot.classList.add('dot--off'); }
      if (label) label.textContent = 'Reconnecting\u2026';
      setTimeout(connect, 2000);
    });
    ws.addEventListener('message', () => {
      liveListeners.forEach((fn) => {
        try { fn(); } catch (e) { console.error(e); }
      });
    });
  }

  function init() {
    // nav.js renders #conn-dot/#conn-label on DOMContentLoaded; connect on
    // the next tick so those elements exist first.
    document.addEventListener('DOMContentLoaded', () => setTimeout(connect, 0));
    setInterval(() => liveListeners.forEach((fn) => fn()), 15000); // safety-net poll
  }
  init();

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

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function fmtDateTime(ms) {
    return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  function relativeTime(ms) {
    if (!ms) return 'never';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return {
    activeEvents, allEvents, metrics, nodes, metricsBySensor, metricsTimeline,
    acknowledge, resolve, onLiveUpdate, showToast, fmtTime, fmtDateTime, relativeTime,
  };
})();
