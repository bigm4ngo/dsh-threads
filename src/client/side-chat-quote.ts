export const SIDE_CHAT_QUOTE_MAX = 4000

export interface UserMessageSegment {
  kind: 'quote' | 'text'
  text: string
}

export type DraftSegment =
  | { kind: 'text'; text: string }
  | { kind: 'quote'; text: string }

export function normalizeQuotedText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, SIDE_CHAT_QUOTE_MAX)
}

export function formatQuoteBlock(raw: string): string {
  const clean = normalizeQuotedText(raw)
  if (!clean) return ''
  return clean
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n')
}

export function serializeDraftSegments(segments: readonly DraftSegment[]): string {
  const merged: DraftSegment[] = []
  for (const seg of segments) {
    const normalizedText = seg.text.replace(/\r\n?/g, '\n')
    if (seg.kind === 'text') {
      const prev = merged[merged.length - 1]
      if (prev && prev.kind === 'text') {
        prev.text += normalizedText
      } else {
        merged.push({ kind: 'text', text: normalizedText })
      }
    } else {
      merged.push({ kind: 'quote', text: normalizedText })
    }
  }

  const parts: string[] = []
  for (const seg of merged) {
    if (seg.kind === 'quote') {
      const block = formatQuoteBlock(seg.text)
      if (block) parts.push(block)
    } else {
      const clean = seg.text.trim()
      if (clean) parts.push(clean)
    }
  }
  return parts.join('\n\n')
}

export function formatQuotedSideChatPrompt(quotes: readonly string[], body: string): string {
  const segments: DraftSegment[] = quotes.map((q) => ({ kind: 'quote', text: q }))
  if (body) segments.push({ kind: 'text', text: body })
  return serializeDraftSegments(segments)
}

export function parseQuotedUserText(text: string): UserMessageSegment[] {
  const normalized = text.replace(/\r\n?/g, '\n')
  const quoteBlockPattern = /^ {0,3}>[^\n]*(?:\n {0,3}>[^\n]*)*/gm
  const matches: Array<{ start: number; end: number; decoded: string }> = []

  for (const match of normalized.matchAll(quoteBlockPattern)) {
    if (match.index === undefined) continue
    const decoded = match[0].replace(/^ {0,3}>[ \t]?/gm, '')
    if (decoded.trim() === '') continue
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      decoded,
    })
  }

  if (matches.length === 0) {
    return [{ kind: 'text', text: normalized }]
  }

  const segments: UserMessageSegment[] = []
  let cursor = 0

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    let before = normalized.slice(cursor, match.start)
    if (i > 0) {
      before = before.replace(/^\n+/, '')
    }
    before = before.replace(/\n+$/, '')
    if (before.length > 0 && before.trim() !== '') {
      segments.push({ kind: 'text', text: before })
    }
    segments.push({ kind: 'quote', text: match.decoded })
    cursor = match.end
  }

  const after = normalized.slice(cursor).replace(/^\n+/, '')
  if (after.length > 0 && after.trim() !== '') {
    segments.push({ kind: 'text', text: after })
  }

  return segments
}
