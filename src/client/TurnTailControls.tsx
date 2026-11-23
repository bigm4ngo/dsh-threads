import type { DshClientContext } from './dsh-types.ts'
import { publishThreadsIntent } from './ui-bus.ts'

export function TurnTailControls({
  ctx,
  sessionId,
  turn,
  seq,
}: {
  ctx: DshClientContext
  sessionId?: string
  turn?: number | { turn?: number }
  seq?: number
}) {
  if (!sessionId) return null
  const turnNumber = typeof turn === 'number' ? turn : turn?.turn
  if (typeof turnNumber !== 'number' || !Number.isFinite(turnNumber)) return null

  return (
    <div className="dsh-thr-turntail" data-dsh-threads-turntail={turnNumber}>
      <button
        type="button"
        className="dsh-thr-btn-xs"
        title="Ask a side question anchored at this turn"
        onClick={() =>
          publishThreadsIntent(
            {
              sessionId,
              tab: 'side',
              anchorTurn: turnNumber,
              ...(typeof seq === 'number' ? { anchorSeq: seq } : {}),
            },
            ctx,
          )
        }
      >
        Side chat
      </button>
      <button
        type="button"
        className="dsh-thr-btn-xs"
        title="Edit this turn's prompt and retry in a new fork or worktree"
        onClick={() =>
          publishThreadsIntent(
            {
              sessionId,
              tab: 'turns',
              anchorTurn: turnNumber,
              ...(typeof seq === 'number' ? { anchorSeq: seq } : {}),
            },
            ctx,
          )
        }
      >
        Edit &amp; Retry
      </button>
      <button
        type="button"
        className="dsh-thr-btn-xs"
        title="Branch or track lineage from this turn"
        onClick={() =>
          publishThreadsIntent(
            {
              sessionId,
              tab: 'tree',
              anchorTurn: turnNumber,
              ...(typeof seq === 'number' ? { anchorSeq: seq } : {}),
            },
            ctx,
          )
        }
      >
        Branch
      </button>
    </div>
  )
}
