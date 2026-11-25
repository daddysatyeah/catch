import { packager } from '@electron/packager'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const storage = path.resolve('.catch-cache')
const release = path.resolve('release', manifest.version)
await mkdir(storage, { recursive: true })
await mkdir(release, { recursive: true })
const stage = await mkdtemp(path.join(storage, 'win-stage-'))
await cp('dist', path.join(stage, 'dist'), { recursive: true, errorOnExist: true })
await cp('desktop', path.join(stage, 'desktop'), { recursive: true, errorOnExist: true })
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'catch', productName: 'Catch', version: manifest.version, main: manifest.main, author: 'Catch contributors', description: 'Local-first clipboard and memory' }))
const image = await readFile('public/catch-native.png')
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(image.length, 14)
header.writeUInt32LE(22, 18)
const icon = path.join(stage, 'catch.ico')
await writeFile(icon, Buffer.concat([header, image]))
const [artifact] = await packager({
  dir: stage, name: 'Catch', platform: 'win32', arch: 'x64', electronVersion: manifest.devDependencies.electron, out: release,
  icon, asar: true, prune: false, overwrite: false,
})
if (!artifact) throw new Error('The portable build already exists. Move it to a retention folder before packaging a new copy.')
const portable = path.join(release, 'Catch-' + manifest.version + '-win-x64.zip')
const tar = spawn('tar', ['-a', '-cf', portable, '-C', release, path.basename(artifact)], { stdio: 'inherit', windowsHide: true })
await new Promise((resolve, reject) => {
  tar.once('error', reject)
  tar.once('exit', code => code === 0 ? resolve() : reject(new Error('Portable ZIP creation failed with exit ' + code)))
})
const artifacts = [portable, path.join(artifact, 'Catch.exe'), path.join(artifact, 'resources', 'app.asar')]
const proofs = []
for (const file of artifacts) {
  const hash = createHash('sha256')
  for await (const data of createReadStream(file)) hash.update(data)
  proofs.push(hash.digest('hex') + '  ' + path.relative(release, file).replaceAll('\\', '/'))
}
await writeFile(path.join(release, 'SHA256SUMS.txt'), proofs.join('\n') + '\n')
console.log(proofs.join('\n'))
