import { useEffect, useRef } from 'react'

export interface QueuedDraft {
  sessionId: string
  text: string
  mode: 'append' | 'replace'
}

const pendingBySession = new Map<string, QueuedDraft>()
const listeners = new Set<() => void>()

export function composeMergedDraft(
  existingDraft: string,
  addition: string,
  mode: 'append' | 'replace',
): string {
  if (mode === 'replace') {
    return addition
  }
  const existingTrimmedEnd = existingDraft.trimEnd()
  if (!existingTrimmedEnd.trim()) {
    return addition
  }
  return `${existingTrimmedEnd}\n\n${addition}`
}

export function queueDraft(
  sessionId: string,
  options: { text: string; mode?: 'append' | 'replace' },
): void {
  const mode = options.mode ?? 'append'
  const existing = pendingBySession.get(sessionId)
  const text =
    existing && mode === 'append'
      ? `${existing.text.trimEnd()}\n\n${options.text}`
      : options.text
  pendingBySession.set(sessionId, {
    sessionId,
    text,
    mode: existing && mode === 'append' ? existing.mode : mode,
  })
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // Ignore subscriber errors.
    }
  }
}

export function takeDraft(sessionId: string): QueuedDraft | undefined {
  const found = pendingBySession.get(sessionId)
  if (!found) return undefined
  pendingBySession.delete(sessionId)
  return found
}

export function DraftRelay(props: {
  sessionId?: string
  inputActions?: { setDraft?: (text: string) => void }
  useInput?: <T>(selector: (state: { draft: string }) => T) => T
}) {
  const { sessionId, inputActions, useInput } = props
  const currentDraft = useInput?.((state) => state.draft) ?? ''
  const draftRef = useRef(currentDraft)
  draftRef.current = currentDraft

  useEffect(() => {
    if (!sessionId || !inputActions?.setDraft) return
    const flush = () => {
      const next = takeDraft(sessionId)
      if (!next) return
      const finalText = composeMergedDraft(draftRef.current, next.text, next.mode)
      inputActions.setDraft?.(finalText)
    }
    flush()
    listeners.add(flush)
    return () => {
      listeners.delete(flush)
    }
  }, [sessionId, inputActions])

  return null
}
