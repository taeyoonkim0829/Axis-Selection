import { args, closure, pointBody, pointOf, refList, refs, referrers, typeOf, type StepFile, type Vec3 } from './step'
import { definitionByName, placementOf, shapeOf, solidsOf } from './structure'

/**
 * Length change of a prismatic axis body (profile, cover strip): everything beyond a cut plane moves along the
 * axis. Lengthening opens a gap at the cut; shortening removes a window behind the cut, dropping the features
 * (holes, slots) that lie entirely inside it. The cut is placed where only edges parallel to the axis cross it, so
 * the B-rep stays valid. All values are in the file's (assembly) coordinates, like the other frames; they are
 * turned into the part's own coordinates by its placement, which must keep the length along a coordinate axis.
 */
export interface StretchSpec {
  /** text in the PRODUCT name of the part to stretch */
  part: string
  /** further parts stretched the same way (an electric cylinder's piston rod) */
  also?: string[]
  /** coordinate index of the length direction */
  axis: 0 | 1 | 2
  /** +1 / −1: side of the cut that moves (the far end) */
  dir: 1 | -1
  /** where the cut may go, along `axis` */
  range: [number, number]
  /**
   * Other parts at the moving end (end caps, the slide when it sits there …), by the id of their placement in the
   * assembly (the second AXIS2_PLACEMENT_3D of their ITEM_DEFINED_TRANSFORMATION): moved along with it.
   */
  move?: number[]
}

/** The spec in the part's own coordinates */
function partSpec(file: StepFile, rep: number, spec: StretchSpec, part: string): Pick<StretchSpec, 'axis' | 'dir' | 'range'> {
  const placed = placementOf(file, rep)
  if (!placed) return spec
  const j = placed.axes.findIndex((a) => Math.abs(a[spec.axis]) > 0.9999)
  if (j < 0) throw new Error(`STEP: part "${part}" is placed at an angle to its length`)
  const s = Math.sign(placed.axes[j][spec.axis]) as 1 | -1
  const local = spec.range.map((v) => (v - placed.origin[spec.axis]) * s)
  return { axis: j as 0 | 1 | 2, dir: (spec.dir * s) as 1 | -1, range: [Math.min(...local), Math.max(...local)] }
}

export interface StretchResult {
  file: StepFile
  /** cut position along the axis */
  cut: number
  /** features removed when shortening */
  removedFaces: number
}

const MARGIN = 0.5
const PARALLEL = 0.9999

interface Edge {
  lo: number
  hi: number
  /** a straight line along the length direction: it may cross the cut */
  parallel: boolean
}

export function stretchPart(source: StepFile, spec: StretchSpec, delta: number): StretchResult {
  const file: StepFile = { header: source.header, entities: new Map(source.entities) }
  if (Math.abs(delta) < 1e-6) return { file, cut: NaN, removedFaces: 0 }
  const e = file.entities
  const { cut, removedFaces } = stretchOne(file, spec.part, spec, delta)
  for (const part of spec.also ?? []) stretchOne(file, part, spec, delta)

  // Parts at the moving end: shift their placement (a new point, the old one may be shared)
  let nextId = Math.max(...e.keys()) + 1
  for (const placement of spec.move ?? []) {
    const body = e.get(placement)
    if (!body || typeOf(body) !== 'AXIS2_PLACEMENT_3D') throw new Error(`STEP: #${placement} is not a placement`)
    const location = pointOf(e.get(refs(body)[0]) ?? '')
    if (!location) throw new Error(`STEP: placement #${placement} has no location`)
    location[spec.axis] += spec.dir * delta
    const point = nextId++
    e.set(point, pointBody(location))
    e.set(placement, replaceArg(body, 1, `#${point}`))
  }
  return { file, cut, removedFaces }
}

