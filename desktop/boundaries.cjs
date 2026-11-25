const path = require('node:path')

const origin = 'catch://app'
const shortcuts = new Set(['', 'CommandOrControl+Alt+Shift+C', 'CommandOrControl+Alt+Shift+V'])
function appPage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'catch:' && url.hostname === 'app' && !url.port && !url.username && !url.password
  } catch {
    return false
  }
}

function assetPath(value, root) {
  if (!appPage(value)) return undefined
  try {
    const route = decodeURIComponent(new URL(value).pathname).replace(/^\/+/, '') || 'index.html'
    if (!/^[a-z\d][a-z\d/_\-.]*$/i.test(route) || route.split('/').some(part => part === '..' || part === '.')) return undefined
    const resolved = path.resolve(root, route)
    if (!resolved.startsWith(root + path.sep) || route === 'desktop-sensitive.mjs') return undefined
    return resolved
  } catch {
    return undefined
  }
}
function safeExternal(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password ? url.href : undefined
  } catch {
    return undefined
  }
}

function permittedModelHost(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    return url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co') || url.hostname.endsWith('.hf.co') || url.hostname === 'raw.githubusercontent.com'
  } catch {
    return false
  }
}

module.exports = { origin, shortcuts, appPage, assetPath, safeExternal, permittedModelHost }
