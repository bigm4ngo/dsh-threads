import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { SideChat, ThreadsSseEvent } from '../shared/types.ts'
import { ThreadsEventBus } from './events.ts'
import { createThreadsHandler } from './routes.ts'
import {
  type LlmChunkLike,
  type LlmGenerateOptionsLike,
  type LlmServiceLike,
  type SessionControllerLike,
  type SessionQueryLike,
  ThreadsService,
} from './service.ts'
import { ThreadsStore } from './store.ts'

async function startTestServer(options: {
  stateDir: string
  rejection?: (req: IncomingMessage) => 401 | 403 | undefined
  running?: boolean
}) {
  let seq = 0
  const llmCalls: LlmGenerateOptionsLike[] = []
  let customStream: ((opts: LlmGenerateOptionsLike) => AsyncIterable<LlmChunkLike>) | undefined

  const sessionController: SessionControllerLike = {
    async modelCatalog() {
      return { groups: [{ id: 'openrouter', models: [{ id: 'z-ai/glm-5.3-flash' }] }] }
    },
    async create() {
      seq += 1
      return { sessionId: `http-sess-${seq}` }
    },
    async fork() {
      seq += 1
      return { sessionId: `http-fork-${seq}` }
    },
    async resolveAgent(sessionId) {
      return {
        agent: {
          id: sessionId,
          session: { id: sessionId, header: { id: sessionId, cwd: options.stateDir }, append() {} },
          model: { select() {} },
        },
      }
    },
    async rename({ title }) {
      return { title, seq: 1 }
    },
    async prompt() {
      return { accepted: true }
    },
    async state() {
      return { running: options.running ?? false }
    },
  }

  const llm: LlmServiceLike = {
    async resolveCallConfig(sel) {
      return sel
    },
    async *stream(opts) {
      for (const m of opts.messages) {
        assert.ok(typeof m.id === 'string' && m.id.length > 0)
        if (m.role === 'assistant') {
          assert.equal(m.source.kind, 'model')
          const _replay = m.source.replayState
          void _replay
        } else {
          assert.equal(m.source.kind, 'user')
        }
      }
      llmCalls.push(opts)
      if (customStream) {
        yield* customStream(opts)
        return
      }
      yield { type: 'text-delta', index: 0, text: 'hello' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }

  const sessionQuery: SessionQueryLike = {
    async readSession(sessionId) {
      return {
        session: { id: sessionId, cwd: options.stateDir },
        events: [
          { type: 'turn/start', seq: 0, time: 100, data: { turn: 1 } },
          {
            type: 'user/message',
            seq: 1,
            time: 101,
            data: { role: 'user', source: { kind: 'user-rpc' }, content: [{ type: 'text', text: 'hi' }] },
          },
          {
            type: 'assistant/message',
            seq: 2,
            time: 102,
            data: {
              message: {
                source: { kind: 'model', provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
                content: [{ type: 'text', text: 'hey' }],
              },
            },
          },
          { type: 'turn/end', seq: 3, time: 103, data: { turn: 1, reason: { kind: 'completed' } } },
        ],
      }
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
  })
  const handler = createThreadsHandler({
    service,
    bus,
    connection: options.rejection ? { requestRejection: options.rejection } : undefined,
  })

  const server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const baseUrl = `http://127.0.0.1:${port}/dsh-threads`

  return {
    baseUrl,
    bus,
    service,
    llmCalls,
    setStream: (fn: ((opts: LlmGenerateOptionsLike) => AsyncIterable<LlmChunkLike>) | undefined) => {
      customStream = fn
    },
    close: async () => {
      service.dispose()
      bus.close()
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}

async function createSseEventReader(url: string) {
  const controller = new AbortController()
  const res = await fetch(url, { signal: controller.signal })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const queue: ThreadsSseEvent[] = []
  const waiters: Array<(ev: ThreadsSseEvent) => void> = []

  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        while (true) {
          const sep = buffer.indexOf('\n\n')
          if (sep === -1) break
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue
            const parsed = JSON.parse(line.slice(5).trim()) as ThreadsSseEvent
            const waiter = waiters.shift()
            if (waiter) waiter(parsed)
            else queue.push(parsed)
          }
        }
      }
    } catch {
      // Ignore abort on close.
    }
  })()

  return {
    async nextMatching(predicate: (ev: ThreadsSseEvent) => boolean, timeoutMs = 4000): Promise<ThreadsSseEvent> {
      const deadline = Date.now() + timeoutMs
      while (true) {
        const idx = queue.findIndex(predicate)
        if (idx !== -1) {
          return queue.splice(idx, 1)[0]
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          throw new Error('Timed out waiting for matching SSE event')
        }
        const nextEv = await Promise.race([
          new Promise<ThreadsSseEvent>((resolve) => {
            waiters.push(resolve)
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timed out waiting for SSE frame')), remaining)
          }),
        ])
        if (predicate(nextEv)) return nextEv
        queue.push(nextEv)
      }
    },
    async close() {
      controller.abort()
      await reader.cancel().catch(() => undefined)
      await pump
    },
  }
}

