# Cross-device test matrix

"Emulated" means a desktop browser with device metrics. It is **not** a substitute for hardware. Nothing below has been run.

| Target | Role | Method | Status |
|---|---|---|---|
| Chromium 1920×1080 | TV | Playwright `tv-1080p` | Blocked (no build) |
| Chromium Pixel 7 profile | Phone | Playwright `phone-emulated` | Blocked |
| Smart-TV browser (e.g. Chromecast/Android TV) | TV | Physical | Not tested |
| Laptop → HDMI TV, fullscreen | TV | Physical | Not tested |
| iPhone Safari (current, current-1) | Phone | Physical | Not tested |
| Android Chrome, low-end device | Phone | Physical | Not tested |
| Phone on cellular, TV on Wi-Fi | Network | Physical | Not tested |
| Airplane-mode toggle / Wi-Fi drop 10 s | Recovery | Physical | Not tested (logic covered by unit tests on `Backoff`, `LivenessTracker`, `decideRecovery`) |
| Phone sleep / tab background | Recovery | Physical | Not tested |
| Clock skew between devices | Realtime | Unit (`SkewFilter`) | Passed (simulated) |
