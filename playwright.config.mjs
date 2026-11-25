import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const installed = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
].find(existsSync)
export const baseURL = 'http://127.0.0.1:4280/catch/'
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 55_000,
  expect: { timeout: 8000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/browser.json' }]],
  use: { baseURL, browserName: 'chromium', viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: process.env.CATCH_CHROMIUM || installed }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve.mjs', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 20_000 },
})
