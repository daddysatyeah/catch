import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { env, pipeline } from '@huggingface/transformers'
import { createCanvas } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { categories, categoryDescriptions, classify } from '../src/classification.ts'
import { extractEntities } from '../src/entities.ts'
import { embeddingModel, embeddingRevision, vectorVersion } from '../src/model-assets.ts'
import { chunksOf, hybridRanking, keywordRanking, semanticRanking } from '../src/retrieval.ts'
import { makeCorpus } from '../research/scenarios.mjs'
import { generateFixtures, ocrCases } from './fixtures.mjs'

const fixtures = path.resolve('.catch-cache/fixtures')
// Keep the recorded 0.2.0 evidence immutable when rerunning this protocol.
const out = path.resolve('.catch-cache/baseline-rerun')
await mkdir(out, { recursive: true })
await generateFixtures(fixtures)
const started = new Date().toISOString()
const baseline = process.memoryUsage().rss
let rss = baseline
const sample = () => { rss = Math.max(rss, process.memoryUsage().rss) }
const sampler = setInterval(sample, 150).unref()
const elapsed = start => +(performance.now() - start).toFixed(3)

function editDistance(source, target) {
  let previous = Array.from({ length: target.length + 1 }, (_, index) => index)
  for (let row = 1; row <= source.length; row++) {
    const current = [row]
    for (let col = 1; col <= target.length; col++) current[col] = Math.min(current[col - 1] + 1, previous[col] + 1, previous[col - 1] + Number(source[row - 1] !== target[col - 1]))
    previous = current
  }
  return previous.at(-1)
}
const clean = value => value.replace(/\s+/g, ' ').trim()
const percentage = value => Number(value.toFixed(4))
const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const p95 = values => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * .95) - 1)]
const f1 = (precision, recall) => precision + recall ? 2 * precision * recall / (precision + recall) : 0

const ocrStarted = performance.now()
const ocr = await createWorker('eng', 1, { langPath: path.resolve('.catch-cache/ocr'), gzip: false, cacheMethod: 'none' })
const ocrInit = elapsed(ocrStarted)
const ocrResults = []
const realized = new Map()
let pdfTime
async function readPdf(name, mode) {
  const raw = await readFile(path.join(fixtures, name + '.pdf'))
  const loading = getDocument({ data: new Uint8Array(raw), standardFontDataUrl: pathToFileURL(path.resolve('node_modules/pdfjs-dist/standard_fonts') + path.sep).href })
  const doc = await loading.promise
  try {
    const collected = []
    for (let page = 1; page <= doc.numPages; page++) {
      const source = await doc.getPage(page)
      if (mode === 'ocr') {
        const viewport = source.getViewport({ scale: 1.5 })
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        await source.render({ canvas, viewport }).promise
        collected.push({ page, method: 'ocr', attachment: name, text: (await ocr.recognize(canvas.toBuffer('image/png'))).data.text })
      } else {
        const items = await source.getTextContent()
        collected.push({ page, method: 'pdf', attachment: name, text: items.items.map(item => item.str ?? '').join(' ').trim() })
      }
    }
    return collected
  } finally { await loading.destroy() }
}
try {
  for (const entry of ocrCases) {
    const start = performance.now()
    const fixture = entry.id === 'scanned-invoice' ? entry.id + '.pdf' : entry.id + '.png'
    const file = path.join(fixtures, fixture)
    const raw = entry.id === 'scanned-invoice' ? (await readPdf(entry.id, 'ocr'))[0].text :
      (await ocr.recognize(await readFile(file))).data.text
    const measured = elapsed(start)
    const expected = clean(entry.lines.join(' ')), observed = clean(raw)
    const cer = editDistance([...expected], [...observed]) / expected.length
    const words = expected.split(' ')
    const wer = editDistance(words, observed.split(' ')) / words.length
    ocrResults.push({ fixture, expected, observed, cer: percentage(cer), wer: percentage(wer), ms: measured })
    realized.set(entry.id, [{ text: raw.trim(), method: 'ocr', attachment: entry.id, ...(entry.id === 'scanned-invoice' && { page: 1 }) }])
    sample()
  }
  const start = performance.now()
  realized.set('two-pages', await readPdf('two-pages', 'text'))
  pdfTime = elapsed(start)
} finally { await ocr.terminate() }

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = path.resolve(process.env.CATCH_MODEL_DIR || '.catch-cache/models') + path.sep
const modelStart = performance.now()
const model = await pipeline('feature-extraction', embeddingModel, { dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } })
const modelInit = elapsed(modelStart)
const embedTimes = []
async function embed(text) {
  const start = performance.now()
  const vectors = await model(text, { pooling: 'mean', normalize: true })
  try { return vectors.tolist().map(value => Float32Array.from(value)) }
  finally { vectors.dispose(); embedTimes.push(elapsed(start)); sample() }
}

