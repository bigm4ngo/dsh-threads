import { useEffect, useRef, useState } from 'react'
import type {
  CatalogResponse,
  DeliveryMode,
  GitRepoInfo,
  ModelSelectionSpec,
  SideChat,
  WorkspaceMode,
} from '../shared/types.ts'
import { ApiError, threadsApi } from './api.ts'
import { queueDraft } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'
import { SimpleMarkdown } from './markdown.tsx'
import { MergeBackDrawer } from './MergeBackDrawer.tsx'
import { formatModelBadge, ModelPickerRow } from './ModelPickerRow.tsx'
import type { SideChatStreamBuffer } from './ThreadsTab.tsx'

export function SideChatView({
  ctx,
  sessionId,
  sessionTitle,
  defaultModel,
  catalog,
  gitInfo,
  sideChats,
  selectedSideChatId,
  onSelectSideChat,
  pendingQuote,
  pendingAnchorTurn,
  pendingAnchorSeq,
  onClearPendingQuote,
  onRefresh,
  onSideChatUpsert,
  streamingBuffers,
}: {
  ctx: DshClientContext
  sessionId: string
  sessionTitle: string
  defaultModel?: ModelSelectionSpec
  catalog: CatalogResponse | null
  gitInfo: GitRepoInfo | null
  sideChats: SideChat[]
  selectedSideChatId: string | null
  onSelectSideChat: (id: string | null) => void
  pendingQuote?: string
  pendingAnchorTurn?: number
  pendingAnchorSeq?: number
  onClearPendingQuote?: () => void
  onRefresh: () => void
  onSideChatUpsert: (chat: SideChat) => void
  streamingBuffers: Record<string, SideChatStreamBuffer>
}) {
  const activeChat = sideChats.find((c) => c.id === selectedSideChatId) ?? sideChats[0] ?? null
  const [composer, setComposer] = useState('')
  const [newModel, setNewModel] = useState<ModelSelectionSpec | undefined>(defaultModel)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMergeBack, setShowMergeBack] = useState(false)
  const [showPromote, setShowPromote] = useState(false)
  const [promoteMode, setPromoteMode] = useState<WorkspaceMode>('same')
  const [promoteRunningConflict, setPromoteRunningConflict] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  useEffect(() => {
    if (!newModel && defaultModel) {
      setNewModel(defaultModel)
    }
  }, [defaultModel, newModel])

  useEffect(() => {
    setShowMergeBack(false)
    setShowPromote(false)
    setPromoteRunningConflict(false)
    setStopping(false)
    setError(null)
    nearBottomRef.current = true
  }, [activeChat?.id])

  const activeIsStreaming = !pendingQuote && Boolean(activeChat?.messages.some((m) => m.streaming))
  const streamingMsg = activeIsStreaming
    ? activeChat?.messages.find((m) => m.streaming)
    : undefined
  const activeStreamBuf = streamingMsg ? streamingBuffers[streamingMsg.id] : undefined

  useEffect(() => {
    if (!activeIsStreaming) {
      setStopping(false)
    }
  }, [activeIsStreaming])

  useEffect(() => {
    const container = bottomRef.current?.closest('.dsh-thr-body') as HTMLElement | null
    if (!container) return
    const updateNearBottom = () => {
      nearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight <= 90
    }
    updateNearBottom()
    container.addEventListener('scroll', updateNearBottom, { passive: true })
    return () => {
      container.removeEventListener('scroll', updateNearBottom)
    }
  }, [activeChat?.id])

  useEffect(() => {
    const container = bottomRef.current?.closest('.dsh-thr-body') as HTMLElement | null
    if (container) {
      nearBottomRef.current = true
      container.scrollTop = container.scrollHeight
    }
  }, [activeChat?.id, activeChat?.messages.length])

  useEffect(() => {
    if (!nearBottomRef.current) return
    const container = bottomRef.current?.closest('.dsh-thr-body') as HTMLElement | null
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [activeStreamBuf?.text, activeStreamBuf?.reasoning])

  const handleNewChat = async () => {
    setCreating(true)
    setError(null)
    try {
      const created = await threadsApi.createSideChat({
        parentSessionId: sessionId,
        ...(pendingQuote ? { quote: pendingQuote } : {}),
        ...(pendingAnchorTurn !== undefined ? { anchorTurn: pendingAnchorTurn } : {}),
        ...(pendingAnchorSeq !== undefined ? { anchorSeq: pendingAnchorSeq } : {}),
        ...(newModel ?? defaultModel ? { model: newModel ?? defaultModel } : {}),
      })
      onClearPendingQuote?.()
      onSideChatUpsert(created)
      onSelectSideChat(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleSend = async () => {
    const text = composer.trim()
    if (!text || sending || activeIsStreaming) return
    setSending(true)
    setError(null)
    try {
      if (!activeChat || pendingQuote) {
        const created = await threadsApi.createSideChat({
          parentSessionId: sessionId,
          question: text,
          ...(pendingQuote ? { quote: pendingQuote } : {}),
          ...(pendingAnchorTurn !== undefined ? { anchorTurn: pendingAnchorTurn } : {}),
          ...(pendingAnchorSeq !== undefined ? { anchorSeq: pendingAnchorSeq } : {}),
          ...(newModel ?? defaultModel ? { model: newModel ?? defaultModel } : {}),
        })
        setComposer('')
        onClearPendingQuote?.()
        onSideChatUpsert(created)
        onSelectSideChat(created.id)
      } else {
        const updated = await threadsApi.sendSideChatMessage(activeChat.id, {
          text,
          model: activeChat.model,
        })
        setComposer('')
        onSideChatUpsert(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  const handleModelSwitch = async (next: ModelSelectionSpec) => {
    setNewModel(next)
    if (activeChat && !pendingQuote) {
      try {
        await threadsApi.updateSideChat(activeChat.id, { model: next })
        onRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await threadsApi.deleteSideChat(id)
      if (activeChat?.id === id) onSelectSideChat(null)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handlePromote = async (
    delivery: DeliveryMode,
    extra: { stopSourceIfRunning?: boolean; workspaceMode?: WorkspaceMode } = {},
  ) => {
    if (!activeChat) return
    setError(null)
    setPromoteRunningConflict(false)
    const mode = extra.workspaceMode ?? promoteMode
    try {
      const res = await threadsApi.promoteSideChat(activeChat.id, {
        workspaceMode: mode,
        delivery,
        model: activeChat.model,
        ...(extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}),
      })
      if (delivery === 'draft' && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: 'replace' })
      }
      setShowPromote(false)
      onRefresh()
      ctx.uiWorkspace?.openSession?.(res.sessionId)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SOURCE_RUNNING') {
        setPromoteRunningConflict(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const defaultMergeBrief = activeChat
    ? (() => {
        const lastAssistant = [...activeChat.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && m.text.trim())
        if (lastAssistant) return lastAssistant.text.trim()
        return activeChat.messages
          .filter((m) => m.text.trim())
          .map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${m.text.trim()}`)
          .join('\n\n')
      })()
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="dsh-thr-between">
        <div className="dsh-thr-muted">
          Read-only Q&amp;A side chats (kept out of main history &amp; sidebar)
        </div>
        <button
          type="button"
          className="dsh-thr-btn"
          disabled={creating}
          onClick={() => void handleNewChat()}
        >
          + New
        </button>
      </div>

      {sideChats.length > 0 && (
        <div className="dsh-thr-side-chips">
          {sideChats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={`dsh-thr-side-chip ${
                activeChat?.id === chat.id && !pendingQuote ? 'dsh-thr-side-chip-active' : ''
              }`}
              onClick={() => {
                onClearPendingQuote?.()
                onSelectSideChat(chat.id)
              }}
              title={chat.title}
            >
              {chat.title}
            </button>
          ))}
        </div>
      )}

      {pendingQuote && (
        <div className="dsh-thr-card dsh-thr-card-accent">
          <div className="dsh-thr-between">
            <span className="dsh-thr-pill dsh-thr-pill-brand">Selected passage attached</span>
            <button
              type="button"
              className="dsh-thr-btn-xs"
              onClick={() => onClearPendingQuote?.()}
            >
              Discard quote
            </button>
          </div>
          <blockquote className="dsh-thr-blockquote">{pendingQuote}</blockquote>
        </div>
      )}

      <div className="dsh-thr-card">
        <div className="dsh-thr-between">
          <span className="dsh-thr-faint">Side-chat model</span>
          {activeChat && !pendingQuote && (
            <div className="dsh-thr-row">
              {activeChat.mergedBackAt && (
                <span className="dsh-thr-pill dsh-thr-pill-ok">Merged</span>
              )}
              {activeChat.promotedSessionId && (
                <button
                  type="button"
                  className="dsh-thr-btn-xs"
                  onClick={() => ctx.uiWorkspace?.openSession?.(activeChat.promotedSessionId!)}
                >
                  Open promoted ↗
                </button>
              )}
              <button
                type="button"
                className="dsh-thr-btn-xs dsh-thr-btn-danger"
                onClick={() => void handleDelete(activeChat.id)}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <ModelPickerRow
          catalog={catalog}
          value={(!pendingQuote ? activeChat?.model : undefined) ?? newModel ?? defaultModel}
          onChange={(next) => void handleModelSwitch(next)}
          disabled={activeIsStreaming || sending}
          compact
        />
        {activeChat && !pendingQuote && (
          <div className="dsh-thr-faint">
            Context: {activeChat.contextTurnCount} parent turn(s)
            {activeChat.anchorTurn !== undefined ? ` · anchored at T${activeChat.anchorTurn}` : ''}
          </div>
        )}
      </div>

      {activeChat && !pendingQuote && activeChat.quote && (
        <blockquote className="dsh-thr-blockquote">{activeChat.quote}</blockquote>
      )}

      {activeChat && !pendingQuote && (
        <div className="dsh-thr-msg-list">
          {activeChat.messages.length === 0 ? (
            <div className="dsh-thr-muted">Ask a question below to start this side chat.</div>
          ) : (
            activeChat.messages.map((msg) => {
              const liveBuf = msg.streaming ? streamingBuffers[msg.id] : undefined
              const displayText = liveBuf ? liveBuf.text : msg.text
              const displayReasoning = liveBuf ? liveBuf.reasoning : (msg.reasoning ?? '')
              return (
                <div
                  key={msg.id}
                  className={`dsh-thr-msg ${
                    msg.role === 'user' ? 'dsh-thr-msg-user' : 'dsh-thr-msg-assistant'
                  }`}
                >
                  {msg.role === 'user' ? (
                    msg.text
                  ) : (
                    <>
                      <div className="dsh-thr-between" style={{ marginBottom: 4 }}>
                        <span className="dsh-thr-faint">
                          {formatModelBadge(msg.model ?? activeChat.model)}
                        </span>
                        {msg.streaming && (
                          <span className="dsh-thr-pill dsh-thr-pill-brand">Streaming…</span>
                        )}
                      </div>
                      {displayReasoning && (
                        <details
                          className="dsh-thr-thinking"
                          open={Boolean(msg.streaming && !displayText)}
                        >
                          <summary>
                            {msg.streaming && !displayText ? 'Thinking…' : 'Thought process'}
                          </summary>
                          <div className="dsh-thr-thinking-body">{displayReasoning}</div>
                        </details>
                      )}
                      {displayText ? (
                        <div className="dsh-thr-stream-text">
                          <SimpleMarkdown text={displayText} />
                          {msg.streaming && <span className="dsh-thr-cursor" aria-hidden="true" />}
                        </div>
                      ) : msg.streaming && !displayReasoning ? (
                        <span className="dsh-thr-faint">Thinking…</span>
                      ) : null}
                      {msg.error && <div className="dsh-thr-err">{msg.error}</div>}
                    </>
                  )}
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <div className="dsh-thr-err">{error}</div>}

      <div className="dsh-thr-card">
        <textarea
          className="dsh-thr-textarea"
          rows={2}
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={
            pendingQuote
              ? 'Ask about the selected passage… (Enter sends)'
              : 'Ask a side question without touching the main session…'
          }
          disabled={sending}
        />
        <div className="dsh-thr-between">
          <div className="dsh-thr-row">
            {activeChat && !pendingQuote && activeChat.messages.length > 0 && (
              <>
                <button
                  type="button"
                  className="dsh-thr-btn-xs"
                  onClick={() => {
                    setShowPromote(false)
                    setShowMergeBack((v) => !v)
                  }}
                >
                  Add findings to parent
                </button>
                <button
                  type="button"
                  className="dsh-thr-btn-xs"
                  onClick={() => {
                    setShowMergeBack(false)
                    setShowPromote((v) => !v)
                  }}
                >
                  Promote to session
                </button>
              </>
            )}
          </div>
          <div className="dsh-thr-row">
            {activeIsStreaming && activeChat && (
              <button
                type="button"
                className="dsh-thr-btn dsh-thr-btn-danger"
                disabled={stopping}
                onClick={() => {
                  setStopping(true)
                  void threadsApi.abortSideChat(activeChat.id).catch(() => {
                    setStopping(false)
                  })
                }}
              >
                {stopping ? 'Stopping…' : 'Stop'}
              </button>
            )}
            <button
              type="button"
              className="dsh-thr-btn dsh-thr-btn-primary"
              disabled={!composer.trim() || sending || activeIsStreaming}
              onClick={() => void handleSend()}
            >
              {sending ? 'Sending…' : 'Ask'}
            </button>
          </div>
        </div>
      </div>

      {showMergeBack && activeChat && (
        <MergeBackDrawer
          ctx={ctx}
          targetParentSessionId={sessionId}
          targetParentTitle={sessionTitle}
          sourceSessionIdForDistill={sessionId}
          sourceSideChatId={activeChat.id}
          initialText={defaultMergeBrief}
          catalog={catalog}
          defaultModel={activeChat.model}
          onClose={() => setShowMergeBack(false)}
          onMerged={() => {
            setShowMergeBack(false)
            onRefresh()
          }}
        />
      )}

      {showPromote && activeChat && (
        <div className="dsh-thr-card dsh-thr-card-accent">
          <div className="dsh-thr-between">
            <strong>Promote side chat to full DSH session</strong>
            <button
              type="button"
              className="dsh-thr-btn-xs"
              onClick={() => setShowPromote(false)}
            >
              Close
            </button>
          </div>
          <div className="dsh-thr-row">
            <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name={`promote-mode-${activeChat.id}`}
                checked={promoteMode === 'same'}
                onChange={() => setPromoteMode('same')}
              />
              <span>Same workspace</span>
            </label>
            <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name={`promote-mode-${activeChat.id}`}
                checked={promoteMode === 'worktree'}
                disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
                onChange={() => setPromoteMode('worktree')}
              />
              <span>New isolated Git worktree</span>
            </label>
          </div>
          {promoteMode === 'worktree' && gitInfo?.dirty && (
            <div className="dsh-thr-warn">
              Source checkout has uncommitted changes; worktree starts from HEAD ({gitInfo.headShort}).
            </div>
          )}
          {promoteRunningConflict && (
            <div className="dsh-thr-warn">
              Parent session is currently running in this workspace.
              <div className="dsh-thr-row" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="dsh-thr-btn dsh-thr-btn-danger"
                  onClick={() => void handlePromote('draft', { stopSourceIfRunning: true })}
                >
                  Stop parent &amp; open draft
                </button>
                <button
                  type="button"
                  className="dsh-thr-btn"
                  disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
                  onClick={() => void handlePromote('draft', { workspaceMode: 'worktree' })}
                >
                  Use isolated worktree
                </button>
              </div>
            </div>
          )}
          <div className="dsh-thr-row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="dsh-thr-btn"
              onClick={() => void handlePromote('draft')}
            >
              Open in typing box
            </button>
            <button
              type="button"
              className="dsh-thr-btn dsh-thr-btn-primary"
              onClick={() => void handlePromote('send')}
            >
              Promote &amp; Send now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
