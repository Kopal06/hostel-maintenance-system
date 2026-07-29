/**
 * scenarios.js
 * ---------------------------------------------------------------------------
 * Synthetic sensor traces used to drive the virtual nodes in the absence of
 * physical hardware (hardware bring-up is planned for Review 3; see the
 * Review-2 report's "Updated Feasibility" section). Each scenario supplies a
 * generator function producing one {s, p} reading per simulated second.
 *
 * Scenario 1 is a direct reproduction of R1 Section 14's worked example, so
 * that the simulator's output can be checked against the patent draft by
 * hand as well as by the automated tests in tests/test_cafva.js.
 */

'use strict';

function unattendedTapLeak() {
  // Tap left running at 3.2 L/min, bathroom empty, for 6 minutes straight.
  const readings = [];
  for (let t = 0; t < 360; t += 1) readings.push({ s: 3.2, p: 0 });
  return readings;
}

function normalShowerUse() {
  // Same flow magnitude, but someone is actually present (shower running).
  const readings = [];
  for (let t = 0; t < 300; t += 1) readings.push({ s: 3.4, p: 1 });
  return readings;
}

function corridorLightLeftOn() {
  // Ambient-light sensor: corridor light stuck on well past curfew with the
  // corridor empty. Uses 'band' trigger mode — a light reading above the
  // "should be dark" ceiling is itself the anomaly signal.
  const readings = [];
  for (let t = 0; t < 900; t += 1) readings.push({ s: 480, p: 0 }); // lux, well above night ceiling
  return readings;
}

function currentSurgeShortCircuit() {
  // Sudden current spike suggestive of a short — should be immediate FAULT.
  const readings = [{ s: 0.6, p: 0 }, { s: 0.7, p: 0 }, { s: 18.9, p: 0 }];
  return readings;
}

function intermittentFalseAlarmAvoided() {
  // Someone walks in partway through a running tap — occupancy should pull
  // the classification back down even though the flow itself never stops.
  const readings = [];
  for (let t = 0; t < 90; t += 1) readings.push({ s: 3.0, p: 0 }); // empty at first
  for (let t = 0; t < 200; t += 1) readings.push({ s: 3.0, p: 1 }); // someone arrives
  return readings;
}

module.exports = {
  unattendedTapLeak,
  normalShowerUse,
  corridorLightLeftOn,
  currentSurgeShortCircuit,
  intermittentFalseAlarmAvoided,
};
