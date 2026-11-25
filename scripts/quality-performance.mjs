import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, chromium, expect } from '@playwright/test'
import { embeddingAssets, embeddingModel, ocrAssets } from '../src/model-assets.ts'
import { generateFixtures } from './fixtures.mjs'

const execute = promisify(execFile)
const url = 'http://127.0.0.1:4281/catch/'
const chrome = process.env.CATCH_CHROMIUM || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
const packaged = path.resolve(process.argv[2] ?? 'release/0.2.1/Catch-win32-x64/Catch.exe')
const ocrFixture = path.resolve('.catch-cache/fixtures/travel-board.png')
if (!existsSync(ocrFixture)) await generateFixtures(path.dirname(ocrFixture))
const ready = page => page.getByRole('heading', { name: 'Copy anything. Forget nothing.' }).waitFor()
const button = (root, name) => root.getByRole('button', { name, exact: true })
const ms = start => +(performance.now() - start).toFixed(2)
const size = 600
const result = { system: { cpu: os.cpus()[0].model, installedMiB: Math.round(os.totalmem() / 1024 ** 2), platform: os.version() }, size,
  chromium: {}, electron: {} }

async function memory(parent) {
  const script = `$tree = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
    $known = [System.Collections.Generic.HashSet[uint32]]::new()
    [void]$known.Add(${parent})
    do {
      $count = $known.Count
      foreach ($item in $tree) { if ($known.Contains($item.ParentProcessId)) { [void]$known.Add($item.ProcessId) } }
    } while ($count -ne $known.Count)
    $samples = @(Get-Process -Id @($known) -ErrorAction SilentlyContinue)
    @{processes=$samples.Count; workingSetMiB=[math]::Round((($samples | Measure-Object WorkingSet64 -Sum).Sum / 1MB),1)
      privateCommitMiB=[math]::Round((($samples | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB),1)} | ConvertTo-Json -Compress`
  const response = await execute('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 20_000 })
  return JSON.parse(response.stdout)
}

async function populate(page) {
  return page.evaluate(count => new Promise((resolve, reject) => {
    const open = indexedDB.open('catch-library', 2)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const write = db.transaction('clips', 'readwrite')
      const store = write.objectStore('clips')
      const areas = ['canal lighting', 'wind maps', 'birch joinery', 'lecture revision', 'rail repair', 'document printing', 'camp gear', 'museum display']
      const materials = ['steel', 'cedar', 'metal', 'glass', 'copper', 'wool', 'felt', 'paper', 'oak', 'nylon']
      for (let index = 0; index < count; index++) {
        const key = 'stress-' + index
        const match = index === count - 1
        const title = match ? 'Glacier relay manual' : areas[index % areas.length] + ' field note ' + index
        const body = match ? 'An emergency signal repeater sends radio messages across the ice ridge. Reference GE-790411.' :
          'Archive log ' + index + '. Inspect the ' + materials[index % materials.length] + ' materials and update the maintenance checklist. ' +
          'Compare the spare parts with the original equipment and check the location before booking a work session.'
        store.put({ id: key, title, body, kind: 'text', created: 1_780_000_000_000 + index })
      }
      write.oncomplete = () => { db.close(); resolve(count) }
      write.onabort = () => { db.close(); reject(write.error) }
    }
  }), size)
}

async function contrast(page) {
  return page.evaluate(() => {
    const rgb = value => {
      const hex = value.trim().replace('#', '')
      const expanded = hex.length === 3 ? [...hex].map(digit => digit.repeat(2)).join('') : hex
      return expanded.match(/../g).map(part => parseInt(part, 16) / 255)
    }
    const relative = color => rgb(color).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries([
      ['body', '--ink', '--page'], ['muted', '--muted', '--surface'], ['accentLabel', '--reverse', '--accent'],
      ['searchMatch', '--accent-ink', '--accent-wash'], ['focusOutline', '--accent-ink', '--surface'],
    ].map(([name, foreground, background]) => {
      const values = [relative(style.getPropertyValue(foreground)), relative(style.getPropertyValue(background))].sort((a, b) => b - a)
      return [name, +( (values[0] + .05) / (values[1] + .05)).toFixed(2)]
    }))
  })
}

