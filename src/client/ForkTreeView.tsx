import { useState } from 'react'
import type {
  CatalogResponse,
  DeliveryMode,
  GitRepoInfo,
  LineageEdge,
  ModelSelectionSpec,
  SessionTreeResponse,
  SideChat,
  TreeSessionNode,
  TurnSummary,
  WorkspaceMode,
} from '../shared/types.ts'
import { ApiError, threadsApi } from './api.ts'
import { queueDraft } from './draft-bridge.ts'
import type { DshClientContext } from './dsh-types.ts'
import { MergeBackDrawer } from './MergeBackDrawer.tsx'
import { formatModelBadge, ModelPickerRow } from './ModelPickerRow.tsx'

interface RenderedTreeRow {
  node: TreeSessionNode
  depth: number
  incoming?: LineageEdge
}

function buildTreeRows(tree: SessionTreeResponse): RenderedTreeRow[] {
  const byParent = new Map<string, LineageEdge[]>()
  for (const edge of tree.edges) {
    const list = byParent.get(edge.parentSessionId) ?? []
    list.push(edge)
    byParent.set(edge.parentSessionId, list)
  }
  const nodeMap = new Map(tree.nodes.map((n) => [n.sessionId, n]))
  const rows: RenderedTreeRow[] = []
  const visited = new Set<string>()

  const walk = (id: string, depth: number, incoming?: LineageEdge) => {
    if (visited.has(id)) return
    visited.add(id)
    const node = nodeMap.get(id) ?? {
      sessionId: id,
      title: `Session ${id.slice(0, 8)}`,
      running: false,
      sideChatCount: 0,
    }
    rows.push({ node, depth, incoming })
    for (const edge of byParent.get(id) ?? []) {
      walk(edge.childSessionId, depth + 1, edge)
    }
  }

  walk(tree.rootSessionId, 0)
  for (const n of tree.nodes) {
    if (!visited.has(n.sessionId)) {
      walk(n.sessionId, 0)
    }
  }
  return rows
}

function kindLabel(kind: LineageEdge['kind']): string {
  switch (kind) {
    case 'handoff':
      return 'Handoff'
    case 'edit-retry':
      return 'Edit-Retry'
    case 'promoted-side':
      return 'Promoted Side'
    default:
      return 'Fork'
  }
}

