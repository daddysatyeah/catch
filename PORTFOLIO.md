# Catch portfolio walkthrough

## Problem

Copied information disappears into different applications. A memory tool should preserve original files and still let a person search the words, ideas and document pages they remember.

## Product contribution

Catch pairs a local clipboard and knowledge inbox with evidence-linked review. Browser users control capture explicitly. The Windows edition adds a tray and opt-in background capture with a conservative text filter. Both editions can export a portable backup and merge it into another profile.

## AI and engineering

MiniLM returns a normalized 384-dimensional vector for each chunk. Cosine ranking retrieves a relevant chunk per capture. The hybrid default combines BM25 and cosine rankings with priority for complete reference codes. English OCR and PDF extraction run on the device. The deterministic entity rules retain original evidence and flag ambiguous calendar conventions. A compact supervised classifier on the same embeddings can abstain before presenting a category suggestion.

The browser uses IndexedDB transactions and a separate verified model cache. The Electron renderer is sandboxed with a small IPC bridge. Expensive recognition runs in workers, and model assets load on demand. Private text is absent from public model requests and products of local inference stay in the library.

## Demonstration

1. Complete onboarding and show the compact returning inbox.
2. Attach an English image and a two-page PDF while explaining the original and derived-text separation.
3. Compare keyword, semantic and hybrid results for a paraphrase and an exact reference number.
4. Open a page-level result. Accept a deadline in Review, then show how the source remains attached.
5. Show Settings and the opt-in model and Windows capture controls. Export and merge a synthetic library.

## Interview preparation

- Explain the IndexedDB migration and how a content signature prevents an interrupted index write from reviving a stale vector.
- Explain why RRF can improve complementary results but still weaken a strong exact match on a small corpus.
- Walk through OCR from image decoding to an English prediction, its OCR-provided confidence and a retained correction.
- Discuss how thresholds trade coverage for category precision and why five held-out synthetic examples per category cannot support a broad reliability claim.
- Discuss the platform boundary. The same web renderer runs in two distinct profiles, and the native shell filters before handing monitored text to the frontend.
- Discuss what failed or remains uncertain. Compare measured results from the benchmark with the assumptions behind the synthetic corpus and the limitations of native clipboard verification.

## Resume entry

Built Catch, a local-first clipboard app for browsers and Windows using React, TypeScript, IndexedDB and Electron. Implemented CPU-only MiniLM search, reference-aware hybrid retrieval, selective classification, and English OCR with evidence-linked review. Reached 84% classification accuracy and 0.874 macro F1 on 50 held-out synthetic captures, and 0.966 nDCG@5 on 50 synthetic retrieval queries. AI assistance was used during implementation and review.
