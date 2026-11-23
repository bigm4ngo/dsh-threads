import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { normalizeQuotedText, serializeDraftSegments, type DraftSegment } from './side-chat-quote.ts'

export interface SideChatDraftHandle {
  insertQuote(text: string): void
  getValue(): string
  clear(): void
  focus(): void
}

const QUOTE_MARK_SVG =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" class="dsh-thr-quote-mark" aria-hidden="true"><path d="M3.2 4.5C2.5 4.5 2 5 2 5.7v2.8C2 9.2 2.5 9.7 3.2 9.7h1.6c-.1 1-.6 1.7-1.6 2.1a.6.6 0 0 0 .4 1.1c1.8-.6 2.6-2.1 2.6-4.2V5.7c0-.7-.5-1.2-1.2-1.2H3.2Zm6.8 0c-.7 0-1.2.5-1.2 1.2v2.8c0 .7.5 1.2 1.2 1.2h1.6c-.1 1-.6 1.7-1.6 2.1a.6.6 0 0 0 .4 1.1c1.8-.6 2.6-2.1 2.6-4.2V5.7c0-.7-.5-1.2-1.2-1.2H10Z" /></svg>'
const CLOSE_MARK_SVG =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" class="dsh-thr-quote-close" aria-hidden="true"><path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>'

function collectSegmentsFromNode(node: Node, out: DraftSegment[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) {
      out.push({ kind: 'text', text: node.textContent })
    }
    return
  }

  if (!(node instanceof HTMLElement)) return

  const quoted = node.getAttribute('data-dsh-quote-text')
  if (quoted !== null) {
    out.push({ kind: 'quote', text: quoted })
    return
  }

  if (node.tagName === 'BR') {
    out.push({ kind: 'text', text: '\n' })
    return
  }

  const isBlock = node.tagName === 'DIV' || node.tagName === 'P'
  if (isBlock && out.length > 0) {
    const last = out[out.length - 1]
    if (last.kind !== 'text' || !last.text.endsWith('\n')) {
      out.push({ kind: 'text', text: '\n' })
    }
  }

  for (const child of Array.from(node.childNodes)) {
    collectSegmentsFromNode(child, out)
  }
}

function readDraftSegments(root: HTMLDivElement | null): DraftSegment[] {
  if (!root) return []
  const segments: DraftSegment[] = []
  for (const child of Array.from(root.childNodes)) {
    collectSegmentsFromNode(child, segments)
  }
  return segments
}

function isQuoteElement(node: Node | null): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute('data-dsh-quote-text')
}

export const SideChatDraftEditor = forwardRef<
  SideChatDraftHandle,
  {
    disabled?: boolean
    placeholder: string
    onHasContentChange: (hasContent: boolean) => void
    onSubmit: () => void
  }
