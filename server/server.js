/**
 * server.js
 * ---------------------------------------------------------------------------
 * Central server for the Context-Aware Fault Verification and Networked
 * Maintenance Alert System (see R1 Section 9, Component/Module 5).
 *
 * Responsibilities (matching R1's spec exactly):
 *   - Accept event payloads (Suspicious/Fault only) from sensor nodes over
 *     HTTP POST (R1 Section 9: "either as an HTTP POST or an MQTT publish").
 *     HTTP/JSON was implemented first because it needs no broker and is
 *     trivial to simulate/test; an MQTT listener is noted as an alternative
 *     embodiment (R1 Section 15) and left for a later iteration.
 *   - Persist events to SQLite (db.js).
 *   - Serve a REST API for the dashboard (active alerts, acknowledge,
 *     resolve, metrics).
 *   - Push live updates over WebSocket so the dashboard doesn't need to poll
 *     (R1 Section 9: "...or over a WebSocket for something closer to live
 *     updates").
 */

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const db = require('./db');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

// --- Node -> Server ingestion -----------------------------------------------
// Only ever called for SUSPICIOUS or FAULT classifications; a NORMAL reading
// is, by design (R1's central inventive feature), never sent at all.
app.post('/api/events', (req, res) => {
  const {
    nodeId,
    facility,
    location,
    sensorType,
    measuredValue,
    classification,
    faultScore,
    durationSeconds,
    confidence,
  } = req.body || {};

  if (!nodeId || !facility || !location || !sensorType || !classification) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  if (!['SUSPICIOUS', 'FAULT'].includes(classification)) {
    return res.status(400).json({ error: 'classification must be SUSPICIOUS or FAULT' });
  }

  db.upsertNode({ nodeId, facility, location, sensorTypes: [sensorType] });
  const id = db.insertEvent({
    nodeId,
    facility,
    location,
    sensorType,
    measuredValue,
    classification,
    faultScore: faultScore ?? null,
    durationSeconds: durationSeconds ?? null,
    confidence: confidence ?? (classification === 'FAULT' ? 'high' : 'medium'),
  });

  const evt = db.getEvent(id);
  broadcast('event:new', evt);
  res.status(201).json(evt);
});

// --- Dashboard-facing API ----------------------------------------------------
app.get('/api/events/active', (req, res) => {
  res.json(db.listActiveEvents());
});

app.get('/api/events', (req, res) => {
  res.json(db.listAllEvents(Number(req.query.limit) || 200));
});

app.post('/api/events/:id/acknowledge', (req, res) => {
  const evt = db.acknowledgeEvent(Number(req.params.id));
  if (!evt) return res.status(404).json({ error: 'not found' });
  broadcast('event:acknowledged', evt);
  res.json(evt);
});

app.post('/api/events/:id/resolve', (req, res) => {
  const evt = db.resolveEvent(Number(req.params.id));
  if (!evt) return res.status(404).json({ error: 'not found' });
  broadcast('event:resolved', evt);
  res.json(evt);
});

app.get('/api/metrics', (req, res) => {
  res.json(db.metrics());
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

server.listen(PORT, () => {
  console.log(`Hostel Maintenance server listening on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`WebSocket:  ws://localhost:${PORT}/ws`);
});
