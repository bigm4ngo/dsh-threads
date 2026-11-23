import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ThreadsSseEvent } from '../shared/types.ts'
import { ThreadsEventBus } from './events.ts'
import { runGit } from './git.ts'
import {
  ConflictError,
  type LlmChunkLike,
  type LlmGenerateOptionsLike,
  type LlmServiceLike,
  type SessionControllerLike,
  type SessionQueryLike,
  ThreadsService,
} from './service.ts'
import type { SkillRegistryLike, ToolsServiceLike, WebServiceLike } from './side-chat-tools.ts'
import { ThreadsStore } from './store.ts'

function assertCanonicalDshMessages(messages: LlmGenerateOptionsLike['messages']): void {
  for (const message of messages) {
    assert.ok(typeof message.id === 'string' && message.id.length > 0, 'message.id must be non-empty')
    if (message.role === 'assistant') {
      assert.ok(message.source, 'assistant message must carry source')
      assert.equal(message.source.kind, 'model')
      assert.ok(
        typeof message.source.provider === 'string' && message.source.provider.length > 0,
        'assistant source.provider must be non-empty',
      )
      assert.ok(
        typeof message.source.model === 'string' && message.source.model.length > 0,
        'assistant source.model must be non-empty',
      )
      // Mirror LlmRuntime.forAdapter: accessing message.source.replayState throws if source is missing.
      const _replayState = message.source.replayState
      void _replayState
    } else if (message.role === 'tool') {
      assert.ok(message.source && message.source.kind === 'tool', 'tool message must carry source.kind=tool')
      assert.ok(typeof message.toolCallId === 'string' && message.toolCallId.length > 0)
    } else {
      assert.equal(message.role, 'user')
      assert.ok(
        message.source &&
          (message.source.kind === 'user' || message.source.kind === 'runtime-context'),
        'user message must carry source.kind=user or runtime-context',
      )
    }
  }
}

