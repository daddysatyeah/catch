import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const ocrCases = [
  { id: 'studio-order', lines: ['FIELDWORK STUDIO', 'Order: ZK-4821', 'Total INR 2,450.50', 'Pickup 25/11/2026'], size: 43, ink: '#20201f', background: '#fffdf9' },
  { id: 'university-notice', lines: ['NIGHT LAB ORIENTATION', 'Report is due 17/12/2026', 'Room B-215 at 18:30'], size: 37, ink: '#171717', background: '#f4f3ee' },
  { id: 'travel-board', lines: ['RIVER TERMINAL', 'Reservation: TR-9542', 'Departure 08:45', 'Platform Seven'], size: 29, ink: '#474947', background: '#eeeeeb' },
  { id: 'subtle-print', lines: ['Print Archive', 'Box VELVET-513', 'Tuesday preview window', 'The cabinet opens at 11:15'], size: 21, ink: '#777774', background: '#deded9' },
  { id: 'scanned-invoice', lines: ['TIDELINE SERVICES', 'Invoice: TD-6512', 'Payment due 21/11/2026', 'Total INR 1,23,456.00'], size: 33, ink: '#404046', background: '#f7f6ef' },
]

const esc = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function screenshotFixture(row) {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="880" height="440" viewBox="0 0 880 440"><rect width="880" height="440" fill="' + row.background +
    '"/><rect x="42" y="35" width="796" height="369" rx="10" fill="none" stroke="#9f9e98"/><g fill="' + row.ink +
    '" font-family="Arial, sans-serif" font-size="' + row.size + '">' + row.lines.map((line, i) => '<text x="80" y="' + (108 + i * 66) + '">' + esc(line) + '</text>').join('') + '</g></svg>')
}

function pdfStream(data, properties = '') {
  const bytes = Buffer.from(data)
  return Buffer.concat([Buffer.from('<< /Length ' + bytes.length + ' ' + properties + ' >>\nstream\n'), bytes, Buffer.from('\nendstream')])
}
const quotePdf = value => value.replace(/([()\\])/g, '\\$1')

function pdf(objects) {
  const binaries = [Buffer.from('%PDF-1.4\n%Catch test fixture\n')]
  const offsets = [0]
  let total = binaries[0].length
  objects.forEach((item, index) => {
    offsets.push(total)
    const object = Buffer.concat([Buffer.from((index + 1) + ' 0 obj\n'), Buffer.from(item), Buffer.from('\nendobj\n')])
    binaries.push(object); total += object.length
  })
  const xref = 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' +
    offsets.slice(1).map(value => String(value).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + total + '\n%%EOF\n'
  return Buffer.concat([...binaries, Buffer.from(xref)])
}

export function textPdf(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  pages.forEach((lines, index) => {
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + (5 + index * 2) + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>')
    objects.push(pdfStream('BT /F1 16 Tf 23 TL 45 740 Td ' + lines.map(line => '(' + quotePdf(line) + ') Tj T*').join(' ') + ' ET'))
  })
  return pdf(objects)
}

async function scannedPdf(row) {
  const image = await sharp(screenshotFixture(row)).flatten().jpeg({ quality: 94 }).toBuffer()
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 306] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>',
    pdfStream('q 612 0 0 306 0 0 cm /Im0 Do Q'),
    pdfStream(image, '/Type /XObject /Subtype /Image /Width 880 /Height 440 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'),
  ])
}

export async function generateFixtures(directory) {
  await mkdir(directory, { recursive: true })
  for (const row of ocrCases) await sharp(screenshotFixture(row)).png().toFile(path.join(directory, row.id + '.png'))
  await writeFile(path.join(directory, 'two-pages.pdf'), textPdf([
    ['COASTAL RESEARCH NOTES', 'Survey equipment inventory and storage instructions.'],
    ['FIELD SESSION', 'The survey deadline is 26/11/2026.', 'Reference: QZ-9157'],
  ]))
  await writeFile(path.join(directory, 'scanned-invoice.pdf'), await scannedPdf(ocrCases.at(-1)))
}
