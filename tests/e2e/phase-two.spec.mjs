import { test, expect } from '@playwright/test'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const portal = page => page.getByRole('dialog', { name: 'Yours. Only yours.' })
const signIn = page => page.getByRole('button', { name: /Sign in Your personal space/ })

test('guest can enter the portal, inspect sign-in options and return without changing their library', async ({ page }) => {
  await page.goto('./')
  await expect(button(page, 'Storage')).toBeVisible()
  await signIn(page).click()
  const dialog = portal(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.privacy-core')).toHaveAttribute('data-drawn', 'true')
  await expect(dialog.getByText('Your captures stay on this device.')).toBeVisible()
  await expect(button(dialog, 'Continue with Google')).toBeVisible()
  await expect(dialog.locator('form')).toHaveCount(0)
  await button(dialog, 'Continue as guest').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Capture anything.' })).toBeVisible()
  await expect(signIn(page)).toBeFocused()
})

test('storage reflects real capture bytes and handles browser estimate and persistence', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { value: {
      estimate: async () => ({ usage: 26_000, quota: 100_000 }),
      persisted: async () => false,
      persist: async () => false,
    } })
  })
  await page.goto('./')
  await button(page.getByRole('banner'), 'New capture').click()
  const dialog = page.getByRole('dialog', { name: 'New capture' })
  await dialog.getByLabel('Content', { exact: true }).fill('Storage test')
  await dialog.locator('input[type=file]').setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('data') })
  await button(dialog, 'Save capture').click()
  await expect(dialog).toBeHidden()
  await button(page, 'Storage').click()
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible()
  await expect(page.getByText('4 B', { exact: true })).toBeVisible()
  await expect(page.getByText('25.4 KB', { exact: true })).toBeVisible()
  await expect(page.getByText('72.3 KB', { exact: true })).toBeVisible()
  await button(page, 'Request persistence').click()
  await expect(page.getByRole('status').filter({ hasText: 'did not grant' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' })
  await nav.getByRole('button', { name: /^Inbox/ }).click()
  await page.locator('.clip-row').filter({ hasText: 'sample.txt' }).click()
  const inspector = page.getByRole('dialog', { name: 'Inspect capture' })
  await button(inspector, 'Move to Trash').click()
  await button(page, 'Storage').click()
  await expect(page.getByText('4 B', { exact: true })).toBeVisible()
  await button(nav, 'Trash').click()
  await page.locator('.clip-row').filter({ hasText: 'sample.txt' }).click()
  await button(inspector, 'Delete permanently').click()
  await button(page.getByRole('dialog', { name: 'Permanently delete capture?' }), 'Delete permanently').click()
  await button(page, 'Storage').click()
  await expect(page.getByText('4 B', { exact: true })).toHaveCount(0)
})

test('reduced-motion portal shows a stable rendered core without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await signIn(page).click()
  const dialog = portal(page)
  await expect(dialog.locator('.privacy-core')).toHaveAttribute('data-drawn', 'true')
  const canvas = dialog.locator('canvas')
  const snapshot = await canvas.evaluate(element => element.toDataURL())
  await canvas.hover()
  await page.waitForTimeout(200)
  expect(await canvas.evaluate(element => element.toDataURL())).toBe(snapshot)
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 780 })
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
