import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const runtime = process.env.CATCH_ARTIFACT_MODULES
const skill = process.env.CATCH_PRESENTATIONS_SKILL
const pythonExecutable = process.env.CATCH_ARTIFACT_PYTHON
if (!runtime || !skill || !pythonExecutable) throw new Error('Use the bundled artifact runtime and set CATCH_ARTIFACT_MODULES, CATCH_PRESENTATIONS_SKILL, and CATCH_ARTIFACT_PYTHON.')
process.env.RUNTIME_NODE_MODULES ??= runtime
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtime, '@oai/artifact-tool/dist/artifact_tool.mjs')).href)
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href)
const research = JSON.parse(await readFile('research/results/quality-held-out.json', 'utf8'))
const documents = JSON.parse(await readFile('research/results/quality-documents.json', 'utf8'))
const held = research.retrieval.overall
const temp = path.resolve('.catch-cache/slides-0.2.1')
const destination = path.resolve('release/0.2.1/Catch-portfolio.pptx')
await mkdir(temp, { recursive: true })
await mkdir(path.dirname(destination), { recursive: true })

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } })
const ink = '#171716', paper = '#FCFCFB', muted = '#595956', line = '#DCDCD9', orange = '#D43A1B', dark = '#1C1B19'
const font = 'Arial'
const noLine = { fill: 'none', width: 0 }
function text(slide, value, x, y, w, h, options = {}) {
  const shape = slide.shapes.add({ name: value.slice(0, 45), geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: noLine })
  shape.text = value
  shape.text.style = { fontFamily: font, fontSize: options.size ?? 24, color: options.color ?? ink, bold: !!options.bold,
    verticalAlignment: 'top', wrap: 'wrap', insets: { left: 0, top: 0, right: 0, bottom: 0 } }
  return shape
}
function rule(slide, x, y, w, color = line) {
  slide.shapes.add({ geometry: 'rect', position: { left: x, top: y, width: w, height: 2 }, fill: color, line: noLine })
}
function frame(title, note, color = paper) {
  const slide = presentation.slides.add()
  slide.background.fill = color
  if (title) { text(slide, title, 70, 49, 1140, 60, { size: 43, bold: true, color: color === dark ? paper : ink }); rule(slide, 70, 119, 1140, color === dark ? '#4B4A46' : line) }
  if (note) slide.speakerNotes.text = note
  return slide
}
async function picture(slide, file, x, y, w, h, alt) {
  const bytes = await sharp(file).resize(w, h, { fit: 'contain', background: '#ffffff00' }).png().toBuffer()
  slide.images.add({ blob: bytes, contentType: 'image/png', fit: 'contain', alt, position: { left: x, top: y, width: w, height: h } })
}
function entry(slide, y, title, copy, x = 70, w = 472) {
  text(slide, title, x, y, w, 26, { bold: true, size: 23 })
  text(slide, copy, x, y + 32, w, 90, { size: 20, color: muted })
}

const cover = frame('', 'Catch is an independent portfolio project built with AI assistance. The aperture is generated artwork documented in ASSETS.md.')
rule(cover, 73, 164, 56, orange)
text(cover, 'Catch', 70, 186, 620, 133, { size: 112, bold: true })
text(cover, 'Copy anything.\nForget nothing.', 73, 326, 530, 104, { size: 41, bold: true })
text(cover, 'A local-first clipboard and personal retrieval app for browsers and Windows', 74, 462, 492, 86, { size: 23, color: muted })
await picture(cover, 'public/catch-aperture.webp', 669, 116, 502, 487, 'Catch optical-glass aperture on a transparent background')

const product = frame('Copied information needs a way back', 'Source: actual production browser screenshot, docs/screenshots/inbox-light.png. The capture titles belong to a synthetic demo library.')
entry(product, 167, 'Capture with context', 'Save notes, URLs, screenshots and files. Keep originals and use collections or tags.')
entry(product, 293, 'Find what you remember', 'Search exact terms or concepts. Open the supporting excerpt and its page.')
entry(product, 419, 'Check the evidence', 'Review suggested categories, dates and actions before using them.')
await picture(product, 'docs/screenshots/inbox-light.png', 568, 166, 641, 401, 'Integrated compact Catch inbox')

const architecture = frame('Processing stays in the local profile', 'Source: ARCHITECTURE.md and PRIVACY.md. Browser and Windows libraries have distinct origins and can be moved using a portable JSON backup.')
const steps = [
  ['Capture', 'Manual browser capture or opt-in Windows clipboard'],
  ['Preserve', 'Versioned IndexedDB records, original Blob handles and SHA-256'],
  ['Read', 'PDF.js and optional English OCR preserve page evidence'],
  ['Retrieve', 'MiniLM vectors, BM25 and human review'],
]
for (const [index, [name, copy]] of steps.entries()) {
  const x = 72 + index * 291
  rule(architecture, x, 224, 237, index === 0 ? orange : line)
  text(architecture, name, x, 258, 236, 35, { size: 29, bold: true })
  text(architecture, copy, x, 308, 237, 140, { size: 20, color: muted })
  if (index < steps.length - 1) text(architecture, '→', x + 248, 257, 32, 40, { size: 23, color: orange })
}
text(architecture, 'Fixed model files are downloaded on request. Queries and captures stay on the device.', 72, 536, 1070, 66, { size: 23, bold: true })

