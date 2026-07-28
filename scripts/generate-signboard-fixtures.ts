/**
 * Generates the M6 signboard fixtures from SVG so the glyph-height ground
 * truth is exact by construction, not measured after the fact.
 *
 *   pnpm tsx scripts/generate-signboard-fixtures.ts
 *
 * Boards (glyph heights are the SVG font sizes, in board millimetres):
 *   board-070:        name 300mm, chinese 210mm  → ratio 0.70, compliant
 *   board-086 (demo): name 300mm, chinese 258mm  → ratio 0.86, non-compliant
 *   board-lowres:     the 0.86 board rendered at 96px wide — unreadable by design
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'signboards')

// board canvas in "millimetres" (6.0m × 1.2m board at 1 unit = 1mm)
const BOARD_W = 6000
const BOARD_H = 1200

interface BoardSpec {
  id: string
  nameHeight: number
  otherHeight: number
  activityHeight: number
  pixelWidth: number
}

const BOARDS: BoardSpec[] = [
  { id: 'board-070', nameHeight: 300, otherHeight: 210, activityHeight: 90, pixelWidth: 1800 },
  { id: 'board-086', nameHeight: 300, otherHeight: 258, activityHeight: 90, pixelWidth: 1800 },
]

function boardSvg(spec: BoardSpec): string {
  // dominant-baseline=hanging puts the glyph top at y, so each run's glyph
  // height equals its font-size exactly — that is the ground truth.
  //
  // The boards are ANNOTATED PRODUCTION PROOFS: each run carries a printed
  // lettering-height annotation, as real signage proofs do. This is the M6
  // input contract — the model reads the annotations rather than eyeballing
  // pixel heights, which the live check proved lands far outside ±0.05.
  const nameY = 160
  const otherY = nameY + spec.nameHeight + 120
  const activityY = otherY + spec.otherHeight + 100
  const annotation = (y: number, h: number) =>
    `<text x="${BOARD_W - 780}" y="${y}" font-family="Arial" font-size="64" fill="#e5e7eb" dominant-baseline="hanging">↕ ${h} mm</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">
  <rect width="${BOARD_W}" height="${BOARD_H}" fill="#14532d"/>
  <rect x="40" y="40" width="${BOARD_W - 80}" height="${BOARD_H - 80}" fill="none" stroke="#facc15" stroke-width="12"/>
  <text x="300" y="${nameY}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${spec.nameHeight}" fill="#ffffff" dominant-baseline="hanging">KEDAI RUNCIT AMAN JAYA</text>
  ${annotation(nameY, spec.nameHeight)}
  <text x="300" y="${otherY}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-weight="bold" font-size="${spec.otherHeight}" fill="#facc15" dominant-baseline="hanging">安泰杂货店</text>
  ${annotation(otherY, spec.otherHeight)}
  <text x="300" y="${activityY}" font-family="Arial, Helvetica, sans-serif" font-size="${spec.activityHeight}" fill="#ffffff" dominant-baseline="hanging">Barangan Runcit &amp; Keperluan Harian</text>
  ${annotation(activityY, spec.activityHeight)}
  <text x="300" y="${BOARD_H - 130}" font-family="Arial" font-size="60" fill="#e5e7eb" dominant-baseline="hanging">BOARD ${BOARD_W} mm × ${BOARD_H} mm — production proof, lettering heights as annotated</text>
</svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  for (const spec of BOARDS) {
    const svg = boardSvg(spec)
    const png = await sharp(Buffer.from(svg)).resize(spec.pixelWidth).png().toBuffer()
    await writeFile(path.join(OUT_DIR, `${spec.id}.png`), png)

    const groundTruth = {
      board_id: spec.id,
      board_dimensions_m: { width_m: 6.0, height_m: 1.2 },
      units: 'board millimetres; 1 SVG unit = 1mm',
      runs: [
        {
          text: 'KEDAI RUNCIT AMAN JAYA',
          script: 'latin',
          language: 'ms',
          role: 'business_name',
          glyph_height_mm: spec.nameHeight,
        },
        {
          text: '安泰杂货店',
          script: 'han',
          language: 'zh',
          role: 'business_name_other_script',
          glyph_height_mm: spec.otherHeight,
        },
        {
          text: 'Barangan Runcit & Keperluan Harian',
          script: 'latin',
          language: 'ms',
          role: 'activity',
          glyph_height_mm: spec.activityHeight,
        },
      ],
      expected_ratio: Math.round((spec.otherHeight / spec.nameHeight) * 100) / 100,
      tolerance: 0.05,
    }
    await writeFile(
      path.join(OUT_DIR, `${spec.id}.json`),
      JSON.stringify(groundTruth, null, 2) + '\n',
    )
    console.log(`${spec.id}: ratio ${groundTruth.expected_ratio} (${spec.otherHeight}/${spec.nameHeight})`)
  }

  // the deliberately unreadable board: same 0.86 artwork at 96px wide
  const lowSvg = boardSvg(BOARDS[1])
  const lowres = await sharp(Buffer.from(lowSvg)).resize(96).blur(1.5).png().toBuffer()
  await writeFile(path.join(OUT_DIR, 'board-lowres.png'), lowres)
  await writeFile(
    path.join(OUT_DIR, 'board-lowres.json'),
    JSON.stringify(
      {
        board_id: 'board-lowres',
        note: 'the 0.86 board at 96px wide, blurred — must escalate, never yield a ratio',
        expected_outcome: 'escalation',
      },
      null,
      2,
    ) + '\n',
  )
  console.log('board-lowres: 96px blurred render, expected outcome = escalation')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
