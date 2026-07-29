/**
 * Generates realistic SPECIMEN demo documents into public/demo-docs so demo
 * users can download and drop them into an application. All are marked
 * SPECIMEN; the MyKad uses the fictional demo identity only.
 *
 *   pnpm tsx scripts/generate-demo-documents.ts
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.join(process.cwd(), 'public', 'demo-docs')

const page = (title: string, subtitle: string, body: string, stamp = '') => `
<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#ffffff"/>
  <rect x="40" y="40" width="1160" height="1674" fill="none" stroke="#94a3b8" stroke-width="2"/>
  <text x="620" y="130" text-anchor="middle" font-family="Arial" font-size="40" font-weight="bold" fill="#0f172a">${title}</text>
  <text x="620" y="185" text-anchor="middle" font-family="Arial" font-size="26" fill="#334155">${subtitle}</text>
  <line x1="120" y1="220" x2="1120" y2="220" stroke="#cbd5e1" stroke-width="2"/>
  ${body}
  ${stamp}
  <text x="620" y="1680" text-anchor="middle" font-family="Arial" font-size="20" fill="#94a3b8">SPECIMEN — dokumen demo sahaja / demo document only — MBJB-lesen POC</text>
</svg>`

const row = (y: number, label: string, value: string) => `
  <text x="140" y="${y}" font-family="Arial" font-size="26" fill="#64748b">${label}</text>
  <text x="520" y="${y}" font-family="Arial" font-size="26" font-weight="bold" fill="#0f172a">${value}</text>`

const stamp = (text: string, color: string) => `
  <g transform="rotate(-12 920 1450)">
    <rect x="760" y="1390" width="330" height="110" rx="10" fill="none" stroke="${color}" stroke-width="5"/>
    <text x="925" y="1458" text-anchor="middle" font-family="Arial" font-size="34" font-weight="bold" fill="${color}">${text}</text>
  </g>`

const DOCS: Array<{ file: string; svg: string }> = [
  {
    file: 'ssm-cert.png',
    svg: page(
      'SURUHANJAYA SYARIKAT MALAYSIA',
      'Sijil Pendaftaran Perniagaan · Certificate of Business Registration',
      [
        row(340, 'Nama Perniagaan', 'KEDAI RUNCIT AMAN JAYA'),
        row(410, 'No. Pendaftaran', '202301012345 (JM0567891-A)'),
        row(480, 'Jenis Perniagaan', 'Pemilikan Tunggal / Sole Proprietorship'),
        row(550, 'Tarikh Daftar', '15 Januari 2023'),
        row(620, 'Tempoh Sah', '15 Januari 2023 — 14 Januari 2028'),
        row(690, 'Alamat Perniagaan', 'No 45, Jalan Rosmerah 2/1,'),
        row(740, '', 'Taman Johor Jaya, 81100 Johor Bahru'),
        row(830, 'Pemilik', 'AMINAH BINTI SALLEH'),
      ].join(''),
      stamp('DIDAFTARKAN', '#166534'),
    ),
  },
  {
    file: 'cukai-harta-2026.png',
    svg: page(
      'MAJLIS BANDARAYA JOHOR BAHRU',
      'Resit Cukai Harta · Property Tax Receipt — Tahun 2026',
      [
        row(340, 'No. Akaun', 'CH-889900'),
        row(410, 'Pemegang Akaun', 'AMINAH BINTI SALLEH'),
        row(480, 'Alamat Harta', 'No 45, Jalan Rosmerah 2/1,'),
        row(530, '', 'Taman Johor Jaya, 81100 Johor Bahru'),
        row(620, 'Tempoh', 'Januari — Jun 2026'),
        row(690, 'Amaun', 'RM 1,240.00'),
        row(760, 'Tarikh Bayaran', '12 Februari 2026'),
        row(830, 'No. Resit', 'MBJB/2026/0031877'),
      ].join(''),
      stamp('TELAH DIBAYAR', '#166534'),
    ),
  },
  {
    file: 'dbp-approval.png',
    svg: page(
      'DEWAN BAHASA DAN PUSTAKA',
      'Pengesahan Bahasa Iklan · Advertisement Language Verification',
      [
        row(340, 'Ruj. Kami', 'DBP/JB/2026/0451'),
        row(410, 'Pemohon', 'KEDAI RUNCIT AMAN JAYA'),
        row(480, 'Teks Iklan', 'KEDAI RUNCIT AMAN JAYA'),
        row(550, '', '安泰杂货店 · Barangan Runcit &amp; Keperluan Harian'),
        `<text x="140" y="660" font-family="Arial" font-size="26" fill="#0f172a">Sukacita dimaklumkan bahawa teks papan iklan di atas telah disemak</text>`,
        `<text x="140" y="705" font-family="Arial" font-size="26" fill="#0f172a">dan DISAHKAN penggunaan bahasa kebangsaannya mengikut garis</text>`,
        `<text x="140" y="750" font-family="Arial" font-size="26" fill="#0f172a">panduan yang berkuat kuasa.</text>`,
        row(860, 'Tarikh', '3 Mac 2026'),
      ].join(''),
      stamp('DISAHKAN', '#1d4ed8'),
    ),
  },
  {
    file: 'tenancy.png',
    svg: page(
      'PERJANJIAN SEWA',
      'Tenancy Agreement — Muka Surat 1 / Page 1',
      [
        row(340, 'Tuan Punya', 'TAN AH KOW (750303-01-5533)'),
        row(410, 'Penyewa', 'AMINAH BINTI SALLEH'),
        row(480, 'Premis', 'No 45, Jalan Rosmerah 2/1,'),
        row(530, '', 'Taman Johor Jaya, 81100 Johor Bahru'),
        row(620, 'Tempoh Sewa', '1 Januari 2026 — 31 Disember 2027'),
        row(690, 'Sewa Bulanan', 'RM 2,800.00'),
        row(760, 'Kegunaan', 'Kedai runcit / retail'),
        `<text x="140" y="900" font-family="Arial" font-size="24" fill="#475569">Ditandatangani di hadapan saksi pada 18 Disember 2025.</text>`,
      ].join(''),
    ),
  },
  {
    file: 'mykad.png',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">
  <rect width="1000" height="630" rx="28" fill="#e0f2fe"/>
  <rect width="1000" height="630" rx="28" fill="none" stroke="#0284c7" stroke-width="4"/>
  <rect x="0" y="0" width="1000" height="110" rx="28" fill="#0369a1"/>
  <text x="40" y="72" font-family="Arial" font-size="42" font-weight="bold" fill="#ffffff">KAD PENGENALAN MALAYSIA</text>
  <rect x="700" y="160" width="240" height="300" rx="12" fill="#cbd5e1"/>
  <circle cx="820" cy="260" r="55" fill="#94a3b8"/>
  <path d="M730 460 q90 -110 180 0 Z" fill="#94a3b8"/>
  <text x="820" y="440" text-anchor="middle" font-family="Arial" font-size="26" fill="#475569">SPECIMEN</text>
  <text x="60" y="210" font-family="Arial" font-size="44" font-weight="bold" fill="#0f172a">800101-01-5566</text>
  <text x="60" y="290" font-family="Arial" font-size="36" font-weight="bold" fill="#0f172a">AMINAH BINTI SALLEH</text>
  <text x="60" y="360" font-family="Arial" font-size="26" fill="#334155">NO 12, JALAN DEDAP 3</text>
  <text x="60" y="400" font-family="Arial" font-size="26" fill="#334155">TAMAN JOHOR JAYA</text>
  <text x="60" y="440" font-family="Arial" font-size="26" fill="#334155">81100 JOHOR BAHRU</text>
  <text x="60" y="520" font-family="Arial" font-size="28" fill="#0f172a">WARGANEGARA</text>
  <text x="500" y="600" text-anchor="middle" font-family="Arial" font-size="20" fill="#64748b">SPECIMEN — demo document only</text>
</svg>`,
  },
  {
    file: 'floorplan.png',
    svg: `
<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="900" viewBox="0 0 1240 900">
  <rect width="1240" height="900" fill="#ffffff"/>
  <text x="620" y="70" text-anchor="middle" font-family="Arial" font-size="36" font-weight="bold" fill="#0f172a">PELAN LANTAI — KEDAI RUNCIT AMAN JAYA</text>
  <rect x="170" y="120" width="900" height="600" fill="none" stroke="#0f172a" stroke-width="5"/>
  <line x1="720" y1="120" x2="720" y2="520" stroke="#0f172a" stroke-width="3"/>
  <line x1="170" y1="520" x2="1070" y2="520" stroke="#0f172a" stroke-width="3"/>
  <text x="440" y="330" text-anchor="middle" font-family="Arial" font-size="30" fill="#334155">Ruang Jualan / Retail</text>
  <text x="895" y="330" text-anchor="middle" font-family="Arial" font-size="30" fill="#334155">Stor / Store</text>
  <text x="620" y="630" text-anchor="middle" font-family="Arial" font-size="30" fill="#334155">Kaunter &amp; Pejabat</text>
  <text x="620" y="790" text-anchor="middle" font-family="Arial" font-size="32" font-weight="bold" fill="#0f172a">Luas Lantai / Floor Area: 85 m²</text>
  <text x="620" y="860" text-anchor="middle" font-family="Arial" font-size="20" fill="#94a3b8">SPECIMEN — demo document only — MBJB-lesen POC</text>
</svg>`,
  },
]

async function main() {
  await mkdir(OUT, { recursive: true })
  for (const doc of DOCS) {
    const png = await sharp(Buffer.from(doc.svg)).png().toBuffer()
    await writeFile(path.join(OUT, doc.file), png)
    console.log(`${doc.file} (${png.length} bytes)`)
  }
  // the two signboard artworks are the real M6 fixtures
  await copyFile(
    path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-086.png'),
    path.join(OUT, 'demo-board-086.png'),
  )
  await copyFile(
    path.join(process.cwd(), 'tests', 'fixtures', 'signboards', 'board-lowres.png'),
    path.join(OUT, 'signboard-lowres.png'),
  )
  console.log('demo-board-086.png + signboard-lowres.png copied from fixtures')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
