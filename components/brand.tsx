import { cn } from '@/lib/utils'

/** Abstract shield-and-tower mark — civic, not a real MBJB crest. */
export function CrestMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
    >
      <path
        d="M16 2 28 7v9c0 7.5-5 12.5-12 14C9 28.5 4 23.5 4 16V7l12-5Z"
        className="fill-primary/12 stroke-primary"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 21v-7h2.5v7M17.5 21v-9H20v9M10 21h12"
        className="stroke-foreground"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="9" r="1.4" className="fill-primary" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1 font-semibold tracking-tight', className)}>
      MBJB<span className="text-primary">-lesen</span>
    </span>
  )
}
