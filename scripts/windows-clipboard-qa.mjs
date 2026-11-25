import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, chromium, expect } from '@playwright/test'

// Explicit Windows desktop check. It replaces the current clipboard with synthetic values.
// No clipboard history or existing library/profile is opened.
const executable = process.argv[2] && path.resolve(process.argv[2])
if (process.platform !== 'win32' || !executable || !existsSync(executable)) throw new Error('Provide a packaged Windows Catch.exe.')
const chrome = process.env.CATCH_CHROMIUM || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
if (!chrome) throw new Error('Install-independent check requires an existing Chrome or Edge executable.')
const temp = path.resolve('.catch-cache')
await mkdir(temp, { recursive: true })
const profile = await mkdtemp(path.join(temp, 'clipboard-qa-'))
const url = 'http://127.0.0.1:4281/catch/clipboard-qa'
const text = {
  before: 'Catch QA control copied before opt-in, expected absent.',
  first: 'Catch QA real Chrome text about repairing the studio lamp.',
  second: 'Catch QA real Chrome text about taking a kettle on the field trip.',
  secret: 'Password: CATCH_QA_SYNTHETIC_PLACEHOLDER',
  paused: 'Catch QA copied while monitoring was paused, expected absent.',
  resumed: 'Catch QA real Chrome text after resuming the test monitor.',
  clean: 'Catch release QA finished with synthetic clipboard data.',
  notepad: 'Catch QA real Notepad copy. The workshop hose is in the crate.',
}
const verdicts = []
const mark = evidence => { verdicts.push(evidence); console.log('PASS · ' + evidence) }
const button = (page, name) => page.getByRole('button', { name, exact: true })
const settings = page => button(page, 'Settings').click()
const status = page => page.evaluate(() => window.catchDesktop.getStatus())
async function enable(page) {
  await button(page, 'Enable monitoring').click()
  const confirmation = page.getByRole('dialog', { name: 'Enable clipboard monitoring?' })
  assert.equal((await status(page)).monitoring, false)
  await button(confirmation, 'Enable monitoring').click()
  await expect.poll(async () => (await status(page)).monitoring).toBe(true)
}
const sequence = page => page.evaluate(() => new Promise((resolve, reject) => {
  const open = indexedDB.open('catch-library', 2)
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const db = open.result
    const query = db.transaction('clips').objectStore('clips').getAll()
    query.onerror = () => reject(query.error)
    query.onsuccess = () => {
      resolve(query.result.filter(clip => !clip.demo).map(clip => ({ title: clip.title, body: clip.body, kind: clip.kind,
        attachments: clip.attachments?.map(file => ({ mime: file.blob.type, bytes: file.blob.size })) })))
      db.close()
    }
  }
}))

