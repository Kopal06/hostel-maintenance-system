/**
 * cafva.h
 * ---------------------------------------------------------------------------
 * Context-Aware Fault Verification Algorithm (CAFVA) — ESP32 firmware port.
 *
 * This is a deliberate, near line-for-line port of simulation/cafva.js so
 * that behaviour validated in the Node.js simulator (Review 2, no hardware
 * yet) transfers directly to the physical node once it is built (Review 3).
 * Any change to the decision logic must be made in BOTH files and re-run
 * against tests/test_cafva.js.
 *
 * Kept dependency-free (no STL containers beyond what avr-libc/ESP32 core
 * already provides) so it is cheap to run inside the ESP32 main loop.
 */

#ifndef CAFVA_H
#define CAFVA_H

#include <Arduino.h>

enum class FaultState : uint8_t { NORMAL = 0, SUSPICIOUS = 1, FAULT = 2 };

struct CAFVAResult {
  FaultState state;
  float faultScore;   // -1 when not meaningfully computed (e.g. plain NORMAL)
  float durationSec;
  float occupancyOverlap;
  bool immediate; // true if this was an absolute-critical-limit trip
};

class CAFVANode {
 public:
  struct Config {
    float Lmin;
    float Lmax;
    float Wsusp;             // seconds
    float Wfault;             // seconds
    float Tsusp = 0.4f;
    float Tfault = 0.75f;
    float w1 = 0.4f;
    float w2 = 0.4f;
    float w3 = 0.2f;
    float occupancyOverrideRatio = 0.5f;
    bool hasCriticalLimit = false;
    float criticalLimit = 0.0f;
    bool activityTrigger = false; // false = 'band' mode, true = 'activity' mode
  };

  explicit CAFVANode(const Config &cfg) : cfg_(cfg) {}

  /**
   * Feed one processing-cycle reading into the node.
   * @param s filtered sensor reading S(t)
   * @param presence 0 or 1, from the PIR / occupancy sensor
   * @param nowMs current time in ms (pass millis())
   */
  CAFVAResult step(float s, uint8_t presence, unsigned long nowMs) {
    // See simulation/cafva.js for the rationale behind using the *previous*
    // cycle's timestamp as the anomaly's t=0 (avoids under-counting duration
    // by one sample period) — discovered while validating against the R1
    // Section 14 worked example.
    bool havePrev = prevSampleValid_;
    unsigned long prevMs = prevSampleMs_;
    prevSampleMs_ = nowMs;
    prevSampleValid_ = true;

    bool anomalous = cfg_.activityTrigger ? (s > cfg_.Lmin) : (s < cfg_.Lmin || s > cfg_.Lmax);

    // Absolute critical limit -> immediate FAULT
    if (cfg_.hasCriticalLimit && fabsf(s) >= cfg_.criticalLimit) {
      resetAnomaly_();
      state_ = FaultState::FAULT;
      return CAFVAResult{FaultState::FAULT, 1.0f, 0.0f, 0.0f, true};
    }

    if (!anomalous) {
      resetAnomaly_();
      state_ = FaultState::NORMAL;
      return CAFVAResult{FaultState::NORMAL, 0.0f, 0.0f, 0.0f, false};
    }

    if (!anomalyActive_) {
      anomalyActive_ = true;
      anomalyStartMs_ = havePrev ? prevMs : nowMs;
      occupiedSamples_ = 0;
      totalSamples_ = 0;
    }
    totalSamples_ += 1;
    if (presence == 1) occupiedSamples_ += 1;

    float durationSec = (nowMs - anomalyStartMs_) / 1000.0f;
    float Op = totalSamples_ > 0 ? (float)occupiedSamples_ / (float)totalSamples_ : 0.0f;

    if (Op >= cfg_.occupancyOverrideRatio) {
      state_ = FaultState::NORMAL;
      return CAFVAResult{FaultState::NORMAL, -1.0f, durationSec, Op, false};
    }

    float Smid = (cfg_.Lmin + cfg_.Lmax) / 2.0f;
    float magnitudeTerm = fabsf(s - Smid) / (cfg_.Lmax - cfg_.Lmin);
    float durationTerm = fminf(durationSec / cfg_.Wfault, 1.0f);
    float occupancyTerm = 1.0f - Op;
    float FS = cfg_.w1 * durationTerm + cfg_.w2 * occupancyTerm + cfg_.w3 * magnitudeTerm;

    FaultState state;
    if (durationSec >= cfg_.Wfault && Op == 0.0f) {
      state = FaultState::FAULT;
    } else if (FS >= cfg_.Tfault) {
      state = FaultState::FAULT;
    } else if (FS >= cfg_.Tsusp && durationSec >= cfg_.Wsusp) {
      state = FaultState::SUSPICIOUS;
    } else {
      state = FaultState::NORMAL;
    }

    state_ = state;
    return CAFVAResult{state, FS, durationSec, Op, false};
  }

  FaultState currentState() const { return state_; }

 private:
  void resetAnomaly_() {
    anomalyActive_ = false;
    anomalyStartMs_ = 0;
    occupiedSamples_ = 0;
    totalSamples_ = 0;
  }

  Config cfg_;
  bool anomalyActive_ = false;
  unsigned long anomalyStartMs_ = 0;
  uint32_t occupiedSamples_ = 0;
  uint32_t totalSamples_ = 0;
  FaultState state_ = FaultState::NORMAL;

  bool prevSampleValid_ = false;
  unsigned long prevSampleMs_ = 0;
};

#endif  // CAFVA_H
