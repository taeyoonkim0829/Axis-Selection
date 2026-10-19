// Writes the Festo CAD models still missing (or all with --all) as CSV, for exporting STEP files from the Festo
// PARTdataManager: node scripts/festo-cad/list.mjs [out.csv] [--all]
import { writeFileSync } from 'node:fs'
import { wantedParts } from './parts.mjs'

const args = process.argv.slice(2)
const all = args.includes('--all')
const out = args.find((a) => !a.startsWith('--'))

const order = { axes: 0, motors: 1, gearboxes: 2, kits: 3 }
const parts = wantedParts()
  .filter((p) => all || !p.have)
  .sort((a, b) => a.priority - b.priority || order[a.kind] - order[b.kind] || a.model.localeCompare(b.model))

const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))
const rows = [
  ['priority', 'kind', 'family', 'model', 'partNumber', 'stroke', 'have'],
  ...parts.map((p) => [p.priority, p.kind, p.family, p.model, p.partNumber, p.stroke, p.have ?? '']),
]
const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

if (out) writeFileSync(out, csv)
else process.stdout.write(csv)

const count = (f) => parts.filter(f).length
console.error(
  `${parts.length} parts (priority 1: ${count((p) => p.priority === 1)}; axes ${count((p) => p.kind === 'axes')}, ` +
    `motors ${count((p) => p.kind === 'motors')}, gearboxes ${count((p) => p.kind === 'gearboxes')}, kits ${count((p) => p.kind === 'kits')})`,
)
