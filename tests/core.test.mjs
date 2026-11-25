import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, mergeLibrary, parseBackup } from '../src/backup.ts'
import { applyRetention, exactDuplicates, nearDuplicates, normalizeText, prepareClip, sha256 } from '../src/content.ts'
import { parseAmount, parseDate, extractEntities } from '../src/entities.ts'
import { attachmentsOf, safeUrl, starterLibrary } from '../src/model.ts'
import { applyCaptureState, recordSearch } from '../src/privacy.ts'
import { cosine, defaultHybridRanking, hybridRanking, keywordRanking, semanticRanking } from '../src/retrieval.ts'
import { categories, decideCategory, linearCategoryScores } from '../src/classification.ts'
import { decide, suggestionsFor } from '../src/review.ts'
import { sensitiveReason, validCard } from '../src/sensitive.ts'
import boundary from '../desktop/boundaries.cjs'
import path from 'node:path'

const make = (id, body, fields = {}) => ({ id, title: id, body, kind: 'text', created: 123, ...fields })
const library = (...clips) => ({ ...starterLibrary(), collections: [], clips })

test('normalization preserves original text while hashing equivalent captures', async () => {
  assert.equal(normalizeText('  e\u0301   archive\r\n note '), 'é archive note')
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const raw = '  A careful studio note to keep open for tomorrow\r\n'
  const a = await prepareClip(make('a', raw))
  const b = await prepareClip(make('b', raw.trim()))
  assert.equal(a.body, raw)
  assert.equal(a.hash, b.hash)
  assert.deepEqual(exactDuplicates(b, [a]).map(item => item.id), ['a'])
  assert.deepEqual(exactDuplicates(make('b', 'hello'), [make('a', 'hello')]), [])
  const files = [{ id: 'blob', name: 'f.txt', blob: new Blob(['demo']) }]
  const attached = await prepareClip(make('c', '', { attachments: files }))
  assert.equal(attached.attachments[0].hash, await sha256('demo'))
  assert.equal(nearDuplicates(make('l', 'one two three four five six seven eight nine ten changed'), [make('m', 'one two three four five six seven eight nine ten original')]).length, 1)
})

test('entity parsing preserves uncertainty and carries evidence to review', () => {
  assert.equal(parseDate('25/11/2026').value, '2026-11-25')
  assert.equal(parseDate('04/07/2026').ambiguous, true)
  assert.equal(parseDate('31/02/2026'), undefined)
  assert.equal(parseDate('Feb 29, 2024').value, '2024-02-29')
  assert.equal(parseAmount('₹ 1,23,456.50').value, 'INR 123456.50')
  assert.equal(parseAmount('$15').ambiguous, true)
  assert.equal(parseAmount('INR 2,3'), undefined)
  const clip = make('paper', 'TODO: call the library\nSubmit by 25/11/2026. Details https://example.test/reference\nOrder #BC-9451 · INR 2,450.50 · 18:30')
  const found = extractEntities(clip)
  assert.deepEqual(new Set(found.map(item => item.type)), new Set(['action', 'deadline', 'amount', 'time', 'url', 'reference']))
  const due = suggestionsFor(clip, []).find(item => item.type === 'deadline')
  assert.match(due.evidence, /Submit by/)
  assert.deepEqual(decide(clip, due, 'accepted').tasks.map(task => task.label), ['2026-11-25'])
  const uncertain = make('ambiguous', 'Due 04/07/2026')
  assert.equal(decide(uncertain, suggestionsFor(uncertain, [])[0], 'accepted').tasks, undefined)
})

test('built-in safety controls skip likely secrets and retain manual data unless explicitly moved', () => {
  assert.equal(sensitiveReason('Your verification code is 123456'), 'one-time code')
  assert.equal(sensitiveReason('Password: RANDOM_TEST_VALUE'), 'credential')
  assert.equal(sensitiveReason('-----BEGIN PRIVATE KEY-----'), 'private key')
  assert.equal(validCard('4111 1111 1111 1111'), true)
  assert.equal(sensitiveReason('Meeting is at 123456 Main Road'), undefined)
  assert.equal(safeUrl('javascript:example'), undefined)
  assert.equal(safeUrl('https://u:p@example.test'), undefined)
  assert.equal(safeUrl('https://example.test/a').hostname, 'example.test')
  const input = library(make('plain', 'photo notes'), make('pin', 'important', { pinned: true }))
  assert.equal(recordSearch(input, 'photos'), input)
  const allowed = { ...input, preferences: { rememberSearches: true, retentionDays: 30 } }
  assert.equal(recordSearch(allowed, 'Password: TEST_TEXT'), allowed)
  assert.deepEqual(recordSearch(allowed, 'photos').preferences.recentSearches, ['photos'])
  const old = applyRetention(allowed, 31 * 86400_000)
  assert.ok(old.clips[0].trashed)
  assert.equal(old.clips[1].trashed, undefined)
  assert.equal(applyCaptureState(old.clips[0], 'restore', 31 * 86400_000).trashed, undefined)
})

