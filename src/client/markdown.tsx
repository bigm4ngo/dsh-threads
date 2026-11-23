import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from './clipboard.ts'

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    void copyTextToClipboard(code).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = setTimeout(() => {
        setCopied(false)
      }, 1500)
    })
  }

  return (
    <div className="dsh-thr-codeblock">
      <div className="dsh-thr-codeblock-head" data-dsh-thr-sel-exclude="">
        <span>{language || 'code'}</span>
        <button type="button" className="dsh-thr-btn-xs" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="dsh-thr-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim()
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/')
  )
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const tokenPattern =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\(([^)\s]+)\)|\*[^*\n]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${keyPrefix}-${tokenIndex++}`
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key} className="dsh-thr-inline-code">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('[')) {
      const splitIdx = token.indexOf('](')
      const label = splitIdx > 1 ? token.slice(1, splitIdx) : token
      const href = match[2] ?? ''
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="dsh-thr-link"
          >
            {label}
          </a>,
        )
      } else {
        nodes.push(label)
      }
    } else {
      nodes.push(token)
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

export function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null

  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let keyCounter = 0

  while (i < lines.length) {
    const line = lines[i]

    const fenceMatch = line.match(/^```([^`\s]*)\s*$/)
    if (fenceMatch) {
      const language = fenceMatch[1] ?? ''
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && /^```\s*$/.test(lines[i])) {
        i += 1
      }
      blocks.push(<CodeBlock key={`b-${keyCounter++}`} language={language} code={codeLines.join('\n')} />)
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push(<hr key={`b-${keyCounter++}`} className="dsh-thr-hr" />)
      i += 1
      continue
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = renderInline(headingMatch[2], `h-${keyCounter}`)
      const key = `b-${keyCounter++}`
      if (level === 1) blocks.push(<h3 key={key} className="dsh-thr-h1">{content}</h3>)
      else if (level === 2) blocks.push(<h4 key={key} className="dsh-thr-h2">{content}</h4>)
      else blocks.push(<h5 key={key} className="dsh-thr-h3">{content}</h5>)
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote key={`b-${keyCounter++}`} className="dsh-thr-blockquote">
          {renderInline(quoteLines.join(' '), `q-${keyCounter}`)}
        </blockquote>,
      )
      continue
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`b-${keyCounter++}`} className="dsh-thr-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul-${keyCounter}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`b-${keyCounter++}`} className="dsh-thr-list">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol-${keyCounter}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^[-*_]{3,}\s*$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i += 1
    }
    const k = `p-${keyCounter++}`
    blocks.push(
      <p key={k} className="dsh-thr-p">
        {paraLines.map((pl, idx) => (
          <span key={idx}>
            {idx > 0 ? <br /> : null}
            {renderInline(pl, `${k}-${idx}`)}
          </span>
        ))}
      </p>,
    )
  }

  return <div className="dsh-thr-md">{blocks}</div>
}
