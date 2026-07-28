/**
 * Prints the exact outbound intake payload for a demo application, after the
 * gateway's redaction pass — the visible proof that no IC number, phone or
 * email leaves the machine (BUILD-PLAN M5).
 *
 *   pnpm tsx scripts/show-redacted-payload.ts
 */
import { redactValue } from '../lib/ai/redact'
import type { IntakePayload } from '../lib/agents/intake/schema'

const payload: IntakePayload = {
  form: {
    applicant_name: 'Aminah binti Salleh',
    ic_or_passport: '800101-01-5566',
    citizenship: 'warganegara',
    correspondence_address: 'No 12, Jalan Dedap 3, Taman Johor Jaya, 81100 Johor Bahru',
    premise_address: 'No 45, Jalan Rosmerah 2/1, Taman Johor Jaya, 81100 Johor Bahru',
    ssm_registration_no: '202301012345',
    company_name: 'Kedai Runcit Aman Jaya',
    property_tax_account_no: 'CH-889900',
    phone: '+60127778888',
    business_activity: 'Kedai runcit',
    floor_area_m2: 85,
    signboard_width_m: 6,
    signboard_height_m: 1.2,
  },
  documents: [
    { doc_type: 'DOC-ID', filename: 'mykad-aminah-800101-01-5566.png', mime_type: 'image/png' },
    { doc_type: 'DOC-SSM', filename: 'ssm-cert.pdf', mime_type: 'application/pdf' },
  ],
  checklist: [
    { doc_id: 'DOC-ID', label: 'Identity document', mandatory: true },
    { doc_id: 'DOC-SSM', label: 'Business or company registration (SSM)', mandatory: true },
  ],
}

const outbound = redactValue(payload)
console.log('=== OUTBOUND PAYLOAD (post-redaction, exactly what the API would receive) ===')
console.log(JSON.stringify(outbound, null, 2))

const asText = JSON.stringify(outbound)
const leaks = ['800101-01-5566', '800101015566', '+60127778888'].filter((v) => asText.includes(v))
if (leaks.length > 0) {
  console.error(`\nLEAK DETECTED: ${leaks.join(', ')}`)
  process.exit(1)
}
console.log('\nNo NRIC, phone or email present in the outbound payload.')
