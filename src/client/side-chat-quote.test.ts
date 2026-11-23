import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatQuotedSideChatPrompt,
  parseQuotedUserText,
  SIDE_CHAT_QUOTE_MAX,
} from './side-chat-quote.ts'

test('formatQuotedSideChatPrompt formats body without quotes', () => {
  assert.equal(formatQuotedSideChatPrompt([], '  Explain this change\r\n'), 'Explain this change')
  assert.equal(formatQuotedSideChatPrompt(['   \n\t  '], ''), '')
})

test('formatQuotedSideChatPrompt formats single, multi-line, and multiple quotes', () => {
  assert.equal(
    formatQuotedSideChatPrompt(['const x = 1'], 'What is x?'),
    '> const x = 1\n\nWhat is x?',
  )
  assert.equal(
    formatQuotedSideChatPrompt(['first paragraph\n\nsecond paragraph'], 'Clarify'),
    '> first paragraph\n>\n> second paragraph\n\nClarify',
  )
  assert.equal(
    formatQuotedSideChatPrompt(['first quote', 'second quote'], 'Compare these'),
    '> first quote\n\n> second quote\n\nCompare these',
  )
  assert.equal(
    formatQuotedSideChatPrompt(['only quote'], ''),
    '> only quote',
  )
})

test('formatQuotedSideChatPrompt truncates long quotes at SIDE_CHAT_QUOTE_MAX', () => {
  const huge = 'a'.repeat(SIDE_CHAT_QUOTE_MAX + 500)
  const formatted = formatQuotedSideChatPrompt([huge], 'Short question')
  assert.equal(formatted, `> ${'a'.repeat(SIDE_CHAT_QUOTE_MAX)}\n\nShort question`)
})

test('parseQuotedUserText keeps plain messages intact including inline >', () => {
  assert.deepEqual(parseQuotedUserText('Check if a > b in foo.ts'), [
    { kind: 'text', text: 'Check if a > b in foo.ts' },
  ])
  assert.deepEqual(parseQuotedUserText(''), [{ kind: 'text', text: '' }])
})

test('parseQuotedUserText splits leading, multi-line, and interleaved quotes cleanly', () => {
  assert.deepEqual(parseQuotedUserText('> line 1\n>\n> line 2\n\nWhat does this mean?'), [
    { kind: 'quote', text: 'line 1\n\nline 2' },
    { kind: 'text', text: 'What does this mean?' },
  ])

  assert.deepEqual(parseQuotedUserText('Context:\n\n> quoted line\n\nFollow up'), [
    { kind: 'text', text: 'Context:' },
    { kind: 'quote', text: 'quoted line' },
    { kind: 'text', text: 'Follow up' },
  ])
})

test('parseQuotedUserText round-trips formatQuotedSideChatPrompt output', () => {
  const wired = formatQuotedSideChatPrompt(['line 1\n\nline 2', 'second'], 'Explain')
  assert.deepEqual(parseQuotedUserText(wired), [
    { kind: 'quote', text: 'line 1\n\nline 2' },
    { kind: 'quote', text: 'second' },
    { kind: 'text', text: 'Explain' },
  ])
})
