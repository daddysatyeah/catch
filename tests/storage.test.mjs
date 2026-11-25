import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentsOf } from '../src/model.ts'
import { readLibrary, readVectors, transact, writeVector, writeVectors } from '../src/storage.ts'

const request = target => new Promise((resolve, reject) => {
  target.onsuccess = () => resolve(target.result)
  target.onerror = () => reject(target.error)
})

test('migrates the actual v1 shape and rolls back a failed mutation', async () => {
  const original = { id: 'existing-capture', title: 'Before upgrade', body: 'Preserve me', kind: 'file', collection: 'user', created: 100,
    pinned: true, attachment: new Blob(['legacy bytes'], { type: 'text/plain' }), filename: 'existing.txt' }
  const opening = indexedDB.open('catch-library', 1)
  opening.onupgradeneeded = () => opening.result.createObjectStore('library').put({
    clips: [original], collections: [{ id: 'user', name: 'User references', color: '#777777' }], theme: 'dark', reduced: true, tourDone: true,
  }, 'current')
  const old = await request(opening)
  old.close()
  const migrated = await readLibrary()
  assert.equal(migrated.theme, 'dark')
  assert.deepEqual(migrated.collections.map(item => item.name), ['User references'])
  assert.equal(migrated.clips[0].body, 'Preserve me')
  assert.equal(migrated.clips[0].pinned, true)
  assert.equal(await attachmentsOf(migrated.clips[0])[0].blob.text(), 'legacy bytes')
  await assert.rejects(transact(() => { throw new Error('simulate failed write') }), /failed write/)
  assert.equal((await readLibrary()).clips[0].title, 'Before upgrade')
})

test('does not revive stale derived data after edits or removal', async () => {
  const old = (await readLibrary()).clips[0]
  const vector = { id: old.id, version: 'test', signature: 'original', chunks: [{ text: 'synthetic', vector: Float32Array.of(1, 2) }] }
  await writeVector(vector, old)
  assert.equal((await readVectors()).length, 1)
  await transact(value => ({ ...value, clips: value.clips.map(clip => ({ ...clip, title: 'Edited', modified: 9999 })) }))
  assert.equal((await readVectors()).length, 0)
  await writeVector(vector, old)
  assert.equal((await readVectors()).length, 0)
  const current = (await readLibrary()).clips[0]
  const replacement = { ...vector, signature: 'edited' }
  const missing = { ...vector, id: 'removed' }
  await writeVectors([{ record: vector, expected: old }, { record: replacement, expected: current }, { record: missing, expected: old }])
  assert.deepEqual((await readVectors()).map(item => item.signature), ['edited'])
  await transact(value => ({ ...value, clips: [] }))
  assert.equal((await readLibrary()).clips.length, 0)
  assert.equal((await readVectors()).length, 0)
})
