# Catch test report

## 0.2.1 release gate

| Command or check | Outcome |
| --- | --- |
| `npm run build` | Passed Vite production build and TypeScript, including the `/catch/` preview. |
| `npm run lint` and `npm test` | Lint passed. Eleven unit and integration tests passed. |
| `npm run test:e2e` | Six Chromium tests passed on the rebuilt release. The first run exposed an offline encoder-cache race, which was corrected. |
| `npm audit --json` | Zero reported vulnerabilities at evaluation time. |
| `node scripts/quality-retrieval.mjs development` and `held-out` | Ran actual local ONNX inference, development sweeps and untouched final evaluation. |
| `node scripts/quality-documents.mjs` | Real Tesseract inference, 19 OCR fixtures, plus 30 independent text inputs for extraction regression. |
| `node scripts/quality-performance.mjs release/0.2.1/Catch-win32-x64/Catch.exe` | Passed the 600-capture startup, search, OCR, memory and contrast exercise. |
| `npm run package:windows` | Built the 0.2.1 Windows x64 ZIP and wrote hashes for the ZIP, executable and app archive. |
| `node scripts/windows-clipboard-qa.mjs release/0.2.1/Catch-win32-x64/Catch.exe` | Ten checks passed with both external-interaction flags enabled. Chrome supplied actual text and PNG clipboard writes. Notepad supplied a real copy. The real system shortcut was sent while Chrome was in front. |
| `node scripts/desktop-smoke.mjs release/0.2.1/Catch-win32-x64/Catch.exe` | Ten checks passed on the final package, including invalid IPC, foreign renderer requests, the installed tray menu callbacks, process exit and restart. |
| Portfolio presentation | Seven rendered slides, one editable chart, zero package and layout findings. |

The Windows test uses an isolated Catch library and a separate Chrome profile. It verified startup off, consent, text and image acquisition, suppression, pause and resume, sensitive-text filtering, cross-app hotkey, hide-to-tray, explicit application quit and restart persistence. That run used the 0.2.1 package before the indexing optimization. The final package smoke test exercised the installed tray menu's Open and Exit callbacks through the test driver. The Windows control surface did not expose the notification-area menu as a target window. To verify that UI manually, open Catch with an isolated test library, close its window, open the notification area, select **Open Catch**, then close the window again and select **Exit Catch**. Confirm the process exits. [Windows check receipt](research/results/quality-windows.json)

E2E captured the five expected model GETs and no external HTTP requests while processing synthetic captures and queries. Replay served verified bytes from local cache files. The browser then repeated semantic search, OCR and classification with networking disabled. Tests also covered backup validation, unsafe content as text, keyboard focus and responsive overflow. Browser and packaged smoke tests ran in fresh profiles. No user's private clipboard history was opened.

Computed ratios for sampled text, search highlighting and focus-outline token pairs passed in both themes. The light accent button was the lowest sampled text pair at 4.55:1. Device refresh was 60 Hz. These checks cover the sampled states and do not constitute a full accessibility audit. [Performance and contrast report](BENCHMARKS.md#application-performance-on-windows-11)

## 0.2.0 checkpoint

## Environment

Windows 11 Pro x64, Intel Core i5-7200U with four logical processors and approximately 8 GB RAM, Node 26.13.1 locally, Chromium 158, and Electron 42.11.18. The release preview was tested under a repository-style /catch/ subpath on loopback. Test libraries used built-in examples and isolated synthetic captures.

## Commands and outcomes

| Command or method | Outcome | Evidence |
| --- | --- | --- |
| npm run typecheck | Passed | Strict TypeScript compilation. Also invoked by npm run build. |
| npm run lint | Passed | TypeScript and JavaScript checks. |
| npm test | 8 passed | Normalization, hashing, duplicates, entity validation, heuristic secret filtering, retrieval math, backup checksums, IPC path policy, IndexedDB migration and stale-vector writes. |
| npm run build | Passed | Relative-base production bundle, scoped service worker, local inference assets and content security policy. |
| npm run test:e2e | 6 passed | Keyboard focus, onboarding, responsive behavior, edit/archive/trash, on-device PDF and OCR, actual MiniLM, hybrid evidence, confirmed tasks, backup round trip, DOCX text and oversized attachment rejection. |
| npm run test:e2e -- --grep 'capture, edit\|local export' | 2 passed | Focused recheck that covers confirmed permanent deletion and backup export and merge with networking disabled. |
| npm audit --json | Zero reported vulnerabilities | The audit initially identified an fflate issue. The project uses patched 0.8.3 after compatibility testing. |
| node scripts/fetch-models.mjs | Passed | Verified exact sizes and SHA-256 hashes for five cached artifact files. |
| npm run bench and node scripts/report.mjs | Passed | Measured real inference and extraction. Structured results are under research/results. |
| node scripts/measure-startup.mjs | Passed | Three fresh Chromium contexts reached the first inbox heading in a median 1.30 s at 1440 × 900. The measurement includes browser automation polling. |
| npm run package:windows | Passed | Local Windows x64 folder and portable ZIP with SHA-256 checksums. |
| node scripts/desktop-smoke.mjs release/Catch-win32-x64/Catch.exe | 8 checks passed with the hotkey check enabled | Packaged launch, renderer isolation, opt-in off by default, IPC guard, synthetic monitoring flows, hide-to-tray, persistence and native shortcut activation. |
| Portfolio PowerPoint | Saved and validated | Seven rendered slides, editable chart, package, layout and reimport checks passed. The local authoring runtime exited abnormally after writing the validated file and receipt. |
| Browser and Windows UI inspection | Passed for inspected paths | Looked at the compact inbox, tablet and mobile layouts, direct optional model downloads, scrolled toolbar, and packaged Windows settings. Sent the real global shortcut while the packaged app was active and observed the capture dialog. |

The browser suite replays downloads from locally cached verified public model files for reproducibility. It executes the actual browser WASM models. A separate live browser review downloaded both models from their configured suppliers. Offline browser tests ran with networking disabled after shell and model assets were cached.

Windows monitoring behavior was exercised using synthetic clipboard reads injected into the Windows process. The test deliberately left the actual Windows clipboard untouched. Native shortcut registration and activation were exercised, and the operating system displayed the real app window. Native clipboard image acquisition and cross-application hotkey dispatch were not separately verified. Foreground-app exclusions and automatic launch at sign-in are unimplemented.

## Regressions and limitations

- The inspector now returns keyboard focus to Search when closed with Esc.
- The browser model worker pins its cache lookup even when the upstream library requests a default revision. Tesseract’s English worker initializes with a transient local cache entry. Offline first PDF reading has a cached parser and worker.
- The earlier test runs exposed a mixed test-upload input, browser model initialization defaults, OCR initialization, and first-use offline PDF asset availability. The final browser suite passed after those corrections.
- PDF.js emitted a bundled fallback-font warning in the benchmark. Text extraction and the scanned-PDF fixture completed.
- No formal WCAG conformance audit, screen-reader platform matrix, clipboard image integration matrix, long-load stress run, or 120 Hz measurement was performed.
- Authored research fixtures are synthetic. Larger libraries, additional languages, legacy Office formats and complex scanned pages need separate validation.

## Evidence

[Screenshots](docs/screenshots) · [Benchmark results](BENCHMARKS.md) · [Security and threat model](SECURITY.md) · [Implementation status](IMPLEMENTATION-STATUS.md)
