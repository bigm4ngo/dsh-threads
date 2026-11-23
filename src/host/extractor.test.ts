import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBoundedSideChatContext,
  buildHandoffPacket,
  buildMergeBackBrief,
  extractTurnsFromEvents,
  type RawSessionEvent,
} from './extractor.ts'

test('extractTurnsFromEvents filters synthetic user messages, tracks prevCompletedEndSeq, and extracts tools/models', () => {
  const events: RawSessionEvent[] = [
    {
      type: 'request/header',
      seq: 0,
      time: 1000,
      data: { header: { config: { provider: 'claude-code', model: 'claude-opus-5-5', reasoningEffort: 'high' } } },
    },
    { type: 'turn/start', seq: 1, time: 1001, data: { turn: 1 } },
    {
      type: 'user/message',
      seq: 2,
      time: 1002,
      data: {
        role: 'user',
        source: { kind: 'runtime-context' },
        content: [{ type: 'text', text: 'Current DSH file policy: workspace-write.' }],
      },
    },
    {
      type: 'user/message',
      seq: 3,
      time: 1003,
      data: {
        role: 'user',
        source: { kind: 'user-rpc', rpcId: 'r1' },
        content: [
          { type: 'text', text: 'Inspect the auth bug' },
          { type: 'image', attachment: { name: 'trace.png', bytes: 1200, mediaType: 'image/png' } },
        ],
      },
    },
    {
      type: 'tool/call',
      seq: 4,
      time: 1004,
      data: { callId: 'c1', name: 'read_file', arguments: '{"Path":"/src/auth.ts"}' },
    },
    {
      type: 'tool/result',
      seq: 5,
      time: 1005,
      data: { message: { toolCallId: 'c1', isError: false, content: [{ type: 'text', text: 'ok' }] } },
    },
    {
      type: 'assistant/message',
      seq: 6,
      time: 1006,
      data: {
        message: {
          source: { kind: 'model', provider: 'claude-code', model: 'claude-opus-5-5' },
          content: [
            { type: 'reasoning', text: 'hidden secret thinking' },
            { type: 'text', text: 'Found a missing null check in auth.ts.' },
          ],
        },
      },
    },
    { type: 'turn/end', seq: 7, time: 1007, data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', seq: 8, time: 2001, data: { turn: 2 } },
    {
      type: 'user/message',
      seq: 9,
      time: 2002,
      data: {
        role: 'user',
        source: { kind: 'user-rpc', rpcId: 'r2' },
        content: [{ type: 'text', text: 'Fix it and run tests' }],
      },
    },
    {
      type: 'assistant/message',
      seq: 10,
      time: 2003,
      data: {
        message: {
          source: { kind: 'model', provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
          content: [{ type: 'text', text: 'Fixed and verified.' }],
        },
      },
    },
    { type: 'turn/end', seq: 11, time: 2004, data: { turn: 2, reason: { kind: 'completed' } } },
  ]

  const turns = extractTurnsFromEvents(events)
  assert.equal(turns.length, 2)

  assert.equal(turns[0].turn, 1)
  assert.equal(turns[0].prevCompletedEndSeq, null)
  assert.equal(turns[0].userText, 'Inspect the auth bug')
  assert.equal(turns[0].userAttachments.length, 1)
  assert.equal(turns[0].userAttachments[0].name, 'trace.png')
  assert.equal(turns[0].assistantText, 'Found a missing null check in auth.ts.')
  assert.equal(turns[0].assistantText.includes('hidden secret thinking'), false)
  assert.equal(turns[0].toolSummary.length, 1)
  assert.equal(turns[0].toolSummary[0].ok, true)
  assert.equal(turns[0].model?.provider, 'claude-code')
  assert.equal(turns[0].model?.reasoningEffort, 'high')

  assert.equal(turns[1].turn, 2)
  assert.equal(turns[1].prevCompletedEndSeq, 7)
  assert.equal(turns[1].userText, 'Fix it and run tests')
  assert.equal(turns[1].model?.provider, 'openrouter')

  const bounded = buildBoundedSideChatContext(turns, {
    maxTurns: 1,
    quote: 'missing null check',
    anchorTurn: 1,
  })
  assert.equal(bounded.contextTurnCount, 1)
  assert.match(bounded.contextSummary, /missing null check/)
  assert.match(bounded.contextSummary, /Turn 1/)
  assert.doesNotMatch(bounded.contextSummary, /Turn 2/)

  const brief = buildMergeBackBrief({
    sourceLabel: 'side chat "Auth check"',
    anchorTurn: 1,
    text: 'Null check belongs on line 42.',
  })
  assert.match(brief, /Findings from side chat "Auth check" \(anchored at Turn 1\)/)
  assert.match(brief, /Null check belongs on line 42\./)

  const handoff = buildHandoffPacket({
    sessionId: 'sess-1',
    sessionTitle: 'Auth debugging',
    turns,
    selectedTurnNumbers: [1],
    fromModel: { provider: 'claude-code', model: 'claude-opus-5-5' },
    toModel: { provider: 'antigravity', model: 'gemini-3.8-flash' },
    workspaceMode: 'worktree',
    gitInfo: { isGitRepo: true, dirty: true, untrackedCount: 2, headShort: 'abc1234' },
    nextInstruction: 'Apply the fix cleanly.',
  })
  assert.deepEqual(handoff.manifest.includedTurnNumbers, [1])
  assert.equal(handoff.manifest.omittedTurnCount, 1)
  assert.equal(handoff.manifest.warnings.length, 2)
  assert.match(handoff.packetText, /Apply the fix cleanly\./)
})
