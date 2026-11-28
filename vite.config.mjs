import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { defineConfig, loadEnv } from 'vite'
import { firebaseDomain } from './src/account.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const domain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
  const project = env.VITE_FIREBASE_PROJECT_ID?.trim()
  const authOrigin = domain && project && firebaseDomain(project, domain) &&
    env.VITE_FIREBASE_API_KEY?.trim() && env.VITE_FIREBASE_APP_ID?.trim() ? 'https://' + domain : ''
  const authScripts = authOrigin ? ' https://apis.google.com https://www.gstatic.com' : ''
  const authConnections = authOrigin ? ' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com ' + authOrigin : ''
  return {
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
          "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'" + authScripts, "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'", "font-src 'self'",
          "img-src 'self' blob: data:" + (authOrigin ? ' https://*.googleusercontent.com https://googleusercontent.com' : ''),
          "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com" + authConnections,
          authOrigin ? 'frame-src ' + authOrigin + ' https://accounts.google.com https://apis.google.com' : "frame-src 'none'",
          "object-src 'none'", "base-uri 'none'", "form-action 'none'",
        ].join('; ') }, injectTo: 'head-prepend' },
      ]
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(output => output.type === 'chunk' && output.isEntry && output.facadeModuleId?.endsWith('index.html'))
      const files = Object.keys(bundle)
      const shell = ['index.html', 'catch.svg', 'catch-aperture.webp', ...files.filter(file =>
        (/\.(css|woff2?)$/.test(file) && !file.includes('/privacy-portal-')) || /\/(?:pdf[-.]|extraction-|category-weights-)/.test(file))]
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
  }
})
