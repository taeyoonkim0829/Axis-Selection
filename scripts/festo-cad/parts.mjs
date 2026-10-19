// Festo parts that step 5 (조합 도면) can use a CAD model for, read from data/: axes (one stroke per type),
// motors (base order code), EMGA gearboxes and mounting kits. Shared by list.mjs and import.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))
const data = join(root, 'data')

const items = (file) => JSON.parse(readFileSync(file, 'utf8')).items
const jsonFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))
const dirOf = (kind) => readdirSync(data + '/' + kind).find((d) => d.toLowerCase() === 'festo')

/** Every STEP file below data/<kind>/<maker>/Drawings, as data-relative paths. */
export function existingDrawings() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(stp|step)$/i.test(e.name)) out.push(relative(root, p).replaceAll('\\', '/'))
    }
  }
  for (const kind of ['axes', 'motors', 'gearboxes', 'kits']) {
    const maker = dirOf(kind)
    const d = maker && join(data, kind, maker, 'Drawings')
    if (d && existsSync(d)) walk(d)
  }
  return out
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Standard stroke to export: one with its own part number closest to 500 mm, else the closest standard stroke. */
function axisStroke(axis) {
  const numbered = axis.strokePartNumbers && typeof axis.strokePartNumbers === 'object' ? axis.strokePartNumbers : null
  const strokes = numbered
    ? Object.keys(numbered).map(Number)
    : axis.standardStrokes?.length
      ? axis.standardStrokes
      : (axis.moduleStrokes?.fixed ?? [])
  const pool = strokes.length ? strokes : [Math.min(500, axis.maxStroke ?? 500)]
  const stroke = pool.reduce((a, b) => (Math.abs(b - 500) < Math.abs(a - 500) ? b : a))
  return { stroke, partNumber: numbered?.[stroke] ?? axis.moduleNumber ?? null }
}

/**
 * One entry per CAD file wanted. `match` tells a STEP file's model name apart (axes: any stroke of the type),
 * `folder` is where it goes below data/.
 */
export function wantedParts() {
  const parts = []
  const festoMotors = []
  const gearboxes = []

  for (const file of jsonFiles(join(data, 'motors', dirOf('motors')))) {
    for (const m of items(file)) {
      festoMotors.push(m)
      const model = m.orderCode ?? m.model
      // another option variant of the same motor fits too (as in src/cad/drawings.ts motorDrawingFor):
      // option letters after the base model, B = brake
      const base = m.brake ? m.model.replace(/-B$/, '') : m.model
      const variant = new RegExp(`^${escape(base)}-([A-Z0-9]+)$`, 'i')
      parts.push({
        priority: 1,
        kind: 'motors',
        family: m.family,
        model,
        partNumber: m.partNumber ?? null,
        stroke: null,
        match: {
          test: (name) =>
            name.toUpperCase() === model.toUpperCase() ||
            (variant.test(name) && variant.exec(name)[1].toUpperCase().includes('B') === m.brake),
        },
        folder: `motors/Festo/Drawings/${m.family}`,
        frames: 'optional',
      })
    }
  }

  for (const file of jsonFiles(join(data, 'gearboxes', dirOf('gearboxes')))) {
    for (const g of items(file)) {
      gearboxes.push(g)
      parts.push({
        priority: 1,
        kind: 'gearboxes',
        family: g.family,
        model: g.model,
        partNumber: g.partNumber ?? null,
        stroke: null,
        match: new RegExp(`^${escape(g.model)}$`, 'i'),
        folder: `gearboxes/Festo/Drawings/${g.family}`,
        frames: 'required',
      })
    }
  }

  const axes = jsonFiles(join(data, 'axes', dirOf('axes'))).flatMap(items)
  for (const a of axes) {
    const code = a.typeCode ?? a.model
    const { stroke, partNumber } = axisStroke(a)
    parts.push({
      priority: 1,
      kind: 'axes',
      family: a.family,
      model: code.replace('…', String(stroke)),
      partNumber,
      stroke,
      match: new RegExp(`^${code.split('…').map(escape).join('\\d+')}$`, 'i'),
      folder: `axes/Festo/Drawings/${a.family}`,
      frames: 'required',
    })
  }

  // Kits: one file per product. Priority 1 = standard kits between a Festo axis and a Festo motor or EMGA output
  // with data sheet values and no inspection window (what the kit step recommends first); the rest priority 2.
  const motorCodes = new Set([...festoMotors, ...gearboxes].map((x) => x.interfaceCode).filter(Boolean))
  const axisCodes = new Set(axes.map((a) => a.interfaceCode).filter(Boolean))
  const kits = new Map()
  for (const file of jsonFiles(join(data, 'kits', dirOf('kits')))) {
    for (const k of items(file)) {
      const first = !k.special && !k.window && k.transmissibleTorque != null && axisCodes.has(k.axisCode) && motorCodes.has(k.motorCode)
      const prev = kits.get(k.product)
      if (!prev || (first && prev.priority === 2)) kits.set(k.product, { kit: k, priority: first ? 1 : 2 })
    }
  }
  for (const { kit: k, priority } of kits.values()) {
    if (k.special) continue // custom-made in Korea, no Festo CAD
    parts.push({
      priority,
      kind: 'kits',
      family: k.product.split('-').slice(0, 2).join('-'),
      model: k.product,
      partNumber: k.partNumber ?? null,
      stroke: null,
      match: new RegExp(`^${escape(k.product)}$`, 'i'),
      folder: `kits/Festo/Drawings/${k.product.split('-').slice(0, 2).join('-')}`,
      frames: 'required',
    })
  }

  const have = existingDrawings()
  for (const p of parts) {
    p.have = have.find((f) => {
      const base = f.split('/').pop().replace(/\.[^.]+$/, '')
      const named = /^(\d{5,})_(.+)$/.exec(base)
      return named ? p.match.test(named[2]) || (p.kind !== 'axes' && p.partNumber === named[1]) : false
    }) ?? null
  }
  return parts
}
