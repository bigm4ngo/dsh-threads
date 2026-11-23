import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LineageEdge, SideChat } from '../shared/types.ts'

interface PersistedThreadsState {
  version: 1
  sideChats: SideChat[]
  edges: LineageEdge[]
}

export interface ThreadsStoreLogger {
  warn(message: string): void
}

export function resolveThreadsStateDir(): string {
  const override = process.env.DSH_THREADS_STATE_DIR?.trim()
  if (override) {
    return path.resolve(override)
  }
  const xdgStateHome = process.env.XDG_STATE_HOME?.trim()
  if (xdgStateHome) {
    return path.join(path.resolve(xdgStateHome), 'dsh-threads')
  }
  return path.join(os.homedir(), '.local', 'state', 'dsh-threads')
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isSideChatLike(value: unknown): value is SideChat {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.id === 'string' &&
    typeof rec.parentSessionId === 'string' &&
    typeof rec.title === 'string' &&
    typeof rec.createdAt === 'number' &&
    typeof rec.updatedAt === 'number' &&
    Array.isArray(rec.messages)
  )
}

function isLineageEdgeLike(value: unknown): value is LineageEdge {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec.id === 'string' &&
    typeof rec.kind === 'string' &&
    typeof rec.parentSessionId === 'string' &&
    typeof rec.childSessionId === 'string' &&
    typeof rec.createdAt === 'number'
  )
}

function sortSideChats(chats: SideChat[]): SideChat[] {
  return [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    .map(clone)
}

function sortEdges(edges: LineageEdge[]): LineageEdge[] {
  return [...edges].sort((a, b) => a.createdAt - b.createdAt).map(clone)
}

/**
 * Atomic JSON persistence for side chats and session lineage edges under
 * ~/.local/state/dsh-threads/state.json.
 */
export class ThreadsStore {
  readonly stateDir: string
  readonly filePath: string
  private readonly logger?: ThreadsStoreLogger
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(options: { stateDir?: string; logger?: ThreadsStoreLogger } = {}) {
    this.stateDir = options.stateDir ? path.resolve(options.stateDir) : resolveThreadsStateDir()
    this.filePath = path.join(this.stateDir, 'state.json')
    this.logger = options.logger
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(task, task)
    this.writeQueue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private async readUnsafe(): Promise<PersistedThreadsState> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return { version: 1, sideChats: [], edges: [] }
      }
      throw error
    }

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('state.json must be a JSON object')
      }
      const rec = parsed as Record<string, unknown>
      if (!Array.isArray(rec.sideChats) || !Array.isArray(rec.edges)) {
        throw new Error('state.json has invalid sideChats or edges arrays')
      }
      return {
        version: 1,
        sideChats: rec.sideChats.filter(isSideChatLike).map(clone),
        edges: rec.edges.filter(isLineageEdgeLike).map(clone),
      }
    } catch (error) {
      await this.backupCorruptFile(error)
      return { version: 1, sideChats: [], edges: [] }
    }
  }

  private async backupCorruptFile(error: unknown): Promise<void> {
    const backupName = `state.corrupt.${Date.now()}.json`
    const backupPath = path.join(this.stateDir, backupName)
    try {
      await mkdir(this.stateDir, { recursive: true })
      await copyFile(this.filePath, backupPath)
      this.logger?.warn(
        `dsh-threads: corrupt state.json backed up to ${backupPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    } catch (backupError) {
      this.logger?.warn(
        `dsh-threads: failed to back up corrupt state.json: ${
          backupError instanceof Error ? backupError.message : String(backupError)
        }`,
      )
    }
  }

  private async writeUnsafe(data: PersistedThreadsState): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    const tmpPath = path.join(this.stateDir, `.state.${process.pid}.${randomUUID()}.tmp`)
    const payload = `${JSON.stringify(data, null, 2)}\n`
    try {
      await writeFile(tmpPath, payload, 'utf8')
      await rename(tmpPath, this.filePath)
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async listSideChats(parentSessionId?: string): Promise<SideChat[]> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const filtered = parentSessionId
        ? data.sideChats.filter((chat) => chat.parentSessionId === parentSessionId)
        : data.sideChats
      return sortSideChats(filtered)
    })
  }

  async getSideChat(id: string): Promise<SideChat | undefined> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const found = data.sideChats.find((chat) => chat.id === id)
      return found ? clone(found) : undefined
    })
  }

  async createSideChat(chat: SideChat): Promise<SideChat> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const stored = clone(chat)
      data.sideChats.push(stored)
      await this.writeUnsafe(data)
      return clone(stored)
    })
  }

  async updateSideChat(
    id: string,
    updater: (current: SideChat) => SideChat | Promise<SideChat>,
  ): Promise<SideChat | undefined> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const index = data.sideChats.findIndex((chat) => chat.id === id)
      if (index === -1) return undefined
      const updated = clone(await updater(clone(data.sideChats[index])))
      data.sideChats[index] = updated
      await this.writeUnsafe(data)
      return clone(updated)
    })
  }

  async deleteSideChat(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const remaining = data.sideChats.filter((chat) => chat.id !== id)
      if (remaining.length === data.sideChats.length) return false
      data.sideChats = remaining
      await this.writeUnsafe(data)
      return true
    })
  }

  async listEdges(): Promise<LineageEdge[]> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      return sortEdges(data.edges)
    })
  }

  async addEdge(edge: LineageEdge): Promise<LineageEdge> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const stored = clone(edge)
      data.edges.push(stored)
      await this.writeUnsafe(data)
      return clone(stored)
    })
  }

  async updateEdge(
    id: string,
    updater: (current: LineageEdge) => LineageEdge | Promise<LineageEdge>,
  ): Promise<LineageEdge | undefined> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const index = data.edges.findIndex((edge) => edge.id === id)
      if (index === -1) return undefined
      const updated = clone(await updater(clone(data.edges[index])))
      data.edges[index] = updated
      await this.writeUnsafe(data)
      return clone(updated)
    })
  }

  async getConnectedLineage(sessionId: string): Promise<{
    sessionIds: string[]
    edges: LineageEdge[]
    sideChatCounts: Record<string, number>
  }> {
    return this.enqueue(async () => {
      const data = await this.readUnsafe()
      const visited = new Set<string>([sessionId])
      const queue: string[] = [sessionId]
      const matchedEdges = new Map<string, LineageEdge>()

      while (queue.length > 0) {
        const current = queue.shift()!
        for (const edge of data.edges) {
          if (edge.parentSessionId !== current && edge.childSessionId !== current) continue
          matchedEdges.set(edge.id, clone(edge))
          const other =
            edge.parentSessionId === current ? edge.childSessionId : edge.parentSessionId
          if (!visited.has(other)) {
            visited.add(other)
            queue.push(other)
          }
        }
      }

      const sideChatCounts: Record<string, number> = {}
      for (const chat of data.sideChats) {
        if (visited.has(chat.parentSessionId)) {
          sideChatCounts[chat.parentSessionId] = (sideChatCounts[chat.parentSessionId] ?? 0) + 1
        }
      }

      return {
        sessionIds: [...visited],
        edges: sortEdges([...matchedEdges.values()]),
        sideChatCounts,
      }
    })
  }
}
