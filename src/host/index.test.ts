import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { apply, inject, name, type HostPluginContext } from './index.ts'

const INJECTED_HOST_KEYS = new Set([
  'webServer',
  'connection',
  'sessionController',
  'llm',
  'logger',
  'get',
  'effect',
])

class MockSseResponse extends EventEmitter {
  statusCode = 200
  headers = new Map<string, string>()
  chunks: string[] = []
  ended = false
  socket = {
    setNoDelay() {},
  }

  setHeader(key: string, value: string): void {
    this.headers.set(key.toLowerCase(), value)
  }

  writeHead(status: number): this {
    this.statusCode = status
    return this
  }

  flushHeaders(): void {}

  write(chunk: string): boolean {
    this.chunks.push(chunk)
    return true
  }

  end(): this {
    this.ended = true
    this.emit('close')
    return this
  }
}

function createCordisHostHarness(options: { withCommands: boolean }) {
  const routes = new Map<
    string,
    {
      kind: 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    }
  >()
  const commands = new Map<string, { name: string }>()
  const warnings: string[] = []
  let activeDisposers: Array<{ label?: string; dispose: () => void | Promise<void> }> = []

  const webServer = {
    register(route: {
      kind: 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    }) {
      if (routes.has(route.path)) {
        throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
      }
      routes.set(route.path, route)
      return () => {
        routes.delete(route.path)
      }
    },
  }

  const commandsRuntime = {
    register(def: { name: string }) {
      if (commands.has(def.name)) {
        throw new Error(`command "${def.name}" is already registered`)
      }
      commands.set(def.name, def)
      return () => {
        commands.delete(def.name)
      }
    },
  }

  const optionalServices: Record<string, unknown> = options.withCommands
    ? { commands: commandsRuntime }
    : {}

  const injectedTarget: Record<string, unknown> = {
    webServer,
    connection: { requestRejection: () => undefined },
    sessionController: {},
    llm: {},
    logger: {
      info() {},
      warn(msg: string) {
        warnings.push(msg)
      },
      error() {},
    },
    get<T>(serviceName: string): T | undefined {
      return optionalServices[serviceName] as T | undefined
    },
    effect(execute: () => (() => void | Promise<void>) | void, label?: string) {
      const cleanup = execute()
      const wrapped = () => {
        if (typeof cleanup === 'function') {
          return cleanup()
        }
      }
      if (typeof cleanup === 'function') {
        activeDisposers.push({ label, dispose: wrapped })
      }
      return wrapped
    },
  }

  const scopedProxy = new Proxy(injectedTarget, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && !INJECTED_HOST_KEYS.has(prop)) {
        throw new Error(`cannot get property "${prop}" without inject`)
      }
      return Reflect.get(target, prop, receiver)
    },
  })

  const rootCtx: HostPluginContext = {
    inject(deps, callback) {
      assert.deepEqual(deps, ['webServer', 'connection', 'sessionController', 'llm'])
      callback(scopedProxy as never)
    },
  }

  const mount = () => {
    const ApplyCtor = apply as unknown as new (ctx: HostPluginContext) => unknown
    // Cordis constructs regular function plugins with `new` and discards return values.
    const instance = new ApplyCtor(rootCtx)
    void instance
  }

  const dispose = async () => {
    const toRun = activeDisposers.splice(0).reverse()
    for (const item of toRun) {
      await item.dispose()
    }
  }

  return {
    mount,
    dispose,
    routes,
    commands,
    warnings,
  }
}

test('host plugin mounts with absent optional services without throwing on ctx.get', async () => {
  const prevStateDir = process.env.DSH_THREADS_STATE_DIR
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-host-opt-'))
  process.env.DSH_THREADS_STATE_DIR = tmpDir

  try {
    assert.equal(name, 'dsh-threads')
    assert.deepEqual(inject, [])

    const harness = createCordisHostHarness({ withCommands: false })
    harness.mount()

    assert.deepEqual([...harness.routes.keys()], ['/dsh-threads'])
    assert.equal(harness.commands.size, 0)
    assert.deepEqual(harness.warnings, [])

    await harness.dispose()
    assert.equal(harness.routes.size, 0)
  } finally {
    if (prevStateDir === undefined) {
      delete process.env.DSH_THREADS_STATE_DIR
    } else {
      process.env.DSH_THREADS_STATE_DIR = prevStateDir
    }
    await rm(tmpDir, { recursive: true, force: true })
  }
})

test('host plugin cleans up route, commands, and active SSE clients across repeated HMR cycles', async () => {
  const prevStateDir = process.env.DSH_THREADS_STATE_DIR
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-host-hmr-'))
  process.env.DSH_THREADS_STATE_DIR = tmpDir

  try {
    const harness = createCordisHostHarness({ withCommands: true })

    for (let cycle = 0; cycle < 3; cycle++) {
      harness.mount()
      assert.deepEqual([...harness.routes.keys()], ['/dsh-threads'])
      assert.deepEqual([...harness.commands.keys()].sort(), ['handoff', 'side'])
      assert.deepEqual(harness.warnings, [])

      const route = harness.routes.get('/dsh-threads')
      assert.ok(route)

      const sseRes = new MockSseResponse()
      const sseReq = {
        method: 'GET',
        url: '/dsh-threads/api/events',
        headers: { host: '127.0.0.1:3080' },
      } as unknown as IncomingMessage

      await route.handler(sseReq, sseRes as unknown as ServerResponse)
      assert.equal(sseRes.ended, false)
      assert.ok(sseRes.chunks.some((c) => c.includes(': connected')))

      await harness.dispose()

      assert.equal(sseRes.ended, true, `SSE client should end on dispose (cycle ${cycle})`)
      assert.equal(harness.routes.size, 0, `Route should be unregistered on dispose (cycle ${cycle})`)
      assert.equal(
        harness.commands.size,
        0,
        `Slash commands should be unregistered on dispose (cycle ${cycle})`,
      )
    }
  } finally {
    if (prevStateDir === undefined) {
      delete process.env.DSH_THREADS_STATE_DIR
    } else {
      process.env.DSH_THREADS_STATE_DIR = prevStateDir
    }
    await rm(tmpDir, { recursive: true, force: true })
  }
})
