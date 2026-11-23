import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogResponse,
  DeliveryMode,
  GitRepoInfo,
  ModelSelectionSpec,
  SideChat,
  WorkspaceMode,
} from '../shared/types.ts'
import { ApiError, threadsApi } from './api.ts'
import { copyTextToClipboard } from './clipboard.ts'
import { queueDraft, queueQuote } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'
import { SimpleMarkdown } from './markdown.tsx'
import { MergeBackDrawer } from './MergeBackDrawer.tsx'
import { formatModelBadge, ModelPickerRow } from './ModelPickerRow.tsx'
import { QuoteChip } from './QuoteChip.tsx'
import { parseQuotedUserText } from './side-chat-quote.ts'
import { SideChatDraftEditor, type SideChatDraftHandle } from './SideChatDraftEditor.tsx'
import type { SideChatStreamBuffer } from './ThreadsTab.tsx'

interface SideSelectionPopoverState {
  text: string
  left: number
  top: number
  placement: 'above' | 'below'
}

type PopoverFlashState = 'copied' | 'quoted-main' | null

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 3.5V3a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyMessageButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        setCopied(false)
      }, 1500)
    })
  }

  return (
    <button
      type="button"
      className="dsh-thr-msg-action-btn"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

function findSelectionSource(node: Node | null): HTMLElement | null {
  const el = node instanceof Element ? node : node?.parentElement ?? null
  if (!el) return null
  if (el.closest('[data-dsh-thr-sel-exclude], button, input, textarea, select')) {
    return null
  }
  const source = el.closest('[data-dsh-thr-side-msg]')
  return source instanceof HTMLElement ? source : null
}

function pickVisibleSelectionRect(range: Range, rootRect: DOMRect): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0)
  const visible = rects.find((r) => r.bottom > rootRect.top && r.top < rootRect.bottom)
  if (visible) return visible
  const fallback = rects[0] ?? range.getBoundingClientRect()
  if (fallback.width === 0 && fallback.height === 0) return null
  if (fallback.bottom <= rootRect.top || fallback.top >= rootRect.bottom) return null
  return fallback
}