test('keyword scoring uses page evidence and hybrid deduplicates ranked captures', () => {
  const direct = make('notes', 'garden tree rainfall')
  const withPage = make('scan', '', { processing: { status: 'ready', passages: [{ method: 'ocr', text: 'Monsoon rainfall charts', page: 2, attachment: 'img' }] } })
  const archived = make('old', 'rainfall tree', { archived: true })
  const hits = keywordRanking(library(direct, withPage, archived), 'rainfall')
  assert.equal(hits.length, 2)
  assert.equal(hits.find(hit => hit.clip.id === 'scan').page, 2)
  assert.equal(cosine(Float32Array.of(1, 0), Float32Array.of(1, 1)).toFixed(5), '0.70711')
  const semantic = semanticRanking([withPage, direct], [
    { id: 'notes', chunks: [{ text: 'test one', vector: Float32Array.of(0, 1) }] },
    { id: 'scan', chunks: [{ text: 'test two', vector: Float32Array.of(1, 0) }] },
  ], Float32Array.of(1, 0))
  assert.equal(semantic[0].clip.id, 'scan')
  assert.equal(new Set(hybridRanking(hits, semantic).map(hit => hit.clip.id)).size, 2)
  const member = { ...direct, collection: 'work' }
  assert.equal(keywordRanking({ ...library(member), collections: [{ id: 'work', name: 'Flood control' }] }, 'flood').length, 1)
  assert.equal(keywordRanking({ ...library(member), collections: [{ id: 'work', name: 'Water control' }] }, 'flood').length, 0)
})

test('hybrid protects full references without promoting partial codes', () => {
  const target = make('target', 'The purchase reference is RF-3245.')
  const partial = make('partial', 'The draft lists XRF-3245 and RF-3245-A.')
  const data = library(partial, target)
  const keyword = keywordRanking(data, 'RF-3245')
  const semantic = [partial, target].map((clip, rank) => ({ clip, score: 1 - rank / 2, snippet: clip.body, method: 'semantic' }))
  assert.deepEqual(defaultHybridRanking(keyword, semantic, 'RF-3245').map(hit => hit.clip.id), ['target', 'partial'])
  assert.equal(defaultHybridRanking([], semantic, 'an ordinary query')[0].clip.id, 'partial')
})

test('linear category scores preserve class order and abstain on close decisions', () => {
  const weights = categories.map((_, index) => [index === 3 ? 2 : 0, 0])
  const scores = linearCategoryScores(Float32Array.of(1), weights)
  assert.ok(Math.abs(scores.reduce((sum, value) => sum + value, 0) - 1) < 1e-9)
  assert.equal(decideCategory(scores, 0, .02).category, 'Shopping')
  assert.equal(decideCategory(scores.map(() => .1), 0, .02).category, undefined)
})

test('entity handling rejects partial money values and preserves qualified evidence', () => {
  const text = 'Ref: RS-5541. Ignore INR 45.999 and name@example..test. Refund -₹ 1,200.00. ' +
    'Use (https://example.test/02/03/2027_(record)). Start 6:30 p.m. or 7:25 am.'
  const found = extractEntities(make('boundary', text)).map(item => item.type + ':' + item.value)
  assert.deepEqual(new Set(found), new Set(['reference:RS-5541', 'amount:INR -1200.00',
    'url:https://example.test/02/03/2027_(record)', 'time:6:30 p.m.', 'time:7:25 am']))
})

test('backup restores binary, origin, metadata and trash, while invalid data is rejected', async () => {
  const blob = new Blob(['backup bytes'], { type: 'text/plain' })
  const prepared = await prepareClip(make('test', '<img src=x> sample text', { attachments: [{ id: 'z', name: 'test.txt', blob }], trashed: 1234, tags: ['records'] }))
  const payload = await createBackup({ ...library(prepared), preferences: { rememberSearches: true, recentSearches: ['private query'] } })
  const result = await parseBackup(payload)
  assert.equal(await attachmentsOf(result.clips[0])[0].blob.text(), 'backup bytes')
  assert.equal(result.clips[0].trashed, 1234)
  assert.equal(result.clips[0].body, prepared.body)
  assert.equal(result.preferences.recentSearches, undefined)
  assert.equal(mergeLibrary(library(prepared), result).clips.length, 1)
  assert.equal(mergeLibrary(library(make('test', 'local content')), result).clips[0].body, 'local content')
  const bad = JSON.parse(await payload.text())
  bad.binaries[0].data = btoa('corrupt')
  await assert.rejects(parseBackup(new Blob([JSON.stringify(bad)])), /checksum/)
  await assert.rejects(parseBackup(new Blob(['{"version":999}'])), /unsupported/)
  await assert.rejects(parseBackup(new Blob(['not JSON'])), /not a valid/)
  const legacy = { ...library(make('legacy', 'v1', { attachment: 'data:text/plain;base64,Zm9v', filename: 'a.txt' })), version: 1 }
  assert.equal(await (await parseBackup(new Blob([JSON.stringify(legacy)]))).clips[0].attachments[0].blob.text(), 'foo')
})

test('desktop path resolution and URL policy stay within explicit boundaries', () => {
  const root = path.resolve('test-dist')
  assert.equal(boundary.assetPath('catch://app/assets/index.js', root), path.join(root, 'assets/index.js'))
  assert.equal(boundary.assetPath('catch://other/index.html', root), undefined)
  assert.equal(boundary.assetPath('catch://app/%2e%2e%2fprivate.txt', root), undefined)
  assert.equal(boundary.assetPath('catch://app/desktop-sensitive.mjs', root), undefined)
  assert.equal(boundary.safeExternal('file:///C:/private'), undefined)
  assert.equal(boundary.permittedModelHost('https://huggingface.co/'), true)
  assert.equal(boundary.permittedModelHost('https://huggingface.co.example.test/'), false)
})
