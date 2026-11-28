import { expect, test } from '@playwright/test'

const button = (scope, name) => scope.getByRole('button', { name, exact: true })

async function openCapture(page, content) {
  await button(page.getByRole('banner'), 'New capture').click()
  const form = page.getByRole('dialog', { name: 'New capture' })
  await form.getByLabel('Content', { exact: true }).fill(content)
  return form
}

test('Gravity Identity plays on startup and committed saves', async ({ page }) => {
  await page.addInitScript(() => {
    window.gravityStarts = 0
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'gravity-capture') window.gravityStarts++
    })
  })
  await page.goto('./')
  const brand = button(page, 'Catch inbox')
  await expect(brand).toHaveText('catch.')
  await expect.poll(() => page.evaluate(() => window.gravityStarts)).toBe(1)

  const content = 'Gravity identity capture verification'
  const capture = await openCapture(page, content)
  await button(capture, 'Save capture').click()
  await expect(capture).toBeHidden()
  await expect.poll(() => page.evaluate(() => window.gravityStarts)).toBe(2)

  const duplicate = await openCapture(page, content)
  await button(duplicate, 'Save capture').click()
  await expect(duplicate.getByRole('alert')).toContainText('Gravity identity capture verification')
  expect(await page.evaluate(() => window.gravityStarts)).toBe(2)
})

test('mobile and dark mode show the settled identity with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const brand = page.getByRole('banner').getByRole('button', { name: 'Catch inbox' })
  await expect(brand).toHaveText('catch.')
  await expect(brand.locator('.gravity-dot')).toHaveCSS('animation-name', 'none')
  await button(page, 'Workspace menu').click()
  await button(page, 'Settings').click()
  await button(page, 'Dark').click()
  await expect(brand.locator('.gravity-wordmark')).toHaveCSS('color', 'rgb(245, 245, 247)')

  const capture = await openCapture(page, 'Reduced motion capture verification')
  await button(capture, 'Save capture').click()
  await expect(capture).toBeHidden()
  await expect(brand.locator('.gravity-dot')).toHaveCSS('animation-name', 'none')
  await expect(brand.locator('.gravity-dot')).toHaveCSS('opacity', '1')
})
