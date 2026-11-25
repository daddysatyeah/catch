# Research methodology

## 0.2.1 protocol

- The final synthetic classification and retrieval fixtures were authored before running the development sweep and frozen by SHA-256. The development command reads only development cases. The final command reads the locked selection, runs it alongside the original methods and records the development result hash. The historical fixture outputs remain available separately.
- Classification training used 30 historical primary scenarios and 40 category examples. It reused the q8 MiniLM encoder and compared description scoring, maximum and mean of four prototypes, and L2-regularized multinomial logistic regression. Thirty development samples set the score and separation cutoffs with a minimum 80% coverage constraint. The final set consists of 50 distinct samples, five per class, and reports a confusion matrix including abstentions.
- Retrieval development added 16 distinct documents and 32 queries to the historical capture templates. The final adds 25 other documents and 50 queries instead, with one target per query and 150 common background captures. Original extracted fixture passages are outside this protocol. Equal-weight k=10, 30 and 60, reduced lexical weighting and depth, and exact-reference priority were compared on development data. The held-out run includes only the old RRF, the selected configuration, and the keyword and semantic comparators.
- The new OCR pack tests 19 synthetic printed-English fixtures using several font families, receipts, screenshots, JPEG damage, blur, skew, varying contrast, a two-column layout and a scanned PDF. The recorded mean gives each fixture equal weight. Extraction is scored independently against typed ground truth with exact value and type matching. Revised rules were tested on the same 30 examples that expose the original failures, so those scores describe regression coverage.
- These samples are authored and balanced. Fifty percent of the retrieval queries are exact identifiers. Five evaluated cases per category cannot establish reliability on uncurated user libraries or across languages. Broader evidence requires new independent data.

```powershell
node scripts/fetch-models.mjs
node scripts/quality-retrieval.mjs development
node scripts/quality-retrieval.mjs held-out
node scripts/quality-documents.mjs
```

## 0.2.0 historical protocol

The main question was whether CPU-only hybrid retrieval can improve rediscovery compared with keyword search in a private clipboard library. Secondary questions concern category usefulness, OCR-dependent retrieval, extraction accuracy and resource use on an 8 GB Windows laptop.

## Protocol

- Authored scenario definitions create 150 synthetic captures and 60 queries. Ten categories each contribute three scenarios. Each scenario includes a primary record, a working duplicate and distractors.
- Every scenario has one exact query and one paraphrased or ambiguous query. Graded relevance identifies the primary and related working copy where applicable. Scenario-group splitting gives 20 development and 40 held-out queries. Retrieval searches the full corpus in each split.
- Five generated OCR fixtures use known printed English at different sizes and contrast. One is rasterized in a scanned PDF. A separate two-page PDF exercises page-aware text extraction. The indexed fixture passages come from actual parser output.
- BM25, normalized MiniLM cosine and reciprocal rank fusion use the same captures and judgments. A development-only sweep compares fusion constants. The fixed app configuration uses k=60. The held-out scores describe that configuration.
- Category evaluation uses the primary captures and the same scenario split. The classifier compares against category descriptions written outside the evaluation corpus. It returns raw similarity and abstains using fixed heuristic thresholds.
- Entity evaluation compares rule output to 12 labeled strings. A match requires the correct type and normalized value. OCR reports character and word edit rates after whitespace normalization.

## Interpretation

The benchmark emits test data, raw results, category confusion counts, OCR strings and timings. See [BENCHMARKS.md](BENCHMARKS.md). Node and native ONNX CPU execution are used for reproducible performance measurements. Browser tests exercise the WASM path separately.

Scenario templates and one author’s judgments limit external validity. Classification has only two held-out primary records per category. The OCR set covers printed English and generated fixtures. The measurements should not be generalized to handwriting, multilingual text, complex document layouts or uncurated personal libraries.