function createHarness(options: {
  stateDir: string
  cwd: string
  running?: boolean
  tools?: ToolsServiceLike
  web?: WebServiceLike
  skills?: SkillRegistryLike
  streamImpl?: (opts: LlmGenerateOptionsLike) => AsyncIterable<LlmChunkLike>
}) {
  let seq = 0
  let running = options.running ?? false
  const llmCalls: LlmGenerateOptionsLike[] = []
  const forkedCalls: Array<{ sessionId: string; atSeq?: number }> = []
  const createdCalls: Array<{ cwd?: string; workspaceId?: string }> = []
  const selectedModels: Array<{ sessionId: string; provider: string; model: string }> = []
  const promptsSent: Array<{ sessionId: string; text: string }> = []
  const cancelledIds: string[] = []

  const sessionController: SessionControllerLike = {
    async modelCatalog() {
      return {
        defaultModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
        groups: [
          { id: 'claude-code', models: [{ id: 'claude-opus-5-5' }] },
          { id: 'antigravity', models: [{ id: 'gemini-3.8-flash' }] },
          { id: 'openrouter', models: [{ id: 'z-ai/glm-5.3-flash' }] },
        ],
      }
    },
    async create(req) {
      seq += 1
      createdCalls.push({ cwd: req.cwd, workspaceId: req.workspaceId })
      return { sessionId: `new-sess-${seq}` }
    },
    async fork(req) {
      seq += 1
      forkedCalls.push({ sessionId: req.sessionId, atSeq: req.atSeq })
      return { sessionId: `fork-sess-${seq}` }
    },
    async resolveAgent(sessionId) {
      return {
        agent: {
          id: sessionId,
          session: {
            id: sessionId,
            header: { id: sessionId, cwd: options.cwd },
            append() {},
          },
          model: {
            select(sel) {
              selectedModels.push({ sessionId, provider: sel.provider, model: sel.model })
            },
          },
        },
      }
    },
    async rename({ title }) {
      return { title, seq: 1 }
    },
    async prompt(req) {
      promptsSent.push({ sessionId: req.sessionId, text: req.content[0]?.text ?? '' })
      return { accepted: true }
    },
    cancel(req) {
      cancelledIds.push(req.sessionId)
      running = false
      return { accepted: true }
    },
    async state() {
      return { running }
    },
    async projections() {
      return {
        values: {
          modelSelection: { provider: 'claude-code', model: 'claude-opus-5-5' },
        },
      }
    },
  }

  let streamOverride = options.streamImpl

  const llm: LlmServiceLike = {
    async resolveCallConfig(sel) {
      return sel
    },
    async prepareCall(cfg) {
      return {
        config: { ...cfg, maxTokens: 4096 },
        async *stream(opts) {
          assertCanonicalDshMessages(opts.messages)
          llmCalls.push(opts)
          if (streamOverride) {
            yield* streamOverride(opts)
            return
          }
          yield { type: 'text-delta', index: 0, text: 'Side ' }
          yield { type: 'text-delta', index: 0, text: 'answer.' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }

  const sessionQuery: SessionQueryLike = {
    async readSession(sessionId) {
      return {
        session: { id: sessionId, cwd: options.cwd },
        events: [
          { type: 'turn/start', seq: 0, time: 100, data: { turn: 1 } },
          {
            type: 'user/message',
            seq: 1,
            time: 101,
            data: { role: 'user', source: { kind: 'user-rpc' }, content: [{ type: 'text', text: 'First prompt' }] },
          },
          {
            type: 'assistant/message',
            seq: 2,
            time: 102,
            data: {
              message: {
                source: { kind: 'model', provider: 'claude-code', model: 'claude-opus-5-5' },
                content: [{ type: 'text', text: 'First reply' }],
              },
            },
          },
          { type: 'turn/end', seq: 3, time: 103, data: { turn: 1, reason: { kind: 'completed' } } },
          { type: 'turn/start', seq: 4, time: 200, data: { turn: 2 } },
          {
            type: 'user/message',
            seq: 5,
            time: 201,
            data: { role: 'user', source: { kind: 'user-rpc' }, content: [{ type: 'text', text: 'Second prompt' }] },
          },
          {
            type: 'assistant/message',
            seq: 6,
            time: 202,
            data: {
              message: {
                source: { kind: 'model', provider: 'claude-code', model: 'claude-opus-5-5' },
                content: [{ type: 'text', text: 'Second reply' }],
              },
            },
          },
          { type: 'turn/end', seq: 7, time: 203, data: { turn: 2, reason: { kind: 'completed' } } },
        ],
      }
    },
    async readTitle() {
      return { title: 'Main Debugging Session' }
    },
  }

  const store = new ThreadsStore({ stateDir: options.stateDir })
  const bus = new ThreadsEventBus()
  const service = new ThreadsService({
    store,
    bus,
    sessionController,
    llm,
    sessionQuery,
    workspaceRegistry: {
      list: () => [{ id: 'ws-1', path: options.cwd, sessionIds: ['parent-1'] }],
    },
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.web ? { web: options.web } : {}),
    ...(options.skills ? { skills: options.skills } : {}),
  })

  return {
    service,
    store,
    bus,
    llmCalls,
    forkedCalls,
    createdCalls,
    selectedModels,
    promptsSent,
    cancelledIds,
    setRunning: (val: boolean) => {
      running = val
    },
    setStreamImpl: (fn: ((opts: LlmGenerateOptionsLike) => AsyncIterable<LlmChunkLike>) | undefined) => {
      streamOverride = fn
    },
  }
}

test('SideChat routes Claude without sessionId, Antigravity with parentSessionId, and canonical multi-turn history', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-svc-'))
  try {
    const h = createHarness({ stateDir: dir, cwd: dir })

    // Claude side chat must omit sessionId.
    const chatClaude = await h.service.createSideChat(
      {
        parentSessionId: 'parent-1',
        model: { provider: 'claude-code', model: 'claude-opus-5-5' },
        question: 'Why did this fail?',
      },
      { wait: true },
    )
    assert.equal(chatClaude.messages.length, 2)
    assert.equal(chatClaude.messages[1].text, 'Side answer.')
    assert.equal(h.llmCalls[0].sessionId, undefined)
    assert.equal(h.llmCalls[0].maxTokens, 4096)

    // Antigravity side chat must pass parentSessionId, read-only runtime-context, and canonical assistant history.
    const turn2 = await h.service.sendSideChatMessage(
      chatClaude.id,
      {
        text: 'Check again with Gemini',
        model: { provider: 'antigravity', model: 'gemini-3.8-flash' },
      },
      { wait: true },
    )
    assert.equal(turn2.messages.length, 4)
    assert.equal(h.llmCalls[1].sessionId, 'parent-1')
    assert.equal(h.llmCalls[1].messages[0].source.kind, 'runtime-context')
    assert.deepEqual(
      h.llmCalls[1].messages.slice(1).map((m) => m.role),
      ['user', 'assistant', 'user'],
    )

    // Turn 3 on OpenRouter also succeeds with full canonical alternating history.
    const turn3 = await h.service.sendSideChatMessage(
      chatClaude.id,
      {
        text: 'Summarize for OpenRouter',
        model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
      },
      { wait: true },
    )
    assert.equal(turn3.messages.length, 6)
    assert.deepEqual(
      h.llmCalls[2].messages.map((m) => m.role),
      ['user', 'assistant', 'user', 'assistant', 'user'],
    )

    // Merge back in both draft and send modes.
    const draftMerge = await h.service.mergeBack({
      targetParentSessionId: 'parent-1',
      sourceSideChatId: chatClaude.id,
      text: 'Found root cause.',
      delivery: 'draft',
    })
    assert.equal(draftMerge.delivery, 'draft')
    assert.match(draftMerge.draftText!, /Found root cause\./)
    assert.equal(h.promptsSent.length, 0)

    const sendMerge = await h.service.mergeBack({
      targetParentSessionId: 'parent-1',
      sourceSideChatId: chatClaude.id,
      text: 'Sending directly.',
      delivery: 'send',
    })
    assert.equal(sendMerge.delivery, 'send')
    assert.equal(h.promptsSent.length, 1)
    assert.match(h.promptsSent[0].text, /Sending directly\./)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('SideChat strips failed turns on retry, recovers stale streaming flags, and streams reasoning + text deltas with abort', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-stream-'))
  try {
    const h = createHarness({ stateDir: dir, cwd: dir })
    const emitted: ThreadsSseEvent[] = []
    const origEmit = h.bus.emit.bind(h.bus)
    h.bus.emit = (ev: ThreadsSseEvent) => {
      emitted.push(ev)
      origEmit(ev)
    }

    // Turn 1 succeeds.
    const chat = await h.service.createSideChat(
      {
        parentSessionId: 'parent-1',
        model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
        question: 'Turn 1 question',
      },
      { wait: true },
    )

    // Turn 2 fails mid-stream before producing text.
    h.setStreamImpl(async function* () {
      yield {
        type: 'finish',
        reason: { kind: 'error', failure: { message: 'Upstream 502' } },
      }
    })
    const failedTurn = await h.service.sendSideChatMessage(
      chat.id,
      { text: 'Turn 2 broken question' },
      { wait: true },
    )
    assert.equal(failedTurn.messages.length, 4)
    assert.equal(failedTurn.messages[3].error, 'Upstream 502')
    assert.equal(failedTurn.messages[3].streaming, false)

    // Turn 3 must drop the failed Turn 2 (user + error assistant) pair so no duplicate user turns remain.
    h.setStreamImpl(undefined)
    await h.service.sendSideChatMessage(chat.id, { text: 'Turn 3 recovery' }, { wait: true })
    assert.deepEqual(
      h.llmCalls.at(-1)!.messages.map((m) => ({
        role: m.role,
        text: m.content[0]?.type === 'text' ? m.content[0].text : '',
      })),
      [
        { role: 'user', text: 'Turn 1 question' },
        { role: 'assistant', text: 'Side answer.' },
        { role: 'user', text: 'Turn 3 recovery' },
      ],
    )

    // Non-blocking stream: returns placeholder immediately, streams reasoning + text deltas, hydrates inspectSession, and supports abort.
    let releaseSecondChunk!: () => void
    const waitSecondChunk = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve
    })
    let signalFirstChunk!: () => void
    const firstChunkArrived = new Promise<void>((resolve) => {
      signalFirstChunk = resolve
    })

    h.setStreamImpl(async function* (opts) {
      yield { type: 'reasoning-delta', index: 0, text: 'Let me think. ' }
      yield { type: 'text-delta', index: 1, text: 'Partial answer' }
      signalFirstChunk()
      await Promise.race([
        waitSecondChunk,
        new Promise<void>((resolve) => {
          opts.signal?.addEventListener('abort', () => resolve(), { once: true })
        }),
      ])
      if (opts.signal?.aborted) {
        yield {
          type: 'finish',
          reason: { kind: 'aborted', failure: { message: 'Aborted' } },
        }
        return
      }
      yield { type: 'text-delta', index: 1, text: ' complete.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })

    emitted.length = 0
    const started = await h.service.sendSideChatMessage(chat.id, { text: 'Stream test' })
    const placeholder = started.messages.at(-1)!
    assert.equal(placeholder.streaming, true)
    assert.equal(placeholder.text, '')

    await firstChunkArrived
    // Allow microtasks for onDelta callbacks to run.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const deltas = emitted.filter((e) => e.type === 'side-chat-delta')
    assert.deepEqual(
      deltas.map((d) => ({
        channel: d.channel,
        seq: d.seq,
        delta: d.delta,
        messageId: d.messageId,
      })),
      [
        { channel: 'reasoning', seq: 1, delta: 'Let me think. ', messageId: placeholder.id },
        { channel: 'text', seq: 2, delta: 'Partial answer', messageId: placeholder.id },
      ],
    )

    // Mid-stream inspectSession hydrates live text, reasoning, and streamSeq.
    const inspectedMid = await h.service.inspectSession('parent-1')
    const liveChat = inspectedMid.sideChats.find((c) => c.id === chat.id)!
    const liveMsg = liveChat.messages.at(-1)!
    assert.equal(liveMsg.streaming, true)
    assert.equal(liveMsg.text, 'Partial answer')
    assert.equal(liveMsg.reasoning, 'Let me think. ')
    assert.equal(liveMsg.streamSeq, 2)

    // Abort mid-stream keeps partial text and clears streaming flag.
    assert.equal(h.service.abortSideChat(chat.id), true)
    releaseSecondChunk()
    const aborted = await h.service.waitForSideChat(chat.id)
    assert.equal(aborted?.messages.at(-1)?.streaming, false)
    assert.equal(aborted?.messages.at(-1)?.text, 'Partial answer')
    assert.equal(aborted?.messages.at(-1)?.reasoning, 'Let me think.')

    // Zombie streaming=true on disk (without an active stream) is healed on read.
    await h.store.createSideChat({
      id: 'zombie-chat',
      parentSessionId: 'parent-1',
      title: 'Zombie',
      contextTurnCount: 0,
      contextSummary: '',
      model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
      messages: [
        { id: 'zu-1', role: 'user', text: 'hello', createdAt: 1 },
        { id: 'za-1', role: 'assistant', text: '', createdAt: 1, streaming: true },
      ],
      createdAt: 1,
      updatedAt: 1,
    })
    const healed = (await h.service.listSideChats('parent-1')).find((c) => c.id === 'zombie-chat')!
    assert.equal(healed.messages[1].streaming, false)
    assert.equal(healed.messages[1].error, 'Interrupted before completion')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('Edit & Retry handles Turn 1 vs Turn N, preserves model after fork, and enforces running guard', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-retry-'))
  const repoDir = path.join(dir, 'repo')
  try {
    await runGit(['init', repoDir], dir)
    await runGit(['config', 'user.email', 'test@example.com'], repoDir)
    await runGit(['config', 'user.name', 'Test User'], repoDir)
    await writeFile(path.join(repoDir, 'app.ts'), 'export const x = 1\n', 'utf8')
    await runGit(['add', 'app.ts'], repoDir)
    await runGit(['commit', '-m', 'init'], repoDir)

    const h = createHarness({ stateDir: path.join(dir, 'state'), cwd: repoDir, running: true })

    // Running session blocks same-workspace retry with ConflictError.
    await assert.rejects(
      () =>
        h.service.editAndRetry({
          sessionId: 'parent-1',
          turnNumber: 2,
          prompt: 'Edited second prompt',
          delivery: 'draft',
          workspaceMode: 'same',
        }),
      (err) => err instanceof ConflictError && err.code === 'SOURCE_RUNNING',
    )

    // Stopping source allows same-workspace fork at prevCompletedEndSeq (3) and restores model.
    const retryT2 = await h.service.editAndRetry({
      sessionId: 'parent-1',
      turnNumber: 2,
      prompt: 'Edited second prompt',
      delivery: 'send',
      workspaceMode: 'same',
      stopSourceIfRunning: true,
    })
    assert.deepEqual(h.cancelledIds, ['parent-1'])
    assert.equal(h.forkedCalls[0].atSeq, 3)
    assert.equal(h.selectedModels[0].provider, 'claude-code')
    assert.equal(h.promptsSent.at(-1)?.text, 'Edited second prompt')
    assert.equal(retryT2.edge.kind, 'edit-retry')

    // Turn 1 uses create (not fork) because prevCompletedEndSeq is null.
    const retryT1 = await h.service.editAndRetry({
      sessionId: 'parent-1',
      turnNumber: 1,
      prompt: 'Edited first prompt',
      delivery: 'draft',
      workspaceMode: 'same',
    })
    assert.equal(h.createdCalls.length, 1)
    assert.equal(retryT1.draftText, 'Edited first prompt')

    // Worktree handoff works even when source is running and sets isolated worktree cwd.
    h.setRunning(true)
    const wtHandoff = await h.service.executeHandoff({
      sessionId: 'parent-1',
      toModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
      workspaceMode: 'worktree',
      delivery: 'draft',
      packetText: 'Handoff packet content',
    })
    assert.equal(wtHandoff.edge.workspaceMode, 'worktree')
    assert.ok(wtHandoff.edge.worktree?.branch.startsWith('dsh-threads/handoff/'))
    assert.equal(wtHandoff.draftText, 'Handoff packet content')
    assert.equal(h.createdCalls.at(-1)?.cwd, wtHandoff.edge.worktree?.path)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('SideChat executes read-only web_search tool loop when enabled and omits tools when disabled', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-tools-loop-'))
  try {
    const web: WebServiceLike = {
      searchReady: async () => true,
      fetchReady: async () => true,
      search: async ({ query }) => ({
        content: `Result for ${query}`,
        sources: [{ url: 'https://example.org/ref', title: 'Ref' }],
      }),
      fetch: async ({ url }) => ({ url, statusCode: 200, body: { kind: 'text', content: 'ok' } }),
    }

    let step = 0
    const h = createHarness({
      stateDir: dir,
      cwd: dir,
      web,
      streamImpl: async function* (opts) {
        step += 1
        if (step === 1) {
          assert.ok(opts.tools?.some((t) => t.name === 'web_search'))
          assert.equal(opts.system?.includes('web_search'), false)
          assert.equal(opts.system?.includes('web_fetch'), false)
          assert.equal(opts.system?.includes('<available_skills>'), false)
          assert.equal(opts.system?.includes('provided read-only research tools'), false)
          yield {
            type: 'block-end',
            index: 0,
            block: {
              type: 'tool-call',
              id: 'call-web-1',
              name: 'web_search',
              arguments: JSON.stringify({ queries: ['dsh threads docs'] }),
            },
          }
          yield { type: 'finish', reason: { kind: 'tool-calls' } }
          return
        }
        const toolMsg = opts.messages.find((m) => m.role === 'tool')
        assert.ok(toolMsg, 'second step must receive tool result message')
        assert.match(toolMsg.content[0].text, /Result for dsh threads docs/)
        yield { type: 'text-delta', index: 0, text: 'Found it in docs.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })

    const emitted: ThreadsSseEvent[] = []
    const origEmit = h.bus.emit.bind(h.bus)
    h.bus.emit = (ev) => {
      emitted.push(ev)
      origEmit(ev)
    }

    const withTools = await h.service.createSideChat(
      {
        parentSessionId: 'parent-1',
        model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
        question: 'Look up dsh threads docs',
      },
      { wait: true },
    )
    assert.equal(withTools.toolsEnabled, true)
    assert.equal(withTools.messages[1].text, 'Found it in docs.')
    assert.equal(withTools.messages[1].toolCalls?.length, 1)
    assert.equal(withTools.messages[1].toolCalls?.[0].name, 'web_search')
    assert.equal(withTools.messages[1].toolCalls?.[0].status, 'done')

    const toolEvents = emitted.filter((e) => e.type === 'side-chat-tool')
    assert.deepEqual(
      toolEvents.map((e) => e.toolCall.status),
      ['running', 'done'],
    )

    h.setStreamImpl(async function* (opts) {
      assert.equal(opts.tools, undefined)
      assert.match(opts.system ?? '', /do NOT invoke any tools/i)
      yield { type: 'text-delta', index: 0, text: 'No tools answer.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })

    const noTools = await h.service.sendSideChatMessage(
      withTools.id,
      { text: 'Answer offline only', toolsEnabled: false },
      { wait: true },
    )
    assert.equal(noTools.toolsEnabled, false)
    assert.equal(noTools.messages.at(-1)?.text, 'No tools answer.')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('SideChat automatically retries text-only when provider hits single-turn limit on denied MCP tool', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-singleturn-retry-'))
  try {
    let calls = 0
    const h = createHarness({
      stateDir: dir,
      cwd: dir,
      streamImpl: async function* (opts) {
        calls += 1
        if (calls === 1) {
          yield {
            type: 'reasoning-delta',
            index: 0,
            text: '⚠ Denied mcp__plugin_playwright_playwright__browser_navigate: Claude requested permissions to use mcp__plugin_playwright_playwright__browser_navigate, but you haven\'t granted it yet.',
          }
          yield {
            type: 'finish',
            reason: {
              kind: 'error',
              failure: { message: 'Reached maximum number of turns (1)' },
            },
          }
          return
        }

        assert.equal(opts.tools, undefined)
        assert.match(opts.system ?? '', /Do NOT invoke any tool/i)
        const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user')
        assert.ok(lastUser)
        assert.ok(
          lastUser.content.some(
            (b) => b.type === 'text' && b.text.includes('Tool and MCP calls are unavailable'),
          ),
        )
        yield { type: 'text-delta', index: 0, text: 'Direct text recommendation.' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    })

    const emitted: ThreadsSseEvent[] = []
    const origEmit = h.bus.emit.bind(h.bus)
    h.bus.emit = (ev) => {
      emitted.push(ev)
      origEmit(ev)
    }

    const retried = await h.service.createSideChat(
      {
        parentSessionId: 'parent-1',
        model: { provider: 'claude-code', model: 'claude-opus-5-5' },
        question: 'Suggest a better code review tool',
      },
      { wait: true },
    )

    assert.equal(calls, 2)
    assert.equal(retried.messages[0].text, 'Suggest a better code review tool')
    assert.equal(retried.messages[0].text.includes('Tool and MCP calls are unavailable'), false)
    assert.equal(retried.messages[1].error, undefined)
    assert.equal(retried.messages[1].reasoning, undefined)
    assert.equal(retried.messages[1].text, 'Direct text recommendation.')

    const resetEvents = emitted.filter(
      (ev): ev is Extract<ThreadsSseEvent, { type: 'side-chat-updated' }> =>
        ev.type === 'side-chat-updated' &&
        ev.sideChat.messages.some((m) => m.streaming === true && m.reasoning === ''),
    )
    assert.equal(resetEvents.length, 1)

    // Non-recoverable errors must not retry.
    let fatalCalls = 0
    h.setStreamImpl(async function* () {
      fatalCalls += 1
      yield {
        type: 'finish',
        reason: { kind: 'error', failure: { message: 'API rate limit exceeded' } },
      }
    })
    const failed = await h.service.sendSideChatMessage(
      retried.id,
      { text: 'Trigger rate limit' },
      { wait: true },
    )
    assert.equal(fatalCalls, 1)
    assert.equal(failed.messages.at(-1)?.error, 'API rate limit exceeded')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
