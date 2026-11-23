import { useEffect, useState } from 'react'
import type {
  CatalogResponse,
  DeliveryMode,
  GitRepoInfo,
  HandoffPreviewResponse,
  ModelSelectionSpec,
  TurnSummary,
  WorkspaceMode,
} from '../shared/types.ts'
import { ApiError, threadsApi } from './api.ts'
import { queueDraft } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'
import { formatModelBadge, ModelPickerRow } from './ModelPickerRow.tsx'

export function HandoffView({
  ctx,
  sessionId,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  initialNote,
  onRefresh,
}: {
  ctx: DshClientContext
  sessionId: string
  defaultModel?: ModelSelectionSpec
  catalog: CatalogResponse | null
  gitInfo: GitRepoInfo | null
  turns: TurnSummary[]
  initialNote?: string
  onRefresh: () => void
}) {
  const [toModel, setToModel] = useState<ModelSelectionSpec | undefined>(defaultModel)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('same')
  const [turnScope, setTurnScope] = useState<'all' | 'last5' | 'custom'>('all')
  const [customTurns, setCustomTurns] = useState<number[]>([])
  const [nextInstruction, setNextInstruction] = useState(initialNote ?? '')
  const [preview, setPreview] = useState<HandoffPreviewResponse | null>(null)
  const [packetText, setPacketText] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [runningConflict, setRunningConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!toModel && (catalog?.defaultModel || defaultModel)) {
      setToModel(catalog?.defaultModel ?? defaultModel)
    }
  }, [catalog, defaultModel, toModel])

  useEffect(() => {
    if (initialNote) {
      setNextInstruction(initialNote)
    }
  }, [initialNote])

  const selectedTurnNumbers =
    turnScope === 'all'
      ? undefined
      : turnScope === 'last5'
        ? turns.slice(-5).map((t) => t.turn)
        : customTurns

  useEffect(() => {
    if (!toModel) return
    let cancelled = false
    setLoadingPreview(true)
    setError(null)
    void threadsApi
      .previewHandoff({
        sessionId,
        toModel,
        workspaceMode,
        ...(selectedTurnNumbers ? { selectedTurnNumbers } : {}),
        ...(nextInstruction.trim() ? { nextInstruction: nextInstruction.trim() } : {}),
      })
      .then((res) => {
        if (cancelled) return
        setPreview(res)
        setPacketText(res.packetText)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    sessionId,
    toModel?.provider,
    toModel?.model,
    toModel?.reasoningEffort,
    workspaceMode,
    turnScope,
    customTurns.join(','),
    nextInstruction,
  ])

  const handleDistill = async () => {
    if (!toModel) return
    setDistilling(true)
    setError(null)
    try {
      const res = await threadsApi.distillSummary({
        kind: 'handoff',
        sessionId,
        ...(selectedTurnNumbers ? { selectedTurnNumbers } : {}),
        model: defaultModel ?? toModel,
        ...(nextInstruction.trim() ? { nextInstruction: nextInstruction.trim() } : {}),
      })
      if (res.text.trim()) {
        setPacketText(res.text.trim())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDistilling(false)
    }
  }

  const handleExecute = async (
    delivery: DeliveryMode,
    extra: { stopSourceIfRunning?: boolean; workspaceMode?: WorkspaceMode } = {},
  ) => {
    if (!toModel || !packetText.trim()) return
    setExecuting(true)
    setError(null)
    setRunningConflict(false)
    const mode = extra.workspaceMode ?? workspaceMode
    try {
      const res = await threadsApi.executeHandoff({
        sessionId,
        toModel,
        workspaceMode: mode,
        delivery,
        packetText: packetText.trim(),
        ...(preview?.manifest ? { manifest: preview.manifest } : {}),
        ...(extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}),
      })
      if (delivery === 'draft' && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: 'replace' })
      }
      onRefresh()
      ctx.uiWorkspace?.openSession?.(res.sessionId)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SOURCE_RUNNING') {
        setRunningConflict(true)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="dsh-thr-card">
        <strong>1. Target model &amp; provider</strong>
        <div className="dsh-thr-faint">Current: {formatModelBadge(defaultModel)}</div>
        <ModelPickerRow
          catalog={catalog}
          value={toModel}
          onChange={setToModel}
          disabled={executing}
        />
      </div>

      <div className="dsh-thr-card">
        <strong>2. Workspace mode</strong>
        <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
          <input
            type="radio"
            name="dsh-thr-handoff-ws"
            checked={workspaceMode === 'same'}
            onChange={() => setWorkspaceMode('same')}
          />
          <span>Same workspace (sequential baton pass — preserves uncommitted edits)</span>
        </label>
        <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
          <input
            type="radio"
            name="dsh-thr-handoff-ws"
            checked={workspaceMode === 'worktree'}
            disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
            onChange={() => setWorkspaceMode('worktree')}
          />
          <span>New isolated Git worktree (safe if current session keeps running)</span>
        </label>
        {workspaceMode === 'same' && preview?.sourceRunning && (
          <div className="dsh-thr-warn">
            This session is currently running. Stop it before handing off here, or switch to an isolated Git worktree.
          </div>
        )}
        {workspaceMode === 'worktree' && gitInfo?.dirty && (
          <div className="dsh-thr-warn">
            Source checkout has uncommitted changes; the new worktree starts from HEAD ({gitInfo.headShort}).
          </div>
        )}
      </div>

      <div className="dsh-thr-card">
        <div className="dsh-thr-between">
          <strong>3. Context &amp; Transfer Manifest</strong>
          <div className="dsh-thr-row">
            <select
              className="dsh-thr-select"
              value={turnScope}
              onChange={(e) => {
                const mode = e.target.value as 'all' | 'last5' | 'custom'
                setTurnScope(mode)
                if (mode === 'custom' && customTurns.length === 0) {
                  setCustomTurns(turns.slice(-3).map((t) => t.turn))
                }
              }}
            >
              <option value="all">All turns ({turns.length})</option>
              <option value="last5">Last 5 turns</option>
              <option value="custom">Custom turns…</option>
            </select>
            <button
              type="button"
              className="dsh-thr-btn-xs"
              disabled={distilling || executing || !toModel}
              onClick={() => void handleDistill()}
            >
              {distilling ? 'Distilling…' : 'AI Distill'}
            </button>
          </div>
        </div>

        {turnScope === 'custom' && (
          <div className="dsh-thr-row">
            {turns.map((t) => {
              const checked = customTurns.includes(t.turn)
              return (
                <label key={t.turn} className="dsh-thr-pill" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setCustomTurns((prev) =>
                        e.target.checked
                          ? [...prev, t.turn].sort((a, b) => a - b)
                          : prev.filter((x) => x !== t.turn),
                      )
                    }}
                  />
                  <span>T{t.turn}</span>
                </label>
              )
            })}
          </div>
        )}

        <input
          type="text"
          className="dsh-thr-input"
          value={nextInstruction}
          onChange={(e) => setNextInstruction(e.target.value)}
          placeholder="Optional next instruction for the receiving model…"
        />

        {preview?.manifest && (
          <div
            style={{
              borderTop: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))',
              paddingTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div className="dsh-thr-faint">
              <strong>Moves:</strong>{' '}
              {preview.manifest.includedTurnNumbers.length} turn(s),{' '}
              {preview.manifest.includedToolDigestCount} tool outcome digest(s)
            </div>
            <div className="dsh-thr-faint">
              <strong>Stays behind:</strong> {preview.manifest.excludedItems.join(' · ')}
            </div>
            {preview.manifest.warnings.map((w, i) => (
              <div key={i} className="dsh-thr-warn">
                {w}
              </div>
            ))}
          </div>
        )}

        <textarea
          className="dsh-thr-textarea"
          rows={9}
          value={packetText}
          onChange={(e) => setPacketText(e.target.value)}
          placeholder={loadingPreview ? 'Building handoff packet…' : 'Handoff packet preview…'}
        />
      </div>

      {runningConflict && (
        <div className="dsh-thr-warn">
          Source session is running in this workspace. Choose how to proceed:
          <div className="dsh-thr-row" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="dsh-thr-btn dsh-thr-btn-danger"
              onClick={() => void handleExecute('draft', { stopSourceIfRunning: true })}
            >
              Stop source &amp; open draft
            </button>
            <button
              type="button"
              className="dsh-thr-btn"
              disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
              onClick={() => void handleExecute('draft', { workspaceMode: 'worktree' })}
            >
              Switch to isolated worktree
            </button>
          </div>
        </div>
      )}

      {error && <div className="dsh-thr-err">{error}</div>}

      <div className="dsh-thr-row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="dsh-thr-btn"
          disabled={executing || distilling || !toModel || !packetText.trim()}
          onClick={() => void handleExecute('draft')}
        >
          Open in typing box
        </button>
        <button
          type="button"
          className="dsh-thr-btn dsh-thr-btn-primary"
          disabled={executing || distilling || !toModel || !packetText.trim()}
          onClick={() => void handleExecute('send')}
        >
          {executing ? 'Handing off…' : 'Handoff & Send now'}
        </button>
      </div>
    </div>
  )
}
