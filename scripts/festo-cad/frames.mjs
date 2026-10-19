// Writes the frame JSON (data/README.md, "Drawings") for Festo axis STEP files that have none, from their geometry:
//   node scripts/festo-cad/frames.mjs [--dry-run] [--force] [file.stp …]
// Festo's CADENAS models share one layout: length along z, base at y = 0, slide on top (+y), centred on x = 0.
// Per family: the motor end (+z for ELGT, ELGD and EGC/EGC-HD spindle axes, −z for ESBF; belt axes: the head and
// side where a shaft cover cap (CUP) is missing), the drive face (largest planar face at that end, facing out;
// belt axes: on the head's side face), the shaft centre (spindle: the outermost small face at that end, i.e. the
// shaft tip; belt: the cover cap on the other side of that head), the slide mounting surface (top of the slide
// part; ESBF: the piston rod end) and the length change (the profile's longest stretch without end features, the
// parts beyond it moving along). Prints what it found; check new families in the 3D preview.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { root } from './parts.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))

const require = createRequire(import.meta.url)
const occt = await require(join(root, 'node_modules/occt-import-js'))()

const axesDir = join(root, 'data/axes/Festo/Drawings')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.stp$/i.test(e.name) ? [join(dir, e.name)] : [],
  )
const axes = readdirSync(join(root, 'data/axes/festo'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(root, 'data/axes/festo', f), 'utf8')).items)

const round = (v, step = 0.05) => Math.round(v / step) * step + 0 // + 0: no -0
const fixed = (v) => Number(round(v).toFixed(2))

// ---- STEP: part instances with their placement and transform ----
function parseEntities(text) {
  const map = new Map()
  const data = text.slice(text.indexOf('DATA;'))
  for (const m of data.matchAll(/#(\d+)\s*=\s*([\s\S]*?);\s*(?=#\d+\s*=|ENDSEC)/g)) map.set(Number(m[1]), m[2].replace(/\s+/g, ' '))
  return map
}
const refsOf = (body) => [...body.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))
const numbers = (body) => body.match(/\(([^()]*)\)\s*\)\s*$/)[1].split(',').map(Number)

function placementTransform(e, id) {
  const [loc, z, x] = refsOf(e.get(id))
  const p = numbers(e.get(loc))
  const zz = z ? numbers(e.get(z)) : [0, 0, 1]
  const xx = x ? numbers(e.get(x)) : [1, 0, 0]
  const yy = [zz[1] * xx[2] - zz[2] * xx[1], zz[2] * xx[0] - zz[0] * xx[2], zz[0] * xx[1] - zz[1] * xx[0]]
  return { p, cols: [xx, yy, zz] }
}

/** Instances of the top assembly: child placement id, transform, and the points of the child's geometry. */
function instances(text) {
  const e = parseEntities(text)
  const out = []
  for (const [id, body] of e) {
    if (!body.startsWith('ITEM_DEFINED_TRANSFORMATION')) continue
    const [p1, p2] = refsOf(body)
    // the representation relationship using this transformation names the child representation
    let child = null
    for (const b of e.values())
      if (b.includes(`REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${id})`)) {
        child = refsOf(b.slice(b.indexOf('REPRESENTATION_RELATIONSHIP(')))[0]
        break
      }
    const t1 = placementTransform(e, p1)
    const t2 = placementTransform(e, p2)
    const name = child && /^SHAPE_REPRESENTATION\(\s*'([^']*)'/.exec(e.get(child) ?? '')?.[1]
    out.push({ placement: p2, child, name: name?.trim() ?? null, identity: isIdentity(t1) && isIdentity(t2), t2 })
  }
  return out
}
const isIdentity = (t) =>
  t.p.every((v) => Math.abs(v) < 1e-6) && t.cols.every((c, i) => c.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-9))

