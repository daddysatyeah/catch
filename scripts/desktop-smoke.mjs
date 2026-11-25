import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const cache = path.resolve('.catch-cache')
await mkdir(cache, { recursive: true })
const profile = await mkdtemp(path.join(cache, 'smoke-profile-'))
const packaged = process.argv[2] ? path.resolve(process.argv[2]) : undefined
const local = path.resolve('node_modules', 'electron', 'dist', 'electron.exe')
let checks = 0
const mark = message => { checks++; console.log('PASS · ' + message) }
const label = (page, name) => page.getByRole('button', { name, exact: true })

async function launch() {
  return electron.launch({ executablePath: packaged ?? local, args: packaged ? [] : ['.'],
    env: { ...process.env, CATCH_PROFILE_DIR: profile }, timeout: 35_000 })
}
let client = await launch()
try {
  const page = await client.firstWindow()
  await expect(page.getByRole('heading', { name: 'Copy anything. Forget nothing.' })).toBeVisible({ timeout: 20_000 })
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  assert.equal(await page.evaluate(() => typeof window.catchDesktop.getStatus), 'function')
  await expect.poll(() => client.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    const config = contents.getLastWebPreferences()
    return config.contextIsolation && config.sandbox && !config.nodeIntegration
  })).toBeTruthy()
  mark('Windows app launches with an isolated, sandboxed renderer')
  await label(page, 'Settings').click()
  await expect(page.getByRole('heading', { name: 'Windows clipboard' })).toBeVisible()
  await expect(label(page, 'Enable monitoring')).toBeVisible()
  assert.equal((await page.evaluate(() => window.catchDesktop.getStatus())).monitoring, false)
  if (packaged) {
    await page.getByRole('heading', { name: 'Windows clipboard' }).scrollIntoViewIfNeeded()
    await mkdir('docs/screenshots', { recursive: true })
    await page.screenshot({ path: 'docs/screenshots/windows-desktop.png', animations: 'disabled' })
  }
  if (process.env.CATCH_VERIFY_HOTKEY === '1') {
    console.log('READY · Ctrl Alt Shift C')
    const capture = page.getByRole('dialog', { name: 'New capture' })
    await expect(capture).toBeVisible({ timeout: 55_000 })
    await label(capture, 'Cancel').click()
    mark('System shortcut opened the capture dialog')
  }
  mark('Clipboard monitoring is off on startup')
  assert.equal(await client.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+Alt+Shift+C')), true)
  mark('Windows registered the global shortcut')
  await expect(page.evaluate(() => window.catchDesktop.setShortcut('F1').then(() => 'allowed', () => 'blocked'))).resolves.toBe('blocked')
  mark('Desktop bridge rejects an unsupported shortcut')
  const boundaries = await page.evaluate(async () => {
    const verdict = promise => promise.then(() => 'allowed', () => 'blocked')
    return {
      invalidMonitoring: await verdict(window.catchDesktop.setMonitoring('true')),
      invalidClipboard: await verdict(window.catchDesktop.writeText(4317)),
      foreignRequest: await verdict(fetch('https://example.test/catch-qa')),
    }
  })
  assert.deepEqual(boundaries, { invalidMonitoring: 'blocked', invalidClipboard: 'blocked', foreignRequest: 'blocked' })
  mark('Desktop rejects invalid clipboard IPC arguments and a foreign renderer request')

  // Exercise the production timer and IPC with clipboard reads supplied in memory.
  // The user's actual Windows clipboard is neither read nor overwritten by this test.
  await client.evaluate(({ clipboard }) => {
    globalThis.catchClipboardFixture = ''
    clipboard.readText = () => globalThis.catchClipboardFixture
  })
  // Record the actual Electron menu installed by refreshTray without clicking the OS notification area.
  await client.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate.bind(Menu)
    Menu.buildFromTemplate = template => {
      const menu = build(template)
      if (menu.items.some(item => item.label === 'Exit Catch')) globalThis.catchTrayMenu = menu
      return menu
    }
  })
  await label(page, 'Enable monitoring').click()
  const warning = page.getByRole('dialog', { name: 'Enable clipboard monitoring?' })
  await label(warning, 'Enable monitoring').click()
  await expect(label(page, 'Pause monitoring')).toBeVisible()
  await client.evaluate(() => { globalThis.catchClipboardFixture = 'A synthetic test capture from the isolated Windows smoke test.' })
  await page.getByRole('button', { name: /^Inbox/ }).first().click()
  const timeline = page.getByRole('region', { name: 'Recent captures' })
  await expect(timeline.getByRole('button', { name: /isolated Windows smoke test/ })).toHaveCount(1)
  await client.evaluate(() => { globalThis.catchClipboardFixture = 'Your verification code is 123456' })
  await label(page, 'Settings').click()
  await expect(page.getByText(/Last skipped: one-time code/)).toBeVisible()
  await label(page, 'Pause monitoring').click()
  await expect(label(page, 'Enable monitoring')).toBeVisible()
  await client.evaluate(() => { globalThis.catchClipboardFixture = 'This synthetic text must not be saved when clipboard monitoring is paused.' })
  await page.getByRole('button', { name: /^Inbox/ }).first().click()
  await new Promise(resolve => setTimeout(resolve, 1150))
  await expect(timeline.getByRole('button', { name: /isolated Windows smoke test/ })).toHaveCount(1)
  await expect(timeline.getByRole('button', { name: /must not be saved/ })).toHaveCount(0)
  mark('Production monitor captures, suppresses repeats, skips likely OTPs, and pauses with an injected clipboard')
  await client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => client.evaluate(({ BrowserWindow }) => {
    const current = BrowserWindow.getAllWindows()[0]
    return !!current && !current.isVisible()
  })).toBe(true)
  mark('Closing window hides it to the tray instead of quitting')
  await client.evaluate(({ BrowserWindow }) => {
    const item = globalThis.catchTrayMenu.items.find(item => item.label === 'Open Catch')
    item.click({}, BrowserWindow.getAllWindows()[0], {})
  })
  await expect.poll(() => client.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true)
  mark('The installed tray menu issues Open Catch')
  const exited = new Promise(resolve => client.process().once('exit', code => resolve(code)))
  await client.evaluate(({ BrowserWindow }) => {
    const item = globalThis.catchTrayMenu.items.find(item => item.label === 'Exit Catch')
    setTimeout(() => item.click({}, BrowserWindow.getAllWindows()[0], {}), 100)
  })
  assert.equal(await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('timeout'), 12_000).unref())]), 0)
  mark('The installed tray menu issues Exit Catch and the process terminates cleanly')
  client = await launch()
  const second = await client.firstWindow()
  await expect(second.getByRole('region', { name: 'Recent captures' }).getByRole('button', { name: /isolated Windows smoke test/ })).toHaveCount(1)
  assert.equal((await second.evaluate(() => window.catchDesktop.getStatus())).monitoring, false)
  mark('Restart preserves the library and resets monitoring to off')
} finally {
  await client.close().catch(() => undefined)
}
console.log(checks + ' desktop smoke checks')
