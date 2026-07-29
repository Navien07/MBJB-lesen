import { STATUS_LABELS, type ApplicationStatus } from '@/lib/status'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'info' | 'warn' | 'active' | 'good' | 'bad'

const STATUS_TONES: Record<ApplicationStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  INTAKE_CHECK: 'info',
  DEFICIENT: 'warn',
  ANALYSING: 'active',
  ASSESSED: 'active',
  OFFICER_REVIEW: 'active',
  APPROVED: 'good',
  APPROVED_WITH_CONDITIONS: 'good',
  AMENDMENT_REQUESTED: 'warn',
  REJECTED: 'bad',
  CLOSED: 'neutral',
}

const TONE_STYLES: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: 'border-border text-muted-foreground', dot: 'bg-muted-foreground' },
  info: { chip: 'border-sky-500/40 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  warn: { chip: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  active: { chip: 'border-primary/40 bg-primary/10 text-emerald-300', dot: 'bg-emerald-400' },
  good: { chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  bad: { chip: 'border-red-500/40 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const tone = TONE_STYLES[STATUS_TONES[status]]
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tone.chip,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone.dot)} />
      {STATUS_LABELS[status]}
    </span>
  )
}
