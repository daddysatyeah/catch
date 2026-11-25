import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const port = Number(process.env.CATCH_PORT ?? 4280)
const scope = process.env.CATCH_SCOPE ?? '/catch/'
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }

createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') throw new Error()
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (!pathname.startsWith(scope)) throw new Error()
    const key = decodeURIComponent(pathname.slice(scope.length)) || 'index.html'
    const resource = path.resolve(root, key)
    if (!resource.startsWith(root + path.sep)) throw new Error()
    const file = await stat(resource)
    if (!file.isFile()) throw new Error()
    response.writeHead(200, { 'content-type': mime[path.extname(resource)] ?? 'application/octet-stream',
      'content-length': file.size, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(resource).pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log('Catch release preview http://127.0.0.1:' + port + scope))
