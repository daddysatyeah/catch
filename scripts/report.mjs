import { mkdir, readFile, writeFile } from 'node:fs/promises'

const results = process.argv[2] === 'rerun' ? '.catch-cache/baseline-rerun' : 'research/results'
const report = JSON.parse(await readFile(results + '/benchmark.json', 'utf8'))
const startup = await readFile(results + '/browser-startup.json', 'utf8').then(JSON.parse).catch(() => undefined)
const { dataset, timing, classification, extraction, ocr } = report
const row = (name, v) => '| ' + name + ' | ' + [v.p5, v.r5, v.mrr, v.ndcg].map(value => value.toFixed(4)).join(' | ') + ' | ' + v.p95Ms.toFixed(2) + ' |'
const label = value => ({ keyword: 'BM25', semantic: 'MiniLM cosine', hybrid: 'Hybrid RRF (k=60)' })[value]
const percent = value => (value * 100).toFixed(2) + '%'
const tables = report.search.map(group => [
  '### ' + group.split[0].toUpperCase() + group.split.slice(1) + ' · ' + group.count + ' queries',
  '',
  '| Method | P@5 | Recall@5 | MRR | nDCG@5 | p95 ms |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...Object.entries(group.modes).map(([key, values]) => row(label(key), values)),
].join('\n')).join('\n\n')
const reportText = [
  '# Catch benchmark results',
  '',
  'Execution started at ' + report.started + '. ' + report.cpu + ', ' + report.logicalProcessors + ' logical processors, ' +
    (report.installedBytes / 1024 ** 3).toFixed(2) + ' GiB available physical RAM, ' + report.os + ', Node ' + report.runtime + '.',
  '',
  'The dataset held ' + dataset.captures + ' captures, ' + dataset.chunks + ' indexed chunks and ' + dataset.queries + ' labeled queries. ' +
    report.model + ' used the fixed revision ' + report.revision + ' with q8 quantization. The benchmark ran native CPU inference with two ONNX intra-op threads.',
  '',
  '## Retrieval',
  '',
  tables,
  '',
  'Development RRF sweep nDCG@5 was ' + report.tuning.map(test => 'k=' + test.k + ' → ' + test.developmentNdcg.toFixed(4)).join(', ') + '. The evaluation reports the app’s fixed k=60 setting.',
  '',
  'Semantic retrieval found the headphone return for an earphone-refund paraphrase (s11-concept) after BM25 missed the top five. BM25 found the capstone upload and related draft for the pagination query (s24-concept) when semantic missed. Hybrid pushed both relevant container-networking results outside the top five on s27-concept after semantic found them at the top. Hybrid beat keyword retrieval in aggregate but trailed semantic on this corpus.',
  '',
  '## Classification',
  '',
  'Held-out accuracy ' + percent(classification.accuracy) + ', macro precision ' + percent(classification.macroPrecision) + ', macro recall ' + percent(classification.macroRecall) +
    ', macro F1 ' + classification.macroF1.toFixed(2) + ', and abstention ' + percent(classification.abstention) + '. These are small-sample results and support keeping a human in the loop.',
  '',
  '| Category | True positives | Predictions | Actual | Precision | Recall | F1 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...classification.perCategory.map(x => '| ' + [x.category, x.correct, x.predicted, x.actual, x.precision.toFixed(2), x.recall.toFixed(2), x.f1.toFixed(2)].join(' | ') + ' |'),
  '',
  '## OCR',
  '',
  'Mean character error rate ' + percent(ocr.cer) + ' and mean word error rate ' + percent(ocr.wer) + ' across ' + ocr.cases.length + ' synthetic English fixtures.',
  '',
  '| Fixture | CER | WER | Elapsed ms |',
  '| --- | ---: | ---: | ---: |',
  ...ocr.cases.map(x => '| ' + [x.fixture, percent(x.cer), percent(x.wer), x.ms.toFixed(2)].join(' | ') + ' |'),
  '',
  'The raw report includes every reference and observed string. OCR error rates were calculated after whitespace normalization. They do not describe handwriting or multilingual performance.',
  '',
  '## Entity extraction',
  '',
  'Exact value and entity-type matches across ' + extraction.fixtureCount + ' authored fixtures.',
  '',
  '| Entity | TP | FP | FN | Precision | Recall | F1 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...extraction.byType.map(x => '| ' + [x.type, x.tp, x.fp, x.fn, x.precision.toFixed(2), x.recall.toFixed(2), x.f1.toFixed(2)].join(' | ') + ' |'),
  '',
  '## CPU and memory',
  '',
  '- MiniLM initialization ' + timing.modelInitMs.toFixed(1) + ' ms.',
  '- English OCR initialization ' + timing.ocrInitMs.toFixed(1) + ' ms.',
  '- Two-page PDF extraction ' + timing.pdfTwoPagesMs.toFixed(1) + ' ms.',
  '- Indexing ' + dataset.chunks + ' chunks in ' + (timing.indexMs / 1000).toFixed(2) + ' s.',
  '- Top-level Node process sampled RSS peaked at ' + timing.sampledPeakRssMb.toFixed(1) + ' MiB, up from a ' + timing.baselineRssMb.toFixed(1) +
    ' MiB baseline. Chromium and Electron full-process footprints were outside this measurement.',
  ...(startup ? ['- Median first inbox heading after navigation was ' + (startup.medianAppReadyMs / 1000).toFixed(2) +
    ' s over ' + startup.trials.length + ' fresh Chromium contexts. This headless measurement includes automation polling. [Startup samples](research/results/browser-startup.json)'] : []),
  '',
  '## Reproduce',
  '',
  '~~~powershell',
  'npm ci',
  'node scripts/fetch-models.mjs',
  'npm run bench',
  'node scripts/report.mjs',
  '~~~',
  '',
  '[Raw benchmark](research/results/benchmark.json) · [Query-level CSV](research/results/retrieval.csv) · [Corpus and judgments](research/results/corpus.json) · [Methodology](RESEARCH.md)',
  '',
].join('\n')
await mkdir('.catch-cache', { recursive: true })
await writeFile('.catch-cache/historical-benchmark-render.md', reportText)
