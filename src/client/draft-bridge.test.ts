import assert from 'node:assert/strict'
import test from 'node:test'
import { composeMergedDraft, queueQuote, takeQuotes } from './draft-bridge.ts'

test('composeMergedDraft preserves unfinished typing when mode is append', () => {
  assert.equal(composeMergedDraft('', 'Findings here', 'append'), 'Findings here')
  assert.equal(composeMergedDraft('   \n', 'Findings here', 'append'), 'Findings here')
  assert.equal(
    composeMergedDraft('My partial prompt', 'Findings here', 'append'),
    'My partial prompt\n\nFindings here',
  )
  assert.equal(
    composeMergedDraft('My partial prompt', 'Replacement', 'replace'),
    'Replacement',
  )
})

test('queueQuote and takeQuotes accumulate and drain per session', () => {
  const sid = 'sess-quote-test'
  assert.deepEqual(takeQuotes(sid), [])
  queueQuote(sid, '  first excerpt  ')
  queueQuote(sid, 'second excerpt')
  queueQuote(sid, '   ')
  assert.deepEqual(takeQuotes(sid), ['first excerpt', 'second excerpt'])
  assert.deepEqual(takeQuotes(sid), [])
})
