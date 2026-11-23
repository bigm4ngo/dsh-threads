import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  CatalogResponse,
  CreateSideChatRequest,
  DeliveryMode,
  DistillRequest,
  DistillResponse,
  EditAndRetryRequest,
  EditAndRetryResponse,
  ExecuteHandoffRequest,
  ExecuteHandoffResponse,
  ForkSessionRequest,
  GitRepoInfo,
  HandoffPreviewRequest,
  HandoffPreviewResponse,
  LineageEdge,
  LinkSessionsRequest,
  MergeBackRequest,
  MergeBackResponse,
  ModelSelectionSpec,
  PromoteSideChatRequest,
  SendSideChatMessageRequest,
  SessionInspectResponse,
  SessionTreeResponse,
  SideChat,
  SideChatMessage,
  TreeSessionNode,
  TurnSummary,
  UpdateSideChatRequest,
  WorkspaceMode,
  WorktreeInfo,
} from '../shared/types.ts'
import type { ThreadsEventBus } from './events.ts'
import {
  buildBoundedSideChatContext,
  buildHandoffPacket,
  buildMergeBackBrief,
  extractTurnsFromEvents,
  type RawSessionEvent,
} from './extractor.ts'
import { createIsolatedWorktree, inspectGitRepo } from './git.ts'
import type { ThreadsStore } from './store.ts'

export class HttpError extends Error {
  readonly statusCode: number
  readonly code?: string
  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.name = 'HttpError'
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, code?: string) {
    super(400, message, code)
    this.name = 'BadRequestError'
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends HttpError {
  constructor(code: string, message: string) {
    super(409, message, code)
    this.name = 'ConflictError'
  }
}

export interface LiveAgentLike {
  id: string
  session: {
    id: string
    header?: {
      id?: string
      cwd?: string
    }
    append(type: string, data: unknown): unknown
  }
  model: {
    select(selection: { provider: string; model: string; reasoningEffort?: string }): unknown
    current?(): { provider: string; model: string; reasoningEffort?: string } | undefined
  }
}

export interface SessionControllerLike {
  modelCatalog(): Promise<{
    groups?: Array<{
      id: string
      name?: string
      models?: Array<{
        id: string
        name?: string
        displayName?: string
        reasoning?: {
          efforts?: Array<string | { id: string; name?: string; description?: string }>
          defaultEffort?: string
        }
      }>
    }>
    defaultModel?: { provider: string; model: string; reasoningEffort?: string }
    default?: { provider: string; model: string; reasoningEffort?: string }
    failures?: Array<{ id?: string; provider?: string; name?: string; message?: string; error?: string }>
  }>
  create(request: {
    workspaceId?: string
    cwd?: string
    sessionId?: string
    agentPreset?: string
  }): Promise<{ sessionId: string; agentPreset?: string }>
  fork(request: {
    sessionId: string
    atSeq?: number
    allowMigration?: boolean
  }): Promise<{ sessionId: string }>
  resolveAgent(
    sessionId: string,
  ): Promise<{ agent: LiveAgentLike } | { error: { code?: string; message: string } }>
  rename(request: { sessionId: string; title: string }): Promise<{ title: string; seq: number }>
  prompt(
    request: {
      requestId: string
      sessionId: string
      mode: 'queue' | 'steer'
      content: Array<{ type: 'text'; text: string }>
      clientTimeZone?: string
    },
    signal: AbortSignal,
  ): Promise<{ accepted: boolean }>
  cancel?(request: { sessionId: string }): { accepted: boolean } | Promise<{ accepted: boolean }>
  state?(
    request: { sessionId: string },
    signal: AbortSignal,
  ): Promise<{ running: boolean; active?: boolean }>
  projections?(
    request: { sessionId: string },
    signal: AbortSignal,
  ): Promise<{ values?: Record<string, unknown> } | null>
  events?(
    request: {
      address: { kind: 'session'; sessionId: string }
      maxMessages?: number
      beforeSeq?: number
    },
    signal: AbortSignal,
  ): Promise<{ records?: Array<{ type: string; event: RawSessionEvent }>; hasMore?: boolean }>
}

export interface LlmChunkLike {
  type: string
  index?: number
  text?: string
  block?: { type?: string; text?: string }
  reason?: { kind?: string; failure?: { message?: string } }
}

export type LlmRequestMessageLike =
  | {
      id: string
      role: 'user'
      source: { kind: 'user' }
      content: Array<{ type: 'text'; text: string }>
    }
  | {
      id: string
      role: 'assistant'
      source: {
        kind: 'model'
        provider: string
        model: string
        replayState?: unknown
      }
      content: Array<{ type: 'text'; text: string }>
    }

export interface LlmGenerateOptionsLike {
  provider: string
  model: string
  reasoningEffort?: string
  temperature?: number
  maxTokens?: number
  system?: string
  messages: LlmRequestMessageLike[]
  signal?: AbortSignal
  sessionId?: string
  purpose?: string
}

export interface LlmServiceLike {
  resolveCallConfig(selection: {
    provider: string
    model: string
    reasoningEffort?: string
  }): Promise<{
    provider: string
    model: string
    reasoningEffort?: string
  }>
  prepareCall?(
    config: {
      provider: string
      model: string
      reasoningEffort?: string
    },
    signal?: AbortSignal,
  ): Promise<{
    config: {
      provider: string
      model: string
      reasoningEffort?: string
      temperature?: number
      maxTokens?: number
    }
    stream(options: LlmGenerateOptionsLike): AsyncIterable<LlmChunkLike>
  }>
  stream?(options: LlmGenerateOptionsLike): AsyncIterable<LlmChunkLike>
}

export interface SessionQueryLike {
  readSession(sessionId: string): Promise<{
    session: {
      id: string
      cwd?: string
      createdAt?: number
      parentSession?: string
      origin?: string
    }
    events: RawSessionEvent[]
  }>
  readTitle?(sessionId: string, signal?: AbortSignal): Promise<{ title: string } | undefined>
  traceSession?(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<{
    target: { header: { id: string; cwd?: string; origin?: string } }
    ancestors: Array<{ header: { id: string; cwd?: string; origin?: string } }>
    descendants: Array<{
      session: { header: { id: string; cwd?: string; origin?: string } }
      descendants: unknown[]
    }>
  }>
}

export interface WorkspaceRegistryLike {
  list?(): Array<{ id: string; path: string; title?: string; sessionIds?: readonly string[] }>
  get?(id: string): { id: string; path: string; title?: string; sessionIds?: readonly string[] } | undefined
}

export interface PermissionPresetsLike {
  set(session: unknown, preset: string): unknown
}

export interface SessionsServiceLike {
  get(sessionId: string):
    | {
        id?: string
        header?: { id?: string; cwd?: string }
        projections?: Record<string, unknown>
        running?: boolean
      }
    | undefined
}

export interface GitAdapter {
  inspectGitRepo: typeof inspectGitRepo
  createIsolatedWorktree: typeof createIsolatedWorktree
}

export interface ThreadsServiceDeps {
  store: ThreadsStore
  bus: ThreadsEventBus
  sessionController: SessionControllerLike
  llm: LlmServiceLike
  sessionQuery?: SessionQueryLike
  workspaceRegistry?: WorkspaceRegistryLike
  permissionPresets?: PermissionPresetsLike
  sessions?: SessionsServiceLike
  logger?: {
    info?(message: string): void
    warn?(message: string): void
    error?(message: string): void
  }
  git?: Partial<GitAdapter>
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function isAntigravityProvider(provider: string): boolean {
  const lower = provider.trim().toLowerCase()
  return lower === 'antigravity' || lower.includes('gravity')
}

function deriveShortTitle(text: string | undefined, fallback: string): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!collapsed) return fallback
  if (collapsed.length <= 52) return collapsed
  return `${collapsed.slice(0, 49).trimEnd()}…`
}

function asModelSelection(value: unknown): ModelSelectionSpec | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const provider = typeof rec.provider === 'string' ? rec.provider.trim() : ''
  const model = typeof rec.model === 'string' ? rec.model.trim() : ''
  if (!provider || !model) return undefined
  const effort =
    typeof rec.reasoningEffort === 'string' && rec.reasoningEffort.trim()
      ? rec.reasoningEffort.trim()
      : undefined
  return {
    provider,
    model,
    ...(effort ? { reasoningEffort: effort } : {}),
  }
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory()
  } catch {
    return false
  }
}

