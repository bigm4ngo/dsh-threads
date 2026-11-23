import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogResponse, SessionInspectResponse, SideChat } from '../shared/types.ts'
import { isThreadsSseOpen, subscribeThreadsEvents, threadsApi } from './api.ts'
import type { SidebarRightTabProps } from './dsh-types.ts'
import { ForkTreeView } from './ForkTreeView.tsx'
import { HandoffView } from './HandoffView.tsx'
import { SideChatView } from './SideChatView.tsx'
import { ThreadsIcon } from './ThreadsIcon.tsx'
import { TurnsView } from './TurnsView.tsx'
import {
  getThreadsIntent,
  subscribeThreadsIntents,
  type ThreadsSubTab,
} from './ui-bus.ts'

export interface SideChatStreamBuffer {
  text: string
  reasoning: string
  seq: number
}

function mergeSideChatPreservingFinal(
  existing: SideChat | undefined,
  incoming: SideChat,
): SideChat {
  if (!existing) return incoming
  const existingById = new Map(existing.messages.map((m) => [m.id, m]))
  let keptFinal = false
  const mergedMessages = incoming.messages.map((m) => {
    const prev = existingById.get(m.id)
    if (prev && !prev.streaming && m.streaming) {
      keptFinal = true
      return prev
    }
    return m
  })
  if (keptFinal && existing.messages.length >= incoming.messages.length) {
    return existing
  }
  if (
    existing.updatedAt > incoming.updatedAt &&
    existing.messages.length >= incoming.messages.length
  ) {
    return existing
  }
  return keptFinal ? { ...incoming, messages: mergedMessages } : incoming
}

function isClaudeModel(provider: string | undefined): boolean {
  if (!provider) return false
  return provider === 'claude-code' || provider.startsWith('claude')
}

export function ThreadsTabTitle({ useTabInfo }: SidebarRightTabProps) {
  useTabInfo?.()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <ThreadsIcon size={13} />
      <span>Threads</span>
    </span>
  )
}

