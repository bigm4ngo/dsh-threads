import { useEffect, useRef } from 'react'
import { formatQuoteBlock } from './side-chat-quote.ts'

export interface QueuedDraft {
  sessionId: string
  text: string
  mode: 'append' | 'replace'
}

const pendingBySession = new Map<string, QueuedDraft>()
const pendingQuotesBySession = new Map<string, string[]>()
const listeners = new Set<() => void>()

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // Ignore subscriber errors.
    }
  }
}

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
  notifyListeners()
}

export function takeDraft(sessionId: string): QueuedDraft | undefined {
  const found = pendingBySession.get(sessionId)
  if (!found) return undefined
  pendingBySession.delete(sessionId)
  return found
}

export function queueQuote(sessionId: string, text: string): void {
  const clean = text.trim()
  if (!sessionId || !clean) return
  const existing = pendingQuotesBySession.get(sessionId) ?? []
  pendingQuotesBySession.set(sessionId, [...existing, clean])
  notifyListeners()
}

export function takeQuotes(sessionId: string): string[] {
  const found = pendingQuotesBySession.get(sessionId)
  if (!found || found.length === 0) return []
  pendingQuotesBySession.delete(sessionId)
  return found
}

export function DraftRelay(props: {
  sessionId?: string
  inputActions?: {
    setDraft?: (text: string) => void
    insertQuote?: (text: string) => boolean
  }
  useInput?: <T>(selector: (state: { draft: string }) => T) => T
}) {
  const { sessionId, inputActions, useInput } = props
  const currentDraft = useInput?.((state) => state.draft) ?? ''
  const draftRef = useRef(currentDraft)
  draftRef.current = currentDraft

  useEffect(() => {
    if (!sessionId || !inputActions) return
    const flush = () => {
      const quotes = takeQuotes(sessionId)
      let draftCursor = draftRef.current
      for (const q of quotes) {
        if (inputActions.insertQuote?.(q) === true) continue
        const block = formatQuoteBlock(q)
        if (block) {
          draftCursor = composeMergedDraft(draftCursor, block, 'append')
          inputActions.setDraft?.(draftCursor)
          draftRef.current = draftCursor
        }
      }

      const next = takeDraft(sessionId)
      if (!next) return
      const finalText = composeMergedDraft(draftCursor, next.text, next.mode)
      inputActions.setDraft?.(finalText)
      draftRef.current = finalText
    }
    flush()
    listeners.add(flush)
    return () => {
      listeners.delete(flush)
    }
  }, [sessionId, inputActions])

  return null
}
