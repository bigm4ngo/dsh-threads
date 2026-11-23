export function ThreadsIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4 5v6M4 9c0-2 1.8-3 4-3h2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