const instance = await chromium.launchServer({ executablePath: chrome })
const browser = await chromium.connect(instance.wsEndpoint())
try {
  const startup = []
  for (let count = 0; count < 3; count++) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const start = performance.now()
    await page.goto(url)
    await ready(page)
    startup.push(ms(start))
    await context.close()
  }
  result.chromium.startupMs = startup
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(url)
  await ready(page)
  result.chromium.idle = await memory(instance.process().pid)
  result.chromium.lightContrast = await contrast(page)
  await button(page, 'Settings').click()
  await button(page, 'Dark').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  result.chromium.darkContrast = await contrast(page)
  for (const metrics of [result.chromium.lightContrast, result.chromium.darkContrast]) {
    assert.ok(metrics.focusOutline >= 3)
    for (const [role, value] of Object.entries(metrics)) if (role !== 'focusOutline') assert.ok(value >= 4.5, role)
  }
  await button(page, 'Light').click()
  assert.equal(await populate(page), size)
  await page.reload()
  await page.getByRole('heading', { name: 'Local models' }).waitFor()
  for (const asset of [...embeddingAssets, ...ocrAssets]) {
    const disk = asset.name === 'eng.traineddata' ? path.join('.catch-cache/ocr', asset.name) :
      path.join('.catch-cache/models', embeddingModel, asset.name)
    await context.route(asset.url, route => route.fulfill({ path: disk, headers: { 'access-control-allow-origin': '*' } }))
  }
  const row = text => page.locator('.settings-row').filter({ hasText: text }).first()
  const semantic = row('Semantic search and categories'), ocr = row('English OCR')
  await button(semantic, 'Download').click()
  await semantic.getByText('Installed', { exact: true }).waitFor({ timeout: 50_000 })
  await button(ocr, 'Download').click()
  await ocr.getByText('Installed', { exact: true }).waitFor({ timeout: 25_000 })
  await page.getByRole('switch', { name: 'Read image attachments' }).click()
  await page.getByRole('button', { name: /^Inbox/ }).first().click()
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Search captures' })
  const field = dialog.getByRole('searchbox')
  const state = dialog.locator('.search-label')
  await button(dialog, 'Keyword').click()
  const startKeyword = performance.now()
  await field.fill('GE-790411')
  await dialog.getByRole('button', { name: /Glacier relay manual/ }).first().waitFor()
  result.chromium.keywordMs = ms(startKeyword)
  await field.fill('emergency communications over a frozen ridge')
  const startIndex = performance.now()
  await button(dialog, 'Hybrid').click()
  await expect(state).toHaveText(/Checking index|Searching locally|Preparing the local index/, { timeout: 8_000 })
  const progressSample = memory(instance.process().pid)
  const keyStart = performance.now()
  await field.press('End')
  await expect(field).toBeFocused()
  result.chromium.workerKeyboardMs = ms(keyStart)
  await expect(state).toHaveText(/^\d+ matches$/, { timeout: 180_000 })
  await dialog.getByRole('button', { name: /Glacier relay manual/ }).first().waitFor()
  result.chromium.coldIndexAndSearchMs = ms(startIndex)
  result.chromium.indexing = await progressSample
  const warm = performance.now()
  await field.fill('radio relay over ice')
  await expect(state).toHaveText(/^\d+ matches$/, { timeout: 25_000 })
  result.chromium.warmSearchMs = ms(warm)
  result.chromium.withIndex = await memory(instance.process().pid)
  await button(dialog, 'Close search').click()
  await button(page, 'New capture').click()
  const capture = page.getByRole('dialog', { name: 'New capture' })
  await capture.getByRole('textbox', { name: /^Title/ }).fill('Clipboard release OCR sample')
  await capture.locator('input[type=file]').first().setInputFiles(ocrFixture)
  const ocrStart = performance.now()
  await button(capture, 'Save capture').click()
  await page.getByRole('button', { name: /Clipboard release OCR sample/ }).first().click()
  await page.getByRole('dialog').getByText(/TR-9542/).first().waitFor({ timeout: 48_000 })
  result.chromium.saveAndOcrMs = ms(ocrStart)
  await context.close()
} finally {
  await browser.close()
  await instance.close()
  await writeFile('research/results/quality-performance.json', JSON.stringify(result, null, 2) + '\n')
}

await mkdir('.catch-cache', { recursive: true })
const profile = await mkdtemp(path.resolve('.catch-cache', 'perf-electron-'))
const electronStart = performance.now()
const desktop = await electron.launch({ executablePath: packaged, env: { ...process.env, CATCH_PROFILE_DIR: profile }, timeout: 35_000 })
try {
  const page = await desktop.firstWindow()
  await ready(page)
  result.electron.freshLaunchMs = ms(electronStart)
  result.electron.idle = await memory(desktop.process().pid)
  await populate(page)
  await page.reload()
  await ready(page)
  result.electron.withLibrary = await memory(desktop.process().pid)
  await page.keyboard.press('Control+k')
  const dialog = page.getByRole('dialog', { name: 'Search captures' })
  const start = performance.now()
  await dialog.getByRole('searchbox').fill('GE-790411')
  await dialog.getByRole('button', { name: /Glacier relay manual/ }).first().waitFor()
  result.electron.keywordMs = ms(start)
} finally {
  await desktop.close()
  await writeFile('research/results/quality-performance.json', JSON.stringify(result, null, 2) + '\n')
}
console.log(JSON.stringify(result, null, 2))
