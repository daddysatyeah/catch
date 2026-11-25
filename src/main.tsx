import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App/>)

if (import.meta.env.PROD && !window.catchDesktop && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => undefined)
  }, { once: true })
}
