import test from 'node:test'
import assert from 'node:assert/strict'
import { authMessage, firebaseDomain, initialLetters } from '../src/account.ts'
import { starterLibrary } from '../src/model.ts'
import { captureUsage, formatBytes, originStorage } from '../src/storage-usage.ts'

test('account configuration constrains the auth origin and maps Google cancellation', () => {
  assert.equal(firebaseDomain('catch-example', 'catch-example.firebaseapp.com'), true)
  for (const host of ['catch-example.firebaseapp.com.evil.test', 'catch-example.firebaseapp.com:443', 'other.firebaseapp.com', 'catch-example.firebaseapp.com/']) {
    assert.equal(firebaseDomain('catch-example', host), false)
  }
  assert.match(authMessage({ code: 'auth/popup-closed-by-user', message: 'provider details' }), /cancelled/)
  assert.equal(initialLetters('Amara Example'), 'AE')
})

test('capture estimates count binary payloads, UTF-8 text and metadata separately', () => {
  const by = new Blob(['<sample>'], { type: 'image/png' })
  const attachment = { id: 'sample', name: 'sample.png', blob: by }
  const file = { id: 'file', name: 'sample.txt', blob: new Blob(['file']) }
  const capture = { id: 'one', kind: 'image', created: 0, title: 'é', body: '☀', attachments: [attachment, file],
    original: { title: '', body: '', attachments: [attachment] }, trashed: 10 }
  const result = captureUsage({ ...starterLibrary(), clips: [capture] })
  assert.equal(result.images, 8)
  assert.equal(result.files, 4)
  assert.equal(result.text, 5)
  assert.equal(result.total, result.images + result.files + result.text + result.metadata)
  assert.equal(formatBytes(0), '0 B')
  assert.match(formatBytes(1024), /1 KB/)
  assert.equal(formatBytes(), 'Unavailable')
})

test('origin estimates and persistence report success, absence and independent failures', async () => {
  assert.deepEqual(await originStorage(), { usage: undefined, quota: undefined, persistent: undefined })
  assert.deepEqual(await originStorage({ estimate: async () => ({ usage: 30, quota: 140 }), persisted: async () => false }), {
    usage: 30, quota: 140, persistent: false,
  })
  assert.deepEqual(await originStorage({ estimate: async () => { throw Error('disabled') }, persisted: async () => true }), {
    usage: undefined, quota: undefined, persistent: true,
  })
})
