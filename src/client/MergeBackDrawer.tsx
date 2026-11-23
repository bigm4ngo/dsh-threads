import { useState } from 'react'
import type { CatalogResponse, DeliveryMode, ModelSelectionSpec } from '../shared/types.ts'
import { threadsApi } from './api.ts'
import { queueDraft } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'

export function MergeBackDrawer({
  ctx,
  targetParentSessionId,
  targetParentTitle,
  sourceSessionIdForDistill,
  sourceSideChatId,
  sourceChildSessionId,
  edgeId,
  initialText,
  catalog,
  defaultModel,
  onClose,
  onMerged,
}: {
  ctx: DshClientContext
  targetParentSessionId: string
  targetParentTitle?: string
  sourceSessionIdForDistill: string
  sourceSideChatId?: string
  sourceChildSessionId?: string
  edgeId?: string
  initialText: string
  catalog: CatalogResponse | null
  defaultModel?: ModelSelectionSpec
  onClose: () => void
  onMerged: (delivery: DeliveryMode) => void
}) {
  const [text, setText] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDistill = async () => {
    setDistilling(true)
    setError(null)
    try {
      const res = await threadsApi.distillSummary({
        kind: 'merge-back',
        sessionId: sourceSessionIdForDistill,
        ...(sourceSideChatId ? { sideChatId: sourceSideChatId } : {}),
        ...(defaultModel ? { model: defaultModel } : {}),
      })
      if (res.text.trim()) {
        setText(res.text.trim())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDistilling(false)
    }
  }

  const submit = async (delivery: DeliveryMode) => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Findings text cannot be empty.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await threadsApi.mergeBack({
        targetParentSessionId,
        ...(sourceSideChatId ? { sourceSideChatId } : {}),
        ...(sourceChildSessionId ? { sourceChildSessionId } : {}),
        ...(edgeId ? { edgeId } : {}),
        text: trimmed,
        delivery,
        ...(tz ? { clientTimeZone: tz } : {}),
      })
      if (delivery === 'draft' && res.draftText) {
        queueDraft(targetParentSessionId, { text: res.draftText, mode: 'append' })
        ctx.uiWorkspace?.openSession?.(targetParentSessionId)
      }
      onMerged(delivery)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dsh-thr-card dsh-thr-card-accent">
      <div className="dsh-thr-between">
        <strong>
          Merge findings → {targetParentTitle || targetParentSessionId.slice(0, 8)}
        </strong>
        <button type="button" className="dsh-thr-btn-xs" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="dsh-thr-faint">
        Insert into draft appends below any unfinished typing in the parent composer without overwriting it.
      </div>
      <textarea
        className="dsh-thr-textarea"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Review or edit findings to send back to the parent session…"
      />
      {error && <div className="dsh-thr-err">{error}</div>}
      <div className="dsh-thr-between">
        <button
          type="button"
          className="dsh-thr-btn"
          disabled={busy || distilling || (!catalog && !defaultModel)}
          onClick={() => void handleDistill()}
          title="Condense findings with an LLM call"
        >
          {distilling ? 'Distilling…' : 'AI Distill'}
        </button>
        <div className="dsh-thr-row">
          <button
            type="button"
            className="dsh-thr-btn"
            disabled={busy || distilling}
            onClick={() => void submit('draft')}
          >
            Insert into draft
          </button>
          <button
            type="button"
            className="dsh-thr-btn dsh-thr-btn-primary"
            disabled={busy || distilling}
            onClick={() => void submit('send')}
          >
            Send now
          </button>
        </div>
      </div>
    </div>
  )
}