function normalizeSelectedText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, 4000)
}

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
  const [hasDraftContent, setHasDraftContent] = useState(false)
  const [newModel, setNewModel] = useState<ModelSelectionSpec | undefined>(defaultModel)
  const [newToolsEnabled, setNewToolsEnabled] = useState(true)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMergeBack, setShowMergeBack] = useState(false)
  const [showPromote, setShowPromote] = useState(false)
  const [promoteMode, setPromoteMode] = useState<WorkspaceMode>('same')
  const [promoteRunningConflict, setPromoteRunningConflict] = useState(false)
  const [selectionPopover, setSelectionPopover] = useState<SideSelectionPopoverState | null>(null)
  const [popoverFlash, setPopoverFlash] = useState<PopoverFlashState>(null)

  const shellRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const draftEditorRef = useRef<SideChatDraftHandle>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const popoverFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverFlashRef = useRef<PopoverFlashState>(null)
  popoverFlashRef.current = popoverFlash

  const effectiveToolsEnabled =
    activeChat && !pendingQuote ? activeChat.toolsEnabled !== false : newToolsEnabled

  const dismissPopover = useCallback(() => {
    if (popoverFlashTimerRef.current) {
      clearTimeout(popoverFlashTimerRef.current)
      popoverFlashTimerRef.current = null
    }
    popoverFlashRef.current = null
    setPopoverFlash(null)
    setSelectionPopover((prev) => (prev ? null : prev))
  }, [])

  useEffect(() => {
    return () => {
      if (popoverFlashTimerRef.current) {
        clearTimeout(popoverFlashTimerRef.current)
      }
    }
  }, [])

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
    setConfirmDeleteId(null)
    setDeleting(false)
    setError(null)
    dismissPopover()
    nearBottomRef.current = true
  }, [activeChat?.id, sessionId, dismissPopover])

  useEffect(() => {
    if (confirmDeleteId === null || typeof document === 'undefined') return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) {
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [confirmDeleteId, deleting])

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
    const container = scrollContainerRef.current
    if (!container) return
    const updateNearBottom = () => {
      nearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight <= 90
      dismissPopover()
    }
    nearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 90
    container.addEventListener('scroll', updateNearBottom, { passive: true })
    return () => {
      container.removeEventListener('scroll', updateNearBottom)
    }
  }, [activeChat?.id, dismissPopover])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container) {
      nearBottomRef.current = true
      container.scrollTop = container.scrollHeight
    }
  }, [activeChat?.id, activeChat?.messages.length])

  useEffect(() => {
    if (!nearBottomRef.current) return
    const container = scrollContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [activeStreamBuf?.text, activeStreamBuf?.reasoning, activeStreamBuf?.toolCalls.length])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    let rafId = 0

    const syncSelectionPopover = () => {
      const root = scrollContainerRef.current
      const shell = shellRef.current
      if (!root || !shell) return

      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        dismissPopover()
        return
      }

      const range = sel.getRangeAt(0)
      const startSource = findSelectionSource(range.startContainer)
      const endSource = findSelectionSource(range.endContainer)
      if (!startSource || startSource !== endSource || !root.contains(startSource)) {
        dismissPopover()
        return
      }

      const text = normalizeSelectedText(sel.toString())
      if (!text) {
        dismissPopover()
        return
      }

      const rootRect = root.getBoundingClientRect()
      const rect = pickVisibleSelectionRect(range, rootRect)
      if (!rect) {
        dismissPopover()
        return
      }

      const shellRect = shell.getBoundingClientRect()
      const rawLeft = rect.left + rect.width / 2 - shellRect.left
      const pad = Math.min(126, shellRect.width / 2)
      const left = Math.max(pad, Math.min(shellRect.width - pad, rawLeft))
      const topAbove = rect.top - shellRect.top - 8
      const placement: 'above' | 'below' = topAbove < 36 ? 'below' : 'above'
      const top =
        placement === 'below'
          ? Math.min(shellRect.height - 12, rect.bottom - shellRect.top + 8)
          : topAbove

      if (popoverFlashTimerRef.current) {
        clearTimeout(popoverFlashTimerRef.current)
        popoverFlashTimerRef.current = null
      }
      popoverFlashRef.current = null
      setPopoverFlash(null)
      setSelectionPopover({ text, left, top, placement })
    }

    const scheduleSync = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        syncSelectionPopover()
      })
    }

    const handleSelectionChange = () => {
      if (popoverFlashRef.current !== null) return
      const root = scrollContainerRef.current
      const sel = window.getSelection()
      if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionPopover((prev) => (prev ? null : prev))
        return
      }
      const range = sel.getRangeAt(0)
      const startSource = findSelectionSource(range.startContainer)
      const endSource = findSelectionSource(range.endContainer)
      if (
        !startSource ||
        startSource !== endSource ||
        !root.contains(startSource) ||
        !normalizeSelectedText(sel.toString())
      ) {
        setSelectionPopover((prev) => (prev ? null : prev))
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return
      }
      dismissPopover()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissPopover()
      }
    }

    const handleResize = () => {
      dismissPopover()
    }

    document.addEventListener('mouseup', scheduleSync)
    document.addEventListener('keyup', scheduleSync)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      document.removeEventListener('mouseup', scheduleSync)
      document.removeEventListener('keyup', scheduleSync)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [dismissPopover])

  const handleQuoteSelection = () => {
    if (!selectionPopover) return
    const snippet = selectionPopover.text
    window.getSelection()?.removeAllRanges()
    dismissPopover()
    draftEditorRef.current?.insertQuote(snippet)
  }

  const handleQuoteToMain = () => {
    if (!selectionPopover || !sessionId) return
    queueQuote(sessionId, selectionPopover.text)
    popoverFlashRef.current = 'quoted-main'
    setPopoverFlash('quoted-main')
    if (popoverFlashTimerRef.current) {
      clearTimeout(popoverFlashTimerRef.current)
    }
    popoverFlashTimerRef.current = setTimeout(() => {
      window.getSelection()?.removeAllRanges()
      dismissPopover()
    }, 600)
  }

  const handleCopySelection = () => {
    if (!selectionPopover) return
    void copyTextToClipboard(selectionPopover.text).then((ok) => {
      if (!ok) return
      popoverFlashRef.current = 'copied'
      setPopoverFlash('copied')
      if (popoverFlashTimerRef.current) {
        clearTimeout(popoverFlashTimerRef.current)
      }
      popoverFlashTimerRef.current = setTimeout(() => {
        window.getSelection()?.removeAllRanges()
        dismissPopover()
      }, 600)
    })
  }

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
        toolsEnabled: newToolsEnabled,
      })
      onClearPendingQuote?.()
      onSideChatUpsert(created)
      onSelectSideChat(created.id)
      dismissPopover()
      draftEditorRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleSend = async () => {
    const text = draftEditorRef.current?.getValue().trim() ?? ''
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
          toolsEnabled: effectiveToolsEnabled,
        })
        draftEditorRef.current?.clear()
        onClearPendingQuote?.()
        onSideChatUpsert(created)
        onSelectSideChat(created.id)
      } else {
        const updated = await threadsApi.sendSideChatMessage(activeChat.id, {
          text,
          model: activeChat.model,
          toolsEnabled: effectiveToolsEnabled,
        })
        draftEditorRef.current?.clear()
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
        const updated = await threadsApi.updateSideChat(activeChat.id, { model: next })
        onSideChatUpsert(updated)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleToolsToggle = async () => {
    const next = !effectiveToolsEnabled
    setNewToolsEnabled(next)
    if (activeChat && !pendingQuote) {
      try {
        const updated = await threadsApi.updateSideChat(activeChat.id, { toolsEnabled: next })
        onSideChatUpsert(updated)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      await threadsApi.deleteSideChat(id)
      setConfirmDeleteId(null)
      if (activeChat?.id === id) onSelectSideChat(null)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
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
    <div ref={shellRef} className="dsh-thr-side-shell">
      <div className="dsh-thr-side-header">
        <div className="dsh-thr-side-header-bar">
          {sideChats.length > 0 ? (
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
          ) : (
            <div className="dsh-thr-muted" style={{ flex: 1, minWidth: 0 }}>
              Read-only Q&amp;A side chats
            </div>
          )}
          <button
            type="button"
            className="dsh-thr-btn dsh-thr-btn-sm"
            disabled={creating}
            onClick={() => void handleNewChat()}
          >
            + New
          </button>
        </div>

        {activeChat && !pendingQuote && (
          <>
            <div className="dsh-thr-between">
              <span className="dsh-thr-faint">
                Context: {activeChat.contextTurnCount} parent turn(s)
                {activeChat.anchorTurn !== undefined
                  ? ` · anchored at T${activeChat.anchorTurn}`
                  : ''}
              </span>
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
                  disabled={deleting}
                  onClick={() =>
                    setConfirmDeleteId((cur) => (cur === activeChat.id ? null : activeChat.id))
                  }
                >
                  Delete
                </button>
              </div>
            </div>

            {confirmDeleteId === activeChat.id && (
              <div
                className="dsh-thr-confirm-box"
                role="alertdialog"
                aria-label="Confirm delete side chat"
              >
                <div className="dsh-thr-confirm-title">Delete &ldquo;{activeChat.title}&rdquo;?</div>
                <div>
                  This permanently deletes this side chat and its messages. This action cannot be
                  undone.
                  {activeChat.promotedSessionId
                    ? ' The promoted session will not be affected.'
                    : ''}
                </div>
                <div className="dsh-thr-row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="dsh-thr-btn-xs"
                    disabled={deleting}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="dsh-thr-btn-xs dsh-thr-btn-danger-solid"
                    disabled={deleting}
                    onClick={() => void handleDelete(activeChat.id)}
                  >
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div ref={scrollContainerRef} className="dsh-thr-side-scroll">
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

        {activeChat && !pendingQuote && activeChat.quote && (
          <blockquote className="dsh-thr-blockquote" data-dsh-thr-side-msg="quote">
            {activeChat.quote}
          </blockquote>
        )}

        {!activeChat && !pendingQuote && (
          <div className="dsh-thr-muted">
            Ask a question below to start a read-only side chat (kept out of main history &amp;
            sidebar).
          </div>
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
                const displayToolCalls =
                  liveBuf && liveBuf.toolCalls.length > 0
                    ? liveBuf.toolCalls
                    : (msg.toolCalls ?? [])
                const isUser = msg.role === 'user'

                if (isUser) {
                  const segments = parseQuotedUserText(msg.text)
                  return (
                    <div key={msg.id} className="dsh-thr-msg-wrap dsh-thr-msg-wrap-user">
                      <div className="dsh-thr-msg dsh-thr-msg-user">
                        <div className="dsh-thr-user-content" data-dsh-thr-side-msg={msg.id}>
                          {segments.map((seg, idx) => (
                            <span key={idx}>
                              {idx > 0 ? ' ' : null}
                              {seg.kind === 'quote' ? (
                                <QuoteChip text={seg.text} />
                              ) : (
                                <span className="dsh-thr-user-text">{seg.text}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      {msg.text.trim().length > 0 && (
                        <div
                          className="dsh-thr-msg-actions dsh-thr-msg-actions-user"
                          data-dsh-thr-sel-exclude=""
                        >
                          <CopyMessageButton text={msg.text} label="Copy message" />
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className="dsh-thr-msg-wrap dsh-thr-msg-wrap-assistant">
                    <div className="dsh-thr-msg dsh-thr-msg-assistant">
                      <div
                        className="dsh-thr-between dsh-thr-msg-head"
                        style={{ marginBottom: 4 }}
                        data-dsh-thr-sel-exclude=""
                      >
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
                          <summary data-dsh-thr-sel-exclude="">
                            {msg.streaming && !displayText ? 'Thinking…' : 'Thought process'}
                          </summary>
                          <div
                            className="dsh-thr-thinking-body"
                            data-dsh-thr-side-msg={`${msg.id}:reasoning`}
                          >
                            {displayReasoning}
                          </div>
                        </details>
                      )}
                      {displayToolCalls.length > 0 && (
                        <div className="dsh-thr-tools-list" data-dsh-thr-sel-exclude="">
                          {displayToolCalls.map((tc) => (
                            <details key={tc.id} className="dsh-thr-tool-row">
                              <summary className="dsh-thr-tool-summary">
                                <span
                                  className={`dsh-thr-tool-status dsh-thr-tool-status-${tc.status}`}
                                >
                                  {tc.status === 'running'
                                    ? 'Running'
                                    : tc.status === 'error'
                                      ? 'Error'
                                      : 'Done'}
                                </span>
                                <span className="dsh-thr-mono">{tc.name}</span>
                                <span className="dsh-thr-tool-arg" title={tc.summary}>
                                  {tc.summary}
                                </span>
                              </summary>
                              {(tc.outputPreview || tc.error) && (
                                <div className="dsh-thr-tool-body">
                                  {tc.error || tc.outputPreview}
                                </div>
                              )}
                            </details>
                          ))}
                        </div>
                      )}
                      {displayText ? (
                        <div className="dsh-thr-stream-text" data-dsh-thr-side-msg={msg.id}>
                          <SimpleMarkdown text={displayText} />
                          {msg.streaming && <span className="dsh-thr-cursor" aria-hidden="true" />}
                        </div>
                      ) : msg.streaming && !displayReasoning && displayToolCalls.length === 0 ? (
                        <span className="dsh-thr-faint" data-dsh-thr-sel-exclude="">
                          Thinking…
                        </span>
                      ) : null}
                      {msg.error && <div className="dsh-thr-err">{msg.error}</div>}
                    </div>
                    {displayText.trim().length > 0 && !msg.streaming && (
                      <div className="dsh-thr-msg-actions" data-dsh-thr-sel-exclude="">
                        <CopyMessageButton text={displayText} label="Copy response" />
                      </div>
                    )}
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="dsh-thr-side-footer">
        {error && <div className="dsh-thr-err">{error}</div>}

        {showMergeBack && activeChat && (
          <div className="dsh-thr-side-drawer">
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
          </div>
        )}

        {showPromote && activeChat && (
          <div className="dsh-thr-side-drawer">
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
                  Source checkout has uncommitted changes; worktree starts from HEAD (
                  {gitInfo.headShort}).
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
          </div>
        )}

        <div className="dsh-thr-card dsh-thr-side-composer">
          <SideChatDraftEditor
            ref={draftEditorRef}
            disabled={sending}
            placeholder={
              pendingQuote
                ? 'Ask about the selected passage… (Enter sends)'
                : 'Ask a side question without touching the main session…'
            }
            onHasContentChange={setHasDraftContent}
            onSubmit={() => void handleSend()}
          />

          <ModelPickerRow
            catalog={catalog}
            value={(!pendingQuote ? activeChat?.model : undefined) ?? newModel ?? defaultModel}
            onChange={(next) => void handleModelSwitch(next)}
            disabled={activeIsStreaming || sending}
            compact
          />

          <div className="dsh-thr-between">
            <div className="dsh-thr-row">
              <button
                type="button"
                className={
                  effectiveToolsEnabled
                    ? 'dsh-thr-tools-toggle dsh-thr-tools-toggle-on'
                    : 'dsh-thr-tools-toggle'
                }
                disabled={activeIsStreaming || sending}
                onClick={() => void handleToolsToggle()}
                title="Allow strictly read-only research tools (web_search, web_fetch, read, glob, grep, skill) on supported model routes; Claude Code side calls run text-only."
              >
                {effectiveToolsEnabled ? 'Tools: Research' : 'Tools: Off'}
              </button>
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
                disabled={!hasDraftContent || sending || activeIsStreaming}
                onClick={() => void handleSend()}
              >
                {sending ? 'Sending…' : 'Ask'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectionPopover && (
        <div
          ref={popoverRef}
          role="toolbar"
          aria-label="Selection actions"
          data-dsh-thr-sel-exclude=""
          className={`dsh-thr-side-sel-popover ${
            selectionPopover.placement === 'below'
              ? 'dsh-thr-side-sel-popover-below'
              : 'dsh-thr-side-sel-popover-above'
          }`}
          style={{ left: selectionPopover.left, top: selectionPopover.top }}
        >
          <button
            type="button"
            className="dsh-thr-side-sel-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleQuoteSelection}
          >
            Quote text
          </button>
          <button
            type="button"
            className="dsh-thr-side-sel-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleQuoteToMain}
          >
            {popoverFlash === 'quoted-main' ? 'Quoted' : 'Quote to main'}
          </button>
          <button
            type="button"
            className="dsh-thr-side-sel-btn"
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleCopySelection}
          >
            {popoverFlash === 'copied' ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