test('HTTP routes enforce guards, 409 SOURCE_RUNNING, and side-chat CRUD', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-http-'))
  let forcedRejection: 401 | 403 | undefined
  const srv = await startTestServer({
    stateDir: dir,
    rejection: () => forcedRejection,
    running: true,
  })

  try {
    forcedRejection = 401
    assert.equal((await fetch(`${srv.baseUrl}/api/catalog`)).status, 401)
    forcedRejection = undefined

    const rCross = await fetch(`${srv.baseUrl}/api/catalog`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    assert.equal(rCross.status, 403)

    const r415 = await fetch(`${srv.baseUrl}/api/side-chats`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    assert.equal(r415.status, 415)

    const rInspect = await fetch(`${srv.baseUrl}/api/sessions/s-1/inspect`)
    assert.equal(rInspect.status, 200)
    const insp = (await rInspect.json()) as { turns: unknown[] }
    assert.equal(insp.turns.length, 1)

    const rCreate = await fetch(`${srv.baseUrl}/api/side-chats?wait=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentSessionId: 's-1', question: 'explain' }),
    })
    assert.equal(rCreate.status, 201)
    const created = (await rCreate.json()) as { sideChat: { id: string; messages: Array<{ text: string }> } }
    assert.equal(created.sideChat.messages[1].text, 'hello')

    // Running source conflict surfaces HTTP 409 with code SOURCE_RUNNING.
    const r409 = await fetch(`${srv.baseUrl}/api/handoff/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 's-1',
        toModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
        workspaceMode: 'same',
        delivery: 'draft',
        packetText: 'continue here',
      }),
    })
    assert.equal(r409.status, 409)
    const err409 = (await r409.json()) as { code: string }
    assert.equal(err409.code, 'SOURCE_RUNNING')

    const rDel = await fetch(`${srv.baseUrl}/api/side-chats/${created.sideChat.id}`, {
      method: 'DELETE',
    })
    assert.equal(rDel.status, 204)
  } finally {
    await srv.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('HTTP side-chat non-blocking streaming emits real-time deltas and supports second message', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-http-sse-'))
  const srv = await startTestServer({ stateDir: dir })
  const sse = await createSseEventReader(`${srv.baseUrl}/api/events`)

  try {
    let finishTurn1!: () => void
    const gateTurn1 = new Promise<void>((resolve) => {
      finishTurn1 = resolve
    })

    srv.setStream(async function* () {
      yield { type: 'reasoning-delta', index: 0, text: 'Step 1. ' }
      yield { type: 'text-delta', index: 1, text: 'First ' }
      await gateTurn1
      yield { type: 'text-delta', index: 1, text: 'reply.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })

    // Turn 1: POST /api/side-chats returns 201 immediately while stream is paused.
    const rCreate = await fetch(`${srv.baseUrl}/api/side-chats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentSessionId: 's-1', question: 'first question' }),
    })
    assert.equal(rCreate.status, 201)
    const createdBody = (await rCreate.json()) as { sideChat: SideChat }
    assert.equal(createdBody.sideChat.messages.length, 2)
    assert.equal(createdBody.sideChat.messages[1].streaming, true)

    const deltaReason = await sse.nextMatching(
      (ev) => ev.type === 'side-chat-delta' && ev.sideChatId === createdBody.sideChat.id && ev.seq === 1,
    )
    assert.equal(deltaReason.type, 'side-chat-delta')
    if (deltaReason.type === 'side-chat-delta') {
      assert.equal(deltaReason.channel, 'reasoning')
      assert.equal(deltaReason.delta, 'Step 1. ')
    }

    const deltaFirst = await sse.nextMatching(
      (ev) => ev.type === 'side-chat-delta' && ev.sideChatId === createdBody.sideChat.id && ev.seq === 2,
    )
    if (deltaFirst.type === 'side-chat-delta') {
      assert.equal(deltaFirst.channel, 'text')
      assert.equal(deltaFirst.delta, 'First ')
    }

    // Now unblock Turn 1 completion and observe final SSE update.
    finishTurn1()
    const finalTurn1 = await sse.nextMatching(
      (ev) =>
        ev.type === 'side-chat-updated' &&
        ev.sideChat.id === createdBody.sideChat.id &&
        ev.sideChat.messages.length === 2 &&
        ev.sideChat.messages[1].streaming === false,
    )
    assert.equal(finalTurn1.type, 'side-chat-updated')
    if (finalTurn1.type === 'side-chat-updated') {
      assert.equal(finalTurn1.sideChat.messages[1].text, 'First reply.')
      assert.equal(finalTurn1.sideChat.messages[1].reasoning, 'Step 1.')
    }

    // Turn 2: POST /api/side-chats/:id/messages returns 202 immediately and succeeds with canonical history.
    let finishTurn2!: () => void
    const gateTurn2 = new Promise<void>((resolve) => {
      finishTurn2 = resolve
    })
    srv.setStream(async function* () {
      yield { type: 'text-delta', index: 0, text: 'Second ' }
      await gateTurn2
      yield { type: 'text-delta', index: 0, text: 'reply.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })

    const rMsg2 = await fetch(
      `${srv.baseUrl}/api/side-chats/${encodeURIComponent(createdBody.sideChat.id)}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'second question' }),
      },
    )
    assert.equal(rMsg2.status, 202)
    const msg2Body = (await rMsg2.json()) as { sideChat: SideChat }
    assert.equal(msg2Body.sideChat.messages.length, 4)
    assert.equal(msg2Body.sideChat.messages[3].streaming, true)

    const deltaTurn2 = await sse.nextMatching(
      (ev) =>
        ev.type === 'side-chat-delta' &&
        ev.sideChatId === createdBody.sideChat.id &&
        ev.messageId === msg2Body.sideChat.messages[3].id,
    )
    if (deltaTurn2.type === 'side-chat-delta') {
      assert.equal(deltaTurn2.delta, 'Second ')
    }

    finishTurn2()
    const finalTurn2 = await sse.nextMatching(
      (ev) =>
        ev.type === 'side-chat-updated' &&
        ev.sideChat.id === createdBody.sideChat.id &&
        ev.sideChat.messages.length === 4 &&
        ev.sideChat.messages[3].streaming === false,
    )
    if (finalTurn2.type === 'side-chat-updated') {
      assert.equal(finalTurn2.sideChat.messages[3].text, 'Second reply.')
    }
    assert.deepEqual(
      srv.llmCalls[1].messages.map((m) => ({
        role: m.role,
        sourceKind: m.source.kind,
        text: m.content[0].text,
      })),
      [
        { role: 'user', sourceKind: 'user', text: 'first question' },
        { role: 'assistant', sourceKind: 'model', text: 'First reply.' },
        { role: 'user', sourceKind: 'user', text: 'second question' },
      ],
    )
  } finally {
    await sse.close()
    await srv.close()
    await rm(dir, { recursive: true, force: true })
  }
})
