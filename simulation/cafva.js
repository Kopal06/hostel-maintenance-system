/**
 * cafva.js - v1 (first pass)
 * ---------------------------------------------------------------------------
 * Direct implementation of Section 12 (ALGORITHM / METHOD) and Section 13
 * (MATHEMATICAL / TECHNICAL MODEL) from the R1 draft. This first version
 * follows the R1 wording literally: an anomaly is any reading OUTSIDE the
 * [Lmin, Lmax] normal-usage band (Section 12, Step 2).
 */

'use strict';

const STATE = Object.freeze({
  NORMAL: 'NORMAL',
  SUSPICIOUS: 'SUSPICIOUS',
  FAULT: 'FAULT',
});

class CAFVANode {
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

    this._anomalyStart = null;
    this._occupiedSamples = 0;
    this._totalSamples = 0;
    this._state = STATE.NORMAL;
  }

  step(s, p, nowMs) {
    const anomalous = s < this.Lmin || s > this.Lmax;

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
      this._anomalyStart = nowMs;
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
