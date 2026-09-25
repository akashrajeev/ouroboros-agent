# Phase 12A device benchmark protocol

The local sandbox is not Akash's desktop or iQOO phone. These measurements must be run on the actual client hardware; do not paste sandbox process-tree RSS as extension memory.

## Desktop Chrome and Firefox

1. Record OS, CPU, physical RAM, browser name/version, graphics adapter/driver and whether the page is cross-origin isolated. Build the extension at the pinned commit (`npm ci && npm run build --workspace extension`). Install the unpacked Chrome MV3 build and Firefox MV2 build separately. Do not sign in to arbitrary sites for this measurement.
2. Open each extension's `bench.html` page. Start from a fresh browser launch/profile with no other tabs/extensions. Record process ID(s) for extension offscreen/background renderer and GPU process where possible; use the browser's own Task Manager or about:processes, not the sum of all child RSS. Collect private/proportional memory at idle, after model load, at peak image inference and 30 seconds after; collect CPU utilization over a fixed workload interval and list the sampling tool/window. Repeat three cold launches and five warm runs per browser.
3. Run the built-in synthetic card benchmark, recording actual execution provider (`webgpu` or `wasm`), startup/model load, first inference, warm per-image p50/p95, errors and image leak check. If WebGPU cannot obtain an adapter, mark unavailable, do not substitute WASM timing as WebGPU. The existing bench page covers vision models only; NER has to be added to the timed cold/warm step and RAM profile before claiming full-client metrics.
4. On the same hardware and workload, record screen-map observation, rules+NER, image masking, gate, network planner and full step separately. Warm caches between repeated steps and include cold start. Link raw traces and screenshots. No fake CPU% derived from raw wall-clock milliseconds.

## Phone

The browser extension is desktop-oriented; Chrome Android does not run arbitrary Chrome desktop extensions. If a compatible mobile client exists, measure on the actual iQOO device and report its exact model/OS, thermal state, battery and permission state. Otherwise mark phone benchmarks not implemented. A flagship-class guess is not a device measurement.

## State now

Extension builds pass for Chrome and Firefox, and model files total about 39 MB before runtime WASM/cache. None of CPU%, RAM MB, WebGPU time or true client cold/warm latency has a valid real-device result as of 25 September 2026. The shared 2-vCPU sandbox process-tree smoke was excluded from scoring because shared memory double-counts and Firefox extension execution was not confirmed.
