/**
 * esp32_node.ino
 * ---------------------------------------------------------------------------
 * Sensor node firmware for the Context-Aware Fault Verification and
 * Networked Maintenance Alert System (R1 Section 9, Components 1-4).
 *
 * STATUS (Review 2): this sketch is written and ready to flash, but has only
 * been exercised in SIMULATE_SENSORS mode on the algorithm side — see
 * simulation/virtual_node.js for the hardware-free validation this logic has
 * actually been through so far. Physical sensor wiring (flow/current/PIR/
 * light/sound) and an ESP32 dev board are the planned Review 3 work; see the
 * Review-2 report's "Updated Feasibility" section for the procurement list.
 *
 * Pin assignments below are for a Wi-Fi + flow + current + PIR + LDR washroom
 * node, matching the worked example in R1 Section 14. Adjust per facility
 * type as described in R1 Section 9 (a bathroom node carries a flow sensor;
 * an electrical-point node carries a current sensor instead).
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include "cafva.h"

// --- Configuration -----------------------------------------------------
#define SIMULATE_SENSORS 1   // set to 0 once real sensors are wired (Review 3)

const char *WIFI_SSID = "HOSTEL-WIFI";
const char *WIFI_PASSWORD = "REPLACE_ME";
const char *SERVER_URL = "http://192.168.1.50:4000/api/events"; // central server

const char *NODE_ID = "WB-B2-04";
const char *FACILITY = "Block B - 2nd Floor Washroom";
const char *LOCATION = "Washbasin tap 3";
const char *SENSOR_TYPE = "flow";

// Pins (adjust to actual wiring at Review 3)
const int PIN_FLOW_PULSE = 27;   // YF-S201 pulse output (interrupt pin)
const int PIN_PIR = 26;          // PIR digital output
const int PIN_LDR = 34;          // LDR analog input

// --- CAFVA configuration for this node's parameter (flow, per R1 Sec. 14) ---
CAFVANode::Config cfg;
CAFVANode *cafva;

// --- Flow-sensor pulse counting -----------------------------------------
volatile uint32_t pulseCount = 0;
void IRAM_ATTR onFlowPulse() { pulseCount++; }

unsigned long lastSampleMs = 0;
const unsigned long SAMPLE_INTERVAL_MS = 1000; // 1 Hz, matches R1 Sec. 9 sampling note

// The YF-S201 datasheet constant: pulses-per-second / 7.5 = flow rate in L/min
float pulsesToLPerMin(uint32_t pulses, unsigned long windowMs) {
  float pulsesPerSec = pulses / (windowMs / 1000.0f);
  return pulsesPerSec / 7.5f;
}

#if SIMULATE_SENSORS
// Reproduces the R1 Section 14 scenario on a bare dev board with no sensors
// wired: a constant 3.2 L/min reading with presence pinned to 0, so the
// escalation SUSPICIOUS -> FAULT can be observed on the Serial monitor and
// (if Wi-Fi is configured) on the live dashboard, ahead of physical sensor
// integration.
float simulatedFlow() { return 3.2f; }
uint8_t simulatedPresence() { return 0; }
#endif

void connectWiFi() {
  Serial.printf("Connecting to Wi-Fi '%s'...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Wi-Fi connected, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("Wi-Fi connection failed - will retry sends but readings still process locally.");
  }
}

// Only ever called for SUSPICIOUS or FAULT classifications - this is the
// bandwidth-saving property that is the core of the invention (R1 Sec. 5-7).
void sendEvent(const CAFVAResult &r, float measuredValue) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("  [!] Wi-Fi not connected, event NOT sent (will be lost - see Review-2 notes on retry/queueing as future work).");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String classification = (r.state == FaultState::FAULT) ? "FAULT" : "SUSPICIOUS";
  String payload = String("{") +
      "\"nodeId\":\"" + NODE_ID + "\"," +
      "\"facility\":\"" + FACILITY + "\"," +
      "\"location\":\"" + LOCATION + "\"," +
      "\"sensorType\":\"" + SENSOR_TYPE + "\"," +
      "\"measuredValue\":" + String(measuredValue, 2) + "," +
      "\"classification\":\"" + classification + "\"," +
      "\"faultScore\":" + String(r.faultScore, 3) + "," +
      "\"durationSeconds\":" + String(r.durationSec, 1) +
      "}";

  int httpCode = http.POST(payload);
  Serial.printf("  -> %s event sent, server responded %d\n", classification.c_str(), httpCode);
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== Hostel Maintenance Sensor Node booting ===");

#if !SIMULATE_SENSORS
  pinMode(PIN_FLOW_PULSE, INPUT_PULLUP);
  pinMode(PIN_PIR, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW_PULSE), onFlowPulse, RISING);
#else
  Serial.println("SIMULATE_SENSORS=1 : running the R1 Section 14 tap-leak scenario without real sensors.");
#endif

  connectWiFi();

  cfg.Lmin = 0.5f;
  cfg.Lmax = 6.0f;
  cfg.Wsusp = 120.0f;
  cfg.Wfault = 300.0f;
  cfg.activityTrigger = true; // see cafva.h / Review-2 report: 'activity' mode
  cafva = new CAFVANode(cfg);

  lastSampleMs = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  unsigned long windowMs = now - lastSampleMs;
  lastSampleMs = now;

  float flow;
  uint8_t presence;

#if SIMULATE_SENSORS
  flow = simulatedFlow();
  presence = simulatedPresence();
#else
  noInterrupts();
  uint32_t pulses = pulseCount;
  pulseCount = 0;
  interrupts();
  flow = pulsesToLPerMin(pulses, windowMs);
  presence = digitalRead(PIN_PIR);
#endif

  CAFVAResult r = cafva->step(flow, presence, now);

  Serial.printf(
      "t=%lus  flow=%.2f L/min  presence=%d  state=%d  FS=%.3f  D=%.0fs\n",
      now / 1000, flow, presence, (int)r.state, r.faultScore, r.durationSec);

  if (r.state == FaultState::SUSPICIOUS || r.state == FaultState::FAULT) {
    sendEvent(r, flow);
  }
  // NORMAL readings are never transmitted - see R1 Sections 5-7.
}
