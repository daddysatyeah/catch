# Catch implementation status

## 0.2.1 release gate

| Area | Status | Evidence |
| --- | --- | --- |
| Classification | Verified on fresh synthetic data | 50 held-out samples, 84% accuracy, 0.874 macro F1 and 92% coverage. Auto-suggestions remain opt-in. |
| Retrieval | Verified on fresh synthetic data | 50 held-out queries, selected hybrid 0.966 nDCG@5. MiniLM narrowly leads the paraphrase subset. Historical results retained byte for byte. |
| OCR and extraction | Verified for benchmark fixtures | 19 OCR inputs and 30 labeled entity inputs. The revised rules fixed observed extraction regressions. Faint print and reading order remain limitations. |
| Browser release | Verified locally | Full Chromium suite passed after fixing the offline search runtime cache race. Production build serves under /catch/. |
| Performance and accessibility | Verified for tested paths | 600 added captures, process-tree memory snapshots, keyboard and sampled contrast. Cold indexing still took 58.29 s. The display runs at 60 Hz. |
| Windows artifact | Packaged locally and tested | Real Windows clipboard writes from Chrome and Notepad, cross-application shortcut, hide-to-tray, quit and persistence observed. The executable is unsigned. |
| Portfolio | Updated and validated | Seven-slide deck with the fresh evaluation and editable chart. |
| Publication | Local review ready | Clean source candidate and opt-in Pages workflow. Hosted deployment, signing and broader platform validation remain pending. |

## 0.2.0 checkpoint

The browser prototype was audited in the Catch checkout on 25 November 2026. The existing preview served HTTP 200. The repository had an unborn branch, no remote, and no automated tests. The original 19 source files were archived and verified individually by SHA-256 before edits. The checkpoint is inside .git/catch-checkpoints in this checkout, with archive SHA-256 CE1EA74B030D05CDF2FB35F4D3AB7D799301F4217D60A808CB8FD5D2D8DE7374.

| Area | Status | Evidence or next checkpoint |
| --- | --- | --- |
| Existing source and storage audit | Verified | Reviewed the React tree, lockfile, original IndexedDB schema, Git state, tooling, and live preview. |
| Browser capture, versioned storage, backup and lifecycle | Verified | IndexedDB migration and stale-vector checks passed. Browser capture, edit, archive, trash restoration and binary backup merge passed. |
| Accessibility and visual refinement | Verified for tested paths | Keyboard focus, mobile drawer and overflow checks at six widths passed. Inspected the desktop, tablet and mobile layouts. Full WCAG conformance and 120 Hz are unmeasured. |
| Exact and near duplicates, evidence extraction and review | Verified | Normalization, hashing, overlap, page evidence, date uncertainty and a browser review-to-task flow passed. |
| PDF and English OCR | Verified for tested formats | Browser page evidence, damaged PDF recovery, image OCR and scanned-PDF OCR passed. OCR evaluation covers five printed-English fixtures. Other languages and complex layouts remain unverified. |
| Local models and retrieval | Verified | Real browser and CPU inference, three retrieval modes, classification and offline search executed. Both fixed model downloads also passed in the live preview. |
| Windows shell and release artifact | Verified for tested paths | Portable x64 ZIP and checksums built. Packaged smoke tests, sandbox, tray, restart and the actual global hotkey passed. Clipboard introduction and monitoring used injected synthetic reads. |
| Applied research | Verified | Measured 150 captures, 60 queries, classification, English OCR, extraction and timings. Raw and aggregate results in research/results. |
| Release QA and documentation | Verified locally | Type check, lint, 8 unit/integration tests, 6 end-to-end tests, dependency audit and production build passed. Actual screenshots and a seven-slide deck were validated. Browser publishing and Windows code signing are outside this local release candidate. |

Sequence: storage and capture → navigation and search → extraction and local inference → desktop adapter → evaluation, verification and release preparation.
