# Cross-device test matrix

"Emulated" means a desktop browser with device metrics. It is **not** a substitute for hardware. Nothing below has been run.

| Target | Role | Method | Status |
|---|---|---|---|
| Chromium 1920×1080 | TV | Real-browser harness `npm run test:browser` | Passed (behaviour; no Tailwind, no Next) |
| Chromium 1920×1080 | TV | Playwright `tv-1080p` against Next | Blocked (no build) |
| Chromium 390×844 touch/mobile | Phone | Real-browser harness | Passed (behaviour; emulation, not hardware) |
| Chromium Pixel 7 profile | Phone | Playwright `phone-emulated` against Next | Blocked |
| Smart-TV browser (e.g. Chromecast/Android TV) | TV | Physical | Not tested |
| Laptop → HDMI TV, fullscreen | TV | Physical | Not tested |
| iPhone Safari (current, current-1) | Phone | Physical | Not tested |
| Android Chrome, low-end device | Phone | Physical | Not tested |
| Phone on cellular, TV on Wi-Fi | Network | Physical | Not tested |
| Network offline→online in Chromium | Recovery | Emulated (`setOffline`) | Passed |
| Airplane-mode toggle / Wi-Fi drop 10 s | Recovery | Physical | Not tested |
| Phone sleep / tab background | Recovery | Physical | Not tested |
| Clock skew between devices | Realtime | Unit (`SkewFilter`) | Passed (simulated) |
