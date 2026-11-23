import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { LineageEdge, SideChat } from '../shared/types.ts'
import { ThreadsStore } from './store.ts'

function makeChat(id: string, parentSessionId: string, updatedAt: number): SideChat {
  return {
    id,
    parentSessionId,
    title: `Chat ${id}`,
    contextTurnCount: 2,
    contextSummary: 'context',
    model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
    messages: [],
    createdAt: updatedAt - 100,
    updatedAt,
  }
}

function makeEdge(
  id: string,
  parentSessionId: string,
  childSessionId: string,
  createdAt: number,
): LineageEdge {
  return {
    id,
    kind: 'fork',
    parentSessionId,
    childSessionId,
    workspaceMode: 'same',
    createdAt,
  }
}

test('ThreadsStore persists side chats and edges atomically and handles concurrent writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-store-'))
  try {
    const store = new ThreadsStore({ stateDir: dir })

    await Promise.all([
      store.createSideChat(makeChat('sc-1', 'sess-a', 100)),
      store.createSideChat(makeChat('sc-2', 'sess-a', 200)),
      store.createSideChat(makeChat('sc-3', 'sess-b', 150)),
      store.addEdge(makeEdge('e-1', 'sess-root', 'sess-a', 10)),
      store.addEdge(makeEdge('e-2', 'sess-a', 'sess-c', 20)),
      store.addEdge(makeEdge('e-3', 'sess-c', 'sess-root', 30)), // deliberate cycle guard test
    ])

    const aChats = await store.listSideChats('sess-a')
    assert.deepEqual(
      aChats.map((c) => c.id),
      ['sc-2', 'sc-1'],
    )

    const updated = await store.updateSideChat('sc-1', (cur) => ({
      ...cur,
      title: 'Renamed',
      updatedAt: 500,
    }))
    assert.equal(updated?.title, 'Renamed')

    const lineage = await store.getConnectedLineage('sess-a')
    assert.equal(new Set(lineage.sessionIds).size, 3)
    assert.equal(lineage.edges.length, 3)
    assert.equal(lineage.sideChatCounts['sess-a'], 2)

    const deleted = await store.deleteSideChat('sc-2')
    assert.equal(deleted, true)
    assert.equal((await store.listSideChats('sess-a')).length, 1)

    const raw = JSON.parse(await readFile(store.filePath, 'utf8')) as { version: number }
    assert.equal(raw.version, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('ThreadsStore backs up corrupt state.json and recovers cleanly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-threads-corrupt-'))
  const warnings: string[] = []
  try {
    const store = new ThreadsStore({
      stateDir: dir,
      logger: { warn: (msg) => warnings.push(msg) },
    })
    await writeFile(store.filePath, '{corrupt json!!!', 'utf8')
    const chats = await store.listSideChats()
    assert.deepEqual(chats, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /corrupt state\.json backed up/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
