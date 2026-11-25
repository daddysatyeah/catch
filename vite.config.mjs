import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  server: { headers: { 'Referrer-Policy': 'no-referrer' } },
  plugins: [{
    name: 'catch-production',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: [
          "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' blob: data:",
          "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com",
          "object-src 'none'", "base-uri 'none'", "form-action 'none'",
        ].join('; ') }, injectTo: 'head-prepend' },
      ]
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(output => output.type === 'chunk' && output.isEntry && output.facadeModuleId?.endsWith('index.html'))
      const files = Object.keys(bundle)
      const shell = ['index.html', 'catch.svg', 'catch-aperture.webp', ...files.filter(file =>
        /\.(css|woff2?)$/.test(file) || /\/(?:pdf[-.]|extraction-|category-weights-)/.test(file))]
      if (entry) shell.push(entry.fileName, ...entry.imports)
      const semanticRuntime = files.filter(file => /\/(?:model-worker-|ort-wasm-)/.test(file))
      const revision = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12)
      const serviceWorker = readFileSync(new URL('./scripts/offline-sw.js', import.meta.url), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: 'const REVISION = ' + JSON.stringify(revision) +
        ';\nconst SHELL = ' + JSON.stringify([...new Set(shell)]) + ';\nconst SEMANTIC = ' + JSON.stringify(semanticRuntime) + ';\n' + serviceWorker })
      const protection = readFileSync(new URL('./src/sensitive.ts', import.meta.url), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'desktop-sensitive.mjs', source: stripTypeScriptTypes(protection) })
    },
  }],
})