// ---- meshes (occt): names, boxes, planar faces ----
function meshes(text) {
  const r = occt.ReadStepFile(new TextEncoder().encode(text), null)
  if (!r.success) throw new Error('occt could not read the file')
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
    // planar faces perpendicular to x (k = 0) or z (k = 2)
    const faces = []
    for (const f of m.brep_faces) {
      let area = 0
      const n = [0, 0, 0]
      const flo = [Infinity, Infinity, Infinity]
      const fhi = [-Infinity, -Infinity, -Infinity]
      let ok = true
      let normal = null
      for (let t = f.first; t <= f.last; t++) {
        const [a, b, c] = [idx[3 * t] * 3, idx[3 * t + 1] * 3, idx[3 * t + 2] * 3]
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
        const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const len = Math.hypot(...cr)
        area += len / 2
        if (len > 1e-9) {
          const unit = cr.map((x) => x / len)
          if (!normal) normal = unit
          else if (unit[0] * normal[0] + unit[1] * normal[1] + unit[2] * normal[2] < 0.9999) ok = false
          for (let k = 0; k < 3; k++) n[k] = unit[k]
        }
        for (const q of [a, b, c])
          for (let k = 0; k < 3; k++) {
            flo[k] = Math.min(flo[k], p[q + k])
            fhi[k] = Math.max(fhi[k], p[q + k])
          }
      }
      if (!ok || !normal || area < 1) continue
      for (const k of [0, 2])
        if (Math.abs(Math.abs(normal[k]) - 1) < 1e-4) faces.push({ k, sign: Math.sign(normal[k]), pos: flo[k], area, lo: flo, hi: fhi })
    }
    return { name: m.name ?? '', lo, hi, faces }
  })
}

const centre = (lo, hi, k) => (lo[k] + hi[k]) / 2
/** fasteners, couplings, fittings: never the drive face or the slide */
const hardware = (name) => /EAMC|ISO|DIN|GUK|AEVU|M\d+x/i.test(name)

