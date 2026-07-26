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
  const node = new CAFVANode({ Lmin: 0.5, Lmax: 6, Wsusp: 120, Wfault: 300, triggerMode: 'activity' });
  let last;
  for (let t = 1; t <= 300; t += 1) {
    last = node.step(3.2, 0, t * 1000);
    if (t === 120) {
      console.log(`    D=120s -> FS=${last.faultScore} state=${last.state}`);
      check('FS at D=120s is ~0.60 (R1 estimate)', approx(last.faultScore, 0.60));
      check('State at D=120s is SUSPICIOUS', last.state === STATE.SUSPICIOUS);
    }
  }
  console.log(`    D=300s -> FS=${last.faultScore} state=${last.state}`);
  check('FS at D=300s is ~0.84 (R1 estimate)', approx(last.faultScore, 0.84));
  check('State at D=300s is FAULT', last.state === STATE.FAULT);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
