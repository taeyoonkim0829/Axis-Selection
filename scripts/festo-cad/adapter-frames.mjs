// Frame JSONs for the gantry kits in data/adapters/Festo/Drawings (EHAM-AK/-MA, EAHF-E24-…-P-D…/-B4), from their
// geometry: `base` on the base axis's slide (the centre of the fasteners reaching into it, at y = 0, axis +y into the
// kit, up across the carried travel), `carried` where the carried axis's profile underside sits (axis from the kit
// towards the carried slide, up along the carried travel, z in Festo's files). Angle kits (EHAM-AK): the outermost
// large x+ face of the wall; plates (EHAM-MA): the top face; EAHF profile mountings: the profile on the base slide
// (y = 0) between the jaws.
//   node scripts/festo-cad/adapter-frames.mjs [--dry-run]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { root } from './parts.mjs'

const require = createRequire(import.meta.url)
const occt = await require(join(root, 'node_modules/occt-import-js'))()
const dir = join(root, 'data/adapters/Festo/Drawings')
const dryRun = process.argv.includes('--dry-run')
const fixed = (v) => Number((Math.round(v / 0.05) * 0.05 + 0).toFixed(2))

function meshes(text) {
  const r = occt.ReadStepFile(new TextEncoder().encode(text), null)
  return r.meshes.map((m) => {
    const p = m.attributes.position.array
    const idx = m.index.array
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[i + k])
        hi[k] = Math.max(hi[k], p[i + k])
      }
    const faces = []
    for (const f of m.brep_faces) {
      const n = [0, 0, 0]
      const flo = [Infinity, Infinity, Infinity]
      const fhi = [-Infinity, -Infinity, -Infinity]
      for (let t = f.first; t <= f.last; t++) {
        const v = [0, 1, 2].map((k) => [0, 1, 2].map((j) => p[idx[3 * t + k] * 3 + j]))
        const a = v[1].map((x, i) => x - v[0][i])
        const b = v[2].map((x, i) => x - v[0][i])
        const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
        for (let i = 0; i < 3; i++) n[i] += c[i] / 2
        for (const q of v)
          for (let k = 0; k < 3; k++) {
            flo[k] = Math.min(flo[k], q[k])
            fhi[k] = Math.max(fhi[k], q[k])
          }
      }
      const area = Math.hypot(...n)
      const k = n.findIndex((x) => Math.abs(x) > 0.999 * area)
      if (area > 1 && k >= 0) faces.push({ k, sign: Math.sign(n[k]), pos: (flo[k] + fhi[k]) / 2, area, lo: flo, hi: fhi })
    }
    return { name: m.name ?? '', lo, hi, faces }
  })
}

const hardware = (name) => /ISO|DIN|H7x|^\d+ \d+H7/i.test(name)
let written = 0
for (const f of readdirSync(dir).filter((f) => /\.stp$/i.test(f))) {
  const model = /^\d+_(.+)\.stp$/i.exec(f)[1]
  const ms = meshes(readFileSync(join(dir, f), 'latin1'))
  const body = ms.filter((m) => !hardware(m.name))
  // fasteners reaching below the mounting face into the base slide
  const into = ms.filter((m) => hardware(m.name) && m.lo[1] < -1)
  const centre = (list, k) => (Math.min(...list.map((m) => m.lo[k])) + Math.max(...list.map((m) => m.hi[k]))) / 2
  const base = { origin: [fixed(centre(into, 0)), 0, fixed(centre(into, 2))], axis: [0, 1, 0], up: [1, 0, 0] }
  let carried
  if (/^EHAM-AK/.test(model)) {
    const faces = body.flatMap((m) => m.faces).filter((x) => x.k === 0 && x.sign > 0)
    const big = Math.max(...faces.map((x) => x.area))
    const wall = faces.filter((x) => x.area > 0.3 * big).reduce((a, b) => (b.pos > a.pos ? b : a))
    const same = faces.filter((x) => Math.abs(x.pos - wall.pos) < 1)
    const y = (Math.min(...same.map((x) => x.lo[1])) + Math.max(...same.map((x) => x.hi[1]))) / 2
    carried = { origin: [fixed(wall.pos), fixed(y), 0], axis: [1, 0, 0], up: [0, 0, 1] }
  } else if (/^EHAM-MA/.test(model)) {
    const top = Math.max(...body.map((m) => m.hi[1]))
    carried = { origin: [0, fixed(top), 0], axis: [0, 1, 0], up: [0, 0, 1] }
  } else {
    // EAHF: the jaws clamp the carried profile lying on the base slide
    base.origin = [0, 0, 0]
    carried = { origin: [0, 0, 0], axis: [0, 1, 0], up: [0, 0, 1] }
  }
  const json = `{\n  "base": ${JSON.stringify(base).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')},\n  "carried": ${JSON.stringify(carried).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}\n}\n`
  console.log(model.padEnd(30), JSON.stringify(base.origin), JSON.stringify(carried.origin))
  if (!dryRun) {
    writeFileSync(join(dir, f.replace(/\.stp$/i, '.json')), json.replace(/,(\d|-)/g, ', $1'))
    written++
  }
}
console.log(`${written} written`)
