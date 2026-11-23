import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { build } from 'esbuild'
import type { DshClientContext } from './dsh-types.ts'
import { ensureThreadsStyles } from './styles.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_ENTRY = path.join(__dirname, 'index.ts')

class MockStyleElement {
  tagName = 'STYLE'
  id = ''
  textContent = ''
  attributes = new Map<string, string>()
  parentNode: MockHead | null = null

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  remove(): void {
    this.parentNode?.removeChild(this)
  }
}

class MockHead {
  children: MockStyleElement[] = []

  appendChild(el: MockStyleElement): MockStyleElement {
    if (!this.children.includes(el)) {
      this.children.push(el)
    }
    el.parentNode = this
    return el
  }

  removeChild(el: MockStyleElement): void {
    this.children = this.children.filter((c) => c !== el)
    if (el.parentNode === this) {
      el.parentNode = null
    }
  }
}

class MockEventSource {
  static instances: MockEventSource[] = []
  readonly url: string
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close(): void {
    this.closed = true
  }
}

async function compileClientPluginForTest(): Promise<{
  name: string
  inject: string[]
  apply: (ctx: DshClientContext) => unknown
}> {
  const result = await build({
    entryPoints: [CLIENT_ENTRY],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120', 'safari17'],
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    define: {
      'process.env.NODE_ENV': '"test"',
    },
  })

  const code = result.outputFiles[0]?.text
  assert.ok(code, 'expected in-memory esbuild output')

  const requireFromHere = createRequire(import.meta.url)
  const module = { exports: {} as Record<string, unknown> }
  const wrapped = `(function (exports, require, module) {\n${code}\n})`
  const fn = vm.runInThisContext(wrapped) as (
    exports: Record<string, unknown>,
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
  ) => void

  fn(
    module.exports,
    (spec: string) => {
      if (spec === 'react' || spec === 'react/jsx-runtime') {
        return requireFromHere(spec)
      }
      throw new Error(`Unexpected external require in client test: ${spec}`)
    },
    module,
  )

  return module.exports as {
    name: string
    inject: string[]
    apply: (ctx: DshClientContext) => unknown
  }
}

