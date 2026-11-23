import type {
  CatalogResponse,
  CreateSideChatRequest,
  DistillRequest,
  DistillResponse,
  EditAndRetryRequest,
  EditAndRetryResponse,
  ExecuteHandoffRequest,
  ExecuteHandoffResponse,
  ForkSessionRequest,
  HandoffPreviewRequest,
  HandoffPreviewResponse,
  LineageEdge,
  LinkSessionsRequest,
  MergeBackRequest,
  MergeBackResponse,
  PromoteSideChatRequest,
  SendSideChatMessageRequest,
  SessionInspectResponse,
  SessionTreeResponse,
  SideChat,
  ThreadsSseEvent,
  UpdateSideChatRequest,
} from '../shared/types.ts'

const API_BASE = '/dsh-threads/api'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'ApiError'
  }
}

async function requestJson<T>(subPath: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${subPath}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    let code: string | undefined
    try {
      const payload = (await response.json()) as { error?: unknown; code?: unknown }
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        message = payload.error
      }
      if (typeof payload?.code === 'string' && payload.code.trim()) {
        code = payload.code
      }
    } catch {
      const text = await response.text().catch(() => '')
      if (text.trim()) message = text.trim()
    }
    throw new ApiError(response.status, message, code)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const threadsApi = {
  fetchCatalog(): Promise<CatalogResponse> {
    return requestJson<CatalogResponse>('/catalog')
  },

  inspectSession(sessionId: string): Promise<SessionInspectResponse> {
    return requestJson<SessionInspectResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/inspect`,
    )
  },

  fetchTree(sessionId: string): Promise<SessionTreeResponse> {
    return requestJson<SessionTreeResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/tree`,
    )
  },

  async listSideChats(sessionId: string): Promise<SideChat[]> {
    const res = await requestJson<{ sideChats: SideChat[] }>(
      `/side-chats?sessionId=${encodeURIComponent(sessionId)}`,
    )
    return res.sideChats
  },

  async createSideChat(payload: CreateSideChatRequest): Promise<SideChat> {
    const res = await requestJson<{ sideChat: SideChat }>('/side-chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return res.sideChat
  },

  async sendSideChatMessage(id: string, payload: SendSideChatMessageRequest): Promise<SideChat> {
    const res = await requestJson<{ sideChat: SideChat }>(
      `/side-chats/${encodeURIComponent(id)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
    return res.sideChat
  },

  async abortSideChat(id: string): Promise<{ aborted: boolean }> {
    return requestJson<{ aborted: boolean }>(
      `/side-chats/${encodeURIComponent(id)}/abort`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    )
  },

  async updateSideChat(id: string, payload: UpdateSideChatRequest): Promise<SideChat> {
    const res = await requestJson<{ sideChat: SideChat }>(
      `/side-chats/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    )
    return res.sideChat
  },

  deleteSideChat(id: string): Promise<void> {
    return requestJson<void>(`/side-chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  promoteSideChat(
    id: string,
    payload: PromoteSideChatRequest = {},
  ): Promise<{ sessionId: string; edge: LineageEdge; delivery: 'draft' | 'send'; draftText?: string }> {
    return requestJson(`/side-chats/${encodeURIComponent(id)}/promote`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  forkSession(payload: ForkSessionRequest): Promise<{
    sessionId: string
    edge: LineageEdge
    delivery: 'draft' | 'send'
    draftText?: string
  }> {
    return requestJson('/fork', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async linkSessions(payload: LinkSessionsRequest): Promise<LineageEdge> {
    const res = await requestJson<{ edge: LineageEdge }>('/link', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return res.edge
  },

  editAndRetry(payload: EditAndRetryRequest): Promise<EditAndRetryResponse> {
    return requestJson<EditAndRetryResponse>('/edit-retry', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  previewHandoff(payload: HandoffPreviewRequest): Promise<HandoffPreviewResponse> {
    return requestJson<HandoffPreviewResponse>('/handoff/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  executeHandoff(payload: ExecuteHandoffRequest): Promise<ExecuteHandoffResponse> {
    return requestJson<ExecuteHandoffResponse>('/handoff/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  distillSummary(payload: DistillRequest): Promise<DistillResponse> {
    return requestJson<DistillResponse>('/distill', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  mergeBack(payload: MergeBackRequest): Promise<MergeBackResponse> {
    return requestJson<MergeBackResponse>('/merge-back', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

const sseListeners = new Set<(event: ThreadsSseEvent) => void>()
const sseReconnectListeners = new Set<() => void>()
let sharedSource: EventSource | null = null
let sseReconnectTimer: ReturnType<typeof setTimeout> | undefined
let sseOpen = false
let sseHasOpenedOnce = false
let sseReconnectAttempts = 0

export function isThreadsSseOpen(): boolean {
  return sseOpen
}

function clearSseReconnectTimer(): void {
  if (sseReconnectTimer !== undefined) {
    clearTimeout(sseReconnectTimer)
    sseReconnectTimer = undefined
  }
}

function teardownSharedEventSource(): void {
  clearSseReconnectTimer()
  sseOpen = false
  sseHasOpenedOnce = false
  sseReconnectAttempts = 0
  if (sharedSource) {
    sharedSource.close()
    sharedSource = null
  }
}

function connectSharedEventSource(): void {
  if (typeof EventSource === 'undefined' || sharedSource || sseListeners.size === 0) {
    return
  }

  const source = new EventSource(`${API_BASE}/events`)
  sharedSource = source

  source.onopen = () => {
    if (sharedSource !== source) return
    const isReconnect = sseHasOpenedOnce
    sseHasOpenedOnce = true
    sseOpen = true
    sseReconnectAttempts = 0
    if (isReconnect) {
      for (const fn of [...sseReconnectListeners]) {
        try {
          fn()
        } catch {
          // Ignore reconnect listener errors.
        }
      }
    }
  }

  source.onmessage = (msg) => {
    if (sharedSource !== source) return
    try {
      const parsed = JSON.parse(msg.data) as ThreadsSseEvent
      if (parsed && typeof parsed.type === 'string') {
        for (const fn of [...sseListeners]) {
          try {
            fn(parsed)
          } catch {
            // Ignore subscriber errors.
          }
        }
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  }

  source.onerror = () => {
    if (sharedSource !== source) return
    sseOpen = false
    source.close()
    sharedSource = null
    if (sseListeners.size === 0 || sseReconnectTimer !== undefined) return
    sseReconnectAttempts += 1
    const delay = sseReconnectAttempts === 1 ? 1000 : sseReconnectAttempts === 2 ? 2000 : 3000
    sseReconnectTimer = setTimeout(() => {
      sseReconnectTimer = undefined
      connectSharedEventSource()
    }, delay)
  }
}

export function subscribeThreadsEvents(
  listener: (event: ThreadsSseEvent) => void,
  options?: { onReconnect?: () => void },
): () => void {
  if (typeof EventSource === 'undefined') {
    return () => {}
  }

  sseListeners.add(listener)
  if (options?.onReconnect) {
    sseReconnectListeners.add(options.onReconnect)
  }
  connectSharedEventSource()

  return () => {
    sseListeners.delete(listener)
    if (options?.onReconnect) {
      sseReconnectListeners.delete(options.onReconnect)
    }
    if (sseListeners.size === 0) {
      teardownSharedEventSource()
    }
  }
}
