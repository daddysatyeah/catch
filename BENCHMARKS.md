# Catch benchmark results

## 0.2.1 release gate

### Classification on 50 fresh held-out captures

| Method | Accuracy | Macro F1 | Coverage | Accuracy among non-abstained |
| --- | ---: | ---: | ---: | ---: |
| 0.2.0 descriptions and thresholds | 24.0% | 0.346 | 28.0% | 85.7% |
| MiniLM with linear classification head | 84.0% | 0.874 | 92.0% | 91.3% |

The previous independent run found 35% accuracy, 0.40 macro F1 and 45% coverage on 20 examples. On the fresh set, the old .26 similarity and .035 margin thresholds abstained on 36 of 50 examples, and their most frequent failure mode was low coverage. Single-description, maximum and mean multi-prototype, and supervised candidates were scored on 30 development examples. The selected linear head was trained on 40 authored examples and 30 historical scenarios. Its top-two score margin is .02. These scores are not calibrated probabilities.

On development, the best macro F1 at the 80% coverage floor was 0.618 for one description, 0.873 for maximum prototype similarity, 0.818 for mean prototype similarity and 0.896 for the linear head. The selected head accepted 27 of 30 development examples and predicted 26 correctly.

| Category | Correct / 5 | Predictions | F1 |
| --- | ---: | ---: | ---: |
| Education | 4 | 4 | 0.89 |
| Work | 5 | 5 | 1.00 |
| Finance | 5 | 6 | 0.91 |
| Shopping | 4 | 4 | 0.89 |
| Personal | 4 | 7 | 0.67 |
| Travel | 5 | 5 | 1.00 |
| Health | 4 | 4 | 0.89 |
| Tasks | 3 | 3 | 0.75 |
| Technology | 3 | 3 | 0.75 |
| References | 5 | 5 | 1.00 |

Four cases abstained and four were assigned the wrong class. The detailed confusion matrices include the abstained column. Classifying automatically remains opt-in, and users decide whether to accept suggestions. [Development sweep](research/results/quality-development.json) · [Held-out predictions and matrices](research/results/quality-held-out.json)

### Retrieval on 50 fresh held-out queries over 175 captures

| Method | Precision@5 | Recall@5 | MRR | nDCG@5 |
| --- | ---: | ---: | ---: | ---: |
| BM25 | 0.164 | 0.82 | 0.777 | 0.784 |
| MiniLM cosine | 0.148 | 0.74 | 0.648 | 0.664 |
| 0.2.0 hybrid RRF, k=60 | 0.172 | 0.86 | 0.835 | 0.835 |
| Reference-aware hybrid | 0.200 | 1.00 | 0.955 | 0.966 |

Every query has one judged target, so the maximum Precision@5 is 0.20. Half the queries are exact identifiers. BM25 was perfect on identifiers and reached 0.568 nDCG@5 on paraphrases. On paraphrases, MiniLM reached 0.936, old hybrid 0.670, and selected hybrid 0.933. Equal-weight RRF promoted incidental term overlap ahead of passages that expressed the intended meaning. The selected configuration promotes complete reference-code matches. Otherwise it weights the first 10 lexical ranks at .15 and the semantic ranks at 1 with k=20. It is the default with the optional model available. Keyword results remain available during indexing and if inference fails. The benchmark does not establish performance for a broader mix or multi-relevant queries. [Query-level results and timings](research/results/quality-held-out.json)

### Expanded OCR and extraction

The unchanged English OCR engine averaged 6.15% character error and 9.67% word error on 19 synthetic fixtures, including receipts, dark and light screenshots, distorted print, columns, and one scanned PDF. The faint till slip had 69% character error and 100% word error. A two-column statement had 38% character error, largely from reading order. The rupee glyph was misread as a percent sign in one fixture.

On a separate set of 30 labeled text inputs, the old rules matched 42 of 47 entities with nine false positives. Revised rules matched 47 of 47 with zero false positives on those same examples after correcting observed parsing defects. Improvements cover complete currency tokens, negative and grouped amounts, malformed addresses, balanced parentheses in URLs, dates inside links and dotted time suffixes. This is a regression result on inspected fixtures. OCR transcription errors can still propagate to extraction. [Transcriptions and exact-value evidence](research/results/quality-documents.json) · [Before fixes](research/results/quality-documents-baseline.json)

### Application performance on Windows 11

Headless Chromium and packaged Electron ran on an Intel i5-7200U with 8,073 MiB of installed RAM. The stress library adds 600 authored synthetic text captures to the demo profile. Playwright timings include automation and the search debounce where applicable.

| Measurement | Before batching | 0.2.1 final |
| --- | ---: | ---: |
| Chromium cold hybrid indexing and search | 63.80 s | 58.29 s |
| Chromium warm hybrid search | 958 ms | 442 ms |
| Chromium first keyword result | 274 ms | 188 ms |
| Electron first keyword result | 220 ms | 124 ms |

The updated browser median across three fresh contexts was 1.14 s. One fresh Electron process reached the inbox in 2.94 s. Saving the test image and seeing OCR text took 2.37 s in Chromium. A keyboard focus check completed in 227 ms while the browser was indexing. Cold indexing remains the longest wait. Keyword results are available during processing.

| Process tree | Working set | Private committed |
| --- | ---: | ---: |
| Chromium idle | 573.2 MiB | 307.0 MiB |
| Chromium during indexing | 958.4 MiB | 687.8 MiB |
| Chromium after indexing | 933.2 MiB | 659.0 MiB |
| Electron idle | 378.0 MiB | 178.2 MiB |
| Electron with the stress library, keyword mode | 417.1 MiB | 214.6 MiB |