const search = frame('The same library supports three ways to search', 'Sources: src/retrieval.ts, src/inference.ts and docs/screenshots/hybrid-search.png. Explain why a result is based on a passage and why cosine is not a probability.')
entry(search, 157, 'BM25', 'Rewards rare matching terms and accounts for capture length.')
entry(search, 275, 'MiniLM cosine', 'Encodes overlapping chunks into 384-dimensional vectors and returns the best passage.')
entry(search, 394, 'Hybrid', 'Gives exact reference matches priority and limits the influence of weaker keyword hits.')
await picture(search, 'docs/screenshots/hybrid-search.png', 574, 169, 620, 407, 'Actual hybrid search dialog with local results')

const results = frame('Reference-aware hybrid led on the new test', 'Sources: research/results/quality-held-out.json and BENCHMARKS.md. The 50 held-out queries have a single judged target each. Half are identifier searches. On paraphrases alone, MiniLM scored slightly higher than selected hybrid at nDCG@5. The historical test is preserved separately.')
results.charts.add('bar', {
  position: { left: 76, top: 159, width: 672, height: 420 },
  title: 'Held-out nDCG@5', categories: ['BM25', 'MiniLM', 'RRF 60', 'Selected hybrid'],
  series: [{ name: 'nDCG@5', values: ['keyword', 'semantic', 'rrf60', research.retrieval.selectedHybrid.id].map(mode => +held[mode].ndcg.toFixed(3)), fill: orange }], hasLegend: false,
  dataLabels: { showValue: true, position: 'outEnd', textStyle: { typeface: font, fontSize: 15 } },
  xAxis: { textStyle: { typeface: font, fontSize: 15 } },
  yAxis: { textStyle: { typeface: font, fontSize: 14 }, minimumScale: 0, maximumScale: 1, majorUnit: .2, majorGridlines: { fill: line, width: 1 } },
})
entry(results, 176, '175 captures, 50 fresh queries', 'Half the queries ask for an exact identifier. MiniLM led slightly on paraphrases alone.', 782, 420)
entry(results, 296, 'Classification improved', 'The linear head reached 84% accuracy and 0.874 macro F1 on 50 held-out examples.', 782, 420)
entry(results, 416, 'Suggestions stay opt-in', 'Coverage was 92%. Accepted predictions were correct 91.3% of the time.', 782, 420)

const evidence = frame('OCR and deadlines stay tied to their evidence', 'Sources: docs/screenshots/ocr-result.png, src/entities.ts, and research/results/quality-documents.json. The fixture set includes difficult low-contrast, skewed and multi-column documents. Exact entity extraction was evaluated separately from OCR transcription.')
entry(evidence, 162, 'English OCR', 'Tesseract reads supported screenshots and scanned PDF pages. The original image stays available.')
entry(evidence, 291, 'Structured details', 'Rules retain the supporting excerpt and flag ambiguous dates. Explicit approval turns an action into a task.')
entry(evidence, 420, 'Measured error', (documents.ocr.cer * 100).toFixed(2) + '% mean character error on 19 synthetic English fixtures. Faint till print and columns were hardest.')
await picture(evidence, 'docs/screenshots/ocr-result.png', 580, 165, 611, 398, 'Catch inspector showing real OCR text from a synthetic station image')

const end = frame('Decisions and trade-offs to discuss', 'This project used AI assistance. Explain the implemented decision and its test evidence independently. See PORTFOLIO.md for more interview prompts.', dark)
const endNotes = [
  ['Why CPU-only?', 'A pinned q8 model runs on the available 8 GB Windows laptop and can work after its resources are cached.'],
  ['Why keep reviewers in the loop?', 'The classifier can abstain or mislabel a capture, and some extracted dates have more than one interpretation.'],
  ['What still needs validation?', 'Real-world retrieval and classification, multilingual OCR, and broader desktop and browser coverage.'],
]
endNotes.forEach(([heading, copy], index) => {
  const y = 166 + index * 137
  text(end, heading, 72, y, 420, 60, { size: 28, bold: true, color: '#F87558' })
  text(end, copy, 531, y + 1, 626, 82, { size: 23, color: paper })
})

for (const [index, slide] of presentation.slides.items.entries()) {
  const image = await presentation.export({ slide, format: 'png', scale: 1 })
  await writeFile(path.join(temp, 'slide-' + (index + 1) + '.png'), new Uint8Array(await image.arrayBuffer()))
}
const candidatePath = path.join(temp, 'candidate.pptx')
await (await PresentationFile.exportPptx(presentation)).save(candidatePath)
await finalizePresentation({
  workspaceDir: process.cwd(), candidatePath, finalPath: destination, pythonExecutable,
  explicitTotalSlideCount: 7, requiredNativeChartOwnerSlides: [5], materializeLiteralChartWorkbooks: true,
  integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000'],
  fontPolicy: { basis: 'design', families: ['Arial'] }, verifyArtifactToolImport: true, receiptPath: path.join(temp, 'validation.json'),
})
console.log(destination)