const browser = await chromium.launchPersistentContext(path.join(profile, 'chrome'), {
  executablePath: chrome, headless: false, viewport: { width: 780, height: 580 },
  permissions: ['clipboard-write'],
})
let client
const launch = () => electron.launch({
  executablePath: executable, env: { ...process.env, CATCH_PROFILE_DIR: path.join(profile, 'catch') }, timeout: 35_000,
})
try {
  const source = browser.pages()[0] ?? await browser.newPage()
  await browser.route(url, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Catch Clipboard QA Source</title>
    <main><h1>Catch Clipboard QA Source</h1><p>Only authored synthetic values are copied.</p>
    ${Object.keys(text).filter(key => key !== 'notepad').map(key => '<button id="' + key + '">' + key + '</button>').join(' ')}
    <button id="image">Copy test image</button><p role="status">Ready</p></main>
    <script>
    const values = ${JSON.stringify(text)};
    const status = document.querySelector('[role=status]');
    for (const [key, value] of Object.entries(values)) {
      const button = document.getElementById(key);
      if (!button) continue;
      button.onclick = async () => {
        status.textContent = 'Copying ' + key;
        try { await navigator.clipboard.writeText(value); status.textContent = 'Copied ' + key }
        catch (error) { status.textContent = error.message }
      };
    }
    document.getElementById('image').onclick = async () => {
      status.textContent = 'Copying image';
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#191715'; ctx.fillRect(0, 0, 120, 64);
      ctx.fillStyle = '#ffffff'; ctx.font = '14px sans-serif'; ctx.fillText('Catch QA', 20, 39);
      const image = new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      try { await navigator.clipboard.write([new ClipboardItem({'image/png': image})]); status.textContent = 'Copied image' }
      catch (error) { status.textContent = error.message }
    };
    </script>` }))
  await source.goto(url)
  async function copy(key) {
    await source.bringToFront()
    await source.locator('#' + key).press('Enter')
    await expect(source.getByRole('status')).toHaveText('Copied ' + key, { timeout: 10_000 })
  }
  await copy('before')
  client = await launch()
  const page = await client.firstWindow()
  await expect(page.getByRole('heading', { name: 'Copy anything. Forget nothing.' })).toBeVisible({ timeout: 20_000 })
  await settings(page)
  await expect(button(page, 'Enable monitoring')).toBeVisible()
  assert.equal((await status(page)).monitoring, false)
  assert.equal((await status(page)).images, false)
  assert.deepEqual(await sequence(page), [])
  mark('Packaged application starts with text and image monitoring off')

  await enable(page)
  await copy('first')
  const matches = async value => (await sequence(page)).filter(clip => clip.body === value).length
  await expect.poll(() => matches(text.first), { timeout: 13_000 }).toBe(1)
  assert.equal(await matches(text.before), 0)
  mark('Explicit opt-in captures real Chrome text and skips the pre-existing clipboard slot')

  await copy('second')
  await expect.poll(() => matches(text.second)).toBe(1)
  await copy('first')
  // Observe a different value after the repeat to prove the monitor continued polling.
  await new Promise(resolve => setTimeout(resolve, 1600))
  await copy('secret')
  await expect.poll(async () => (await status(page)).lastSkipped).toBe('credential')
  assert.equal(await matches(text.first), 1)
  assert.equal(await matches(text.secret), 0)
  mark('Real clipboard repeat is suppressed and a synthetic credential-shaped string is skipped')

  await page.getByRole('switch', { name: 'Capture clipboard images' }).click()
  await expect.poll(async () => (await status(page)).images).toBe(true)
  await copy('image')
  await expect.poll(async () => (await sequence(page)).some(clip => clip.kind === 'image' &&
    clip.attachments?.some(file => file.mime === 'image/png' && file.bytes > 50)), { timeout: 13_000 }).toBe(true)
  mark('Windows receives and preserves a real Chrome PNG clipboard write')

  await button(page, 'Pause monitoring').click()
  await expect.poll(async () => (await status(page)).monitoring).toBe(false)
  await copy('paused')
  await new Promise(resolve => setTimeout(resolve, 1400))
  await enable(page)
  await copy('resumed')
  await expect.poll(() => matches(text.resumed)).toBe(1)
  assert.equal(await matches(text.paused), 0)
  mark('Pause prevents capture and resume accepts the next real clipboard write')
  if (process.env.CATCH_VERIFY_NOTEPAD === '1') {
    const note = path.join(profile, 'Catch QA Notepad Fixture.txt')
    await writeFile(note, text.notepad, 'utf8')
    const editor = spawn('notepad.exe', [note], { stdio: 'ignore' })
    editor.on('error', error => console.log('Notepad could not launch: ' + error.code))
    editor.unref()
    console.log('READY · Select and copy the synthetic Catch QA Notepad Fixture from Notepad')
    await expect.poll(() => matches(text.notepad), { timeout: 150_000 }).toBe(1)
    mark('Windows captures copied text from a separate Notepad window')
  }
  await button(page, 'Pause monitoring').click()
  await copy('clean')
  if (process.env.CATCH_VERIFY_HOTKEY === '1') {
    console.log('READY · Send Ctrl Alt Shift C from the separate Chrome QA window')
    const capture = page.getByRole('dialog', { name: 'New capture' })
    await expect(capture).toBeVisible({ timeout: 150_000 })
    await button(capture, 'Cancel').click()
    mark('Global shortcut opens quick capture when sent from the Chrome window')
  }
  await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => client.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return !!window && !window.isVisible()
  })).toBe(true)
  mark('Window close hides Catch while it remains running in the tray')
  await client.close()
  mark('Explicit Electron application quit completes with the window hidden')
  client = await launch()
  const restarted = await client.firstWindow()
  await expect.poll(async () => (await sequence(restarted)).filter(clip => clip.kind === 'image').length).toBe(1)
  assert.equal((await sequence(restarted)).filter(clip => clip.body === text.first).length, 1)
  assert.equal((await status(restarted)).monitoring, false)
  mark('Restart preserves text and image and resets monitoring to off')
} finally {
  await client?.close().catch(() => undefined)
  await browser.close()
  await writeFile('research/results/quality-windows.json', JSON.stringify({ version: '0.2.1', source: 'Chromium system clipboard', verdicts }, null, 2) + '\n')
}