These are Windows process-tree snapshots. Summed working sets can double-count shared pages, and the values are neither peaks nor isolated renderer totals. Chromium measurements include model inference. Electron memory was sampled without models installed. The 60 Hz display was unsuitable for verifying high-refresh rendering. [Raw timing, contrast and memory samples](research/results/quality-performance.json)

## 0.2.0 historical baseline

Execution started at 2026-11-25T05:05:43.255Z. Intel(R) Core(TM) i5-7200U CPU @ 2.50GHz, 4 logical processors, 7.88 GiB available physical RAM, Windows 11 Pro, Node v26.13.1.

The dataset held 150 captures, 307 indexed chunks and 60 labeled queries. Xenova/all-MiniLM-L6-v2 used the fixed revision 751bff37182d3f1213fa05d7196b954e230abad9 with q8 quantization. The benchmark ran native CPU inference with two ONNX intra-op threads.

## Retrieval

### Development · 20 queries

| Method | P@5 | Recall@5 | MRR | nDCG@5 | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| BM25 | 0.3100 | 0.8250 | 0.7833 | 0.7853 | 24.23 |
| MiniLM cosine | 0.3800 | 1.0000 | 0.9667 | 0.9021 | 29.70 |
| Hybrid RRF (k=60) | 0.3200 | 0.8500 | 0.8287 | 0.8140 | 64.05 |

### Held-out · 40 queries

| Method | P@5 | Recall@5 | MRR | nDCG@5 | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| BM25 | 0.2800 | 0.7500 | 0.7514 | 0.7446 | 13.79 |
| MiniLM cosine | 0.3550 | 0.9375 | 0.9635 | 0.9047 | 29.21 |
| Hybrid RRF (k=60) | 0.3200 | 0.8500 | 0.8481 | 0.8439 | 39.53 |

Development RRF sweep nDCG@5 was k=10 → 0.8507, k=30 → 0.8140, k=60 → 0.8140. The evaluation reports the app’s fixed k=60 setting.

Semantic retrieval found the headphone return for an earphone-refund paraphrase (s11-concept) after BM25 missed the top five. BM25 found the capstone upload and related draft for the pagination query (s24-concept) when semantic missed. Hybrid pushed both relevant container-networking results outside the top five on s27-concept after semantic found them at the top. Hybrid beat keyword retrieval in aggregate but trailed semantic on this corpus.

## Classification

Held-out accuracy 35.00%, macro precision 50.00%, macro recall 35.00%, macro F1 0.40, and abstention 55.00%. These are small-sample results and support keeping a human in the loop.

| Category | True positives | Predictions | Actual | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Education | 0 | 0 | 2 | 0.00 | 0.00 | 0.00 |
| Work | 1 | 2 | 2 | 0.50 | 0.50 | 0.50 |
| Finance | 0 | 0 | 2 | 0.00 | 0.00 | 0.00 |
| Shopping | 1 | 2 | 2 | 0.50 | 0.50 | 0.50 |
| Personal | 0 | 0 | 2 | 0.00 | 0.00 | 0.00 |
| Travel | 1 | 1 | 2 | 1.00 | 0.50 | 0.67 |
| Health | 2 | 2 | 2 | 1.00 | 1.00 | 1.00 |
| Tasks | 1 | 1 | 2 | 1.00 | 0.50 | 0.67 |
| Technology | 0 | 0 | 2 | 0.00 | 0.00 | 0.00 |
| References | 1 | 1 | 2 | 1.00 | 0.50 | 0.67 |

## OCR

Mean character error rate 2.56% and mean word error rate 6.67% across 5 synthetic English fixtures.

| Fixture | CER | WER | Elapsed ms |
| --- | ---: | ---: | ---: |
| studio-order.png | 0.00% | 0.00% | 871.42 |
| university-notice.png | 0.00% | 0.00% | 425.29 |
| travel-board.png | 0.00% | 0.00% | 462.11 |
| subtle-print.png | 12.82% | 33.33% | 259.45 |
| scanned-invoice.pdf | 0.00% | 0.00% | 1709.05 |

The raw report includes every reference and observed string. OCR error rates were calculated after whitespace normalization. They do not describe handwriting or multilingual performance.

## Entity extraction

Exact value and entity-type matches across 12 authored fixtures.

| Entity | TP | FP | FN | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| deadline | 2 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| amount | 2 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| email | 1 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| url | 2 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| reference | 2 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| time | 2 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| action | 1 | 0 | 0 | 1.00 | 1.00 | 1.00 |
| date | 1 | 0 | 0 | 1.00 | 1.00 | 1.00 |

## CPU and memory

- MiniLM initialization 959.2 ms.
- English OCR initialization 1129.3 ms.
- Two-page PDF extraction 57.6 ms.
- Indexing 307 chunks in 6.26 s.
- Top-level Node process sampled RSS peaked at 223.5 MiB, up from a 106.2 MiB baseline. Chromium and Electron full-process footprints were outside this measurement.
- Median first inbox heading after navigation was 1.30 s over 3 fresh Chromium contexts. This headless measurement includes automation polling. [Startup samples](research/results/browser-startup.json)

## Reproduce

~~~powershell
npm ci
node scripts/fetch-models.mjs
npm run bench
node scripts/report.mjs rerun
~~~

Reruns write under `.catch-cache`. The 0.2.0 raw outputs are frozen and reflect the original implementation.

[Raw benchmark](research/results/benchmark.json) · [Query-level CSV](research/results/retrieval.csv) · [Corpus and judgments](research/results/corpus.json) · [Methodology](RESEARCH.md)
