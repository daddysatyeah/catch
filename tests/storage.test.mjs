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
  const knownDemo = { ...original, id: 'd1', demo: true, title: 'Legacy sample' }
  const personalLookalike = { ...original, id: 'personal-lookalike', demo: false, title: 'Field guide to retrieval evaluation', filename: 'CATCH_Demo.txt' }
  const unknownDemo = { ...original, id: 'unverified', demo: true, title: 'Amur leopard' }
  const opening = indexedDB.open('catch-library', 1)
  opening.onupgradeneeded = () => opening.result.createObjectStore('library').put({
    clips: [original, knownDemo, personalLookalike, unknownDemo], collections: [{ id: 'user', name: 'User references', color: '#777777' }], theme: 'dark', reduced: true, tourDone: true,
  }, 'current')
  const old = await request(opening)
  old.close()
  const migrated = await readLibrary()
  assert.equal(migrated.theme, 'dark')
  assert.deepEqual(migrated.collections.map(item => item.name), ['User references'])
  const migratedOriginal = migrated.clips.find(clip => clip.id === original.id)
  assert.equal(migratedOriginal.body, 'Preserve me')
  assert.equal(migratedOriginal.pinned, true)
  assert.equal(await attachmentsOf(migratedOriginal)[0].blob.text(), 'legacy bytes')
  const trashedDemo = migrated.clips.find(clip => clip.id === knownDemo.id)
  assert.ok(trashedDemo.trashed)
  assert.equal(await attachmentsOf(trashedDemo)[0].blob.text(), 'legacy bytes')
  assert.equal(migrated.clips.find(clip => clip.id === personalLookalike.id).trashed, undefined)
  assert.equal(migrated.clips.find(clip => clip.id === unknownDemo.id).trashed, undefined)
  await transact(value => ({ ...value, clips: value.clips.map(clip => clip.id === knownDemo.id ? { ...clip, trashed: undefined } : clip) }))
  assert.equal((await readLibrary()).clips.find(clip => clip.id === knownDemo.id).trashed, undefined)
  await assert.rejects(transact(() => { throw new Error('simulate failed write') }), /failed write/)
  assert.equal((await readLibrary()).clips.find(clip => clip.id === original.id).title, 'Before upgrade')
})

test('does not revive stale derived data after edits or removal', async () => {
  const old = (await readLibrary()).clips.find(clip => clip.id === 'existing-capture')
  const vector = { id: old.id, version: 'test', signature: 'original', chunks: [{ text: 'synthetic', vector: Float32Array.of(1, 2) }] }
  await writeVector(vector, old)
  assert.equal((await readVectors()).length, 1)
  await transact(value => ({ ...value, clips: value.clips.map(clip => ({ ...clip, title: 'Edited', modified: 9999 })) }))
  assert.equal((await readVectors()).length, 0)
  await writeVector(vector, old)
  assert.equal((await readVectors()).length, 0)
  const current = (await readLibrary()).clips.find(clip => clip.id === 'existing-capture')
  const replacement = { ...vector, signature: 'edited' }
  const missing = { ...vector, id: 'removed' }
  await writeVectors([{ record: vector, expected: old }, { record: replacement, expected: current }, { record: missing, expected: old }])
  assert.deepEqual((await readVectors()).map(item => item.signature), ['edited'])
  await transact(value => ({ ...value, clips: [] }))
  assert.equal((await readLibrary()).clips.length, 0)
  assert.equal((await readVectors()).length, 0)
})
