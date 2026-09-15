# Context-Aware Fault Verification & Networked Maintenance Alert System

Working implementation accompanying the Review-2 submission. This repository
turns the Review-1 patent-specification draft (architecture, CAFVA algorithm,
mathematical model) into running code.

**Hardware status:** no physical ESP32/sensors procured yet — that is the
planned Review-3 milestone. Everything here runs today as a software
simulation that (a) implements the *exact* decision logic the firmware will
use, and (b) exercises the full server + dashboard pipeline end-to-end.

## Repository layout

```
firmware/esp32_node/    Arduino sketch + CAFVA header for the real ESP32 node
                         (written and ready to flash once hardware arrives;
                         SIMULATE_SENSORS=1 lets it run on a bare dev board)
simulation/             Node.js virtual sensor nodes standing in for hardware
  cafva.js              Reference implementation of the CAFVA algorithm
  scenarios.js          Sensor traces incl. R1 Section 14's worked example
  virtual_node.js        Runs 5 virtual nodes against the live server
server/                 Express + SQLite + WebSocket central server
dashboard/              Multi-page maintenance dashboard (no build step)
  index.html             Overview: metrics + preview of alerts/nodes
  alerts.html             Full active-alerts list, acknowledge/resolve
  log.html                Full permanent event history, filter + CSV export
  nodes.html              Every registered sensor node + its lifetime stats
  metrics.html            Timeline chart + breakdown by sensor type
  about.html              Architecture/algorithm explainer for reviewers
  shared/                 nav.js (shared nav bar) + api.js (fetch/WebSocket helpers)
tests/test_cafva.js    Validates CAFVA against the R1 worked example
docs/                   Architecture diagrams for the Review-2 report
```

## Running it

```bash
# 1. Install server dependencies (one-time)
cd server && npm install

# 2. Start the central server + dashboard
npm start
# -> Dashboard at http://localhost:4000

# 3. In a second terminal, run the virtual sensor nodes
cd ..
node simulation/virtual_node.js

# 4. Run the algorithm test suite
node tests/test_cafva.js
```

Watch the dashboard update live as the virtual nodes report Suspicious and
Fault events — and notice that the "normal usage" control node (an occupied
shower) never appears on the dashboard at all, which is the point of the
invention.

The dashboard is a real multi-page site (separate HTML pages with normal
`<a href>` navigation, not a client-side-routed single-page app):
Dashboard, Active Alerts, Event Log, Nodes, Metrics, and About, linked via
a shared nav bar (`dashboard/shared/nav.js`).

## What's real vs. simulated right now

| Piece | Status |
|---|---|
| CAFVA algorithm (edge classification logic) | Implemented in JS and C++, unit-tested against R1's own worked example |
| Central server (REST API, SQLite, WebSocket push) | Fully working |
| Web dashboard (live alerts, acknowledge/resolve, metrics) | Fully working |
| ESP32 firmware structure (Wi-Fi, HTTP POST, sensor pin plan) | Written, compiles logically against the Arduino/ESP32 API, **not yet flashed to real hardware** |
| Physical sensors (flow, current, PIR, LDR, sound/vibration) | Not yet procured — Review 3 |

See the Review-2 report for design justification, updated cost/feasibility
figures, problems encountered while building this, and individual
contribution logs (commit history).