function frames(file, model) {
  const text = readFileSync(file, 'latin1')
  const ms = meshes(text)
  // the body: largest box (an ESBF piston rod is as long as the cylinder)
  const volume = (m) => (m.hi[0] - m.lo[0]) * (m.hi[1] - m.lo[1]) * (m.hi[2] - m.lo[2])
  const profile = ms.reduce((a, b) => (volume(b) > volume(a) ? b : a))
  const length = profile.hi[2] - profile.lo[2]
  const width = profile.hi[0] - profile.lo[0]
  const x0 = centre(profile.lo, profile.hi, 0)
  const family = /^ESBF/.test(model) ? 'ESBF' : /-TB-/.test(model) ? 'TB' : 'BS'
  const others = ms.filter((m) => m !== profile)

  // motor end (±z) and, for belt axes, the kit side (±x)
  let motor = /^ESBF/.test(model) ? -1 : 1
  let side = 1
  if (family === 'TB') {
    const caps = others.filter((m) => /CUP/.test(m.name))
    const at = (end, s) => caps.some((c) => Math.sign(centre(c.lo, c.hi, 2) - centre(profile.lo, profile.hi, 2)) === end && Math.sign(centre(c.lo, c.hi, 0) - x0) === s)
    const open = [1, -1].flatMap((end) => [1, -1].filter((s) => !at(end, s)).map((s) => ({ end, s })))
    if (open.length === 1) {
      motor = open[0].end
      side = open[0].s
    } else if (open.length === 0) {
      // every shaft end capped (EGC-HD-TB): the drive head is the one the slide starts at, as on the other belt axes
      const slides = others.filter((m) => !hardware(m.name) && !/CUP|AK\)/.test(m.name) && m.hi[0] - m.lo[0] > 0.6 * width)
      const s = slides.reduce((a, b) => (b.hi[1] > a.hi[1] ? b : a))
      motor = Math.sign(centre(s.lo, s.hi, 2) - centre(profile.lo, profile.hi, 2))
      side = 1
    } else throw new Error(`belt axis: ${open.length} open shaft ends, cannot tell the drive head`)
  }

  // slide
  let slide
  if (family === 'ESBF') {
    const rod = others.filter((m) => !hardware(m.name)).reduce((a, b) => (b.hi[2] > a.hi[2] ? b : a))
    slide = { origin: [fixed(x0), fixed(centre(rod.lo, rod.hi, 1)), fixed(rod.hi[2])], normal: [0, 1, 0], travel: [0, 0, 1] }
  } else {
    // wide, on top, within the profile's length (end caps reach beyond it)
    const candidates = others.filter(
      (m) =>
        !hardware(m.name) &&
        m.hi[0] - m.lo[0] > 0.6 * width &&
        m.hi[2] - m.lo[2] < 0.6 * length &&
        m.lo[2] > profile.lo[2] &&
        m.hi[2] < profile.hi[2] &&
        m.hi[1] > 0.8 * profile.hi[1],
    )
    if (candidates.length === 0) throw new Error('no slide part found')
    const s = candidates.reduce((a, b) => (b.hi[1] > a.hi[1] ? b : a))
    slide = { origin: [fixed(x0), fixed(s.hi[1]), fixed(centre(s.lo, s.hi, 2))], normal: [0, 1, 0], travel: [0, 0, -motor], part: s }
  }

  // drive
  let drive
  const structural = ms.filter((m) => !hardware(m.name) && m !== slide.part)
  if (family === 'TB') {
    const caps = others.filter((m) => /CUP/.test(m.name) && Math.sign(centre(m.lo, m.hi, 2) - centre(profile.lo, profile.hi, 2)) === motor)
    const cap = caps[0]
    const shaft = [centre(cap.lo, cap.hi, 1), centre(cap.lo, cap.hi, 2)]
    const faces = structural
      .flatMap((m) => m.faces)
      .filter((f) => f.k === 0 && f.sign === side && f.lo[2] < shaft[1] && f.hi[2] > shaft[1] && f.lo[1] < shaft[0] && f.hi[1] > shaft[0])
    if (faces.length === 0) throw new Error('no side face at the drive shaft')
    const face = faces.reduce((a, b) => (b.pos * side > a.pos * side ? b : a))
    drive = { origin: [fixed(face.pos), fixed(shaft[0]), fixed(shaft[1])], axis: [side, 0, 0], up: [0, 1, 0] }
  } else {
    const out = structural.flatMap((m) => m.faces).filter((f) => f.k === 2 && f.sign === motor)
    const extreme = Math.max(...out.map((f) => f.pos * motor))
    const near = out.filter((f) => f.pos * motor > extreme - 80)
    // the outermost face of a quarter of the cross-section or more: the end face the kit sits on (not the shaft,
    // the centering collar or, further in, the profile end hidden in an end cap)
    const section = width * (profile.hi[1] - profile.lo[1])
    const face = near.filter((f) => f.area > 0.25 * section).reduce((a, b) => (b.pos * motor > a.pos * motor ? b : a))
    const tips = near.filter((f) => f.area < 0.2 * face.area && f.pos * motor > face.pos * motor)
    if (tips.length === 0) throw new Error('no shaft beyond the drive face')
    const tip = tips.reduce((a, b) => (b.pos * motor > a.pos * motor ? b : a))
    drive = {
      origin: [fixed(centre(tip.lo, tip.hi, 0)), fixed(centre(tip.lo, tip.hi, 1)), fixed(face.pos)],
      axis: [0, 0, motor],
      up: [0, 1, 0],
    }
  }

  // length change: the longest stretch of the profile without end features (its own faces across the length,
  // other parts that do not run along it), parts beyond it on the far side move along
  const dir = family === 'ESBF' ? motor : -motor
  const blocked = [
    ...profile.faces.filter((f) => f.k === 2).map((f) => [f.pos, f.pos]),
    ...others.filter((m) => m.hi[2] - m.lo[2] < 0.6 * length).map((m) => [m.lo[2], m.hi[2]]),
  ].sort((a, b) => a[0] - b[0])
  let best = null
  let at = profile.lo[2]
  for (const [lo, hi] of [...blocked, [profile.hi[2], profile.hi[2]]]) {
    if (lo > at && (!best || lo - at > best[1] - best[0])) best = [at, lo]
    at = Math.max(at, hi)
  }
  const range = [Math.ceil(best[0] + 5), Math.floor(best[1] - 5)]
  const edge = dir > 0 ? range[1] : range[0]
  const beyond = (m) => (dir > 0 ? m.lo[2] > edge : m.hi[2] < edge)

  // placements of the moving parts, matched to the meshes by the box of their geometry
  const inst = instances(text)
  const profileInst = matchInstance(inst, profile, text)
  if (!profileInst) throw new Error('no placement for the profile')
  const move = others.filter(beyond).map((m) => {
    const i = matchInstance(inst, m, text)
    if (!i) throw new Error(`no placement for ${m.name}`)
    return i.placement
  })

  // parts running along the whole axis change length with it (ESBF piston rod)
  const also = family === "ESBF" ? others.filter((m) => m.hi[2] - m.lo[2] >= 0.6 * length).map((m) => m.name) : []
  const stroke = strokeOf(model)
  const json = {
    stroke,
    drive,
    slide: { origin: slide.origin, normal: slide.normal, travel: slide.travel },
    stretch: { part: profile.name, ...(also.length ? { also } : {}), axis: 2, dir, range, ...(move.length ? { move } : {}) },
  }
  return { json, info: `${family} motor ${motor > 0 ? '+z' : '-z'}${family === 'TB' ? ` side ${side > 0 ? '+x' : '-x'}` : ''}, range ${range}, moving ${move.length}` }
}

