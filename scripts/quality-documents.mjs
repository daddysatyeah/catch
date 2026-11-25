import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'
import { extractCases, imageCases } from '../research/quality-documents.mjs'
import { extractEntities } from '../src/entities.ts'
import { generateFixtures, ocrCases } from './fixtures.mjs'

const directory = path.resolve('.catch-cache/quality-fixtures')
await mkdir(directory, { recursive: true })
await generateFixtures(directory)
const clean = value => value.replace(/\s+/g, ' ').trim()
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function rasterMarkup(row) {
  const width = row.columns ? 900 : 760
  const size = row.size ?? 32
  const height = 90 + row.lines.length * (size + 12)
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect width="100%" height="100%" fill="' +
    (row.background ?? '#f7f5ee') + '"/><path d="M38 38h' + (width - 76) + '" stroke="#999998" opacity=".40"/><g fill="' +
    (row.ink ?? '#252523') + '" font-size="' + size + '" font-family="' + (row.font ?? 'sans-serif') + '">' +
    row.lines.map((line, index) => '<text x="' + (row.columns && index > 2 ? 485 : 48) + '" y="' +
      (61 + size + (index > 2 && row.columns ? index - 2 : index) * (size + 12)) + '">' + esc(line) + '</text>').join('') + '</g></svg>')
}

function editDistance(expected, actual) {
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index)
  for (const [index, token] of expected.entries()) {
    const current = [index + 1]
    for (const [offset, observed] of actual.entries())
      current.push(Math.min(previous[offset + 1] + 1, current[offset] + 1, previous[offset] + Number(token !== observed)))
    previous = current
  }
  return previous.at(-1)
}
const ocr = await createWorker('eng', 1, { langPath: path.resolve('.catch-cache/ocr'), gzip: false, cacheMethod: 'none' })
let rows
try {
  rows = []
  const loading = getDocument({ data: new Uint8Array(await readFile(path.join(directory, 'scanned-invoice.pdf'))) })
  try {
    const scanned = await loading.promise
    const page = await scanned.getPage(1)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvas, viewport }).promise
    const start = performance.now()
    rows.push({ id: 'scanned-invoice', kind: 'scanned PDF', expected: ocrCases.at(-1).lines.join(' '),
      observed: clean((await ocr.recognize(canvas.toBuffer('image/png'))).data.text), ms: performance.now() - start })
  } finally { await loading.destroy() }
  for (const row of imageCases) {
    let image = sharp(rasterMarkup(row))
    if (row.skew) image = image.rotate(row.skew, { background: row.background ?? '#f7f5ee' })
    if (row.blur) image = image.blur(row.blur)
    const imageFile = path.join(directory, row.id + (row.jpeg ? '.jpg' : '.png'))
    await (row.jpeg ? image.jpeg({ quality: row.jpeg }) : image.png()).toFile(imageFile)
    const start = performance.now()
    const { data } = await ocr.recognize(imageFile)
    rows.push({ id: row.id, kind: row.kind, expected: clean(row.lines.join(' ')), observed: clean(data.text), ms: performance.now() - start })
  }
} finally { await ocr.terminate() }
for (const row of rows) {
  row.cer = editDistance([...row.expected], [...row.observed]) / [...row.expected].length
  row.wer = editDistance(row.expected.split(' '), row.observed ? row.observed.split(' ') : []) / row.expected.split(' ').length
}
const extraction = extractCases.map(([text, expected], index) => {
  const observed = extractEntities({ id: 'quality-' + index, title: 'Synthetic capture', body: text, kind: 'text', created: 0 })
    .map(value => value.type + ':' + value.value)
  return { text, expected, observed, missing: expected.filter(value => !observed.includes(value)), extra: observed.filter(value => !expected.includes(value)) }
})
const types = [...new Set(extraction.flatMap(item => [...item.expected, ...item.observed].map(value => value.split(':')[0])))]
const byType = Object.fromEntries(types.map(type => {
  const count = key => extraction.flatMap(row => row[key]).filter(item => item.startsWith(type + ':')).length
  return [type, { tp: count('expected') - count('missing'), fp: count('extra'), fn: count('missing') }]
}))
const total = Object.fromEntries(['tp', 'fp', 'fn'].map(key => [key, Object.values(byType).reduce((sum, row) => sum + row[key], 0)]))
const precision = total.tp / (total.tp + total.fp), recall = total.tp / (total.tp + total.fn)
const result = {
  ocr: { count: rows.length, cer: mean(rows.map(row => row.cer)), wer: mean(rows.map(row => row.wer)), rows },
  extraction: { count: extraction.length, ...total, precision, recall, f1: 2 * precision * recall / (precision + recall), byType, rows: extraction },
}
const suffix = process.argv[2] === 'baseline' ? '-baseline' : ''
await writeFile('research/results/quality-documents' + suffix + '.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ ocr: { count: rows.length, cer: result.ocr.cer, wer: result.ocr.wer },
  extraction: { count: extraction.length, ...total, precision, recall, byType }, failures: extraction.filter(row => row.extra.length || row.missing.length) }, null, 2))
