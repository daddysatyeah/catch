import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

// This provider only exists in the local browser test. Its network routes are intercepted before navigation.
const fixture = `
const listeners = new Set()
const key = 'catch-mock-session'
const profile = id => ({scope:'phase-two-fixture:'+id, name:'Mock Account '+id, email:'example-'+id.toLowerCase()+'@example.test'})
const after = (ms, run) => new Promise((resolve,reject)=>setTimeout(()=>{try{resolve(run())}catch(error){reject(error)}},ms))
const fail = code => {throw Object.assign(new Error('fixture'), {code})}
const setSession = account => {
  if(account) localStorage.setItem(key, JSON.stringify(account)); else localStorage.removeItem(key)
  listeners.forEach(change=>change(account))
  return account
}
export function connectFirebase() {
  return {
    watch(change) {listeners.add(change); queueMicrotask(()=>change(JSON.parse(localStorage.getItem(key)||'null'))); return ()=>listeners.delete(change)},
    google() {
      return after(1900,()=>{const choice=sessionStorage.getItem('mock-google'); if(choice==='cancel') fail('auth/popup-closed-by-user')
        return setSession(profile(choice||'A'))})
    },
    signOut() {setSession(null); return Promise.resolve()},
  }
}
`
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'mock-sdk-never-called',
  VITE_FIREBASE_AUTH_DOMAIN: 'phase-two-fixture.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'phase-two-fixture',
  VITE_FIREBASE_APP_ID: 'mock-app',
})
const preview = await createServer({ base: '/catch/', server: { host: '127.0.0.1', port: 4293, strictPort: true } })
const browserPath = process.env.CATCH_CHROMIUM || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find(existsSync)
const output = process.env.CATCH_ACCOUNT_SCREENSHOTS
if (output) mkdirSync(output, { recursive: true })
let browser
try {
  await preview.listen()
  browser = await chromium.launch({ executablePath: browserPath })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/src/auth-provider.ts*', route => route.fulfill({ contentType: 'application/javascript', body: fixture }))
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(60_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const root = 'http://127.0.0.1:4293/catch/'
  const button = (name, scope = page) => scope.getByRole('button', { name, exact: true })
  const portal = page.getByRole('dialog', { name: 'Yours. Only yours.' })
  const select = (choice) => page.evaluate(value => sessionStorage.setItem('mock-google', value), choice)
  const snap = async (name) => {
    if (output) await page.screenshot({ path: path.join(output, name + '.png'), animations: 'allow' })
  }
  const inbox = () => page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name: /^Inbox/ }).click()
  const row = (name) => page.locator('.clip-row').filter({ hasText: name })
  const signIn = () => page.getByRole('button', { name: /Sign in Your personal space/ }).click()
  async function capture(name) {
    await button('New capture', page.getByRole('banner')).click()
    const modal = page.getByRole('dialog', { name: 'New capture' })
    await modal.getByLabel(/Title/).fill(name)
    await modal.getByLabel('Content', { exact: true }).fill('Synthetic account isolation fixture: ' + name)
    await button('Save capture', modal).click()
    await modal.waitFor({ state: 'hidden' })
    await row(name).waitFor()
  }
  await page.goto(root)
  await capture('Guest clipping')
  await signIn()
  await select('cancel')
  await button('Continue with Google', portal).click()
  await button('Waiting for Google…', portal).waitFor()
  await page.waitForTimeout(500)
  await snap('mock-google-pending')
  await portal.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor()
  await snap('mock-google-cancelled')
  await select('A')
  await button('Continue with Google', portal).click()
  await page.locator('.account-capsule').filter({ hasText: 'Mock Account A' }).waitFor()
  await portal.waitFor({ state: 'hidden' })
  assert.equal(await row('Guest clipping').count(), 0)
  await capture('First clipping')
  await page.reload()
  await row('First clipping').waitFor()
  assert.equal(await row('Guest clipping').count(), 0)
  await button('Settings').click()
  await button('Switch account').click()
  await select('B')
  await button('Continue with Google', portal).click()
  await page.locator('.account-capsule').filter({ hasText: 'Mock Account B' }).waitFor()
  await portal.waitFor({ state: 'hidden' })
  await inbox()
  await page.getByRole('heading', { name: 'Capture anything.' }).waitFor()
  assert.equal(await row('First clipping').count(), 0)
  await capture('Second clipping')
  await page.locator('summary.account-capsule').click()
  await button('Sign out', page.locator('.account-popup')).click()
  await row('Guest clipping').waitFor()
  assert.equal(await row('First clipping').count(), 0)
  assert.equal(await row('Second clipping').count(), 0)
  await signIn()
  await select('A')
  await button('Continue with Google', portal).click()
  await row('First clipping').waitFor()
  assert.equal(await row('Second clipping').count(), 0)
  assert.equal(await row('Guest clipping').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Synthetic provider passed: pending, cancellation, verified session response, reload, switching, sign-out and library isolation.')
} finally {
  await browser?.close()
  await preview.close()
}