export function ForkTreeView({
  ctx,
  sessionId,
  sessionTitle,
  defaultModel,
  catalog,
  gitInfo,
  turns,
  sideChats,
  tree,
  initialAnchorTurn,
  initialAnchorSeq,
  onRefresh,
  onSelectSideTab,
}: {
  ctx: DshClientContext
  sessionId: string
  sessionTitle: string
  defaultModel?: ModelSelectionSpec
  catalog: CatalogResponse | null
  gitInfo: GitRepoInfo | null
  turns: TurnSummary[]
  sideChats: SideChat[]
  tree: SessionTreeResponse | null
  initialAnchorTurn?: number
  initialAnchorSeq?: number
  onRefresh: () => void
  onSelectSideTab: () => void
}) {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('same')
  const [branchModel, setBranchModel] = useState<ModelSelectionSpec | undefined>(defaultModel)
  const [anchorTurn, setAnchorTurn] = useState<number | ''>(initialAnchorTurn ?? '')
  const [branchNote, setBranchNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [runningConflict, setRunningConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkChildId, setLinkChildId] = useState('')
  const [mergeTarget, setMergeTarget] = useState<{
    edge: LineageEdge
    parentNode?: TreeSessionNode
    childNode?: TreeSessionNode
  } | null>(null)

  const handleFork = async (
    delivery: DeliveryMode,
    extra: { stopSourceIfRunning?: boolean; workspaceMode?: WorkspaceMode } = {},
  ) => {
    setBusy(true)
    setError(null)
    setRunningConflict(false)
    const mode = extra.workspaceMode ?? workspaceMode
    try {
      const pickedTurn =
        typeof anchorTurn === 'number'
          ? turns.find((t) => t.turn === anchorTurn)
          : undefined
      const res = await threadsApi.forkSession({
        sessionId,
        atSeq: pickedTurn?.turnEndSeq ?? initialAnchorSeq,
        ...(pickedTurn ? { anchorTurn: pickedTurn.turn } : {}),
        workspaceMode: mode,
        ...(branchModel ?? defaultModel ? { model: branchModel ?? defaultModel } : {}),
        ...(branchNote.trim() ? { initialDraft: branchNote.trim() } : {}),
        delivery,
        ...(extra.stopSourceIfRunning ? { stopSourceIfRunning: true } : {}),
      })
      if (delivery === 'draft' && res.draftText) {
        queueDraft(res.sessionId, { text: res.draftText, mode: 'replace' })
      }
      setBranchNote('')
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

  const handleLink = async () => {
    const childId = linkChildId.trim()
    if (!childId) return
    setError(null)
    try {
      await threadsApi.linkSessions({
        parentSessionId: sessionId,
        childSessionId: childId,
        kind: 'fork',
      })
      setLinkChildId('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const rows = tree ? buildTreeRows(tree) : []
  const nodeMap = new Map((tree?.nodes ?? []).map((n) => [n.sessionId, n]))
  const sessionsSnap = ctx.sessions?.list?.getSnapshot()
  const otherSessions = (sessionsSnap?.ids ?? [])
    .filter((id) => id !== sessionId && !nodeMap.has(id))
    .slice(0, 25)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="dsh-thr-card">
        <div className="dsh-thr-between">
          <strong>Branch from {sessionTitle}</strong>
          <button type="button" className="dsh-thr-btn-xs" onClick={onSelectSideTab}>
            {sideChats.length} side chat{sideChats.length === 1 ? '' : 's'}
          </button>
        </div>

        <div className="dsh-thr-row">
          <span className="dsh-thr-faint">At turn:</span>
          <select
            className="dsh-thr-select"
            value={anchorTurn}
            onChange={(e) => {
              const v = e.target.value
              setAnchorTurn(v === '' ? '' : Number(v))
            }}
          >
            <option value="">Latest completed turn</option>
            {turns.map((t) => (
              <option key={t.turn} value={t.turn}>
                T{t.turn}: {t.userText.slice(0, 42) || '(attachment)'}
              </option>
            ))}
          </select>
        </div>

        <ModelPickerRow
          catalog={catalog}
          value={branchModel ?? defaultModel}
          onChange={setBranchModel}
          disabled={busy}
          compact
        />

        <div className="dsh-thr-row">
          <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="dsh-thr-fork-mode"
              checked={workspaceMode === 'same'}
              onChange={() => setWorkspaceMode('same')}
            />
            <span>Same workspace</span>
          </label>
          <label className="dsh-thr-row" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="dsh-thr-fork-mode"
              checked={workspaceMode === 'worktree'}
              disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
              onChange={() => setWorkspaceMode('worktree')}
            />
            <span>New isolated Git worktree</span>
          </label>
        </div>

        {workspaceMode === 'worktree' && gitInfo?.dirty && (
          <div className="dsh-thr-warn">
            Uncommitted local changes stay in this checkout; the new worktree starts from HEAD ({gitInfo.headShort}).
          </div>
        )}

        <textarea
          className="dsh-thr-textarea"
          rows={2}
          value={branchNote}
          onChange={(e) => setBranchNote(e.target.value)}
          placeholder="Optional first prompt or note for the branched session…"
        />

        {runningConflict && (
          <div className="dsh-thr-warn">
            Current session is still running in this workspace.
            <div className="dsh-thr-row" style={{ marginTop: 6 }}>
              <button
                type="button"
                className="dsh-thr-btn dsh-thr-btn-danger"
                onClick={() => void handleFork('draft', { stopSourceIfRunning: true })}
              >
                Stop current &amp; fork here
              </button>
              <button
                type="button"
                className="dsh-thr-btn"
                disabled={!gitInfo?.isGitRepo || !gitInfo?.headCommit}
                onClick={() => void handleFork('draft', { workspaceMode: 'worktree' })}
              >
                Use isolated worktree
              </button>
            </div>
          </div>
        )}

        {error && <div className="dsh-thr-err">{error}</div>}

        <div className="dsh-thr-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="dsh-thr-btn"
            disabled={busy}
            onClick={() => void handleFork('draft')}
          >
            Branch (Draft)
          </button>
          {branchNote.trim() && (
            <button
              type="button"
              className="dsh-thr-btn dsh-thr-btn-primary"
              disabled={busy}
              onClick={() => void handleFork('send')}
            >
              Branch &amp; Send
            </button>
          )}
        </div>
      </div>

      <div className="dsh-thr-between">
        <strong>Lineage Tree ({rows.length})</strong>
        <button type="button" className="dsh-thr-btn-xs" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {rows.length <= 1 ? (
        <div className="dsh-thr-muted">
          No branches or handoffs linked to this session yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(({ node, depth, incoming }) => {
            const isCurrent = node.sessionId === sessionId
            const parentNode = incoming ? nodeMap.get(incoming.parentSessionId) : undefined
            return (
              <div
                key={node.sessionId}
                style={{ marginLeft: Math.min(depth * 14, 56) }}
                className={`dsh-thr-tree-node ${isCurrent ? 'dsh-thr-tree-node-current' : ''}`}
              >
                <div className="dsh-thr-between">
                  <div className="dsh-thr-row" style={{ minWidth: 0, flex: 1 }}>
                    {depth > 0 && <span className="dsh-thr-faint">↳</span>}
                    <button
                      type="button"
                      className="dsh-thr-btn-xs"
                      style={{
                        border: 'none',
                        padding: 0,
                        fontWeight: isCurrent ? 600 : 500,
                        color: 'var(--dsw-alias-label-primary, inherit)',
                        textAlign: 'left',
                      }}
                      onClick={() => ctx.uiWorkspace?.openSession?.(node.sessionId)}
                      title={`Open ${node.sessionId}`}
                    >
                      {node.title}
                    </button>
                    {isCurrent && <span className="dsh-thr-pill dsh-thr-pill-brand">Current</span>}
                    {node.running && <span className="dsh-thr-pill dsh-thr-pill-warn">Running</span>}
                  </div>
                  <div className="dsh-thr-row">
                    {incoming && (
                      <button
                        type="button"
                        className="dsh-thr-btn-xs"
                        onClick={() =>
                          setMergeTarget({ edge: incoming, parentNode, childNode: node })
                        }
                      >
                        Merge back
                      </button>
                    )}
                    {!isCurrent && (
                      <button
                        type="button"
                        className="dsh-thr-btn-xs"
                        onClick={() => ctx.uiWorkspace?.openSession?.(node.sessionId)}
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
                <div className="dsh-thr-row">
                  {incoming && (
                    <span className="dsh-thr-pill">{kindLabel(incoming.kind)}</span>
                  )}
                  {incoming?.anchorTurn !== undefined && (
                    <span className="dsh-thr-pill">T{incoming.anchorTurn}</span>
                  )}
                  {incoming?.mergedBackAt && (
                    <span className="dsh-thr-pill dsh-thr-pill-ok">Merged</span>
                  )}
                  {(incoming?.toModel || node.model) && (
                    <span className="dsh-thr-faint">
                      {formatModelBadge(incoming?.toModel ?? node.model)}
                    </span>
                  )}
                  {node.sideChatCount > 0 && (
                    <span className="dsh-thr-faint">{node.sideChatCount} side</span>
                  )}
                  {incoming?.worktree && (
                    <span className="dsh-thr-faint dsh-thr-mono" title={incoming.worktree.path}>
                      ⎇ {incoming.worktree.branch}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {mergeTarget && (
        <MergeBackDrawer
          ctx={ctx}
          targetParentSessionId={mergeTarget.edge.parentSessionId}
          targetParentTitle={mergeTarget.parentNode?.title}
          sourceSessionIdForDistill={mergeTarget.edge.childSessionId}
          sourceChildSessionId={mergeTarget.edge.childSessionId}
          edgeId={mergeTarget.edge.id}
          initialText={`Summary from ${mergeTarget.childNode?.title || mergeTarget.edge.childSessionId.slice(0, 8)}:\n`}
          catalog={catalog}
          defaultModel={mergeTarget.childNode?.model ?? defaultModel}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null)
            onRefresh()
          }}
        />
      )}

      {otherSessions.length > 0 && (
        <div className="dsh-thr-card">
          <div className="dsh-thr-faint">Link an existing forked session as a child of this thread:</div>
          <div className="dsh-thr-row">
            <select
              className="dsh-thr-select"
              style={{ flex: 1 }}
              value={linkChildId}
              onChange={(e) => setLinkChildId(e.target.value)}
            >
              <option value="">Select session…</option>
              {otherSessions.map((id) => {
                const entry = sessionsSnap?.byId[id]
                return (
                  <option key={id} value={id}>
                    {entry?.displayTitle || entry?.title || id.slice(0, 12)}
                  </option>
                )
              })}
            </select>
            <button
              type="button"
              className="dsh-thr-btn"
              disabled={!linkChildId}
              onClick={() => void handleLink()}
            >
              Link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
