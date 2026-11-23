import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DshClientContext } from './dsh-types.ts'
import { publishThreadsIntent } from './ui-bus.ts'

const QUOTE_MAX = 4000

export interface SelectionPopoverProps {
  ctx: DshClientContext
  sessionId?: string
  readText?: () => string | null
  dismiss?: () => void
  clearSelection?: () => void
  inputActions?: { insertQuote?: (text: string) => boolean }
  useSession?: <V>(
    select: (s: {
      removed?: boolean
      subagent?: null | { address?: { mode?: string }; parentAvailable?: boolean }
    }) => V,
  ) => V
  t?: (key: string) => string
}

function getOptionalModelDirectories(
  ctx: DshClientContext,
): DshClientContext['modelDirectories'] | undefined {
  return (
    typeof ctx.get === 'function'
      ? ctx.get('modelDirectories')
      : ctx.modelDirectories
  ) as DshClientContext['modelDirectories'] | undefined
}

function readClaudeSessionFlag(ctx: DshClientContext, sessionId: string): boolean {
  if (!sessionId) return false
  try {
    const dirApi = getOptionalModelDirectories(ctx)
    const liveProvider = dirApi?.directoryFor?.(sessionId)?.store?.getSnapshot()?.current?.provider
    if (liveProvider !== undefined) {
      return liveProvider.startsWith('claude-code')
    }
  } catch {
    // Unbound directory falls back to list projection.
  }
  const summary = ctx.sessions?.list?.getSnapshot()?.byId[sessionId]
  const sel = summary?.projectionValues?.modelSelection ?? summary?.projections?.values?.modelSelection
  const provider = sel?.next?.provider ?? sel?.lastUsed?.provider ?? sel?.provider
  return provider?.startsWith('claude-code') === true
}

function useIsClaudeSession(ctx: DshClientContext, sessionId: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const offs: Array<() => void> = []
      try {
        const dirApi = getOptionalModelDirectories(ctx)
        const unsub = dirApi?.directoryFor?.(sessionId)?.store?.subscribe(notify)
        if (unsub) offs.push(unsub)
      } catch {
        // Ignore directory subscription failures on cold sessions.
      }
      try {
        const unsub = ctx.sessions?.list?.subscribe(notify)
        if (unsub) offs.push(unsub)
      } catch {
        // Ignore list subscription failures.
      }
      return () => {
        for (const off of offs) off()
      }
    },
    () => readClaudeSessionFlag(ctx, sessionId),
    () => false,
  )
}

export function SelectionPopover(props: SelectionPopoverProps) {
  const { ctx, sessionId = '', readText, dismiss, clearSelection, inputActions, t } = props

  const enabled =
    props.useSession?.(
      (s) =>
        !s.removed &&
        (s.subagent === null ||
          s.subagent === undefined ||
          (s.subagent.address?.mode === 'continuable' && s.subagent.parentAvailable === true)),
    ) ?? true

  const isClaude = useIsClaudeSession(ctx, sessionId)
  const [askPassage, setAskPassage] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) dismiss?.()
  }, [enabled, dismiss])

  useEffect(() => {
    if (askPassage !== null) {
      inputRef.current?.focus()
    }
  }, [askPassage])

  if (!enabled || !readText || !dismiss) return null

  const quoteLabel = t ? t('quote.add') : 'Quote'

  const close = () => {
    clearSelection?.()
    dismiss()
  }

  const handleQuote = () => {
    const text = readText()
    if (text === null) {
      dismiss()
      return
    }
    if (inputActions?.insertQuote?.(text) !== true) return
    close()
  }

  const handleOpenSideChat = () => {
    const text = askPassage ?? readText()
    if (text === null) {
      dismiss()
      return
    }
    if (sessionId) {
      publishThreadsIntent(
        {
          sessionId,
          tab: 'side',
          quote: text.slice(0, QUOTE_MAX),
        },
        ctx,
      )
    }
    close()
  }

  const handleOpenClaudeBtw = () => {
    const text = readText()
    if (text === null) {
      dismiss()
      return
    }
    setNote(null)
    setAskPassage(text.slice(0, QUOTE_MAX))
  }

  const handleSendClaudeBtw = async () => {
    if (askPassage === null || asking || !sessionId) return
    setAsking(true)
    setNote(null)
    try {
      const res = await fetch('/dsh-oh-my-claude/side-questions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session: sessionId,
          question: question.trim(),
          quote: askPassage,
        }),
      })
      if (!mountedRef.current) return
      if (res.ok) {
        close()
        return
      }
      if (res.status === 404) {
        setNote('Oh My Claude /btw route is unavailable; open in Side chat instead.')
      } else if (res.status === 409) {
        setNote('Claude process is not running yet; open in Side chat instead.')
      } else {
        setNote('Claude /btw request failed; try Side chat instead.')
      }
    } catch {
      if (mountedRef.current) {
        setNote('Could not reach Oh My Claude; try Side chat instead.')
      }
    } finally {
      if (mountedRef.current) setAsking(false)
    }
  }

  const keepSelection = (e: React.PointerEvent) => {
    e.preventDefault()
  }

  if (askPassage !== null) {
    return (
      <div className="dsh-thr-popover-panel">
        <div
          className="dsh-thr-faint"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={askPassage}
        >
          {askPassage.replace(/\s+/g, ' ').trim()}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <textarea
            ref={inputRef}
            className="dsh-thr-textarea"
            rows={1}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && e.nativeEvent.isComposing) {
                e.stopPropagation()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void handleSendClaudeBtw()
              }
            }}
            placeholder="Ask Claude /btw (empty = explain)…"
            readOnly={asking}
          />
          <button
            type="button"
            className="dsh-thr-popover-btn"
            onPointerDown={keepSelection}
            onClick={() => void handleSendClaudeBtw()}
            aria-disabled={asking}
          >
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </div>
        {note && (
          <div className="dsh-thr-row" style={{ justifyContent: 'space-between' }}>
            <span className="dsh-thr-faint" style={{ color: 'var(--dsw-alias-state-error-primary, #dc2626)' }}>
              {note}
            </span>
            <button
              type="button"
              className="dsh-thr-popover-btn"
              onPointerDown={keepSelection}
              onClick={handleOpenSideChat}
            >
              Side chat
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dsh-thr-popover-row">
      <button
        type="button"
        className="dsh-thr-popover-btn"
        onPointerDown={keepSelection}
        onClick={handleQuote}
      >
        {quoteLabel}
      </button>
      <button
        type="button"
        className="dsh-thr-popover-btn"
        onPointerDown={keepSelection}
        onClick={handleOpenSideChat}
      >
        Side chat
      </button>
      {isClaude && (
        <button
          type="button"
          className="dsh-thr-popover-btn"
          onPointerDown={keepSelection}
          onClick={handleOpenClaudeBtw}
        >
          Claude /btw
        </button>
      )}
    </div>
  )
}
