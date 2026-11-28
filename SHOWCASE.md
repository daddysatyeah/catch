# Professional showcase library

The 0.2.2 browser showcase adds 45 sample captures on request. It uses the same local storage, extraction, search and Review as personal captures. The catalog carries original text, images and documents. It contains no precomputed embeddings, OCR transcripts, category predictions or ranked search results.

| Group | Count | Captures |
| --- | ---: | --- |
| AI/ML education PDFs | 5 | Field guide to retrieval evaluation, Sentence embeddings in practice, Avoiding leakage in model evaluation, An INT8 quantization lab, An OCR quality worksheet |
| Synthetic receipts | 5 | Fieldwork Studio print receipt, Components bench order, Reading room book receipt, Morning edit café receipt, Workshop materials receipt |
| Fictional travel documents | 4 | Nightline rail reservation, Hearthline guesthouse confirmation, Harbour Loop ferry boarding note, Cedar Valley coach ticket |
| Professional meeting notes | 5 | Search evaluation kickoff, Document review handoff, Research seminar planning notes, Keyboard accessibility review, Search evaluation kickoff draft |
| Educational and technical notes | 8 | When vocabulary does not match, Offline experiment metric checklist, Working note on rank fusion, Reading a SQLite query plan, IndexedDB durability checklist, Testing focus and contrast, The shape of a useful note, A note on paying attention |
| Recreated screenshots | 6 | Evaluation run screenshot, Build log screenshot, Reading room notice screenshot, Workshop timetable screenshot, Query planner screenshot, A field guide to dot matrices |
| Publisher links | 7 | Apple Human Interface Guidelines, Google Machine Learning Crash Course, scikit-learn evaluation, NeurIPS attention paper, Hugging Face LLM course, SQLite query planning, WCAG 2.2 quick reference |
| Productivity notes and tasks | 5 | Weekend list, Weekly study plan, Trip preparation checklist, Receipt reconciliation checklist, Friday knowledge inbox review |

## Try the library

The six collections are **AI & Machine Learning**, **Education & Research**, **Work & Productivity**, **Finance & Receipts**, **Travel**, and **Personal Knowledge**. The retrieval guide, evaluation screenshot, and attention note are pinned on import.

| Try | What Catch computes |
| --- | --- |
| NBS-4821 | Keyword search and, with MiniLM enabled, reference-aware hybrid ranking. |
| graded rubric | Search of page 2 of the retrieval guide after local PDF extraction finishes. |
| how can I make a model smaller? | Local semantic ranking with the optional MiniLM model. |
| Evaluation run screenshot | English OCR can read EVL-5728 after installing the OCR model and enabling image reading. |
| Fieldwork Studio print receipt | Review finds the INR 1,385.00 total and the date in the extracted PDF text. |
| Search evaluation kickoff | Review detects the near-duplicate draft, and rules identify the checklist item and explicit due date. |
| Sentence embeddings in practice | Use **Find related captures** in the inspector. The optional local model ranks related passages. |

## Origin and safety

All attached documents, screenshots, and PDF preview images were made for Catch from the [original catalog](research/showcase-library.json). Receipts, travel operators, times, booking identifiers, and screenshot data are fictional. The attachments contain no personal information, credentials, scannable ticket codes, or payment details. The NeurIPS paper and other third-party items are publisher links. Their PDFs and artwork are not included.

The [render script](scripts/render-showcase.py) uses ReportLab, Poppler, and Pillow. The checked-in assets ship with the web app, and the generator is unnecessary for running or building Catch. PDF files use standard PDF fonts. The preview images come from rendered first pages.

Loading the library stores sample files on this device without fetching AI models. Existing user captures and collections stay in place. On first opening the Phase 1 build, Catch moves recognized legacy demo records to recoverable Trash using recorded demo flags and known IDs. An explicitly imported 0.2.2 library stays active. Catch preserves records whose provenance is unknown, including captures with matching titles or filenames. Removing the showcase moves current examples to Trash. Restoration reuses saved records and their IDs. Purged examples can be fetched again. A sample edited into a personal capture keeps its slot and is preserved.

The showcase is a product demonstration. It does not change the [synthetic research benchmarks](BENCHMARKS.md).

## Verification paths

Run the existing unit and browser suites with the test model files prepared by the [model fetch script](scripts/fetch-models.mjs). The browser suite exercises the actual local runtimes, PDF page evidence, model-assisted retrieval and classification, image OCR, and restoration with networking disabled. The desktop and mobile views are recorded in the [showcase screenshots](docs/showcase/).

For 0.2.2, type checking, lint, 12 unit and integration tests, and eight Chromium end-to-end tests passed. All 14 PDFs were also opened and checked with a separate PDF reader. The documented workflows validate the showcase. They are not a new accuracy benchmark.