export function ThreadsTabBody(props: SidebarRightTabProps) {
  const { ctx, sessionId, useTabInfo } = props
  const tabInfo = useTabInfo?.()
  const navParams = tabInfo?.tab.navigation.params

  const [subTab, setSubTab] = useState<ThreadsSubTab>('side')
  const [selectedSideChatId, setSelectedSideChatId] = useState<string | null>(null)
  const [pendingQuote, setPendingQuote] = useState<string | undefined>(undefined)
  const [pendingAnchorTurn, setPendingAnchorTurn] = useState<number | undefined>(undefined)
  const [pendingAnchorSeq, setPendingAnchorSeq] = useState<number | undefined>(undefined)
  const [handoffNote, setHandoffNote] = useState<string | undefined>(undefined)
  const [inspect, setInspect] = useState<SessionInspectResponse | null>(null)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamingBuffers, setStreamingBuffers] = useState<Record<string, SideChatStreamBuffer>>({})
  const latestSeqByMsgRef = useRef<Record<string, number>>({})
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const syncBuffersForChats = useCallback(
    (chats: readonly SideChat[], scope: 'all' | 'partial' = 'all') => {
      setStreamingBuffers((prev) => {
        let next: Record<string, SideChatStreamBuffer> | null = null
        const ensureNext = () => {
          if (!next) next = { ...prev }
          return next
        }

        const activeIds = new Set<string>()
        const finishedIds = new Set<string>()
        for (const chat of chats) {
          for (const msg of chat.messages) {
            if (msg.streaming) {
              activeIds.add(msg.id)
              const serverSeq = msg.streamSeq ?? 0
              const cur = prev[msg.id]
              if (!cur) {
                if (msg.text || msg.reasoning || serverSeq > 0) {
                  latestSeqByMsgRef.current[msg.id] = Math.max(
                    latestSeqByMsgRef.current[msg.id] ?? 0,
                    serverSeq,
                  )
                  ensureNext()[msg.id] = {
                    text: msg.text,
                    reasoning: msg.reasoning ?? '',
                    seq: serverSeq,
                  }
                }
              } else if (serverSeq > cur.seq) {
                latestSeqByMsgRef.current[msg.id] = Math.max(
                  latestSeqByMsgRef.current[msg.id] ?? 0,
                  serverSeq,
                )
                ensureNext()[msg.id] = {
                  text: msg.text,
                  reasoning: msg.reasoning ?? cur.reasoning,
                  seq: serverSeq,
                }
              }
            } else {
              finishedIds.add(msg.id)
            }
          }
        }

        if (scope === 'all') {
          for (const msgId of Object.keys(prev)) {
            if (!activeIds.has(msgId)) {
              delete latestSeqByMsgRef.current[msgId]
              delete ensureNext()[msgId]
            }
          }
        } else {
          for (const msgId of finishedIds) {
            if (msgId in latestSeqByMsgRef.current) {
              delete latestSeqByMsgRef.current[msgId]
            }
            if (msgId in prev) {
              delete ensureNext()[msgId]
            }
          }
        }

        return next ?? prev
      })
    },
    [],
  )

  const upsertSideChat = useCallback(
    (incoming: SideChat) => {
      let mergedForSync = incoming
      setInspect((prev) => {
        if (!prev) return prev
        const existing = prev.sideChats.find((c) => c.id === incoming.id)
        const merged = mergeSideChatPreservingFinal(existing, incoming)
        mergedForSync = merged
        const nextChats = existing
          ? prev.sideChats.map((c) => (c.id === incoming.id ? merged : c))
          : [merged, ...prev.sideChats]
        return { ...prev, sideChats: nextChats }
      })
      syncBuffersForChats([mergedForSync], 'partial')
    },
    [syncBuffersForChats],
  )

  const refreshSideChats = useCallback(async () => {
    const targetSessionId = sessionIdRef.current
    if (!targetSessionId) return
    try {
      const chats = await threadsApi.listSideChats(targetSessionId)
      if (sessionIdRef.current !== targetSessionId) return
      let mergedChats: SideChat[] = chats
      setInspect((prev) => {
        if (!prev || prev.sessionId !== targetSessionId) return prev
        const prevById = new Map(prev.sideChats.map((c) => [c.id, c]))
        mergedChats = chats.map((c) => mergeSideChatPreservingFinal(prevById.get(c.id), c))
        return { ...prev, sideChats: mergedChats }
      })
      syncBuffersForChats(mergedChats, 'all')
    } catch {
      // Ignore background side-chat sync errors.
    }
  }, [syncBuffersForChats])

  useEffect(() => {
    latestSeqByMsgRef.current = {}
    setStreamingBuffers({})
  }, [sessionId])

  useEffect(() => {
    const paramTab = navParams?.tab
    if (
      paramTab === 'side' ||
      paramTab === 'tree' ||
      paramTab === 'turns' ||
      paramTab === 'handoff'
    ) {
      setSubTab(paramTab)
    }
    if (typeof navParams?.sideChatId === 'string') {
      setSelectedSideChatId(navParams.sideChatId)
    }
  }, [tabInfo?.tab.navigation.revision, navParams?.tab, navParams?.sideChatId])

  useEffect(() => {
    if (!sessionId) return
    const applyIntent = () => {
      const intent = getThreadsIntent(sessionId)
      if (!intent) return
      setSubTab(intent.tab)
      if (intent.sideChatId !== undefined) setSelectedSideChatId(intent.sideChatId)
      if (intent.quote !== undefined) setPendingQuote(intent.quote)
      if (intent.anchorTurn !== undefined) setPendingAnchorTurn(intent.anchorTurn)
      if (intent.anchorSeq !== undefined) setPendingAnchorSeq(intent.anchorSeq)
      if (intent.note !== undefined) setHandoffNote(intent.note)
    }
    applyIntent()
    return subscribeThreadsIntents(applyIntent)
  }, [sessionId])

  const loadAll = useCallback(() => {
    if (!sessionId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([
      threadsApi.inspectSession(sessionId),
      threadsApi.fetchCatalog().catch(() => null),
    ])
      .then(([insp, cat]) => {
        if (cancelled) return
        setInspect((prev) => {
          if (!prev || prev.sessionId !== insp.sessionId) {
            return insp
          }
          const prevById = new Map(prev.sideChats.map((c) => [c.id, c]))
          return {
            ...insp,
            sideChats: insp.sideChats.map((c) =>
              mergeSideChatPreservingFinal(prevById.get(c.id), c),
            ),
          }
        })
        syncBuffersForChats(insp.sideChats, 'all')
        if (cat) setCatalog(cat)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, syncBuffersForChats])

  useEffect(() => {
    const cancel = loadAll()
    const bindCleanup = tabInfo?.tab.actions.bindCommands?.({
      refresh: () => {
        loadAll()
      },
    })
    return () => {
      cancel?.()
      bindCleanup?.()
    }
  }, [loadAll, tabInfo?.tab.actions])

  useEffect(() => {
    if (!sessionId) return
    return subscribeThreadsEvents(
      (ev) => {
        if (ev.type === 'side-chat-delta' && ev.parentSessionId === sessionId) {
          const prevSeq = latestSeqByMsgRef.current[ev.messageId] ?? 0
          if (ev.seq !== undefined && prevSeq >= ev.seq) {
            return
          }
          const missedSeq = ev.seq !== undefined && prevSeq > 0 && ev.seq > prevSeq + 1
          if (ev.seq !== undefined) {
            latestSeqByMsgRef.current[ev.messageId] = ev.seq
          }
          setStreamingBuffers((prev) => {
            const cur = prev[ev.messageId] ?? { text: '', reasoning: '', seq: 0 }
            if (ev.seq !== undefined && cur.seq >= ev.seq) return prev
            const nextSeq = ev.seq ?? cur.seq + 1
            return {
              ...prev,
              [ev.messageId]: {
                text: ev.channel === 'reasoning' ? cur.text : `${cur.text}${ev.delta}`,
                reasoning: ev.channel === 'reasoning' ? `${cur.reasoning}${ev.delta}` : cur.reasoning,
                seq: nextSeq,
              },
            }
          })
          if (missedSeq) {
            void refreshSideChats()
          }
          return
        }
        if (ev.type === 'side-chat-updated' && ev.parentSessionId === sessionId) {
          upsertSideChat(ev.sideChat)
          return
        }
        if (ev.type === 'side-chat-deleted' && ev.parentSessionId === sessionId) {
          setInspect((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              sideChats: prev.sideChats.filter((c) => c.id !== ev.sideChatId),
            }
          })
          return
        }
        if (ev.type === 'lineage-updated' && ev.sessionIds.includes(sessionId)) {
          loadAll()
        }
      },
      {
        onReconnect: () => {
          void refreshSideChats()
        },
      },
    )
  }, [sessionId, loadAll, upsertSideChat, refreshSideChats])

  const hasStreamingSideChat = Boolean(
    inspect?.sideChats.some((c) => c.messages.some((m) => m.streaming)),
  )

  useEffect(() => {
    if (!sessionId || !hasStreamingSideChat) return
    const timer = setInterval(() => {
      if (!isThreadsSseOpen()) {
        void refreshSideChats()
      }
    }, 1500)
    return () => {
      clearInterval(timer)
    }
  }, [sessionId, hasStreamingSideChat, refreshSideChats])

  if (!sessionId) {
    return (
      <div className="dsh-thr-root">
        <div className="dsh-thr-body">
          <div className="dsh-thr-muted">Open a session to use Threads.</div>
        </div>
      </div>
    )
  }

  const sideChats = inspect?.sideChats ?? []
  const turns = inspect?.turns ?? []
  const tree = inspect?.tree ?? null
  const branchCount = Math.max(0, (tree?.nodes.length ?? 1) - 1)

  return (
    <div className="dsh-thr-root">
      <div className="dsh-thr-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'side'}
          className={`dsh-thr-subtab ${subTab === 'side' ? 'dsh-thr-subtab-active' : ''}`}
          onClick={() => setSubTab('side')}
        >
          Side Chats{sideChats.length > 0 ? ` (${sideChats.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'tree'}
          className={`dsh-thr-subtab ${subTab === 'tree' ? 'dsh-thr-subtab-active' : ''}`}
          onClick={() => setSubTab('tree')}
        >
          Fork Tree{branchCount > 0 ? ` (${branchCount})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'turns'}
          className={`dsh-thr-subtab ${subTab === 'turns' ? 'dsh-thr-subtab-active' : ''}`}
          onClick={() => setSubTab('turns')}
        >
          Turns{turns.length > 0 ? ` (${turns.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'handoff'}
          className={`dsh-thr-subtab ${subTab === 'handoff' ? 'dsh-thr-subtab-active' : ''}`}
          onClick={() => setSubTab('handoff')}
        >
          Handoff
        </button>
      </div>

      <div className={subTab === 'side' ? 'dsh-thr-body dsh-thr-body-side' : 'dsh-thr-body'}>
        {loading && !inspect && <div className="dsh-thr-muted">Loading session state…</div>}
        {error && <div className="dsh-thr-err">{error}</div>}

        {subTab === 'side' && (
          <SideChatView
            ctx={ctx}
            sessionId={sessionId}
            sessionTitle={inspect?.title || `Session ${sessionId.slice(0, 8)}`}
            defaultModel={inspect?.model ?? catalog?.defaultModel}
            catalog={catalog}
            gitInfo={inspect?.gitInfo ?? null}
            sideChats={sideChats}
            selectedSideChatId={selectedSideChatId}
            onSelectSideChat={setSelectedSideChatId}
            pendingQuote={pendingQuote}
            pendingAnchorTurn={pendingAnchorTurn}
            pendingAnchorSeq={pendingAnchorSeq}
            onClearPendingQuote={() => {
              setPendingQuote(undefined)
              setPendingAnchorTurn(undefined)
              setPendingAnchorSeq(undefined)
            }}
            onRefresh={loadAll}
            onSideChatUpsert={upsertSideChat}
            streamingBuffers={streamingBuffers}
          />
        )}

        {subTab === 'tree' && (
          <ForkTreeView
            ctx={ctx}
            sessionId={sessionId}
            sessionTitle={inspect?.title || `Session ${sessionId.slice(0, 8)}`}
            defaultModel={inspect?.model ?? catalog?.defaultModel}
            catalog={catalog}
            gitInfo={inspect?.gitInfo ?? null}
            turns={turns}
            sideChats={sideChats}
            tree={tree}
            initialAnchorTurn={pendingAnchorTurn}
            initialAnchorSeq={pendingAnchorSeq}
            onRefresh={loadAll}
            onSelectSideTab={() => setSubTab('side')}
          />
        )}

        {subTab === 'turns' && (
          <TurnsView
            ctx={ctx}
            sessionId={sessionId}
            defaultModel={inspect?.model ?? catalog?.defaultModel}
            catalog={catalog}
            gitInfo={inspect?.gitInfo ?? null}
            turns={turns}
            initialAnchorTurn={pendingAnchorTurn}
            isClaudeSession={isClaudeModel(inspect?.model?.provider)}
            onRefresh={loadAll}
          />
        )}

        {subTab === 'handoff' && (
          <HandoffView
            ctx={ctx}
            sessionId={sessionId}
            defaultModel={inspect?.model ?? catalog?.defaultModel}
            catalog={catalog}
            gitInfo={inspect?.gitInfo ?? null}
            turns={turns}
            initialNote={handoffNote}
            onRefresh={loadAll}
          />
        )}
      </div>
    </div>
  )
}
