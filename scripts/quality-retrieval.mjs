import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env, pipeline } from '@huggingface/transformers'
import { scenarios, makeCorpus } from '../research/scenarios.mjs'
import { categories, categoryDescriptions, categoryExamples, categoryScores, decideCategory, linearCategoryScores } from '../src/classification.ts'
import { embeddingModel, vectorVersion } from '../src/model-assets.ts'
import { chunksOf, defaultHybridRanking, hybridRanking, keywordRanking, semanticRanking } from '../src/retrieval.ts'

const split = process.argv[2]
if (!['development', 'held-out'].includes(split)) throw new Error('Choose development or held-out.')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const frozenFixtures = '780d0a7979497aa1d5f5a0dbd45c31edec08f4b481a9fdedd8e4f0e9924450f4'
const fixtureHash = hash(await readFile('research/quality-held-out.mjs'))
if (fixtureHash !== frozenFixtures) throw new Error('The frozen evaluation fixture changed.')
const developmentPath = 'research/results/quality-development.json'
const development = split === 'held-out' ? JSON.parse(await readFile(developmentPath, 'utf8')) : undefined
if (development && development.fixtureHash !== fixtureHash) throw new Error('Run development against the frozen evaluation manifest first.')
const fixtures = await import('../research/quality-' + split + '.mjs')

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = path.resolve('.catch-cache/models') + path.sep
const encoder = await pipeline('feature-extraction', embeddingModel, {
  dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
})
const mean = list => list.reduce((total, value) => total + value, 0) / list.length
const f1 = (precision, recall) => precision + recall ? 2 * precision * recall / (precision + recall) : 0
const p95 = list => [...list].sort((a, b) => a - b)[Math.ceil(list.length * .95) - 1]
async function embed(texts) {
  const out = []
  for (let i = 0; i < texts.length; i += 8) {
    const tensor = await encoder(texts.slice(i, i + 8), { pooling: 'mean', normalize: true })
    try { out.push(...tensor.tolist().map(value => Float32Array.from(value))) }
    finally { tensor.dispose() }
  }
  return out
}

function trainLinear(vectors, labels) {
  const width = vectors[0].length
  const weights = categories.map(() => new Float64Array(width + 1))
  for (let step = 0; step < 180; step++) {
    const gradient = weights.map(() => new Float64Array(width + 1))
    for (const [row, vector] of vectors.entries()) {
      const scores = linearCategoryScores(vector, weights)
      for (const [category, changes] of gradient.entries()) {
        const error = scores[category] - Number(labels[row] === category)
        for (let i = 0; i < width; i++) changes[i] += error * vector[i]
        changes[width] += error
      }
    }
    for (const [category, weight] of weights.entries())
      for (let i = 0; i <= width; i++) weight[i] -= 2 * (gradient[category][i] / vectors.length + .002 * weight[i])
  }
  return weights
}

function summarizeClasses(rows, selection) {
  const predictions = rows.map(({ text, expected, scores }) => ({ text, expected,
    ...decideCategory(scores[selection.method], selection.minimum, selection.separation) }))
  const perCategory = categories.map(category => {
    const actual = predictions.filter(row => row.expected === category).length
    const predicted = predictions.filter(row => row.category === category).length
    const correct = predictions.filter(row => row.expected === category && row.category === category).length
    const precision = correct / (predicted || 1), recall = correct / actual
    return { category, actual, predicted, correct, precision, recall, f1: f1(precision, recall) }
  })
  const accepted = predictions.filter(row => row.category).length
  const correct = predictions.filter(row => row.category === row.expected).length
  const confusion = Object.fromEntries(categories.map(category => [category, Object.fromEntries([...categories, 'Abstained'].map(predicted =>
    [predicted, predictions.filter(row => row.expected === category && (row.category ?? 'Abstained') === predicted).length]))]))
  return { selection, count: rows.length, accuracy: correct / rows.length, macroF1: mean(perCategory.map(row => row.f1)),
    coverage: accepted / rows.length, acceptedAccuracy: correct / (accepted || 1), perCategory, confusion, predictions }
}

const baseline = { method: 'description', minimum: .26, separation: .035 }
const originals = await embed(categories.map(category => categoryDescriptions[category]))
const expanded = await embed(categories.flatMap(category => categoryExamples[category]))
const classCases = categories.flatMap(category => fixtures.classificationCases[category].map(text => ({ text, expected: category })))
const classVectors = await embed(classCases.map(row => row.text))
const classSelection = development?.classification.selected.selection
const runSupervised = !development || classSelection.method === 'supervised'
const training = scenarios.map(([category, title, text]) => ({ label: categories.indexOf(category), text: title + '\n' + text }))
const supervised = runSupervised && (development
  ? JSON.parse(await readFile('src/category-weights.json', 'utf8'))
  : trainLinear(
    [...expanded, ...await embed(training.map(row => row.text))],
    [...categories.flatMap((category, index) => categoryExamples[category].map(() => index)), ...training.map(row => row.label)],
  ).map(row => Array.from(row, value => +value.toFixed(6))))
const classificationRows = classCases.map((row, index) => {
  const vector = classVectors[index]
  return { ...row, scores: {
    description: categoryScores(vector, originals, 'description'),
    'prototype-max': categoryScores(vector, expanded, 'prototype-max'),
    'prototype-mean': categoryScores(vector, expanded, 'prototype-mean'),
    ...(supervised && { supervised: linearCategoryScores(vector, supervised) }),
  } }
})
const classTrials = development ? [] : ['description', 'prototype-max', 'prototype-mean', 'supervised'].flatMap(method =>
  (method === 'supervised' ? [0, .2, .3, .4, .5] : [0, .2, .26, .32, .38]).flatMap(minimum =>
    [0, .01, .02, .035, .055].map(separation => {
      const { accuracy, macroF1, coverage, acceptedAccuracy } = summarizeClasses(classificationRows, { method, minimum, separation })
      return { method, minimum, separation, accuracy, macroF1, coverage, acceptedAccuracy }
    })))