const { clips: sampleClips, queries, collections } = makeCorpus()
const captures = sampleClips.map(clip => {
  const derived = realized.get(clip.fixture)
  return { ...clip, processing: derived ? { status: 'ready', passages: derived } : undefined }
})
const library = { clips: captures, collections }
await writeFile(path.join(out, 'corpus.json'), JSON.stringify({ clips: sampleClips, queries, collections }, null, 2) + '\n')
const indexStart = performance.now()
const chunks = captures.flatMap(clip => chunksOf(clip).map(chunk => ({ ...chunk, id: clip.id })))
const records = new Map(captures.map(clip => [clip.id, { id: clip.id, version: vectorVersion, chunks: [] }]))
for (let offset = 0; offset < chunks.length; offset += 6) {
  const batch = chunks.slice(offset, offset + 6)
  const vectors = await embed(batch.map(chunk => chunk.text))
  batch.forEach(({ id, ...chunk }, index) => records.get(id).chunks.push({ ...chunk, vector: vectors[index] }))
}
const indexMs = elapsed(indexStart)

function evaluate(hits, labels) {
  const top = hits.slice(0, 5)
  const grades = top.map(hit => labels[hit.clip.id] ?? 0)
  const first = hits.findIndex(hit => labels[hit.clip.id] > 0)
  const count = grades.filter(Boolean).length
  const ideal = Object.values(labels).sort((a, b) => b - a).slice(0, 5)
  const gain = values => values.reduce((total, value, index) => total + (2 ** value - 1) / Math.log2(index + 2), 0)
  return { p5: count / 5, r5: count / ideal.length, mrr: first >= 0 ? 1 / (1 + first) : 0,
    ndcg: gain(grades) / gain(ideal), top: top.map(hit => hit.clip.id) }
}

const scored = []
for (const query of queries) {
  const keywordStart = performance.now()
  const lexical = keywordRanking(library, query.query)
  const keywordMs = elapsed(keywordStart)
  const semanticStart = performance.now()
  const [vector] = await embed([query.query])
  const nearest = semanticRanking(captures, [...records.values()], vector)
  const semanticMs = elapsed(semanticStart)
  const fusionStart = performance.now()
  const fused = hybridRanking(lexical, nearest)
  const hybridMs = +((keywordMs + semanticMs) + elapsed(fusionStart)).toFixed(3)
  scored.push({ id: query.id, type: query.type, split: query.split, query: query.query, keyword: { ...evaluate(lexical, query.relevant), ms: keywordMs },
    semantic: { ...evaluate(nearest, query.relevant), ms: semanticMs }, hybrid: { ...evaluate(fused, query.relevant), ms: hybridMs },
    experimentalK: [10, 30, 60].map(k => ({ k, ndcg: evaluate(hybridRanking(lexical, nearest, k), query.relevant).ndcg })) })
}
const tuning = [10, 30, 60].map(k => ({ k, developmentNdcg: percentage(average(scored.filter(row => row.split === 'development').map(row => row.experimentalK.find(item => item.k === k).ndcg))) }))
const search = ['development', 'held-out'].map(split => ({
  split,
  count: scored.filter(row => row.split === split).length,
  modes: Object.fromEntries(['keyword', 'semantic', 'hybrid'].map(mode => {
    const rows = scored.filter(row => row.split === split).map(row => row[mode])
    return [mode, { p5: percentage(average(rows.map(row => row.p5))), r5: percentage(average(rows.map(row => row.r5))),
      mrr: percentage(average(rows.map(row => row.mrr))), ndcg: percentage(average(rows.map(row => row.ndcg))), p95Ms: +p95(rows.map(row => row.ms)).toFixed(2) }]
  })),
}))

const prototypes = await embed(categories.map(category => categoryDescriptions[category]))
const classification = []
for (const [index, clip] of captures.filter(clip => clip.id.endsWith('-main')).entries()) {
  const [vector] = await embed([chunksOf(clip).slice(0, 4).map(chunk => chunk.text).join('\n').slice(0, 1900)])
  const observed = classify(vector, prototypes)
  classification.push({ id: clip.id, split: index % 3 === 0 ? 'development' : 'held-out', expected: clip.category, observed: observed.category ?? null, similarity: observed.similarity, margin: observed.margin })
}
await model.dispose()
const heldClasses = classification.filter(row => row.split === 'held-out')
const perCategory = categories.map(category => {
  const correct = heldClasses.filter(row => row.expected === category && row.observed === category).length
  const predicted = heldClasses.filter(row => row.observed === category).length
  const actual = heldClasses.filter(row => row.expected === category).length
  const precision = correct / (predicted || 1), recall = correct / (actual || 1)
  return { category, correct, predicted, actual, precision: percentage(precision), recall: percentage(recall), f1: percentage(f1(precision, recall)) }
})
const confusion = Object.fromEntries(categories.map(category => [category, Object.fromEntries([...categories, 'Abstained'].map(predicted =>
  [predicted, heldClasses.filter(row => row.expected === category && (row.observed ?? 'Abstained') === predicted).length]))]))

