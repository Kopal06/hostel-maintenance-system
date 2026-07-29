/**
 * virtual_node.js
 * ---------------------------------------------------------------------------
 * Stands in for physical ESP32 sensor nodes until Review 3 hardware bring-up.
 * Each virtual node:
 *   1. Runs the exact same CAFVA edge-classification logic the firmware runs
 *      (cafva.js — ported to C++ in firmware/esp32_node/cafva.h).
 *   2. Feeds it a scripted or randomized sensor trace instead of real ADC
 *      readings.
 *   3. Only ever calls the server's HTTP API when the local classification
 *      is SUSPICIOUS or FAULT — normal-usage readings never leave the
 *      "device", reproducing the invention's central bandwidth-saving
 *      property even in simulation.
 *
 * Usage:
 *   node simulation/virtual_node.js                  # run all demo nodes once
 *   node simulation/virtual_node.js --server http://localhost:4000
 */

'use strict';

const path = require('path');
const { CAFVANode } = require(path.join(__dirname, 'cafva.js'));
const scenarios = require(path.join(__dirname, 'scenarios.js'));

const args = process.argv.slice(2);
const serverFlagIdx = args.indexOf('--server');
const SERVER = serverFlagIdx >= 0 ? args[serverFlagIdx + 1] : 'http://localhost:4000';
const SPEED = args.includes('--fast') ? 0 : 15; // ms delay between simulated seconds (0 = as fast as possible)

const NODES = [
  {
    nodeId: 'WB-B2-04',
    facility: 'Block B — 2nd Floor Washroom',
    location: 'Washbasin tap 3',
    sensorType: 'flow',
    cfg: { Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' },
    trace: scenarios.unattendedTapLeak(),
  },
  {
    nodeId: 'WB-B2-04-CTRL',
    facility: 'Block B — 2nd Floor Washroom',
    location: 'Shower stall 1 (control case — occupied)',
    sensorType: 'flow',
    cfg: { Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' },
    trace: scenarios.normalShowerUse(),
  },
  {
    nodeId: 'CR-A3-12',
    facility: 'Block A — 3rd Floor Corridor',
    location: 'Corridor light, Wing 3',
    sensorType: 'light',
    cfg: { Lmin: 0, Lmax: 40, Wsusp: 300, Wfault: 900, triggerMode: 'band' },
    trace: scenarios.corridorLightLeftOn(),
  },
  {
    nodeId: 'EP-C1-07',
    facility: 'Block C — 1st Floor Electrical Point',
    location: 'Washing-machine socket 2',
    sensorType: 'current',
    cfg: { Lmin: 0.2, Lmax: 8, Wsusp: 20, Wfault: 60, criticalLimit: 15 },
    trace: scenarios.currentSurgeShortCircuit(),
  },
  {
    nodeId: 'WB-D1-02',
    facility: 'Block D — 1st Floor Washroom',
    location: 'Washbasin tap 1 (occupancy arrives mid-anomaly)',
    sensorType: 'flow',
    cfg: { Lmin: 0.5, Lmax: 6, Wsusp: 60, Wfault: 180, triggerMode: 'activity' },
    trace: scenarios.intermittentFalseAlarmAvoided(),
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postEvent(node, result, reading) {
  const payload = {
    nodeId: node.nodeId,
    facility: node.facility,
    location: node.location,
    sensorType: node.sensorType,
    measuredValue: reading.s,
    classification: result.state,
    faultScore: result.faultScore,
    durationSeconds: result.duration,
  };
  try {
    const res = await fetch(`${SERVER}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`  [${node.nodeId}] server rejected event: ${res.status} ${await res.text()}`);
      return;
    }
    console.log(
      `  [${node.nodeId}] -> ${result.state} sent (FS=${
        result.faultScore !== null && result.faultScore !== undefined ? result.faultScore.toFixed(2) : 'n/a'
      }, D=${Math.round(result.duration)}s)`
    );
  } catch (err) {
    console.error(`  [${node.nodeId}] could not reach server at ${SERVER} (${err.message})`);
  }
}

async function runNode(node) {
  console.log(`\n[${node.nodeId}] ${node.facility} / ${node.location} — starting trace (${node.trace.length}s)`);
  const engine = new CAFVANode(node.cfg);
  let lastReportedState = 'NORMAL';
  let sentCount = 0;
  let normalCycles = 0;

  for (let t = 0; t < node.trace.length; t += 1) {
    const reading = node.trace[t];
    const result = engine.step(reading.s, reading.p, (t + 1) * 1000);

    if (result.state === 'NORMAL') {
      normalCycles += 1;
      // Nothing is transmitted for Normal Usage — this is the whole point.
    } else if (result.state !== lastReportedState || result.immediate) {
      // Report on state transitions (SUSPICIOUS entered, then escalated to
      // FAULT) rather than every single cycle, matching how the firmware
      // would avoid re-sending an unchanged classification every second.
      await postEvent(node, result, reading);
      sentCount += 1;
    }
    lastReportedState = result.state;

    if (SPEED > 0) await sleep(SPEED);
  }

  console.log(
    `[${node.nodeId}] done. ${normalCycles}/${node.trace.length} cycles stayed Normal Usage (never transmitted); ${sentCount} event(s) sent to server.`
  );
}

async function main() {
  console.log(`Virtual node simulator — target server: ${SERVER}`);
  console.log('(Run `npm start` inside server/ first, in another terminal.)');
  for (const node of NODES) {
    // eslint-disable-next-line no-await-in-loop
    await runNode(node);
  }
  console.log('\nAll scripted scenarios complete. Open the dashboard to review results.');
}

main();