/** The instance whose child geometry, transformed, has the box closest to the mesh's. */
function matchInstance(inst, mesh, text) {
  const e = (matchInstance.cache ??= new Map()).get(text) ?? parseEntities(text)
  matchInstance.cache.set(text, e)
  // same part name, nearest box centre: vertex boxes stay inside the tessellated ones (rounded faces bulge out,
  // a disc has a single vertex)
  const named = inst.filter((i) => i.name === mesh.name.trim())
  let best = null
  for (const i of named.length ? named : inst) {
    const box = (i.box ??= childBox(e, i))
    if (!box) continue
    const d = Math.hypot(...[0, 1, 2].map((k) => (box.lo[k] + box.hi[k] - mesh.lo[k] - mesh.hi[k]) / 2))
    if ((named.length || d < 6) && (!best || d < best.d)) best = { ...i, d }
  }
  return best
}

/** Box of the vertices of an instance's geometry, in assembly coordinates. */
function childBox(e, i) {
  if (!i.child) return null
  // shape representation → (relationship) → brep representation(s) → vertex points
  const reps = [i.child]
  for (const b of e.values())
    if (b.startsWith('SHAPE_REPRESENTATION_RELATIONSHIP') && refsOf(b).includes(i.child)) reps.push(...refsOf(b))
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  const seen = new Set()
  const stack = [...new Set(reps)]
  let count = 0
  while (stack.length) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    const body = e.get(id)
    if (!body) continue
    if (body.startsWith('VERTEX_POINT')) {
      const p = numbers(e.get(refsOf(body)[0]))
      const [x, y, z] = i.t2.cols
      const w = [0, 1, 2].map((k) => i.t2.p[k] + x[k] * p[0] + y[k] * p[1] + z[k] * p[2])
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], w[k])
        hi[k] = Math.max(hi[k], w[k])
      }
      count++
      continue
    }
    if (/^(SHAPE_REPRESENTATION|PRODUCT|NEXT_ASSEMBLY|CONTEXT_DEPENDENT|ITEM_DEFINED|\(|GEOMETRIC_REPRESENTATION_CONTEXT|PRESENTATION|STYLED|MECHANICAL_DESIGN)/.test(body) && id !== reps[0] && !reps.includes(id)) continue
    for (const r of refsOf(body)) stack.push(r)
  }
  return count ? { lo, hi } : null
}

function strokeOf(model) {
  for (const a of axes) {
    const code = a.typeCode ?? a.model
    const re = new RegExp(`^${code.split('…').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(\\d+)')}$`, 'i')
    const m = re.exec(model)
    if (m) return Number(m[1])
  }
  throw new Error(`no axis type in data/ for ${model}`)
}

/** one line per top-level key, as in the hand-written files */
const inline = (v) =>
  Array.isArray(v)
    ? `[${v.map(inline).join(', ')}]`
    : v && typeof v === 'object'
      ? `{ ${Object.entries(v)
          .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
          .join(', ')} }`
      : JSON.stringify(v)
const format = (json) =>
  `{\n${Object.entries(json)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`)
    .join(',\n')}\n}\n`

const files = only.length ? only : walk(axesDir)
let written = 0
for (const file of files) {
  const out = file.replace(/\.stp$/i, '.json')
  if (existsSync(out) && !force && !dryRun) continue
  const model = /^\d+_(.+)\.stp$/i.exec(file.split(/[\\/]/).pop())[1]
  try {
    const { json, info } = frames(file, model)
    console.log(`${model}: ${info}`)
    if (dryRun) console.log(JSON.stringify(json))
    else {
      writeFileSync(out, format(json))
      written++
    }
  } catch (err) {
    console.log(`${model}: FAILED ${err.message}`)
  }
}
console.log(`${written} written`)
