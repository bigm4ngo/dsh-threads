import { useCallback, useEffect, useState } from 'react'
import type { SessionTreeResponse } from '../shared/types.ts'
import { subscribeThreadsEvents, threadsApi } from './api.ts'
import type { DshClientContext } from './dsh-types.ts'
import { ThreadsIcon } from './ThreadsIcon.tsx'
import { publishThreadsIntent } from './ui-bus.ts'

export function LineageHeaderPill({
  ctx,
  sessionId,
}: {
  ctx: DshClientContext
  sessionId?: string
}) {
  const [tree, setTree] = useState<SessionTreeResponse | null>(null)

  const refresh = useCallback(() => {
    if (!sessionId) {
      setTree(null)
      return
    }
    let cancelled = false
    void threadsApi
      .fetchTree(sessionId)
      .then((res) => {
        if (!cancelled) setTree(res)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const cancel = refresh()
    const unsub = subscribeThreadsEvents((ev) => {
      if (!sessionId) return
      if (
        (ev.type === 'lineage-updated' && ev.sessionIds.includes(sessionId)) ||
        (ev.type === 'side-chat-updated' && ev.parentSessionId === sessionId) ||
        (ev.type === 'side-chat-deleted' && ev.parentSessionId === sessionId)
      ) {
        refresh()
      }
    })
    return () => {
      cancel?.()
      unsub()
    }
  }, [sessionId, refresh])

  if (!sessionId || !tree) return null

  const incoming = tree.edges.find((e) => e.childSessionId === sessionId)
  const childCount = tree.edges.filter((e) => e.parentSessionId === sessionId).length
  const selfNode = tree.nodes.find((n) => n.sessionId === sessionId)
  const sideCount = selfNode?.sideChatCount ?? 0

  if (!incoming && childCount === 0 && sideCount === 0) return null

  const parentNode = incoming
    ? tree.nodes.find((n) => n.sessionId === incoming.parentSessionId)
    : undefined

  let label = ''
  if (incoming) {
    const kindWord =
      incoming.kind === 'handoff'
        ? 'Handoff from'
        : incoming.kind === 'edit-retry'
          ? 'Retry of'
          : incoming.kind === 'promoted-side'
            ? 'Side of'
            : 'Fork of'
    const parentName = parentNode?.title || incoming.parentSessionId.slice(0, 8)
    const turnTag = incoming.anchorTurn !== undefined ? ` T${incoming.anchorTurn}` : ''
    label = `↳ ${kindWord} ${parentName}${turnTag}`
  } else {
    const parts: string[] = []
    if (childCount > 0) parts.push(`${childCount} branch${childCount === 1 ? '' : 'es'}`)
    if (sideCount > 0) parts.push(`${sideCount} side`)
    label = `⎇ ${parts.join(' · ')}`
  }

  return (
    <button
      type="button"
      className="dsh-thr-lineage-pill"
      title="Open Threads lineage tree"
      onClick={() =>
        publishThreadsIntent(
          {
            sessionId,
            tab: 'tree',
          },
          ctx,
        )
      }
    >
      {label}
    </button>
  )
}

export function ThreadsHeaderButton({
  ctx,
  sessionId,
}: {
  ctx: DshClientContext
  sessionId?: string
}) {
  if (!sessionId) return null

  return (
    <button
      type="button"
      className="dsh-thr-header-btn"
      title="Open Threads (Side chats, Fork tree, Edit & Retry, Handoff)"
      aria-label="Open Threads sidebar"
      onClick={() =>
        publishThreadsIntent(
          {
            sessionId,
            tab: 'side',
          },
          ctx,
        )
      }
    >
      <ThreadsIcon size={14} />
      <span>Threads</span>
    </button>
  )
}
