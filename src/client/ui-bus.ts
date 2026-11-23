import type { DshClientContext } from './dsh-types.ts'

export type ThreadsSubTab = 'side' | 'tree' | 'turns' | 'handoff'

export interface ThreadsUiIntent {
  sessionId: string
  tab: ThreadsSubTab
  sideChatId?: string
  quote?: string
  anchorTurn?: number
  anchorSeq?: number
  note?: string
  seq: number
}

let seqCounter = 0
const latestIntentBySession = new Map<string, ThreadsUiIntent>()
const listeners = new Set<() => void>()

export const THREADS_TAB_KIND = 'dsh-threads'

export function publishThreadsIntent(
  intent: Omit<ThreadsUiIntent, 'seq'>,
  ctx?: DshClientContext,
): ThreadsUiIntent {
  seqCounter += 1
  const full: ThreadsUiIntent = { ...intent, seq: seqCounter }
  latestIntentBySession.set(intent.sessionId, full)
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // Ignore UI subscriber errors.
    }
  }
  try {
    ctx?.sidebarRight?.openTab?.(THREADS_TAB_KIND, {
      params: {
        tab: full.tab,
        ...(full.sideChatId ? { sideChatId: full.sideChatId } : {}),
      },
    })
  } catch {
    // Sidebar may be absent when viewing global panels.
  }
  return full
}

export function getThreadsIntent(sessionId: string): ThreadsUiIntent | undefined {
  return latestIntentBySession.get(sessionId)
}

export function subscribeThreadsIntents(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
