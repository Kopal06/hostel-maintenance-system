/**
 * db.js
 * ---------------------------------------------------------------------------
 * Thin SQLite persistence layer for the central server.
 *
 * DESIGN JUSTIFICATION (see Review-2 report for the full discussion):
 * SQLite (via better-sqlite3, a synchronous, zero-network-hop driver) was
 * chosen over a MySQL/Postgres server for this stage of the project because:
 *   - It matches R1 Section 10's stated option of "a low-cost server ---
 *     a single-board computer works fine" (e.g. a Raspberry Pi hosting an
 *     event-driven system does not need a separate DB daemon).
 *   - The system is event-driven and low-volume by design (only Suspicious/
 *     Fault events are ever written, per the whole point of the invention),
 *     so SQLite's single-writer model is not a bottleneck here.
 *   - Zero setup burden during development (no server process, no
 *     credentials) — one less moving part while iterating on the schema.
 * A migration path to Postgres/MySQL for a multi-building institutional
 * deployment remains open and is noted as future work.
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'hostel_maintenance.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS nodes (
  node_id TEXT PRIMARY KEY,
  facility TEXT NOT NULL,
  location TEXT NOT NULL,
  sensor_types TEXT NOT NULL,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  facility TEXT NOT NULL,
  location TEXT NOT NULL,
  sensor_type TEXT NOT NULL,
  measured_value REAL NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('SUSPICIOUS', 'FAULT')),
  fault_score REAL,
  duration_seconds REAL,
  confidence TEXT,
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  resolved_at INTEGER,
  response_time_seconds REAL,
  FOREIGN KEY (node_id) REFERENCES nodes(node_id)
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_classification ON events(classification);
`);

function upsertNode({ nodeId, facility, location, sensorTypes }) {
  db.prepare(
    `INSERT INTO nodes (node_id, facility, location, sensor_types, last_seen)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       facility=excluded.facility,
       location=excluded.location,
       sensor_types=excluded.sensor_types,
       last_seen=excluded.last_seen`
  ).run(nodeId, facility, location, JSON.stringify(sensorTypes), Date.now());
}

function insertEvent(evt) {
  const info = db
    .prepare(
      `INSERT INTO events
        (node_id, facility, location, sensor_type, measured_value,
         classification, fault_score, duration_seconds, confidence, created_at)
       VALUES (@nodeId, @facility, @location, @sensorType, @measuredValue,
               @classification, @faultScore, @durationSeconds, @confidence, @createdAt)`
    )
    .run({ ...evt, createdAt: Date.now() });
  return info.lastInsertRowid;
}

function listActiveEvents() {
  return db
    .prepare(
      `SELECT * FROM events WHERE resolved_at IS NULL ORDER BY created_at DESC`
    )
    .all();
}

function listAllEvents(limit = 200) {
  return db
    .prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT ?`)
    .all(limit);
}

function acknowledgeEvent(id) {
  db.prepare(`UPDATE events SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL`).run(
    Date.now(),
    id
  );
  return getEvent(id);
}

function resolveEvent(id) {
  const evt = getEvent(id);
  if (!evt) return null;
  const now = Date.now();
  const responseTimeSeconds = (now - evt.created_at) / 1000;
  db.prepare(
    `UPDATE events SET resolved_at = ?, response_time_seconds = ? WHERE id = ? AND resolved_at IS NULL`
  ).run(now, responseTimeSeconds, id);
  return getEvent(id);
}

function getEvent(id) {
  return db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
}

function metrics() {
  const total = db.prepare(`SELECT COUNT(*) c FROM events`).get().c;
  const faults = db.prepare(`SELECT COUNT(*) c FROM events WHERE classification='FAULT'`).get().c;
  const avgResponse = db
    .prepare(`SELECT AVG(response_time_seconds) a FROM events WHERE response_time_seconds IS NOT NULL`)
    .get().a;
  return {
    totalEvents: total,
    faultEvents: faults,
    suspiciousEvents: total - faults,
    avgResponseTimeSeconds: avgResponse,
  };
}

function listNodes() {
  const rows = db.prepare(`SELECT * FROM nodes ORDER BY last_seen DESC`).all();
  const countStmt = db.prepare(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN classification='FAULT' THEN 1 ELSE 0 END) faults,
            SUM(CASE WHEN classification='SUSPICIOUS' THEN 1 ELSE 0 END) suspicious,
            SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) active
     FROM events WHERE node_id = ?`
  );
  return rows.map((n) => {
    const counts = countStmt.get(n.node_id);
    return {
      ...n,
      sensor_types: JSON.parse(n.sensor_types || '[]'),
      totalEvents: counts.total || 0,
      faultEvents: counts.faults || 0,
      suspiciousEvents: counts.suspicious || 0,
      activeEvents: counts.active || 0,
    };
  });
}

function metricsBySensor() {
  return db
    .prepare(
      `SELECT sensor_type,
              COUNT(*) total,
              SUM(CASE WHEN classification='FAULT' THEN 1 ELSE 0 END) faults,
              SUM(CASE WHEN classification='SUSPICIOUS' THEN 1 ELSE 0 END) suspicious
       FROM events GROUP BY sensor_type ORDER BY total DESC`
    )
    .all();
}

function metricsTimeline(days = 14) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT created_at, classification FROM events WHERE created_at >= ? ORDER BY created_at ASC`
    )
    .all(since);
  const buckets = {};
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    if (!buckets[day]) buckets[day] = { date: day, fault: 0, suspicious: 0 };
    if (r.classification === 'FAULT') buckets[day].fault += 1;
    else buckets[day].suspicious += 1;
  }
  return Object.values(buckets).sort((a, b) => (a.date < b.date ? -1 : 1));
}

module.exports = {
  db,
  upsertNode,
  insertEvent,
  listActiveEvents,
  listAllEvents,
  acknowledgeEvent,
  resolveEvent,
  getEvent,
  metrics,
  listNodes,
  metricsBySensor,
  metricsTimeline,
};