const extractionCases = [
  ['Submit by 25/11/2026', ['deadline:2026-11-25']],
  ['Bought supplies. Total INR 1,23,456.50.', ['amount:INR 123456.50']],
  ['Reply to editor@example.test, then read https://example.test/archive.', ['email:editor@example.test','url:https://example.test/archive']],
  ['Due 03/04/2026; the calendar convention is unknown.', ['deadline:03/04/2026']],
  ['Reference: SD-2941. Gate closes at 18:35.', ['reference:SD-2941','time:18:35']],
  ['The faulty slip reads 31/02/2026 and INR 2,3.', []],
  ['TODO: return the test library book.', ['action:return the test library book.']],
  ['Invoice: CB-4826 and total $35.00.', ['reference:CB-4826','amount:$ 35.00']],
  ['The meeting may happen next Friday.', []],
  ['The normalized date is 2026-12-07.', ['date:2026-12-07']],
  ['The extension was 19:99. Deadline 30/02/2026.', []],
  ['Departure 9:05 am. Follow https://example.test/terminal.', ['time:9:05 am','url:https://example.test/terminal']],
]
const extraction = extractionCases.map(([text, expected], index) => {
  const observed = extractEntities({ id: 'evaluation-' + index, title: 'evaluation', kind: 'text', body: text, created: 0 }).map(entity => entity.type + ':' + entity.value)
  return { text, expected, observed }
})
const extractionTypes = [...new Set(extraction.flatMap(row => [...row.expected, ...row.observed].map(value => value.split(':')[0])))]
const byType = extractionTypes.map(type => {
  let tp = 0, fp = 0, fn = 0
  const starts = item => item.startsWith(type + ':')
  for (const row of extraction) {
    tp += row.observed.filter(value => starts(value) && row.expected.includes(value)).length
    fp += row.observed.filter(value => starts(value) && !row.expected.includes(value)).length
    fn += row.expected.filter(value => starts(value) && !row.observed.includes(value)).length
  }
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1)
  return { type, tp, fp, fn, precision: percentage(precision), recall: percentage(recall), f1: percentage(f1(precision, recall)) }
})

clearInterval(sampler)
const result = {
  started, runtime: process.version, os: os.version(), architecture: process.arch, cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length, installedBytes: os.totalmem(),
  model: embeddingModel, revision: embeddingRevision, quantization: 'q8', engine: 'Transformers.js 4.3.2 with ONNX Runtime Node CPU (2 inference threads)',
  timing: { modelInitMs: modelInit, ocrInitMs: ocrInit, pdfTwoPagesMs: pdfTime, indexMs, embeddingBatchP95Ms: p95(embedTimes),
    baselineRssMb: +(baseline / 1024 ** 2).toFixed(1), sampledPeakRssMb: +(rss / 1024 ** 2).toFixed(1) },
  dataset: { captures: captures.length, chunks: chunks.length, queries: queries.length, development: queries.filter(query => query.split === 'development').length,
    heldOut: queries.filter(query => query.split === 'held-out').length },
  search, tuning, scored,
  classification: { accuracy: percentage(heldClasses.filter(row => row.observed === row.expected).length / heldClasses.length),
    macroPrecision: percentage(average(perCategory.map(row => row.precision))), macroRecall: percentage(average(perCategory.map(row => row.recall))),
    macroF1: percentage(average(perCategory.map(row => row.f1))), abstention: percentage(heldClasses.filter(row => !row.observed).length / heldClasses.length),
    perCategory, confusion, examples: classification },
  ocr: { cer: percentage(average(ocrResults.map(row => row.cer))), wer: percentage(average(ocrResults.map(row => row.wer))), cases: ocrResults },
  extraction: { fixtureCount: extraction.length, byType, examples: extraction },
}
await writeFile(path.join(out, 'benchmark.json'), JSON.stringify(result, null, 2) + '\n')
const csv = ['query,split,type,mode,precision_at_5,recall_at_5,mrr,ndcg_at_5,latency_ms',
  ...scored.flatMap(row => ['keyword', 'semantic', 'hybrid'].map(mode => [row.id, row.split, row.type, mode, row[mode].p5, row[mode].r5, row[mode].mrr, row[mode].ndcg, row[mode].ms].join(',')))].join('\n')
await writeFile(path.join(out, 'retrieval.csv'), csv + '\n')
console.log(JSON.stringify({ dataset: result.dataset, search, tuning, classification: { accuracy: result.classification.accuracy,
  macroF1: result.classification.macroF1, abstention: result.classification.abstention }, ocr: { cer: result.ocr.cer, wer: result.ocr.wer }, timing: result.timing }, null, 2))