/** Stretches one part of `file` in place; returns the cut in the part's coordinates */
function stretchOne(file: StepFile, part: string, spec: StretchSpec, delta: number): Omit<StretchResult, 'file'> {
  const e = file.entities
  const pd = definitionByName(file, part)
  const rep = pd != null ? shapeOf(file, pd) : null
  const solids = rep != null ? solidsOf(file, rep) : []
  if (solids.length === 0) throw new Error(`STEP: part "${part}" not found`)

  const local = partSpec(file, rep!, spec, part)
  const k = local.axis
  const coord = (id: number) => pointOf(e.get(id) ?? '')?.[k]
  const extentCache = new Map<number, Edge>()
  const edgeOf = (id: number): Edge => {
    const cached = extentCache.get(id)
    if (cached) return cached
    let lo = Infinity
    let hi = -Infinity
    const extend = (v: number | undefined) => {
      if (v == null) return
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    const [v1, v2, curveId] = refs(e.get(id)!)
    for (const v of [v1, v2]) extend(coord(refs(e.get(v)!)[0]))
    const curve = e.get(curveId) ?? ''
    const t = typeOf(curve)
    let parallel = false
    if (t === 'LINE') {
      // a line's own point may lie anywhere on it: the vertices bound the edge
      const d = directionOf(e.get(refs(e.get(refs(curve)[1])!)[0])!)
      parallel = Math.abs(d[k]) / Math.hypot(...d) > PARALLEL
    } else if (t === 'CIRCLE' || t === 'ELLIPSE') {
      // a circle in a plane with normal n reaches r·√(1 − n_k²) along the axis from its centre
      const [pointId, normalId] = refs(e.get(refs(curve)[0])!)
      const centre = coord(pointId)
      const normal = normalId != null ? directionOf(e.get(normalId)!) : ([0, 0, 1] as Vec3)
      const r = Math.max(...args(curve).slice(2).map(Number))
      const reach = r * Math.sqrt(Math.max(0, 1 - (normal[k] / Math.hypot(...normal)) ** 2))
      if (centre != null) {
        extend(centre - reach)
        extend(centre + reach)
      }
    } else for (const c of closure(file, curveId)) extend(coord(c))
    const edge = { lo, hi, parallel }
    extentCache.set(id, edge)
    return edge
  }

  // Topology: solids → shells → faces → bounds → edges
  interface Bound {
    id: number
    edges: Edge[]
  }
  interface Face {
    id: number
    shell: number
    bounds: Bound[]
  }
  const faces: Face[] = []
  for (const solid of solids) {
    for (const shell of refs(e.get(solid)!)) {
      const shellBody = e.get(shell)!
      if (!/SHELL/.test(typeOf(shellBody))) continue
      for (const face of refList(args(shellBody)[1])) {
        const bounds = refList(args(e.get(face)!)[1]).map((b) => {
          const loop = e.get(refs(e.get(b)!)[0])!
          const edgeIds =
            typeOf(loop) === 'EDGE_LOOP' ? refList(args(loop)[1]).map((oe) => refs(e.get(oe)!).at(-1)!) : []
          const vertexOnly = typeOf(loop) === 'VERTEX_LOOP' ? closureEdge(file, refs(loop)[0], coord) : null
          return { id: b, edges: vertexOnly ? [vertexOnly] : edgeIds.map(edgeOf) }
        })
        faces.push({ id: face, shell, bounds })
      }
    }
  }

  const span = Math.abs(delta)
  const [r0, r1] = [Math.min(...local.range), Math.max(...local.range)]
  const mid = (r0 + r1) / 2
  // window [w0, w1] behind the cut (on the moving side); empty when lengthening
  const windowOf = (c: number): [number, number] => {
    const far = delta < 0 ? c + local.dir * span : c
    return [Math.min(c, far), Math.max(c, far)]
  }
  const inside = (x: Edge, [w0, w1]: [number, number]) => x.lo > w0 + MARGIN && x.hi < w1 - MARGIN
  const touches = (x: Edge, [w0, w1]: [number, number]) => !x.parallel && x.hi >= w0 - MARGIN && x.lo <= w1 + MARGIN
  const valid = (c: number) => {
    const w = windowOf(c)
    if (w[0] < r0 || w[1] > r1) return false
    for (const f of faces)
      for (const b of f.bounds) {
        if (delta < 0 && b.edges.every((x) => inside(x, w))) continue
        if (b.edges.some((x) => touches(x, w))) return false
      }
    return true
  }
  const candidates: number[] = []
  for (let c = r0; c <= r1; c += 0.5) candidates.push(c)
  candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
  const cut = candidates.find(valid)
  if (cut == null) throw new Error('STEP: no place to change the axis length')

  // Shortening: drop the bounds and faces inside the window
  let removedFaces = 0
  if (delta < 0) {
    const w = windowOf(cut)
    const removedByShell = new Map<number, Set<number>>()
    for (const f of faces) {
      const gone = f.bounds.filter((b) => b.edges.every((x) => inside(x, w)))
      if (gone.length === 0) continue
      if (gone.length === f.bounds.length) {
        removedFaces++
        const set = removedByShell.get(f.shell) ?? new Set<number>()
        set.add(f.id)
        removedByShell.set(f.shell, set)
      } else {
        const body = e.get(f.id)!
        const keep = f.bounds.filter((b) => !gone.includes(b)).map((b) => `#${b.id}`)
        e.set(f.id, replaceArg(body, 1, `(${keep.join(',')})`))
      }
    }
    for (const [shell, removed] of removedByShell) {
      const body = e.get(shell)!
      const keep = refList(args(body)[1]).filter((id) => !removed.has(id))
      e.set(shell, replaceArg(body, 1, `(${keep.map((id) => `#${id}`).join(',')})`))
    }
  }

  // Move the points beyond the cut; points used outside the stretched solids are copied first
  const inSolids = new Set<number>()
  for (const s of solids) for (const id of closure(file, s)) inSolids.add(id)
  const by = referrers(file)
  let nextId = Math.max(...e.keys()) + 1
  for (const id of inSolids) {
    const p = pointOf(e.get(id) ?? '')
    if (!p) continue
    const u = (p[k] - cut) * local.dir
    if (u <= 0) continue
    const moved: Vec3 = [...p]
    moved[k] = delta > 0 ? p[k] + local.dir * delta : u >= span ? p[k] - local.dir * span : cut
    const outside = (by.get(id) ?? []).filter((r) => !inSolids.has(r))
    if (outside.length > 0) {
      // keep the original for the other users, give the solid its own copy
      const copy = nextId++
      e.set(copy, pointBody(moved))
      for (const r of by.get(id) ?? [])
        if (inSolids.has(r)) e.set(r, e.get(r)!.replace(new RegExp(`#${id}(?!\\d)`, 'g'), `#${copy}`))
    } else e.set(id, pointBody(moved))
  }
  return { cut, removedFaces }
}

/** A frame on the axis after the length change: frames at the moving end (beyond the cut range) move along. */
export function stretchedOrigin(origin: Vec3, spec: StretchSpec, delta: number): Vec3 {
  const edge = spec.dir > 0 ? Math.max(...spec.range) : Math.min(...spec.range)
  if ((origin[spec.axis] - edge) * spec.dir <= 0) return origin
  const moved: Vec3 = [...origin]
  moved[spec.axis] += spec.dir * delta
  return moved
}

const directionOf = (body: string) => pointOf(body.replace(/^DIRECTION/, 'CARTESIAN_POINT'))!

/** Extent of a vertex loop's single vertex */
function closureEdge(file: StepFile, vertex: number, coord: (id: number) => number | undefined): Edge {
  const v = coord(refs(file.entities.get(vertex)!)[0]) ?? 0
  return { lo: v, hi: v, parallel: false }
}

/** Replaces the i-th top-level argument of an entity */
function replaceArg(body: string, i: number, value: string): string {
  const parts = args(body)
  parts[i] = value
  return `${body.slice(0, body.indexOf('('))}(${parts.join(',')})`
}
