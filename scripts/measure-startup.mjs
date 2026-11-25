import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const executable = process.env.CATCH_CHROMIUM || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find(existsSync)
const url = process.argv[2] || 'http://127.0.0.1:4281/catch/'
const browser = await chromium.launch({ executablePath: executable })
try {
  const trials = []
  for (let iteration = 0; iteration < 3; iteration++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    try {
      const page = await context.newPage()
      const begin = performance.now()
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.getByRole('heading', { name: 'Copy anything. Forget nothing.' }).waitFor()
      const reading = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0]
        const paint = performance.getEntriesByName('first-contentful-paint')[0]
        return { domContentLoadedMs: +navigation.domContentLoadedEventEnd.toFixed(2), firstContentfulPaintMs: paint ? +paint.startTime.toFixed(2) : null }
      })
      trials.push({ appReadyMs: +(performance.now() - begin).toFixed(2), ...reading })
    } finally { await context.close() }
  }
  const result = { timestamp: new Date().toISOString(), chromium: browser.version(), viewport: '1440x900', trials,
    medianAppReadyMs: trials.map(trial => trial.appReadyMs).sort((a, b) => a - b)[1] }
  await mkdir('.catch-cache/baseline-rerun', { recursive: true })
  await writeFile('.catch-cache/baseline-rerun/browser-startup.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally { await browser.close() }