function createCordisClientHarness() {
  const registeredTabIds = new Set<string>()
  const registeredSlots = new Map<string, unknown>()
  let activeDisposers: Array<{ label?: string; dispose: () => void | Promise<void> }> = []

  const ctx: DshClientContext = {
    effect(execute, label) {
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
    sidebarRightTabs: {
      // Intentionally does NOT call ctx.effect (mirrors DSH ui-sidebar-right whose registry
      // uses its own ctx.effect and requires callers to retain the disposer via ctx.effect).
      register(def) {
        if (registeredTabIds.has(def.id)) {
          throw new Error(`sidebarRight: tab type id "${def.id}" is already registered`)
        }
        registeredTabIds.add(def.id)
        return () => {
          registeredTabIds.delete(def.id)
        }
      },
    },
    slots: {
      // Intentionally returns factory disposer without calling ctx.effect so the test verifies
      // client/index.ts wraps every slots.inject call in ctx.effect(...).
      inject(_slotName, factory) {
        const innerDispose = factory()
        return () => {
          if (typeof innerDispose === 'function') {
            innerDispose()
          }
        }
      },
      register(meta, component) {
        const key = `${String(meta.name)}:${String(meta.key ?? meta.id)}`
        if (registeredSlots.has(key)) {
          throw new Error(`slots: duplicate registration "${key}"`)
        }
        registeredSlots.set(key, component)
        return () => {
          registeredSlots.delete(key)
        }
      },
    },
    sessions: {},
    workspaces: {},
    uiWorkspace: {},
    uiSession: {},
    uiConversation: {},
    sidebarRight: {},
  }

  const dispose = async () => {
    for (const item of activeDisposers.splice(0).reverse()) {
      await item.dispose()
    }
  }

  return {
    ctx,
    registeredTabIds,
    registeredSlots,
    dispose,
  }
}

test('ensureThreadsStyles stamps data-plugin and removes its style element on dispose', () => {
  const prevDocument = (globalThis as { document?: unknown }).document
  const prevHtmlStyle = (globalThis as { HTMLStyleElement?: unknown }).HTMLStyleElement
  const head = new MockHead()

  ;(globalThis as { HTMLStyleElement: unknown }).HTMLStyleElement = MockStyleElement
  ;(globalThis as { document: unknown }).document = {
    head,
    getElementById(id: string) {
      return head.children.find((el) => el.id === id) ?? null
    },
    createElement(tag: string) {
      assert.equal(tag, 'style')
      return new MockStyleElement()
    },
  }

  try {
    const dispose = ensureThreadsStyles()
    assert.equal(head.children.length, 1)
    assert.equal(head.children[0].id, 'dsh-threads-styles')
    assert.equal(head.children[0].getAttribute('data-plugin'), 'dsh-threads')
    assert.ok(head.children[0].textContent.includes('.dsh-thr-root'))

    dispose()
    assert.equal(head.children.length, 0)
  } finally {
    if (prevDocument === undefined) {
      delete (globalThis as { document?: unknown }).document
    } else {
      ;(globalThis as { document: unknown }).document = prevDocument
    }
    if (prevHtmlStyle === undefined) {
      delete (globalThis as { HTMLStyleElement?: unknown }).HTMLStyleElement
    } else {
      ;(globalThis as { HTMLStyleElement: unknown }).HTMLStyleElement = prevHtmlStyle
    }
  }
})

test('client plugin cleans up tab type, slots, styles, and EventSource across repeated HMR cycles', async () => {
  const clientMod = await compileClientPluginForTest()
  assert.equal(clientMod.name, 'dsh-threads')
  assert.ok(clientMod.inject.includes('sidebarRightTabs'))

  const prevDocument = (globalThis as { document?: unknown }).document
  const prevHtmlStyle = (globalThis as { HTMLStyleElement?: unknown }).HTMLStyleElement
  const prevEventSource = (globalThis as { EventSource?: unknown }).EventSource

  const head = new MockHead()
  MockEventSource.instances = []

  ;(globalThis as { HTMLStyleElement: unknown }).HTMLStyleElement = MockStyleElement
  ;(globalThis as { document: unknown }).document = {
    head,
    getElementById(id: string) {
      return head.children.find((el) => el.id === id) ?? null
    },
    createElement(tag: string) {
      assert.equal(tag, 'style')
      return new MockStyleElement()
    },
  }
  ;(globalThis as { EventSource: unknown }).EventSource = MockEventSource

  try {
    const harness = createCordisClientHarness()
    const ApplyCtor = clientMod.apply as unknown as new (ctx: DshClientContext) => unknown

    for (let cycle = 0; cycle < 3; cycle++) {
      // Simulate Cordis `isConstructor(apply)` which calls `new apply(ctx)` and ignores return values.
      const instance = new ApplyCtor(harness.ctx)
      void instance

      assert.deepEqual([...harness.registeredTabIds], ['dsh-threads'])
      assert.equal(harness.registeredSlots.size, 7)
      assert.equal(head.children.length, 1)
      assert.equal(head.children[0].getAttribute('data-plugin'), 'dsh-threads')

      const activeSources = MockEventSource.instances.filter((s) => !s.closed)
      assert.equal(activeSources.length, 1, `Expected 1 open EventSource in cycle ${cycle}`)

      await harness.dispose()

      assert.equal(
        harness.registeredTabIds.size,
        0,
        `Tab type should be unregistered on dispose (cycle ${cycle})`,
      )
      assert.equal(
        harness.registeredSlots.size,
        0,
        `Slots should be unregistered on dispose (cycle ${cycle})`,
      )
      assert.equal(
        head.children.length,
        0,
        `Style element should be removed on dispose (cycle ${cycle})`,
      )
      assert.equal(
        MockEventSource.instances.every((s) => s.closed),
        true,
        `EventSource should be closed on dispose (cycle ${cycle})`,
      )
    }
  } finally {
    if (prevDocument === undefined) {
      delete (globalThis as { document?: unknown }).document
    } else {
      ;(globalThis as { document: unknown }).document = prevDocument
    }
    if (prevHtmlStyle === undefined) {
      delete (globalThis as { HTMLStyleElement?: unknown }).HTMLStyleElement
    } else {
      ;(globalThis as { HTMLStyleElement: unknown }).HTMLStyleElement = prevHtmlStyle
    }
    if (prevEventSource === undefined) {
      delete (globalThis as { EventSource?: unknown }).EventSource
    } else {
      ;(globalThis as { EventSource: unknown }).EventSource = prevEventSource
    }
  }
})
