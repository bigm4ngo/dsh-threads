export const SIDE_CHAT_QUOTE_MAX = 4000

export interface UserMessageSegment {
  kind: 'quote' | 'text'
  text: string
}

export function normalizeQuotedText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim().slice(0, SIDE_CHAT_QUOTE_MAX)
}

export function formatQuotedSideChatPrompt(quotes: readonly string[], body: string): string {
  const formattedQuotes: string[] = []
  for (const raw of quotes) {
    const clean = normalizeQuotedText(raw)
    if (!clean) continue
    const block = clean
      .split('\n')
      .map((line) => (line.length > 0 ? `> ${line}` : '>'))
      .join('\n')
    formattedQuotes.push(block)
  }

  const cleanBody = body.replace(/\r\n?/g, '\n').trim()
  const parts = cleanBody ? [...formattedQuotes, cleanBody] : formattedQuotes
  return parts.join('\n\n')
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
