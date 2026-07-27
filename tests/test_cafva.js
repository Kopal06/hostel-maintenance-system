/**
 * test_cafva.js (first pass)
 * ---------------------------------------------------------------------------
 * Validates the CAFVA implementation against the worked numerical example in
 * R1, Section 14 (tap left running at 2 AM, empty bathroom): expects
 * FS ~ 0.60 at D=120s (SUSPICIOUS) and FS ~ 0.84 at D=300s (FAULT).
 *
 * Run with: node tests/test_cafva.js
 */

'use strict';

const path = require('path');
const { CAFVANode, STATE } = require(path.join(__dirname, '..', 'simulation', 'cafva.js'));

let passed = 0;
let failed = 0;

function approx(a, b, tol = 0.05) {
  return Math.abs(a - b) <= tol;
}

function check(label, cond) {
  if (cond) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.log(`  [FAIL] ${label}`);
  }
}

console.log('--- Test 1: R1 Section 14 worked example (unattended tap, 2 AM) ---');
{
  // Anomaly is first observed at t=1 (that reading's timestamp becomes the
  // anomaly's t=0), so the loop index that yields an *elapsed* duration of
  // exactly 120s is t=121 - a direct consequence of periodic (rather than
  // continuous) sampling, same as would occur on real firmware. Discovered
  // this off-by-one while chasing the SUSPICIOUS-at-120s assertion below.
  const node = new CAFVANode({ Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' });
  let last;
  for (let t = 1; t <= 301; t += 1) {
    last = node.step(3.2, 0, t * 1000);
    if (t === 121) {
      console.log(`    D=120s -> FS=${last.faultScore.toFixed(3)} state=${last.state}`);
      check('FS at D=120s is close to R1 estimate (~0.60)', approx(last.faultScore, 0.60, 0.06));
      check('State at D=120s is SUSPICIOUS', last.state === STATE.SUSPICIOUS);
    }
  }
  console.log(`    D=300s -> FS=${last.faultScore.toFixed(3)} state=${last.state}`);
  check('FS at D=300s is close to R1 estimate (~0.84)', approx(last.faultScore, 0.84, 0.06));
  check('State at D=300s is FAULT', last.state === STATE.FAULT);
}

console.log('\n--- Test 2: Same flow rate, but occupied (normal shower use) ---');
{
  const node = new CAFVANode({ Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' });
  let last;
  for (let t = 1; t <= 300; t += 1) {
    last = node.step(3.2, 1, t * 1000);
  }
  check('Occupied continuous flow never escalates past NORMAL', last.state === STATE.NORMAL);
}

console.log('\n--- Test 3: Immediate FAULT on absolute critical limit (current spike) ---');
{
  const node = new CAFVANode({ Lmin: 0.1, Lmax: 5, Wsusp: 30, Wfault: 90, criticalLimit: 15 });
  const result = node.step(18.4, 0, 1000);
  check('Critical current spike -> immediate FAULT', result.state === STATE.FAULT && result.immediate);
}

console.log('\n--- Test 4: Anomaly resolves before Wfault -> drops back to NORMAL ---');
{
  const node = new CAFVANode({ Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' });
  let last;
  for (let t = 1; t <= 150; t += 1) last = node.step(3.2, 0, t * 1000);
  check('Mid-way state is SUSPICIOUS before resolution', last.state === STATE.SUSPICIOUS);
  last = node.step(0.0, 0, 151000);
  check('Tap turning off resets to NORMAL', last.state === STATE.NORMAL);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