>(function SideChatDraftEditor({ disabled, placeholder, onHasContentChange, onSubmit }, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [empty, setEmpty] = useState(true)
  const [hoverPreview, setHoverPreview] = useState<{ text: string; left: number; top: number } | null>(
    null,
  )

  const syncEmpty = () => {
    const hasContent = serializeDraftSegments(readDraftSegments(editorRef.current)).length > 0
    setEmpty(!hasContent)
    onHasContentChange(hasContent)
  }

  const saveSelection = () => {
    const root = editorRef.current
    if (!root || typeof window === 'undefined') return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (root.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange()
    }
  }

  useEffect(() => {
    const handleSelectionChange = () => {
      saveSelection()
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])

  const removeQuoteChip = (chip: HTMLElement, moveCaretToChipPos: boolean) => {
    const root = editorRef.current
    if (!root) return
    const next = chip.nextSibling
    const parent = chip.parentNode
    if (!parent) return

    const offset = Array.prototype.indexOf.call(parent.childNodes, chip)
    if (next && next.nodeType === Node.TEXT_NODE && next.textContent?.startsWith(' ')) {
      const remainder = next.textContent.slice(1)
      if (remainder.length === 0) {
        parent.removeChild(next)
      } else {
        next.textContent = remainder
      }
    }
    parent.removeChild(chip)
    setHoverPreview(null)
    syncEmpty()

    if (moveCaretToChipPos && typeof window !== 'undefined') {
      root.focus()
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        const safeOffset = Math.max(0, Math.min(offset, parent.childNodes.length))
        range.setStart(parent, safeOffset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        savedRangeRef.current = range.cloneRange()
      }
    }
  }

  const createQuotePill = (raw: string): HTMLSpanElement => {
    const normalized = normalizeQuotedText(raw)
    const pill = document.createElement('span')
    pill.setAttribute('contenteditable', 'false')
    pill.className = 'dsh-thr-quote-chip'
    pill.setAttribute('data-quote-preview', '')
    pill.setAttribute('data-removable', '')
    pill.setAttribute('data-dsh-quote-text', normalized)

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'dsh-thr-quote-remove'
    removeBtn.setAttribute('aria-label', 'Remove quote')
    removeBtn.innerHTML = `${QUOTE_MARK_SVG}${CLOSE_MARK_SVG}`
    removeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      removeQuoteChip(pill, true)
    })

    const source = document.createElement('span')
    source.className = 'dsh-thr-quote-source'
    source.textContent = normalized.replace(/\s*\n+\s*/g, ' ')

    pill.appendChild(removeBtn)
    pill.appendChild(source)
    return pill
  }

  useImperativeHandle(ref, () => ({
    insertQuote(rawText: string) {
      const root = editorRef.current
      const normalized = normalizeQuotedText(rawText)
      if (!root || !normalized) return

      const pill = createQuotePill(normalized)
      const spacer = document.createTextNode(' ')
      root.focus()

      const sel = window.getSelection()
      let range =
        savedRangeRef.current && root.contains(savedRangeRef.current.commonAncestorContainer)
          ? savedRangeRef.current.cloneRange()
          : null
      if (!range && sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0).cloneRange()
      }
      if (!range) {
        range = document.createRange()
        range.selectNodeContents(root)
        range.collapse(false)
      }

      if (!range.collapsed) {
        range.deleteContents()
      }

      range.insertNode(spacer)
      range.insertNode(pill)

      const after = document.createRange()
      after.setStart(spacer, spacer.textContent?.length ?? 1)
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)
      savedRangeRef.current = after.cloneRange()
      syncEmpty()
    },
    getValue() {
      return serializeDraftSegments(readDraftSegments(editorRef.current))
    },
    clear() {
      const root = editorRef.current
      if (!root) return
      root.innerHTML = ''
      savedRangeRef.current = null
      setHoverPreview(null)
      syncEmpty()
    },
    focus() {
      editorRef.current?.focus()
    },
  }))

  const tryDeleteAdjacentQuote = (backward: boolean): boolean => {
    const root = editorRef.current
    const sel = window.getSelection()
    if (!root || !sel || !sel.isCollapsed || sel.rangeCount === 0) return false
    const range = sel.getRangeAt(0)
    const { startContainer, startOffset } = range

    if (backward) {
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const text = startContainer.textContent ?? ''
        if (startOffset === 1 && text.startsWith(' ') && isQuoteElement(startContainer.previousSibling)) {
          removeQuoteChip(startContainer.previousSibling, true)
          return true
        }
        if (startOffset === 0 && isQuoteElement(startContainer.previousSibling)) {
          removeQuoteChip(startContainer.previousSibling, true)
          return true
        }
      } else if (startContainer instanceof HTMLElement && startOffset > 0) {
        const prev = startContainer.childNodes[startOffset - 1] ?? null
        if (isQuoteElement(prev)) {
          removeQuoteChip(prev, true)
          return true
        }
      }
    } else {
      if (startContainer.nodeType === Node.TEXT_NODE) {
        const text = startContainer.textContent ?? ''
        if (startOffset === text.length && isQuoteElement(startContainer.nextSibling)) {
          removeQuoteChip(startContainer.nextSibling, true)
          return true
        }
      } else if (startContainer instanceof HTMLElement) {
        const next = startContainer.childNodes[startOffset] ?? null
        if (isQuoteElement(next)) {
          removeQuoteChip(next, true)
          return true
        }
      }
    }
    return false
  }

  return (
    <div
      className="dsh-thr-draft-wrap"
      onMouseOver={(e) => {
        const target = e.target instanceof Element ? e.target.closest('[data-dsh-quote-text]') : null
        if (!(target instanceof HTMLElement)) return
        const text = target.getAttribute('data-dsh-quote-text') ?? ''
        const source = target.querySelector('.dsh-thr-quote-source')
        const overflowed =
          text.includes('\n') ||
          (source instanceof HTMLElement && source.scrollWidth > source.clientWidth + 1)
        if (!overflowed) return
        const wrapRect = e.currentTarget.getBoundingClientRect()
        const chipRect = target.getBoundingClientRect()
        setHoverPreview({
          text,
          left: Math.max(8, Math.min(wrapRect.width - 220, chipRect.left - wrapRect.left)),
          top: chipRect.top - wrapRect.top - 6,
        })
      }}
      onMouseOut={(e) => {
        const related = e.relatedTarget instanceof Node ? e.relatedTarget : null
        const stillInsideChip =
          related instanceof Element && related.closest('[data-dsh-quote-text]') !== null
        if (!stillInsideChip) {
          setHoverPreview(null)
        }
      }}
    >
      {hoverPreview && (
        <div
          className="dsh-thr-quote-hover"
          style={{ left: hoverPreview.left, top: hoverPreview.top }}
          role="tooltip"
        >
          {hoverPreview.text}
        </div>
      )}
      <div
        ref={editorRef}
        className="dsh-thr-draft-editor"
        role="textbox"
        aria-multiline="true"
        aria-label="Side chat message"
        aria-disabled={disabled ? 'true' : undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-empty={empty ? 'true' : 'false'}
        data-placeholder={placeholder}
        onInput={() => {
          syncEmpty()
          saveSelection()
        }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onPaste={(e) => {
          e.preventDefault()
          if (disabled) return
          const text = e.clipboardData.getData('text/plain')
          if (!text) return
          const sel = window.getSelection()
          if (!sel || sel.rangeCount === 0) return
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const textNode = document.createTextNode(text)
          range.insertNode(textNode)
          range.setStart(textNode, text.length)
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
          savedRangeRef.current = range.cloneRange()
          syncEmpty()
        }}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onSubmit()
            return
          }
          if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            const sel = window.getSelection()
            if (!sel || sel.rangeCount === 0) return
            const range = sel.getRangeAt(0)
            range.deleteContents()
            const nl = document.createTextNode('\n')
            range.insertNode(nl)
            range.setStart(nl, 1)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
            savedRangeRef.current = range.cloneRange()
            syncEmpty()
            return
          }
          if (e.key === 'Backspace' && tryDeleteAdjacentQuote(true)) {
            e.preventDefault()
            return
          }
          if (e.key === 'Delete' && tryDeleteAdjacentQuote(false)) {
            e.preventDefault()
          }
        }}
      />
    </div>
  )
})
