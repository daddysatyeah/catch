import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { embeddingAssets, embeddingModel, ocrAssets } from '../src/model-assets.ts'

const sha = input => createHash('sha256').update(input).digest('hex')
for (const asset of [...embeddingAssets, ...ocrAssets]) {
  const directory = asset.name === 'eng.traineddata' ? '.catch-cache/ocr' : path.join('.catch-cache/models', embeddingModel)
  const filename = path.join(directory, asset.name)
  const existing = await readFile(filename).catch(() => undefined)
  if (existing?.length === asset.bytes && sha(existing) === asset.hash) {
    console.log('Verified cache · ' + asset.name)
    continue
  }
  await mkdir(path.dirname(filename), { recursive: true })
  const request = await fetch(asset.url, { signal: AbortSignal.timeout(120_000), credentials: 'omit' })
  if (!request.ok) throw Error('Download failed with HTTP ' + request.status + ' for ' + asset.name)
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length !== asset.bytes || sha(bytes) !== asset.hash) throw Error('Checksum mismatch for ' + asset.name)
  const temporary = filename + '.' + process.pid + '.partial'
  await writeFile(temporary, bytes, { flag: 'wx' })
  await rename(temporary, filename)
  console.log('Verified download · ' + asset.name + ' · ' + asset.bytes + ' bytes')
}
