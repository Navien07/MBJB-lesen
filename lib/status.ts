export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'INTAKE_CHECK',
  'DEFICIENT',
  'ANALYSING',
  'ASSESSED',
  'OFFICER_REVIEW',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'AMENDMENT_REQUESTED',
  'REJECTED',
  'CLOSED',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const TERMINAL_STATUSES: readonly ApplicationStatus[] = [
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'AMENDMENT_REQUESTED',
  'REJECTED',
]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  INTAKE_CHECK: 'Intake check',
  DEFICIENT: 'Deficient',
  ANALYSING: 'Analysing',
  ASSESSED: 'Assessed',
  OFFICER_REVIEW: 'Officer review',
  APPROVED: 'Approved',
  APPROVED_WITH_CONDITIONS: 'Approved with conditions',
  AMENDMENT_REQUESTED: 'Amendment requested',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
}