// Reward all-case F1, then fewer guesses at the same F1 and accuracy. A coverage floor prevents degenerate selection.
classTrials.sort((a, b) => b.macroF1 - a.macroF1 || b.accuracy - a.accuracy || a.coverage - b.coverage || b.separation - a.separation || b.minimum - a.minimum)
const winner = classTrials.find(row => row.coverage >= .8)
const selected = classSelection ?? { method: winner.method, minimum: winner.minimum, separation: winner.separation }
const classification = {
  baseline: summarizeClasses(classificationRows, baseline), selected: summarizeClasses(classificationRows, selected),
  ...(classTrials.length && { tuning: classTrials }),
}

const { clips, collections } = makeCorpus()
const queries = []
for (const [index, [title, text, exact, paraphrase]] of fixtures.retrievalCases.entries()) {
  const id = split + '-' + String(index + 1)
  clips.push({ id, title, body: text, kind: 'text', created: index + 1 })
  queries.push({ id: id + '-exact', query: exact, type: 'reference', relevant: id },
    { id: id + '-concept', query: paraphrase, type: 'paraphrase', relevant: id })
}
const library = { clips, collections }
const records = clips.map(clip => ({ id: clip.id, version: vectorVersion, chunks: chunksOf(clip) }))
const chunks = records.flatMap(record => record.chunks)
const startIndex = performance.now()
const vectors = await embed(chunks.map(chunk => chunk.text))
chunks.forEach((chunk, index) => { chunk.vector = vectors[index] })
const indexMs = performance.now() - startIndex
const candidates = [
  { id: 'rrf60', constant: 60, weight: 1 }, { id: 'rrf10', constant: 10, weight: 1 },
  { id: 'rrf30', constant: 30, weight: 1 }, { id: 'semantic-weighted', constant: 30, weight: .35 },
  { id: 'lexical-top10', constant: 20, weight: .15, depth: 10 },
]
const exactGate = { id: 'reference-gate', constant: 20, weight: .15, depth: 10, gate: true }

function fuse(configuration, lexical, nearest, query) {
  if (configuration.gate) return defaultHybridRanking(lexical, nearest, query)
  return hybridRanking(lexical, nearest, configuration.constant, configuration.weight, configuration.depth)
}
function measure(results, expected, ms) {
  const rank = 1 + results.findIndex(hit => hit.clip.id === expected)
  return { rank, p5: rank > 0 && rank <= 5 ? .2 : 0, r5: Number(rank > 0 && rank <= 5),
    mrr: rank ? 1 / rank : 0, ndcg: rank && rank <= 5 ? 1 / Math.log2(rank + 1) : 0, ms, top: results.slice(0, 5).map(hit => hit.clip.id) }
}
const chosenHybrid = development?.retrieval.selectedHybrid
const variants = chosenHybrid ? [candidates[0], ...[chosenHybrid].filter(value => value.id !== candidates[0].id)] : [...candidates, exactGate]
const queryResults = []
for (const item of queries) {
  const startKeyword = performance.now()
  const lexical = keywordRanking(library, item.query)
  const keywordMs = performance.now() - startKeyword
  const startSemantic = performance.now()
  const [queryVector] = await embed([item.query])
  const nearest = semanticRanking(clips, records, queryVector)
  const semanticMs = performance.now() - startSemantic
  const scored = { keyword: measure(lexical, item.relevant, keywordMs), semantic: measure(nearest, item.relevant, semanticMs) }
  for (const configuration of variants) {
    const start = performance.now()
    const hits = fuse(configuration, lexical, nearest, item.query)
    scored[configuration.id] = measure(hits, item.relevant, keywordMs + semanticMs + performance.now() - start)
  }
  queryResults.push({ ...item, scored })
}
await encoder.dispose()
function summarizeQueries(rows) {
  return Object.fromEntries(Object.keys(rows[0].scored).map(mode => {
    const values = rows.map(row => row.scored[mode])
    return [mode, { ...Object.fromEntries(['p5', 'r5', 'mrr', 'ndcg'].map(metric => [metric, mean(values.map(row => row[metric]))])),
      p95Ms: p95(values.map(row => row.ms)) }]
  }))
}
const overall = summarizeQueries(queryResults)
const selectedHybrid = chosenHybrid ?? [...variants].sort((a, b) => overall[b.id].ndcg - overall[a.id].ndcg || overall[b.id].mrr - overall[a.id].mrr)[0]
const retrieval = { clips: clips.length, chunks: chunks.length, indexMs, count: queries.length, overall, selectedHybrid,
  byType: Object.fromEntries(['reference', 'paraphrase'].map(type => [type, summarizeQueries(queryResults.filter(row => row.type === type))])), queries: queryResults }
const result = { split, fixtureHash, ...(development && { developmentHash: hash(await readFile(developmentPath)) }), classification, retrieval }
await writeFile('research/results/quality-' + split + '.json', JSON.stringify(result, null, 2) + '\n')
if (supervised && winner?.method === 'supervised') {
  await writeFile('.catch-cache/category-weights.json', JSON.stringify(supervised) + '\n')
}
console.log(JSON.stringify({ classification: Object.fromEntries(Object.entries(classification).filter(([key]) => key !== 'tuning').map(([key, row]) =>
  [key, { selection: row.selection, accuracy: row.accuracy, macroF1: row.macroF1, coverage: row.coverage, acceptedAccuracy: row.acceptedAccuracy }])),
retrieval: { selectedHybrid, overall } }, null, 2))
