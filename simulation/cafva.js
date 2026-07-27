/**
 * cafva.js
 * ---------------------------------------------------------------------------
 * Context-Aware Fault Verification Algorithm (CAFVA).
 *
 * Implementation of Section 12 (ALGORITHM / METHOD) and Section 13
 * (MATHEMATICAL / TECHNICAL MODEL) from the R1 patent-specification draft,
 * after two rounds of fixes against R1's own Section 14 worked example (see
 * git history: the literal Section 12 anomaly-trigger definition directly
 * contradicted the Section 14 example, and the naive duration calculation
 * undercounted by one sample period — both documented and fixed as separate
 * commits rather than folded together).
 *
 * This file is the reference implementation. The exact same decision logic
 * is ported to C++ for the real ESP32 firmware in
 * firmware/esp32_node/cafva.h — any behavioural change belongs in both
 * places, re-validated against tests/test_cafva.js.
 */

'use strict';

const STATE = Object.freeze({
  NORMAL: 'NORMAL',
  SUSPICIOUS: 'SUSPICIOUS',
  FAULT: 'FAULT',
});

class CAFVANode {
  /**
   * @param {Object} cfg
   * @param {number} cfg.Lmin - lower edge of the normal-usage band (or the
   *        activity threshold, in 'activity' trigger mode)
   * @param {number} cfg.Lmax - upper edge of the normal-usage band (or the
   *        critical ceiling, in 'activity' trigger mode)
   * @param {number} cfg.Wsusp - seconds of unoccupied anomaly before
   *        SUSPICIOUS becomes possible
   * @param {number} cfg.Wfault - seconds of unoccupied anomaly before an
   *        automatic FAULT regardless of fault score
   * @param {number} [cfg.Tsusp=0.4] / {number} [cfg.Tfault=0.75] - fault
   *        score thresholds (Section 13)
   * @param {number} [cfg.w1=0.4] [cfg.w2=0.4] [cfg.w3=0.2] - fault-score
   *        weights on duration / occupancy / magnitude-deviation
   * @param {number} [cfg.occupancyOverrideRatio=0.5] - Op above which an
   *        anomaly is forced back to NORMAL (Section 12, Step 5)
   * @param {number} [cfg.criticalLimit] - optional absolute value; |S|
   *        crossing it triggers immediate FAULT (Step 6, current-spike case)
   * @param {'band'|'activity'} [cfg.triggerMode='band'] - see fix commit
   *        and docs above for why this exists.
   */
  constructor(cfg) {
    this.Lmin = cfg.Lmin;
    this.Lmax = cfg.Lmax;
    this.Wsusp = cfg.Wsusp;
    this.Wfault = cfg.Wfault;
    this.Tsusp = cfg.Tsusp ?? 0.4;
    this.Tfault = cfg.Tfault ?? 0.75;
    this.w1 = cfg.w1 ?? 0.4;
    this.w2 = cfg.w2 ?? 0.4;
    this.w3 = cfg.w3 ?? 0.2;
    this.occupancyOverrideRatio = cfg.occupancyOverrideRatio ?? 0.5;
    this.criticalLimit = cfg.criticalLimit ?? null;
    // FIX (2026-07-26): R1's Section 14 worked example requires a reading
    // that sits INSIDE [Lmin, Lmax] to still be treated as anomalous, based
    // purely on how long it persists with nobody present (a tap running at
    // a perfectly normal rate, but all night, with the bathroom empty).
    // That is impossible under a literal "outside the band = anomalous"
    // rule (see the previous commit's failing test). Introducing an
    // explicit trigger mode resolves the contradiction without touching the
    // fault-score formula itself:
    //   'band'     - anomalous when OUTSIDE [Lmin, Lmax] (R1's literal Step 2
    //                wording; fine for sensors like temperature/light where
    //                any excursion from a safe range is itself notable).
    //   'activity' - anomalous when ABOVE Lmin, i.e. "the tap/appliance is
    //                on at all"; Lmax is then just a critical ceiling. This
    //                is what the flow-sensor worked example actually needs.
    this.triggerMode = cfg.triggerMode ?? 'band';

    this._anomalyStart = null;
    this._occupiedSamples = 0;
    this._totalSamples = 0;
    this._state = STATE.NORMAL;
    this._prevSampleMs = null; // timestamp of the previous processing cycle
  }

  step(s, p, nowMs) {
    // The previous cycle's timestamp is the last moment we know the reading
    // was (at worst) not-yet-flagged. Using it as the anomaly's t=0, rather
    // than nowMs, avoids a systematic one-sample-period undercount of the
    // anomaly duration (discovered while validating against the R1
    // worked example - see commit history / Review-2 report).
    const prevMs = this._prevSampleMs;
    this._prevSampleMs = nowMs;

    const anomalous =
      this.triggerMode === 'activity' ? s > this.Lmin : s < this.Lmin || s > this.Lmax;

    if (this.criticalLimit !== null && Math.abs(s) >= this.criticalLimit) {
      this._resetAnomaly();
      this._state = STATE.FAULT;
      return { state: this._state, faultScore: 1.0, duration: 0, immediate: true };
    }

    if (!anomalous) {
      this._resetAnomaly();
      this._state = STATE.NORMAL;
      return { state: this._state, faultScore: 0, duration: 0 };
    }

    if (this._anomalyStart === null) {
      this._anomalyStart = prevMs !== null ? prevMs : nowMs;
      this._occupiedSamples = 0;
      this._totalSamples = 0;
    }
    this._totalSamples += 1;
    if (p === 1) this._occupiedSamples += 1;

    const durationSec = (nowMs - this._anomalyStart) / 1000;
    const Op = this._totalSamples > 0 ? this._occupiedSamples / this._totalSamples : 0;

    if (Op >= this.occupancyOverrideRatio) {
      this._state = STATE.NORMAL;
      return { state: this._state, faultScore: null, duration: durationSec, Op };
    }

    const Smid = (this.Lmin + this.Lmax) / 2;
    const magnitudeTerm = Math.abs(s - Smid) / (this.Lmax - this.Lmin);
    const durationTerm = Math.min(durationSec / this.Wfault, 1);
    const occupancyTerm = 1 - Op;
    const FS = this.w1 * durationTerm + this.w2 * occupancyTerm + this.w3 * magnitudeTerm;

    let state;
    if (durationSec >= this.Wfault && Op === 0) {
      state = STATE.FAULT;
    } else if (FS >= this.Tfault) {
      state = STATE.FAULT;
    } else if (FS >= this.Tsusp && durationSec >= this.Wsusp) {
      state = STATE.SUSPICIOUS;
    } else {
      state = STATE.NORMAL;
    }

    this._state = state;
    return { state, faultScore: FS, duration: durationSec, Op };
  }

  _resetAnomaly() {
    this._anomalyStart = null;
    this._occupiedSamples = 0;
    this._totalSamples = 0;
  }
}

module.exports = { CAFVANode, STATE };
