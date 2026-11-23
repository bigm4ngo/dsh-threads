import { useLayoutEffect, useRef, useState } from 'react'

export function QuoteMarkSvg({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.2 4.5C2.5 4.5 2 5 2 5.7v2.8C2 9.2 2.5 9.7 3.2 9.7h1.6c-.1 1-.6 1.7-1.6 2.1a.6.6 0 0 0 .4 1.1c1.8-.6 2.6-2.1 2.6-4.2V5.7c0-.7-.5-1.2-1.2-1.2H3.2Zm6.8 0c-.7 0-1.2.5-1.2 1.2v2.8c0 .7.5 1.2 1.2 1.2h1.6c-.1 1-.6 1.7-1.6 2.1a.6.6 0 0 0 .4 1.1c1.8-.6 2.6-2.1 2.6-4.2V5.7c0-.7-.5-1.2-1.2-1.2H10Z" />
    </svg>
  )
}

export function CloseMarkSvg({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function QuoteChip({
  text,
  onRemove,
}: {
  text: string
  onRemove?: () => void
}) {
  const sourceRef = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [hovered, setHovered] = useState(false)

  useLayoutEffect(() => {
    const el = sourceRef.current
    if (!el) return
    const check = () => {
      setTruncated(el.scrollWidth > el.clientWidth + 1 || text.includes('\n'))
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  return (
    <span
      className="dsh-thr-quote-chip"
      data-quote-preview=""
      data-removable={onRemove ? '' : undefined}
      onMouseEnter={() => {
        if (truncated) setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {onRemove ? (
        <button
          type="button"
          className="dsh-thr-quote-remove"
          aria-label="Remove quote"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRemove()
          }}
        >
          <QuoteMarkSvg className="dsh-thr-quote-mark" />
          <CloseMarkSvg className="dsh-thr-quote-close" />
        </button>
      ) : (
        <span className="dsh-thr-quote-marker" aria-hidden="true">
          <QuoteMarkSvg className="dsh-thr-quote-mark" />
        </span>
      )}
      <span ref={sourceRef} className="dsh-thr-quote-source" title={truncated ? undefined : text}>
        {text.replace(/\s*\n+\s*/g, ' ')}
      </span>
      {hovered && truncated && (
        <span className="dsh-thr-quote-hover" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
