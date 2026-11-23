import { useEffect, useState } from 'react'
import type {
  CatalogResponse,
  DeliveryMode,
  GitRepoInfo,
  ModelSelectionSpec,
  TurnSummary,
  WorkspaceMode,
} from '../shared/types.ts'
import { ApiError, threadsApi } from './api.ts'
import { queueDraft } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'
import { formatModelBadge, ModelPickerRow } from './ModelPickerRow.tsx'
import { publishThreadsIntent } from './ui-bus.ts'

function formatTime(ms: number): string {
  if (!ms) return ''
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function TurnsView({
  ctx,
  sessionId,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  initialAnchorTurn,
  isClaudeSession,
  onRefresh,
}: {
  ctx: DshClientContext
  sessionId: string
  defaultModel?: ModelSelectionSpec
  catalog: CatalogResponse | null
  gitInfo: GitRepoInfo | null
  turns: TurnSummary[]
  initialAnchorTurn?: number
  isClaudeSession: boolean
  onRefresh: () => void
}) {
  const [editingTurn, setEditingTurn] = useState<number | null>(initialAnchorTurn ?? null)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [retryModel, setRetryModel] = useState<ModelSelectionSpec | undefined>(defaultModel)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('same')
  const [busy, setBusy] = useState(false)
  const [runningConflict, setRunningConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const openEditorFor = (turn: TurnSummary) => {
    setEditingTurn(turn.turn)
    setEditedPrompt(turn.userText)
    setRetryModel(turn.model ?? defaultModel)
    setWorkspaceMode('same')
    setRunningConflict(false)
    setError(null)
    setNotice(null)
  }

  useEffect(() => {
    if (initialAnchorTurn === undefined) return
    const match = turns.find((t) => t.turn === initialAnchorTurn)
    if (match) {
      openEditorFor(match)
    }
  }, [initialAnchorTurn, turns.length])

  const submitRetry = async (
    turn: TurnSummary,
    delivery: DeliveryMode,
    extra: { stopSourceIfRunning?: boolean; workspaceMode?: WorkspaceMode } = {},
  ) => {
    const trimmed = editedPrompt.trim()
    if (!trimmed) {
      setError('Edited prompt must not be empty.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    setRunningConflict(false)
    const mode = extra.workspaceMode ?? workspaceMode
    try {
      const res = await threadsApi.editAndRetry({
        sessionId,
        turnNumber: turn.turn,
        prompt: trimmed,
        delivery,
        workspaceMode: mode,
        ...(retryModel ?? turn.model ?? defaultModel
          ? { model: retryModel ?? turn.model ?? defaultModel }
          : {}),
        ...(extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}),
      })
      if (res.attachmentWarning) {
        setNotice(res.attachmentWarning)
      }
      if (delivery === 'draft' && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: 'replace' })
      }
      setEditingTurn(null)
      onRefresh()
      ctx.uiWorkspace?.openSession?.(res.sessionId)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SOURCE_RUNNING') {
        setRunningConflict(true)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleQuickFork = async (turn: TurnSummary) => {
    setBusy(true)
    setError(null)
    try {
      const res = await threadsApi.forkSession({
        sessionId,
        atSeq: turn.turnEndSeq,
        anchorTurn: turn.turn,
        workspaceMode: 'same',
        ...(turn.model ?? defaultModel ? { model: turn.model ?? defaultModel } : {}),
        delivery: 'draft',
      })
      onRefresh()
      ctx.uiWorkspace?.openSession?.(res.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (turns.length === 0) {
    return <div className="dsh-thr-muted">No completed or started turns in this session yet.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="dsh-thr-muted">
        Fork-and-edit is non-destructive (conversation history only; files on disk stay untouched).
      </div>
      {isClaudeSession && (
        <div className="dsh-thr-faint">
          Using Claude Code: for in-place conversation + file checkpoint rollback, open Oh My Claude&apos;s Rewind tab (<kbd>Esc</kbd> <kbd>Esc</kbd> in an empty composer or the Spark button).
        </div>
      )}
      {notice && <div className="dsh-thr-warn">{notice}</div>}
      {error && <div className="dsh-thr-err">{error}</div>}

      {turns.map((turn) => {
        const isEditing = editingTurn === turn.turn
        return (
          <div
            key={turn.turn}
            className={`dsh-thr-card ${isEditing ? 'dsh-thr-card-accent' : ''}`}
          >
            <div className="dsh-thr-between">
              <div className="dsh-thr-row">
                <strong>Turn {turn.turn}</strong>
                {turn.model && (
                  <span className="dsh-thr-faint">{formatModelBadge(turn.model)}</span>
                )}
                {turn.toolSummary.length > 0 && (
                  <span className="dsh-thr-pill">
                    {turn.toolSummary.length} tool{turn.toolSummary.length === 1 ? '' : 's'}
                  </span>
                )}
                {turn.userAttachments.length > 0 && (
                  <span className="dsh-thr-pill dsh-thr-pill-warn">
                    {turn.userAttachments.length} attachment
                    {turn.userAttachments.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <span className="dsh-thr-faint">{formatTime(turn.time)}</span>
            </div>

            <div
              className="dsh-thr-muted"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 68,
                overflow: 'hidden',
              }}
            >
              {turn.userText || '(attachment-only prompt)'}
            </div>

            <div className="dsh-thr-row">
              <button
                type="button"
                className="dsh-thr-btn-xs"
                onClick={() => (isEditing ? setEditingTurn(null) : openEditorFor(turn))}
              >
                {isEditing ? 'Cancel edit' : 'Edit & Retry'}
              </button>
              <button
                type="button"
                className="dsh-thr-btn-xs"
                disabled={busy}
                onClick={() => void handleQuickFork(turn)}
              >
                Fork after T{turn.turn}
              </button>
              <button
                type="button"
                className="dsh-thr-btn-xs"
                onClick={() =>
                  publishThreadsIntent(
                    {
                      sessionId,
                      tab: 'side',
                      anchorTurn: turn.turn,
                      anchorSeq: turn.turnEndSeq,
                    },
                    ctx,
                  )
                }
              >
                Side chat
              </button>
            </div>

            {isEditing && (
              <div
                style={{
                  borderTop: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.22))',
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {turn.prevCompletedEndSeq === null && (
                  <div className="dsh-thr-faint">
                    Turn 1 has no prior history; retrying starts a fresh session with your edited prompt.
                  </div>
                )}
                {turn.userAttachments.length > 0 && (
                  <div className="dsh-thr-warn">
                    Attachments ({turn.userAttachments.map((a) => a.name ?? a.kind).join(', ')}) are not automatically copied; use Open in typing box if you need to re-attach files.
                  </div>
                )}

                <textarea
                  className="dsh-thr-textarea"
                  rows={4}
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  disabled={busy}
                />

                <ModelPickerRow
                  catalog={catalog}
                  value={retryModel ?? turn.model ?? defaultModel}
                  onChange={setRetryModel}
                  disabled={busy}
                  compact
                />

                <div className="dsh-thr-row">
                  <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`retry-ws-${turn.turn}`}
                      checked={workspaceMode === 'same'}
                      onChange={() => setWorkspaceMode('same')}
                    />
                    <span>Same workspace</span>
                  </label>
                  <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`retry-ws-${turn.turn}`}
                      checked={workspaceMode === 'worktree'}
                      disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
                      onChange={() => setWorkspaceMode('worktree')}
                    />
                    <span>New Git worktree</span>
                  </label>
                </div>

                {workspaceMode === 'worktree' && gitInfo?.dirty && (
                  <div className="dsh-thr-warn">
                    New worktree starts from committed HEAD ({gitInfo.headShort}); uncommitted edits stay in this checkout.
                  </div>
                )}

                {runningConflict && (
                  <div className="dsh-thr-warn">
                    Source session is running in this workspace.
                    <div className="dsh-thr-row" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="dsh-thr-btn dsh-thr-btn-danger"
                        onClick={() =>
                          void submitRetry(turn, 'draft', { stopSourceIfRunning: true })
                        }
                      >
                        Stop source &amp; open draft
                      </button>
                      <button
                        type="button"
                        className="dsh-thr-btn"
                        disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
                        onClick={() =>
                          void submitRetry(turn, 'draft', { workspaceMode: 'worktree' })
                        }
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
                    disabled={busy || !editedPrompt.trim()}
                    onClick={() => void submitRetry(turn, 'draft')}
                  >
                    Open in typing box
                  </button>
                  <button
                    type="button"
                    className="dsh-thr-btn dsh-thr-btn-primary"
                    disabled={busy || !editedPrompt.trim()}
                    onClick={() => void submitRetry(turn, 'send')}
                  >
                    {busy ? 'Forking…' : 'Fork & Send now'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
