# Changelog

## 0.2.1

- Improved local classification with a compact supervised head and fresh held-out validation.
- Made reference-aware hybrid search the default when the model is available, with keyword fallback.
- Corrected currency, time, deadline, and URL extraction and expanded the OCR benchmark.
- Fixed a race that left the encoder runtime uncached on an offline reload after model installation.
- Batched vector indexing and reused keyword features to cut repeated search work.

## 0.2.0

- Added a compact returning inbox, review, archive, trash, bulk selection and view history.
- Added multi-file capture, content fingerprints, an IndexedDB upgrade and validated backup merge.
- Added local document reading and optional English OCR with source-preserving corrections.
- Added keyword, semantic and hybrid searching, related captures, and evidence-linked review.
- Fixed focus restoration when the inspector opened from search closes.
- Added a sandboxed Windows shell with opt-in clipboard monitoring, a tray and a global shortcut.
- Added regression tests, a 150-capture synthetic evaluation corpus, and release tooling.

## 0.1.0

- Browser design prototype with manual capture, local persistence, collections, keyword search and Catch’s original visual identity.
