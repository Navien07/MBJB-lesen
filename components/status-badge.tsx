import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/status'

const STATUS_VARIANTS: Record<ApplicationStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SUBMITTED: 'bg-blue-100 text-blue-900',
  INTAKE_CHECK: 'bg-blue-100 text-blue-900',
  DEFICIENT: 'bg-amber-100 text-amber-900',
  ANALYSING: 'bg-blue-100 text-blue-900',
  ASSESSED: 'bg-indigo-100 text-indigo-900',
  OFFICER_REVIEW: 'bg-indigo-100 text-indigo-900',
  APPROVED: 'bg-green-100 text-green-900',
  APPROVED_WITH_CONDITIONS: 'bg-green-100 text-green-900',
  AMENDMENT_REQUESTED: 'bg-amber-100 text-amber-900',
  REJECTED: 'bg-red-100 text-red-900',
  CLOSED: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="outline" className={STATUS_VARIANTS[status]} data-status={status}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
