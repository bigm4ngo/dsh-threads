import assert from 'node:assert/strict'
import test from 'node:test'
import { composeMergedDraft } from './draft-bridge.ts'

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