const MAX_PERSISTED_REASONING_CHARS = 16_000

interface LlmHistoryEntry {
  id?: string
  role: 'user' | 'assistant'
  text: string
  model?: ModelSelectionSpec
}

interface ActiveSideChatStream {
  messageId: string
  controller: AbortController
  text: string
  reasoning: string
  seq: number
  done: Promise<SideChat>
}

function capReasoningText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.length <= MAX_PERSISTED_REASONING_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_PERSISTED_REASONING_CHARS - 16).trimEnd()}\n… [truncated]`
}

function isUsableAssistantMessage(msg: SideChatMessage): boolean {
  return (
    msg.role === 'assistant' &&
    !msg.streaming &&
    msg.text.trim().length > 0 &&
    (!msg.error || msg.error === 'Stopped by user')
  )
}

function buildSideChatLlmHistory(
  existingMessages: readonly SideChatMessage[],
  nextUserMsg: { id: string; text: string },
): LlmHistoryEntry[] {
  const rawEntries: LlmHistoryEntry[] = []
  for (let i = 0; i < existingMessages.length; i += 1) {
    const msg = existingMessages[i]
    if (msg.streaming) continue
    if (msg.role === 'user') {
      const next = existingMessages[i + 1]
      if (next && next.role === 'assistant' && !isUsableAssistantMessage(next)) {
        i += 1
        continue
      }
      const trimmed = msg.text.trim()
      if (!trimmed) continue
      rawEntries.push({
        id: msg.id,
        role: 'user',
        text: trimmed,
      })
      continue
    }
    if (msg.role === 'assistant') {
      if (!isUsableAssistantMessage(msg)) continue
      rawEntries.push({
        id: msg.id,
        role: 'assistant',
        text: msg.text.trim(),
        ...(msg.model ? { model: msg.model } : {}),
      })
    }
  }

  rawEntries.push({
    id: nextUserMsg.id,
    role: 'user',
    text: nextUserMsg.text,
  })

  const coalesced: LlmHistoryEntry[] = []
  for (const entry of rawEntries) {
    const prev = coalesced.at(-1)
    if (prev && prev.role === entry.role) {
      prev.text = `${prev.text}\n\n${entry.text}`
      if (entry.id) prev.id = entry.id
      if (entry.model) prev.model = entry.model
    } else {
      coalesced.push({ ...entry })
    }
  }
  return coalesced
}

export class ThreadsService {
  private readonly deps: ThreadsServiceDeps
  private readonly git: GitAdapter
  private readonly activeStreams = new Map<string, ActiveSideChatStream>()

  constructor(deps: ThreadsServiceDeps) {
    this.deps = deps
    this.git = {
      inspectGitRepo: deps.git?.inspectGitRepo ?? inspectGitRepo,
      createIsolatedWorktree: deps.git?.createIsolatedWorktree ?? createIsolatedWorktree,
    }
  }

  dispose(): void {
    for (const active of this.activeStreams.values()) {
      active.controller.abort()
    }
    this.activeStreams.clear()
  }

  async getCatalog(): Promise<CatalogResponse> {
    const raw = await this.deps.sessionController.modelCatalog()
    const rawDefault = raw.defaultModel ?? raw.default
    const groups = (raw.groups ?? []).map((group) => ({
      id: group.id,
      ...(group.name ? { name: group.name } : {}),
      models: (group.models ?? []).map((model) => ({
        id: model.id,
        ...(model.name ? { name: model.name } : {}),
        ...(model.displayName ? { displayName: model.displayName } : {}),
        ...(model.reasoning
          ? {
              reasoning: {
                efforts: (model.reasoning.efforts ?? []).map((effort) =>
                  typeof effort === 'string'
                    ? { id: effort, name: effort }
                    : {
                        id: effort.id,
                        ...(effort.name ? { name: effort.name } : {}),
                        ...(effort.description ? { description: effort.description } : {}),
                      },
                ),
                ...(model.reasoning.defaultEffort
                  ? { defaultEffort: model.reasoning.defaultEffort }
                  : {}),
              },
            }
          : {}),
      })),
    }))

    const failures = (raw.failures ?? []).map((failure) => ({
      id: failure.id ?? failure.provider ?? 'unknown',
      ...(failure.name ? { name: failure.name } : {}),
      message: failure.message ?? failure.error ?? 'Provider unavailable',
    }))

    return {
      groups,
      ...(rawDefault?.provider && rawDefault?.model
        ? {
            defaultModel: {
              provider: rawDefault.provider,
              model: rawDefault.model,
              ...(rawDefault.reasoningEffort
                ? { reasoningEffort: rawDefault.reasoningEffort }
                : {}),
            },
          }
        : {}),
      failures,
    }
  }

  private async readSessionRaw(sessionId: string): Promise<{
    cwd?: string
    title: string
    events: RawSessionEvent[]
    model?: ModelSelectionSpec
  }> {
    let cwd: string | undefined
    let events: RawSessionEvent[] = []
    let title = ''

    const liveSession = this.deps.sessions?.get(sessionId)
    if (liveSession?.header?.cwd) {
      cwd = liveSession.header.cwd
    }
    let model = asModelSelection(liveSession?.projections?.modelSelection)

    if (this.deps.sessionQuery) {
      try {
        const snap = await this.deps.sessionQuery.readSession(sessionId)
        cwd = snap.session.cwd ?? cwd
        events = snap.events
      } catch (error) {
        if (!liveSession) {
          throw new NotFoundError(`Session not found: ${sessionId} (${errorMessage(error)})`)
        }
      }
      if (this.deps.sessionQuery.readTitle) {
        const titled = await this.deps.sessionQuery
          .readTitle(sessionId, AbortSignal.timeout(4000))
          .catch(() => undefined)
        if (titled?.title) title = titled.title
      }
    } else if (this.deps.sessionController.events) {
      try {
        const page = await this.deps.sessionController.events(
          { address: { kind: 'session', sessionId }, maxMessages: 200 },
          AbortSignal.timeout(5000),
        )
        events = (page.records ?? []).map((r) => r.event)
      } catch (error) {
        if (!liveSession) {
          throw new NotFoundError(`Session not found: ${sessionId} (${errorMessage(error)})`)
        }
      }
    }

    if (!model && this.deps.sessionController.projections) {
      const proj = await this.deps.sessionController
        .projections({ sessionId }, AbortSignal.timeout(4000))
        .catch(() => null)
      model = asModelSelection(proj?.values?.modelSelection)
    }

    return {
      ...(cwd ? { cwd } : {}),
      title: title || `Session ${sessionId.slice(0, 8)}`,
      events,
      ...(model ? { model } : {}),
    }
  }

  private async isSessionRunning(sessionId: string): Promise<boolean> {
    if (this.deps.sessionController.state) {
      try {
        const state = await this.deps.sessionController.state(
          { sessionId },
          AbortSignal.timeout(3000),
        )
        return Boolean(state.running)
      } catch {
        // Fall back to live registry snapshot if state query fails.
      }
    }
    return Boolean(this.deps.sessions?.get(sessionId)?.running)
  }

  private resolveWorkspaceForSession(sessionId: string): string | undefined {
    const list = this.deps.workspaceRegistry?.list?.() ?? []
    const match = list.find((ws) => ws.sessionIds?.includes(sessionId))
    return match?.id
  }

  private async resolveDefaultModel(fallback?: ModelSelectionSpec): Promise<ModelSelectionSpec> {
    if (fallback?.provider && fallback?.model) return fallback
    const catalog = await this.getCatalog()
    if (catalog.defaultModel) return catalog.defaultModel
    for (const group of catalog.groups) {
      if (group.models.length > 0) {
        return {
          provider: group.id,
          model: group.models[0].id,
          ...(group.models[0].reasoning?.defaultEffort
            ? { reasoningEffort: group.models[0].reasoning.defaultEffort }
            : {}),
        }
      }
    }
    throw new BadRequestError('No routable LLM model is available')
  }

  private async applyModelAndPermissions(
    agent: LiveAgentLike,
    options: {
      model?: ModelSelectionSpec
      workspaceWrite?: boolean
    },
  ): Promise<ModelSelectionSpec | undefined> {
    let appliedModel: ModelSelectionSpec | undefined
    if (options.model?.provider && options.model?.model) {
      const resolved = await this.deps.llm.resolveCallConfig({
        provider: options.model.provider,
        model: options.model.model,
        ...(options.model.reasoningEffort
          ? { reasoningEffort: options.model.reasoningEffort }
          : {}),
      })
      agent.model.select({
        provider: resolved.provider,
        model: resolved.model,
        ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
      })
      appliedModel = {
        provider: resolved.provider,
        model: resolved.model,
        ...(resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
      }
    }

    if (options.workspaceWrite) {
      if (this.deps.permissionPresets) {
        try {
          await this.deps.permissionPresets.set(agent.session, 'workspace-write')
          return appliedModel
        } catch (error) {
          this.deps.logger?.warn?.(
            `dsh-threads: permissionPresets.set failed, falling back to session events: ${errorMessage(error)}`,
          )
        }
      }
      agent.session.append('sandbox/mode', { mode: 'workspace-write' })
      agent.session.append('approval/policy', { policy: 'ask' })
    }
    return appliedModel
  }

  private async ensureSafeWorkspaceTarget(options: {
    sourceSessionId: string
    workspaceMode: WorkspaceMode
    stopSourceIfRunning?: boolean
    allowSameWhileRunning?: boolean
  }): Promise<void> {
    if (options.workspaceMode !== 'same') return
    const running = await this.isSessionRunning(options.sourceSessionId)
    if (!running) return

    if (options.stopSourceIfRunning) {
      await this.deps.sessionController.cancel?.({ sessionId: options.sourceSessionId })
      return
    }

    if (!options.allowSameWhileRunning) {
      throw new ConflictError(
        'SOURCE_RUNNING',
        'Source session is currently running in this local workspace. Stop the source session first or switch to a new isolated Git worktree to prevent concurrent file edits.',
      )
    }
  }

  private async prepareWorktree(options: {
    cwd?: string
    kind: 'fork' | 'edit-retry' | 'handoff' | 'promoted-side'
    label: string
  }): Promise<{ worktree: WorktreeInfo; gitInfo: GitRepoInfo }> {
    const cwd = options.cwd?.trim()
    if (!cwd || !(await isDirectory(cwd))) {
      throw new BadRequestError(
        'Isolated Git worktree mode requires a session with an existing workspace directory.',
      )
    }
    const gitInfo = await this.git.inspectGitRepo(cwd)
    if (!gitInfo.isGitRepo || !gitInfo.repoRoot || !gitInfo.headCommit) {
      throw new BadRequestError(
        gitInfo.reason || 'Isolated Git worktree mode requires a Git repository with at least one commit.',
      )
    }
    const worktree = await this.git.createIsolatedWorktree({
      repoRoot: gitInfo.repoRoot,
      baseCommit: gitInfo.headCommit,
      kind: options.kind,
      label: options.label,
    })
    return { worktree, gitInfo }
  }

  private async createConfiguredSession(options: {
    sourceSessionId?: string
    workspaceId?: string
    cwd?: string
    model?: ModelSelectionSpec
    title?: string
    promptText?: string
    delivery: DeliveryMode
    clientTimeZone?: string
    workspaceWrite?: boolean
  }): Promise<{ sessionId: string; cwd?: string; model?: ModelSelectionSpec; draftText?: string }> {
    const createReq: { workspaceId?: string; cwd?: string } = {}
    if (options.cwd) {
      createReq.cwd = options.cwd
    } else if (options.workspaceId) {
      createReq.workspaceId = options.workspaceId
    }

    const created = await this.deps.sessionController.create(createReq)
    const sessionId = created.sessionId
    const resolved = await this.deps.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) {
      throw new Error(resolved.error.message || 'Failed to resolve agent for new session')
    }

    const appliedModel = await this.applyModelAndPermissions(resolved.agent, {
      model: options.model,
      workspaceWrite: options.workspaceWrite,
    })

    if (options.title?.trim()) {
      await this.deps.sessionController
        .rename({ sessionId, title: options.title.trim().slice(0, 120) })
        .catch(() => undefined)
    }

    const text = options.promptText?.trim()
    if (options.delivery === 'send' && text) {
      await this.deps.sessionController.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text }],
          ...(options.clientTimeZone ? { clientTimeZone: options.clientTimeZone } : {}),
        },
        AbortSignal.timeout(15_000),
      )
      return {
        sessionId,
        cwd: resolved.agent.session.header?.cwd ?? options.cwd,
        model: appliedModel ?? options.model,
      }
    }

    return {
      sessionId,
      cwd: resolved.agent.session.header?.cwd ?? options.cwd,
      model: appliedModel ?? options.model,
      ...(text ? { draftText: text } : {}),
    }
  }

  async inspectSession(sessionId: string): Promise<SessionInspectResponse> {
    const raw = await this.readSessionRaw(sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const latestTurnModel = [...turns].reverse().find((t) => t.model)?.model
    const effectiveModel = raw.model ?? latestTurnModel
    const running = await this.isSessionRunning(sessionId)
    const gitInfo: GitRepoInfo = raw.cwd
      ? await this.git.inspectGitRepo(raw.cwd)
      : {
          isGitRepo: false,
          dirty: false,
          untrackedCount: 0,
          reason: 'Session has no workspace directory',
        }
    const sideChats = await this.listSideChats(sessionId)
    const tree = await this.getSessionTree(sessionId)

    return {
      sessionId,
      title: raw.title,
      ...(raw.cwd ? { cwd: raw.cwd } : {}),
      running,
      ...(effectiveModel ? { model: effectiveModel } : {}),
      gitInfo,
      turns,
      sideChats,
      tree,
    }
  }

  async getSessionTree(sessionId: string): Promise<SessionTreeResponse> {
    const lineage = await this.deps.store.getConnectedLineage(sessionId)
    const edges = [...lineage.edges]
    const knownEdgesKey = new Set(edges.map((e) => `${e.parentSessionId}->${e.childSessionId}`))
    const sessionIds = new Set<string>(lineage.sessionIds)

    // Merge native non-subagent parent/child lineage if SessionQuery exposes it.
    if (this.deps.sessionQuery?.traceSession) {
      try {
        const traced = await this.deps.sessionQuery.traceSession(
          sessionId,
          AbortSignal.timeout(4000),
        )
        const chain = [...traced.ancestors].reverse()
        chain.push(traced.target)
        for (let i = 0; i < chain.length - 1; i += 1) {
          const parentHeader = chain[i].header
          const childHeader = chain[i + 1].header
          if (childHeader.origin === 'subagent') continue
          sessionIds.add(parentHeader.id)
          sessionIds.add(childHeader.id)
          const key = `${parentHeader.id}->${childHeader.id}`
          if (!knownEdgesKey.has(key)) {
            knownEdgesKey.add(key)
            edges.push({
              id: `native-${parentHeader.id}-${childHeader.id}`,
              kind: 'fork',
              parentSessionId: parentHeader.id,
              childSessionId: childHeader.id,
              workspaceMode: 'same',
              createdAt: 0,
            })
          }
        }
        const walkDesc = (
          parentId: string,
          items: Array<{ session: { header: { id: string; origin?: string } }; descendants: unknown[] }>,
        ) => {
          for (const item of items) {
            const childId = item.session.header.id
            if (item.session.header.origin === 'subagent') continue
            sessionIds.add(childId)
            const key = `${parentId}->${childId}`
            if (!knownEdgesKey.has(key)) {
              knownEdgesKey.add(key)
              edges.push({
                id: `native-${parentId}-${childId}`,
                kind: 'fork',
                parentSessionId: parentId,
                childSessionId: childId,
                workspaceMode: 'same',
                createdAt: 0,
              })
            }
            if (Array.isArray(item.descendants) && item.descendants.length > 0) {
              walkDesc(
                childId,
                item.descendants as Array<{
                  session: { header: { id: string; origin?: string } }
                  descendants: unknown[]
                }>,
              )
            }
          }
        }
        walkDesc(traced.target.header.id, traced.descendants)
      } catch {
        // Ignore trace lookup errors for synthetic/missing sessions.
      }
    }

    const childIds = new Set(edges.map((e) => e.childSessionId))
    const roots = [...sessionIds].filter((id) => !childIds.has(id))
    const rootSessionId = roots[0] ?? sessionId

    const nodes: TreeSessionNode[] = await Promise.all(
      [...sessionIds].map(async (id) => {
        try {
          const raw = await this.readSessionRaw(id)
          const running = await this.isSessionRunning(id)
          return {
            sessionId: id,
            title: raw.title,
            ...(raw.cwd ? { cwd: raw.cwd } : {}),
            running,
            ...(raw.model ? { model: raw.model } : {}),
            sideChatCount: lineage.sideChatCounts[id] ?? 0,
          }
        } catch {
          return {
            sessionId: id,
            title: `Session ${id.slice(0, 8)}`,
            running: false,
            sideChatCount: lineage.sideChatCounts[id] ?? 0,
            missing: true,
          }
        }
      }),
    )

    return {
      rootSessionId,
      currentSessionId: sessionId,
      nodes,
      edges,
    }
  }

  private hydrateSideChat(chat: SideChat): SideChat {
    const active = this.activeStreams.get(chat.id)
    const cloned = structuredClone(chat)
    let changed = false
    for (const msg of cloned.messages) {
      if (!msg.streaming) continue
      if (active && active.messageId === msg.id) {
        msg.text = active.text
        if (active.reasoning) {
          msg.reasoning = active.reasoning
        }
        msg.streamSeq = active.seq
        changed = true
      } else {
        msg.streaming = false
        if (!msg.text.trim() && !msg.error) {
          msg.error = 'Interrupted before completion'
        }
        changed = true
      }
    }
    return cloned
  }

  async listSideChats(parentSessionId: string): Promise<SideChat[]> {
    const chats = await this.deps.store.listSideChats(parentSessionId)
    return chats.map((chat) => this.hydrateSideChat(chat))
  }

  async waitForSideChat(sideChatId: string): Promise<SideChat | undefined> {
    const active = this.activeStreams.get(sideChatId)
    if (active) {
      return active.done
    }
    const stored = await this.deps.store.getSideChat(sideChatId)
    return stored ? this.hydrateSideChat(stored) : undefined
  }

  async createSideChat(
    req: CreateSideChatRequest,
    options: { wait?: boolean } = {},
  ): Promise<SideChat> {
    if (!req.parentSessionId?.trim()) {
      throw new BadRequestError('parentSessionId is required')
    }
    const raw = await this.readSessionRaw(req.parentSessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const latestTurnModel = [...turns].reverse().find((t) => t.model)?.model
    const chosenModel = await this.resolveDefaultModel(
      req.model ?? raw.model ?? latestTurnModel,
    )

    const { contextSummary, contextTurnCount } = buildBoundedSideChatContext(turns, {
      maxTurns: req.maxContextTurns,
      quote: req.quote,
      anchorTurn: req.anchorTurn,
    })

    const now = Date.now()
    const title =
      req.title?.trim() ||
      deriveShortTitle(req.question ?? req.quote, `Side chat · ${raw.title}`)

    const chat: SideChat = {
      id: randomUUID(),
      parentSessionId: req.parentSessionId,
      title,
      ...(req.anchorSeq !== undefined ? { anchorSeq: req.anchorSeq } : {}),
      ...(req.anchorTurn !== undefined ? { anchorTurn: req.anchorTurn } : {}),
      ...(req.quote?.trim() ? { quote: req.quote.trim() } : {}),
      contextTurnCount,
      contextSummary,
      model: chosenModel,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }

    const stored = await this.deps.store.createSideChat(chat)
    this.deps.bus.emit({
      type: 'side-chat-updated',
      parentSessionId: stored.parentSessionId,
      sideChat: stored,
    })

    if (req.question?.trim()) {
      return this.sendSideChatMessage(
        stored.id,
        {
          text: req.question.trim(),
          model: chosenModel,
        },
        options,
      )
    }
    return stored
  }

  async updateSideChat(id: string, req: UpdateSideChatRequest): Promise<SideChat> {
    const updated = await this.deps.store.updateSideChat(id, (chat) => {
      const next = structuredClone(chat)
      if (typeof req.title === 'string' && req.title.trim()) {
        next.title = req.title.trim().slice(0, 120)
      }
      if (req.model?.provider && req.model?.model) {
        next.model = req.model
      }
      next.updatedAt = Date.now()
      return next
    })
    if (!updated) throw new NotFoundError(`Side chat not found: ${id}`)
    this.deps.bus.emit({
      type: 'side-chat-updated',
      parentSessionId: updated.parentSessionId,
      sideChat: updated,
    })
    return updated
  }

  async deleteSideChat(id: string): Promise<boolean> {
    this.abortSideChat(id)
    const existing = await this.deps.store.getSideChat(id)
    const deleted = await this.deps.store.deleteSideChat(id)
    if (deleted && existing) {
      this.deps.bus.emit({
        type: 'side-chat-deleted',
        parentSessionId: existing.parentSessionId,
        sideChatId: id,
      })
    }
    return deleted
  }

  abortSideChat(id: string): boolean {
    const active = this.activeStreams.get(id)
    if (!active) return false
    active.controller.abort()
    return true
  }

  private async streamLlmText(options: {
    model: ModelSelectionSpec
    system: string
    messages: LlmHistoryEntry[]
    purpose: string
    antigravitySessionId?: string
    signal: AbortSignal
    onDelta?: (delta: string) => void
    onReasoningDelta?: (delta: string) => void
  }): Promise<{ text: string; reasoning: string; model: ModelSelectionSpec }> {
    const resolvedConfig = await this.deps.llm.resolveCallConfig({
      provider: options.model.provider,
      model: options.model.model,
      ...(options.model.reasoningEffort ? { reasoningEffort: options.model.reasoningEffort } : {}),
    })

    const isAgy = isAntigravityProvider(resolvedConfig.provider)
    // AGY needs a valid sessionId so cwdFor(sessionId) resolves; ensure session is loaded if cold.
    // Claude MUST NOT receive sessionId on auxiliary purpose calls or it mutates parent accessModes.
    if (isAgy && options.antigravitySessionId && !this.deps.sessions?.get(options.antigravitySessionId)) {
      await this.deps.sessionController.resolveAgent(options.antigravitySessionId).catch(() => undefined)
    }

    const llmMessages: LlmRequestMessageLike[] = options.messages.map((m) =>
      m.role === 'assistant'
        ? {
            id: m.id || randomUUID(),
            role: 'assistant',
            source: {
              kind: 'model',
              provider: m.model?.provider || resolvedConfig.provider,
              model: m.model?.model || resolvedConfig.model,
            },
            content: [{ type: 'text' as const, text: m.text }],
          }
        : {
            id: m.id || randomUUID(),
            role: 'user',
            source: { kind: 'user' },
            content: [{ type: 'text' as const, text: m.text }],
          },
    )

    let preparedConfig: {
      provider: string
      model: string
      reasoningEffort?: string
      temperature?: number
      maxTokens?: number
    } = resolvedConfig
    let streamIter: AsyncIterable<LlmChunkLike>

    if (typeof this.deps.llm.prepareCall === 'function') {
      const prepared = await this.deps.llm.prepareCall(resolvedConfig, options.signal)
      preparedConfig = prepared.config
      streamIter = prepared.stream({
        ...preparedConfig,
        system: options.system,
        messages: llmMessages,
        purpose: options.purpose,
        signal: options.signal,
        ...(isAgy && options.antigravitySessionId
          ? { sessionId: options.antigravitySessionId }
          : {}),
      })
    } else if (typeof this.deps.llm.stream === 'function') {
      streamIter = this.deps.llm.stream({
        ...resolvedConfig,
        system: options.system,
        messages: llmMessages,
        purpose: options.purpose,
        signal: options.signal,
        ...(isAgy && options.antigravitySessionId
          ? { sessionId: options.antigravitySessionId }
          : {}),
      })
    } else {
      throw new Error('LLM service exposes neither prepareCall nor stream')
    }

    let fullText = ''
    let fullReasoning = ''
    const textDeltaSeenIndexes = new Set<number>()
    const reasoningDeltaSeenIndexes = new Set<number>()

    for await (const chunk of streamIter) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text.length > 0) {
        if (typeof chunk.index === 'number') textDeltaSeenIndexes.add(chunk.index)
        fullText += chunk.text
        options.onDelta?.(chunk.text)
      } else if (
        chunk.type === 'reasoning-delta' &&
        typeof chunk.text === 'string' &&
        chunk.text.length > 0
      ) {
        if (typeof chunk.index === 'number') reasoningDeltaSeenIndexes.add(chunk.index)
        fullReasoning += chunk.text
        options.onReasoningDelta?.(chunk.text)
      } else if (
        chunk.type === 'block-end' &&
        chunk.block?.type === 'text' &&
        typeof chunk.block.text === 'string' &&
        chunk.block.text.length > 0 &&
        (typeof chunk.index !== 'number' || !textDeltaSeenIndexes.has(chunk.index))
      ) {
        fullText += chunk.block.text
        options.onDelta?.(chunk.block.text)
      } else if (
        chunk.type === 'block-end' &&
        chunk.block?.type === 'reasoning' &&
        typeof chunk.block.text === 'string' &&
        chunk.block.text.length > 0 &&
        (typeof chunk.index !== 'number' || !reasoningDeltaSeenIndexes.has(chunk.index))
      ) {
        fullReasoning += chunk.block.text
        options.onReasoningDelta?.(chunk.block.text)
      } else if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          const msg = chunk.reason?.failure?.message || `Model stream ended (${kind})`
          throw new Error(msg)
        }
      }
    }

    return {
      text: fullText.trim(),
      reasoning: fullReasoning.trim(),
      model: {
        provider: preparedConfig.provider,
        model: preparedConfig.model,
        ...(preparedConfig.reasoningEffort
          ? { reasoningEffort: preparedConfig.reasoningEffort }
          : {}),
      },
    }
  }

  private async runSideChatStream(options: {
    sideChatId: string
    parentSessionId: string
    assistantMsgId: string
    model: ModelSelectionSpec
    systemPrompt: string
    historyForLlm: LlmHistoryEntry[]
    streamEntry: ActiveSideChatStream
  }): Promise<SideChat> {
    const { sideChatId, parentSessionId, assistantMsgId, model, systemPrompt, historyForLlm, streamEntry } =
      options
    try {
      const result = await this.streamLlmText({
        model,
        system: systemPrompt,
        messages: historyForLlm,
        purpose: 'dsh-threads-side-chat',
        antigravitySessionId: parentSessionId,
        signal: streamEntry.controller.signal,
        onDelta: (delta) => {
          streamEntry.text += delta
          streamEntry.seq += 1
          this.deps.bus.emit({
            type: 'side-chat-delta',
            parentSessionId,
            sideChatId,
            messageId: assistantMsgId,
            delta,
            channel: 'text',
            seq: streamEntry.seq,
          })
        },
        onReasoningDelta: (delta) => {
          streamEntry.reasoning += delta
          streamEntry.seq += 1
          this.deps.bus.emit({
            type: 'side-chat-delta',
            parentSessionId,
            sideChatId,
            messageId: assistantMsgId,
            delta,
            channel: 'reasoning',
            seq: streamEntry.seq,
          })
        },
      })

      const finalized = await this.deps.store.updateSideChat(sideChatId, (chat) => {
        const next = structuredClone(chat)
        const target = next.messages.find((m) => m.id === assistantMsgId)
        if (target) {
          target.text = result.text || streamEntry.text.trim() || '(Empty response)'
          const persistedReasoning = capReasoningText(result.reasoning || streamEntry.reasoning)
          if (persistedReasoning) {
            target.reasoning = persistedReasoning
          }
          target.streaming = false
          target.model = result.model
        }
        next.model = result.model
        next.updatedAt = Date.now()
        return next
      })
      if (!finalized) throw new NotFoundError(`Side chat not found: ${sideChatId}`)
      this.deps.bus.emit({
        type: 'side-chat-updated',
        parentSessionId: finalized.parentSessionId,
        sideChat: finalized,
      })
      return finalized
    } catch (error) {
      const isAbort = streamEntry.controller.signal.aborted
      const errText = isAbort ? 'Stopped by user' : errorMessage(error)
      const persistedText = streamEntry.text.trim()
      const persistedReasoning = capReasoningText(streamEntry.reasoning)
      const finalized = await this.deps.store.updateSideChat(sideChatId, (chat) => {
        const next = structuredClone(chat)
        const target = next.messages.find((m) => m.id === assistantMsgId)
        if (target) {
          target.text = persistedText
          if (persistedReasoning) {
            target.reasoning = persistedReasoning
          }
          target.streaming = false
          if (!persistedText || !isAbort) {
            target.error = errText
          }
        }
        next.updatedAt = Date.now()
        return next
      })
      if (finalized) {
        this.deps.bus.emit({
          type: 'side-chat-updated',
          parentSessionId: finalized.parentSessionId,
          sideChat: finalized,
        })
        return finalized
      }
      throw error
    } finally {
      if (this.activeStreams.get(sideChatId) === streamEntry) {
        this.activeStreams.delete(sideChatId)
      }
    }
  }

  async sendSideChatMessage(
    sideChatId: string,
    req: SendSideChatMessageRequest,
    options: { wait?: boolean } = {},
  ): Promise<SideChat> {
    const promptText = req.text?.trim()
    if (!promptText) {
      throw new BadRequestError('Side chat message text must not be empty')
    }

    const existing = await this.deps.store.getSideChat(sideChatId)
    if (!existing) {
      throw new NotFoundError(`Side chat not found: ${sideChatId}`)
    }
    if (this.activeStreams.has(sideChatId)) {
      throw new ConflictError('SIDE_CHAT_BUSY', 'This side chat is already generating a response')
    }

    const nextModel = req.model?.provider && req.model?.model ? req.model : existing.model
    const now = Date.now()
    const userMsgId = randomUUID()
    const userMsg: SideChatMessage = {
      id: userMsgId,
      role: 'user',
      text: promptText,
      createdAt: now,
    }
    const assistantMsgId = randomUUID()
    const assistantPlaceholder: SideChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      createdAt: now,
      model: nextModel,
      streaming: true,
    }

    const historyForLlm = buildSideChatLlmHistory(existing.messages, {
      id: userMsgId,
      text: promptText,
    })

    const prepared = await this.deps.store.updateSideChat(sideChatId, (chat) => {
      const next = structuredClone(chat)
      next.model = nextModel
      if (next.messages.length === 0 && next.title.startsWith('Side chat ·')) {
        next.title = deriveShortTitle(promptText, next.title)
      }
      next.messages.push(userMsg, assistantPlaceholder)
      next.updatedAt = now
      return next
    })
    if (!prepared) {
      throw new NotFoundError(`Side chat not found: ${sideChatId}`)
    }

    const systemPrompt = [
      'You are answering a focused side-chat question alongside a parent coding session.',
      'Be concise, direct, and strictly read-only: do NOT edit files, do NOT run mutating commands, and answer using the supplied parent context and the user question.',
      prepared.contextSummary ? `\n${prepared.contextSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const abortController = new AbortController()
    const streamEntry: ActiveSideChatStream = {
      messageId: assistantMsgId,
      controller: abortController,
      text: '',
      reasoning: '',
      seq: 0,
      done: Promise.resolve(prepared),
    }
    this.activeStreams.set(sideChatId, streamEntry)

    this.deps.bus.emit({
      type: 'side-chat-updated',
      parentSessionId: prepared.parentSessionId,
      sideChat: prepared,
    })

    const donePromise = this.runSideChatStream({
      sideChatId,
      parentSessionId: prepared.parentSessionId,
      assistantMsgId,
      model: nextModel,
      systemPrompt,
      historyForLlm,
      streamEntry,
    })
    streamEntry.done = donePromise
    donePromise.catch(() => undefined)

    if (options.wait) {
      return donePromise
    }
    return this.hydrateSideChat(prepared)
  }

  async promoteSideChat(
    sideChatId: string,
    req: PromoteSideChatRequest = {},
  ): Promise<{ sessionId: string; edge: LineageEdge; delivery: DeliveryMode; draftText?: string }> {
    const chat = await this.deps.store.getSideChat(sideChatId)
    if (!chat) throw new NotFoundError(`Side chat not found: ${sideChatId}`)

    const workspaceMode: WorkspaceMode = req.workspaceMode ?? 'same'
    const delivery: DeliveryMode = req.delivery ?? 'draft'

    await this.ensureSafeWorkspaceTarget({
      sourceSessionId: chat.parentSessionId,
      workspaceMode,
      stopSourceIfRunning: req.stopSourceIfRunning,
      allowSameWhileRunning: req.allowSameWhileRunning,
    })

    const rawParent = await this.readSessionRaw(chat.parentSessionId)
    let targetCwd = rawParent.cwd
    let worktree: WorktreeInfo | undefined
    const workspaceId = this.resolveWorkspaceForSession(chat.parentSessionId)

    if (workspaceMode === 'worktree') {
      const preparedWt = await this.prepareWorktree({
        cwd: rawParent.cwd,
        kind: 'promoted-side',
        label: chat.title,
      })
      worktree = preparedWt.worktree
      targetCwd = worktree.path
    }

    const transcript = chat.messages
      .filter((m) => m.text.trim().length > 0)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.trim()}`)
      .join('\n\n')

    const seedParts = [
      `# Promoted Side Chat: ${chat.title}`,
      chat.quote ? `> ${chat.quote.replace(/\n/g, '\n> ')}` : '',
      transcript ? `## Side-Chat Discussion\n\n${transcript}` : '',
      req.prompt?.trim()
        ? `## Next Step\n${req.prompt.trim()}`
        : '## Next Step\nContinue from this side-chat exploration.',
    ].filter(Boolean)

    const targetModel = req.model ?? chat.model
    const created = await this.createConfiguredSession({
      sourceSessionId: chat.parentSessionId,
      ...(workspaceMode === 'same' && workspaceId ? { workspaceId } : {}),
      ...(targetCwd ? { cwd: targetCwd } : {}),
      model: targetModel,
      title: `Side · ${chat.title}`,
      promptText: seedParts.join('\n\n'),
      delivery,
      workspaceWrite: workspaceMode === 'worktree',
    })

    const edge: LineageEdge = {
      id: randomUUID(),
      kind: 'promoted-side',
      parentSessionId: chat.parentSessionId,
      childSessionId: created.sessionId,
      sourceSideChatId: chat.id,
      ...(chat.anchorSeq !== undefined ? { anchorSeq: chat.anchorSeq } : {}),
      ...(chat.anchorTurn !== undefined ? { anchorTurn: chat.anchorTurn } : {}),
      ...(chat.quote ? { anchorSnippet: deriveShortTitle(chat.quote, '') } : {}),
      fromModel: rawParent.model ?? chat.model,
      toModel: created.model ?? targetModel,
      workspaceMode,
      ...(worktree ? { worktree } : {}),
      createdAt: Date.now(),
    }

    await this.deps.store.addEdge(edge)
    const updatedChat = await this.deps.store.updateSideChat(chat.id, (cur) => ({
      ...cur,
      promotedSessionId: created.sessionId,
      updatedAt: Date.now(),
    }))
    if (updatedChat) {
      this.deps.bus.emit({
        type: 'side-chat-updated',
        parentSessionId: updatedChat.parentSessionId,
        sideChat: updatedChat,
      })
    }
    this.deps.bus.emit({
      type: 'lineage-updated',
      sessionIds: [chat.parentSessionId, created.sessionId],
      edge,
    })

    return {
      sessionId: created.sessionId,
      edge,
      delivery,
      ...(created.draftText ? { draftText: created.draftText } : {}),
    }
  }

  async forkSession(req: ForkSessionRequest): Promise<{
    sessionId: string
    edge: LineageEdge
    delivery: DeliveryMode
    draftText?: string
  }> {
    if (!req.sessionId?.trim()) {
      throw new BadRequestError('sessionId is required')
    }
    const workspaceMode: WorkspaceMode = req.workspaceMode ?? 'same'
    const delivery: DeliveryMode = req.delivery ?? 'draft'

    await this.ensureSafeWorkspaceTarget({
      sourceSessionId: req.sessionId,
      workspaceMode,
      stopSourceIfRunning: req.stopSourceIfRunning,
      allowSameWhileRunning: req.allowSameWhileRunning,
    })

    const raw = await this.readSessionRaw(req.sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const sourceModel = raw.model ?? [...turns].reverse().find((t) => t.model)?.model
    const targetModel = req.model ?? sourceModel

    if (workspaceMode === 'worktree') {
      const { worktree, gitInfo } = await this.prepareWorktree({
        cwd: raw.cwd,
        kind: 'fork',
        label: req.title ?? raw.title,
      })
      const eligibleTurns =
        req.anchorTurn !== undefined ? turns.filter((t) => t.turn <= req.anchorTurn!) : turns
      const { packetText } = buildHandoffPacket({
        sessionId: req.sessionId,
        sessionTitle: raw.title,
        turns: eligibleTurns,
        fromModel: sourceModel,
        toModel: targetModel,
        workspaceMode: 'worktree',
        gitInfo,
        nextInstruction: req.initialDraft?.trim(),
      })

      const created = await this.createConfiguredSession({
        cwd: worktree.path,
        model: targetModel,
        title: req.title?.trim() || `${raw.title} (worktree branch)`,
        promptText: packetText,
        delivery,
        workspaceWrite: true,
      })

      const edge: LineageEdge = {
        id: randomUUID(),
        kind: 'fork',
        parentSessionId: req.sessionId,
        childSessionId: created.sessionId,
        ...(req.atSeq !== undefined ? { anchorSeq: req.atSeq } : {}),
        ...(req.anchorTurn !== undefined ? { anchorTurn: req.anchorTurn } : {}),
        ...(req.anchorSnippet ? { anchorSnippet: req.anchorSnippet } : {}),
        ...(sourceModel ? { fromModel: sourceModel } : {}),
        ...(created.model ?? targetModel ? { toModel: created.model ?? targetModel } : {}),
        workspaceMode: 'worktree',
        worktree,
        createdAt: Date.now(),
      }
      await this.deps.store.addEdge(edge)
      this.deps.bus.emit({
        type: 'lineage-updated',
        sessionIds: [req.sessionId, created.sessionId],
        edge,
      })
      return {
        sessionId: created.sessionId,
        edge,
        delivery,
        ...(created.draftText ? { draftText: created.draftText } : {}),
      }
    }

    // Same-workspace fork uses native sessionController.fork and restores the chosen model.
    const forked = await this.deps.sessionController.fork({
      sessionId: req.sessionId,
      ...(req.atSeq !== undefined ? { atSeq: req.atSeq } : {}),
      allowMigration: true,
    })

    const resolved = await this.deps.sessionController.resolveAgent(forked.sessionId)
    if ('error' in resolved) {
      throw new Error(resolved.error.message || 'Failed to resolve forked session agent')
    }
    const appliedModel = await this.applyModelAndPermissions(resolved.agent, {
      model: targetModel,
    })

    const childTitle =
      req.title?.trim() ||
      (req.anchorTurn !== undefined ? `${raw.title} (branch T${req.anchorTurn})` : `${raw.title} (fork)`)
    await this.deps.sessionController
      .rename({ sessionId: forked.sessionId, title: childTitle.slice(0, 120) })
      .catch(() => undefined)

    let draftText: string | undefined
    if (req.initialDraft?.trim()) {
      if (delivery === 'send') {
        await this.deps.sessionController.prompt(
          {
            requestId: randomUUID(),
            sessionId: forked.sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: req.initialDraft.trim() }],
          },
          AbortSignal.timeout(15_000),
        )
      } else {
        draftText = req.initialDraft.trim()
      }
    }

    const edge: LineageEdge = {
      id: randomUUID(),
      kind: 'fork',
      parentSessionId: req.sessionId,
      childSessionId: forked.sessionId,
      ...(req.atSeq !== undefined ? { anchorSeq: req.atSeq } : {}),
      ...(req.anchorTurn !== undefined ? { anchorTurn: req.anchorTurn } : {}),
      ...(req.anchorSnippet ? { anchorSnippet: req.anchorSnippet } : {}),
      ...(sourceModel ? { fromModel: sourceModel } : {}),
      ...(appliedModel ?? targetModel ? { toModel: appliedModel ?? targetModel } : {}),
      workspaceMode: 'same',
      createdAt: Date.now(),
    }
    await this.deps.store.addEdge(edge)
    this.deps.bus.emit({
      type: 'lineage-updated',
      sessionIds: [req.sessionId, forked.sessionId],
      edge,
    })

    return {
      sessionId: forked.sessionId,
      edge,
      delivery,
      ...(draftText ? { draftText } : {}),
    }
  }

  async linkSessions(req: LinkSessionsRequest): Promise<LineageEdge> {
    if (!req.parentSessionId?.trim() || !req.childSessionId?.trim()) {
      throw new BadRequestError('parentSessionId and childSessionId are required')
    }
    if (req.parentSessionId === req.childSessionId) {
      throw new BadRequestError('Cannot link a session to itself')
    }
    const existing = await this.deps.store.listEdges()
    const duplicate = existing.find(
      (e) => e.parentSessionId === req.parentSessionId && e.childSessionId === req.childSessionId,
    )
    if (duplicate) return duplicate

    const edge: LineageEdge = {
      id: randomUUID(),
      kind: req.kind ?? 'fork',
      parentSessionId: req.parentSessionId,
      childSessionId: req.childSessionId,
      ...(req.anchorSeq !== undefined ? { anchorSeq: req.anchorSeq } : {}),
      ...(req.anchorTurn !== undefined ? { anchorTurn: req.anchorTurn } : {}),
      ...(req.anchorSnippet ? { anchorSnippet: req.anchorSnippet } : {}),
      workspaceMode: 'same',
      createdAt: Date.now(),
    }
    const saved = await this.deps.store.addEdge(edge)
    this.deps.bus.emit({
      type: 'lineage-updated',
      sessionIds: [req.parentSessionId, req.childSessionId],
      edge: saved,
    })
    return saved
  }

  async editAndRetry(req: EditAndRetryRequest): Promise<EditAndRetryResponse> {
    const editedPrompt = req.prompt?.trim()
    if (!editedPrompt) {
      throw new BadRequestError('Edited prompt must not be empty')
    }
    const workspaceMode: WorkspaceMode = req.workspaceMode ?? 'same'
    const delivery: DeliveryMode = req.delivery ?? 'draft'

    await this.ensureSafeWorkspaceTarget({
      sourceSessionId: req.sessionId,
      workspaceMode,
      stopSourceIfRunning: req.stopSourceIfRunning,
      allowSameWhileRunning: req.allowSameWhileRunning,
    })

    const raw = await this.readSessionRaw(req.sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const targetTurn = turns.find((t) => t.turn === req.turnNumber)
    if (!targetTurn) {
      throw new NotFoundError(`Turn ${req.turnNumber} not found in session ${req.sessionId}`)
    }

    const sourceModel = raw.model ?? targetTurn.model ?? [...turns].reverse().find((t) => t.model)?.model
    const targetModel = req.model ?? targetTurn.model ?? sourceModel
    const attachmentWarning =
      targetTurn.userAttachments.length > 0
        ? `Original turn had ${targetTurn.userAttachments.length} attachment(s) (${targetTurn.userAttachments
            .map((a) => a.name ?? a.kind)
            .join(', ')}); re-attach files if needed before sending.`
        : undefined

    let childSessionId: string
    let worktree: WorktreeInfo | undefined
    let appliedModel: ModelSelectionSpec | undefined
    let draftText: string | undefined

    if (workspaceMode === 'worktree') {
      const preparedWt = await this.prepareWorktree({
        cwd: raw.cwd,
        kind: 'edit-retry',
        label: `turn-${req.turnNumber}`,
      })
      worktree = preparedWt.worktree
      const priorTurns = turns.filter((t) => t.turn < targetTurn.turn)
      const promptToUse =
        priorTurns.length > 0
          ? `${buildHandoffPacket({
              sessionId: req.sessionId,
              sessionTitle: raw.title,
              turns: priorTurns,
              fromModel: sourceModel,
              toModel: targetModel,
              workspaceMode: 'worktree',
              gitInfo: preparedWt.gitInfo,
              nextInstruction: editedPrompt,
            }).packetText}`
          : editedPrompt

      const created = await this.createConfiguredSession({
        cwd: worktree.path,
        model: targetModel,
        title: `${raw.title} (retry T${targetTurn.turn})`,
        promptText: promptToUse,
        delivery,
        workspaceWrite: true,
      })
      childSessionId = created.sessionId
      appliedModel = created.model
      draftText = created.draftText
    } else if (targetTurn.prevCompletedEndSeq === null) {
      // Turn 1 has no earlier completed prefix to fork from: start a fresh session in the same workspace.
      const workspaceId = this.resolveWorkspaceForSession(req.sessionId)
      const created = await this.createConfiguredSession({
        ...(workspaceId ? { workspaceId } : {}),
        ...(raw.cwd ? { cwd: raw.cwd } : {}),
        model: targetModel,
        title: `${raw.title} (retry T${targetTurn.turn})`,
        promptText: editedPrompt,
        delivery,
      })
      childSessionId = created.sessionId
      appliedModel = created.model
      draftText = created.draftText
    } else {
      const forked = await this.deps.sessionController.fork({
        sessionId: req.sessionId,
        atSeq: targetTurn.prevCompletedEndSeq,
        allowMigration: true,
      })
      childSessionId = forked.sessionId
      const resolved = await this.deps.sessionController.resolveAgent(childSessionId)
      if ('error' in resolved) {
        throw new Error(resolved.error.message || 'Failed to resolve forked retry agent')
      }
      appliedModel = await this.applyModelAndPermissions(resolved.agent, { model: targetModel })
      await this.deps.sessionController
        .rename({
          sessionId: childSessionId,
          title: `${raw.title} (retry T${targetTurn.turn})`.slice(0, 120),
        })
        .catch(() => undefined)

      if (delivery === 'send') {
        await this.deps.sessionController.prompt(
          {
            requestId: randomUUID(),
            sessionId: childSessionId,
            mode: 'queue',
            content: [{ type: 'text', text: editedPrompt }],
          },
          AbortSignal.timeout(15_000),
        )
      } else {
        draftText = editedPrompt
      }
    }

    const edge: LineageEdge = {
      id: randomUUID(),
      kind: 'edit-retry',
      parentSessionId: req.sessionId,
      childSessionId,
      anchorSeq: targetTurn.userSeq,
      anchorTurn: targetTurn.turn,
      anchorSnippet: deriveShortTitle(editedPrompt, `Turn ${targetTurn.turn}`),
      ...(sourceModel ? { fromModel: sourceModel } : {}),
      ...(appliedModel ?? targetModel ? { toModel: appliedModel ?? targetModel } : {}),
      workspaceMode,
      ...(worktree ? { worktree } : {}),
      createdAt: Date.now(),
    }
    await this.deps.store.addEdge(edge)
    this.deps.bus.emit({
      type: 'lineage-updated',
      sessionIds: [req.sessionId, childSessionId],
      edge,
    })

    return {
      sessionId: childSessionId,
      edge,
      delivery,
      ...(draftText ? { draftText } : {}),
      ...(attachmentWarning ? { attachmentWarning } : {}),
    }
  }

  async previewHandoff(req: HandoffPreviewRequest): Promise<HandoffPreviewResponse> {
    if (!req.sessionId?.trim()) throw new BadRequestError('sessionId is required')
    if (!req.toModel?.provider?.trim() || !req.toModel?.model?.trim()) {
      throw new BadRequestError('toModel.provider and toModel.model are required')
    }
    const raw = await this.readSessionRaw(req.sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const fromModel = raw.model ?? [...turns].reverse().find((t) => t.model)?.model
    const sourceRunning = await this.isSessionRunning(req.sessionId)
    const gitInfo: GitRepoInfo = raw.cwd
      ? await this.git.inspectGitRepo(raw.cwd)
      : {
          isGitRepo: false,
          dirty: false,
          untrackedCount: 0,
          reason: 'Session has no workspace directory',
        }

    const { packetText, manifest } = buildHandoffPacket({
      sessionId: req.sessionId,
      sessionTitle: raw.title,
      turns,
      selectedTurnNumbers: req.selectedTurnNumbers,
      fromModel,
      toModel: req.toModel,
      workspaceMode: req.workspaceMode,
      gitInfo,
      nextInstruction: req.nextInstruction,
    })

    return {
      packetText,
      manifest,
      gitInfo,
      sourceRunning,
    }
  }

  async executeHandoff(req: ExecuteHandoffRequest): Promise<ExecuteHandoffResponse> {
    if (!req.sessionId?.trim()) throw new BadRequestError('sessionId is required')
    if (!req.toModel?.provider?.trim() || !req.toModel?.model?.trim()) {
      throw new BadRequestError('toModel.provider and toModel.model are required')
    }
    const packetText = req.packetText?.trim()
    if (!packetText) throw new BadRequestError('packetText must not be empty')

    const workspaceMode: WorkspaceMode = req.workspaceMode ?? 'same'
    const delivery: DeliveryMode = req.delivery ?? 'draft'

    await this.ensureSafeWorkspaceTarget({
      sourceSessionId: req.sessionId,
      workspaceMode,
      stopSourceIfRunning: req.stopSourceIfRunning,
      allowSameWhileRunning: req.allowSameWhileRunning,
    })

    const raw = await this.readSessionRaw(req.sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const fromModel = raw.model ?? [...turns].reverse().find((t) => t.model)?.model
    const workspaceId = this.resolveWorkspaceForSession(req.sessionId)

    let targetCwd = raw.cwd
    let worktree: WorktreeInfo | undefined
    if (workspaceMode === 'worktree') {
      const preparedWt = await this.prepareWorktree({
        cwd: raw.cwd,
        kind: 'handoff',
        label: req.toModel.model,
      })
      worktree = preparedWt.worktree
      targetCwd = worktree.path
    }

    const created = await this.createConfiguredSession({
      ...(workspaceMode === 'same' && workspaceId ? { workspaceId } : {}),
      ...(targetCwd ? { cwd: targetCwd } : {}),
      model: req.toModel,
      title: req.title?.trim() || `${raw.title} → ${req.toModel.model}`,
      promptText: packetText,
      delivery,
      workspaceWrite: workspaceMode === 'worktree',
    })

    const edge: LineageEdge = {
      id: randomUUID(),
      kind: 'handoff',
      parentSessionId: req.sessionId,
      childSessionId: created.sessionId,
      ...(fromModel ? { fromModel } : {}),
      toModel: created.model ?? req.toModel,
      workspaceMode,
      ...(worktree ? { worktree } : {}),
      ...(req.manifest ? { transferManifest: req.manifest } : {}),
      createdAt: Date.now(),
    }
    await this.deps.store.addEdge(edge)
    this.deps.bus.emit({
      type: 'lineage-updated',
      sessionIds: [req.sessionId, created.sessionId],
      edge,
    })

    return {
      sessionId: created.sessionId,
      edge,
      delivery,
      ...(created.draftText ? { draftText: created.draftText } : {}),
    }
  }

  async distillSummary(req: DistillRequest): Promise<DistillResponse> {
    const raw = await this.readSessionRaw(req.sessionId)
    const turns = extractTurnsFromEvents(raw.events)
    const latestModel = raw.model ?? [...turns].reverse().find((t) => t.model)?.model
    const model = await this.resolveDefaultModel(req.model ?? latestModel)

    if (req.kind === 'merge-back') {
      let sourceContent = ''
      if (req.sideChatId) {
        const chat = await this.deps.store.getSideChat(req.sideChatId)
        if (!chat) throw new NotFoundError(`Side chat not found: ${req.sideChatId}`)
        sourceContent = chat.messages
          .filter((m) => m.text.trim())
          .map((m) => `${m.role.toUpperCase()}: ${m.text.trim()}`)
          .join('\n\n')
      } else {
        sourceContent = buildBoundedSideChatContext(turns, { maxTurns: 10 }).contextSummary
      }

      const system =
        'Distill the provided side-chat or branch findings into a compact, accurate summary ready to merge back into the parent task. Use sections: Conclusion, Key Details, Caveats (if any). Stay strictly factual and concise.'
      const res = await this.streamLlmText({
        model,
        system,
        messages: [{ role: 'user', text: sourceContent || 'No messages to summarize.' }],
        purpose: 'dsh-threads-distill',
        antigravitySessionId: req.sessionId,
        signal: AbortSignal.timeout(90_000),
      })
      return { text: res.text, model: res.model }
    }

    const { packetText } = buildHandoffPacket({
      sessionId: req.sessionId,
      sessionTitle: raw.title,
      turns,
      selectedTurnNumbers: req.selectedTurnNumbers,
      fromModel: latestModel,
      toModel: model,
      workspaceMode: 'same',
      nextInstruction: req.nextInstruction,
    })
    const system =
      'Distill this session transcript into a clean, portable provider handoff brief with sections: Goal, Current State, Decisions Made, Files / Commands Touched, Open Issues, Next Step. Never fabricate file paths or results.'
    const res = await this.streamLlmText({
      model,
      system,
      messages: [{ role: 'user', text: packetText }],
      purpose: 'dsh-threads-distill',
      antigravitySessionId: req.sessionId,
      signal: AbortSignal.timeout(90_000),
    })
    return { text: res.text, model: res.model }
  }

  async mergeBack(req: MergeBackRequest): Promise<MergeBackResponse> {
    if (!req.targetParentSessionId?.trim()) {
      throw new BadRequestError('targetParentSessionId is required')
    }
    const text = req.text?.trim()
    if (!text) throw new BadRequestError('Merge-back text must not be empty')
    const delivery: DeliveryMode = req.delivery ?? 'draft'

    let sourceLabel = 'branch session'
    let anchorTurn: number | undefined
    let quote: string | undefined

    if (req.sourceSideChatId) {
      const chat = await this.deps.store.getSideChat(req.sourceSideChatId)
      if (chat) {
        sourceLabel = `side chat "${chat.title}"`
        anchorTurn = chat.anchorTurn
        quote = chat.quote
      }
    } else if (req.sourceChildSessionId) {
      const childRaw = await this.readSessionRaw(req.sourceChildSessionId).catch(() => undefined)
      sourceLabel = childRaw?.title
        ? `branch "${childRaw.title}"`
        : `branch ${req.sourceChildSessionId.slice(0, 8)}`
    }

    const formatted = buildMergeBackBrief({
      sourceLabel,
      anchorTurn,
      quote,
      text,
    })

    const mergedBackAt = Date.now()

    if (delivery === 'send') {
      await this.deps.sessionController.prompt(
        {
          requestId: randomUUID(),
          sessionId: req.targetParentSessionId,
          mode: 'queue',
          content: [{ type: 'text', text: formatted }],
          ...(req.clientTimeZone ? { clientTimeZone: req.clientTimeZone } : {}),
        },
        AbortSignal.timeout(15_000),
      )
    }

    if (req.sourceSideChatId) {
      const updatedChat = await this.deps.store.updateSideChat(req.sourceSideChatId, (chat) => ({
        ...chat,
        mergedBackAt,
        updatedAt: mergedBackAt,
      }))
      if (updatedChat) {
        this.deps.bus.emit({
          type: 'side-chat-updated',
          parentSessionId: updatedChat.parentSessionId,
          sideChat: updatedChat,
        })
      }
    }

    if (req.edgeId) {
      const updatedEdge = await this.deps.store.updateEdge(req.edgeId, (edge) => ({
        ...edge,
        mergedBackAt,
      }))
      if (updatedEdge) {
        this.deps.bus.emit({
          type: 'lineage-updated',
          sessionIds: [updatedEdge.parentSessionId, updatedEdge.childSessionId],
          edge: updatedEdge,
        })
      }
    }

    return {
      ok: true,
      delivery,
      targetParentSessionId: req.targetParentSessionId,
      ...(delivery === 'draft' ? { draftText: formatted } : {}),
      mergedBackAt,
    }
  }

  handleSlashSide(sessionId: string, rawInput: string): { kind: 'success' | 'error'; text: string } {
    const question = rawInput.trim()
    if (!question) {
      this.deps.bus.emit({
        type: 'open-ui',
        sessionId,
        tab: 'side',
      })
      return {
        kind: 'success',
        text: 'Opened Side Chats in the right Threads sidebar.',
      }
    }

    void this.createSideChat({
      parentSessionId: sessionId,
      question,
    })
      .then((chat) => {
        this.deps.bus.emit({
          type: 'open-ui',
          sessionId,
          tab: 'side',
          sideChatId: chat.id,
        })
      })
      .catch((err) => {
        this.deps.logger?.warn?.(`dsh-threads: /side failed: ${errorMessage(err)}`)
        this.deps.bus.emit({
          type: 'open-ui',
          sessionId,
          tab: 'side',
        })
      })

    return {
      kind: 'success',
      text: `Started side chat for "${deriveShortTitle(question, 'question')}".`,
    }
  }

  handleSlashHandoff(sessionId: string, rawInput: string): { kind: 'success'; text: string } {
    const note = rawInput.trim()
    this.deps.bus.emit({
      type: 'open-ui',
      sessionId,
      tab: 'handoff',
      ...(note ? { note } : {}),
    })
    return {
      kind: 'success',
      text: 'Opened Provider Handoff in the right Threads sidebar.',
    }
  }
}
