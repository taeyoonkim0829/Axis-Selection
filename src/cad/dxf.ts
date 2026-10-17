import { dot, sub } from './geometry'
import type { Vec3 } from './step'

// 2D drawing from the tessellated assembly: front, top and right side view (third-angle projection) with the
// model edges (B-rep face borders) and silhouettes, hidden parts removed with a depth buffer.

export interface DrawMesh {
  /** world mm, xyz per vertex */
  positions: ArrayLike<number>
  index: ArrayLike<number>
  /** B-rep faces as triangle ranges (inclusive) */
  faces: { first: number; last: number }[]
}

export interface ViewDef {
  name: string
  right: Vec3
  up: Vec3
  /** towards the viewer */
  toViewer: Vec3
}

export const VIEWS: Record<'front' | 'top' | 'side', ViewDef> = {
  front: { name: 'FRONT', right: [1, 0, 0], up: [0, 0, 1], toViewer: [0, -1, 0] },
  top: { name: 'TOP', right: [1, 0, 0], up: [0, 1, 0], toViewer: [0, 0, 1] },
  side: { name: 'RIGHT', right: [0, 1, 0], up: [0, 0, 1], toViewer: [1, 0, 0] },
}

type Seg = [number, number, number, number]

interface Model {
  points: Float64Array
  /** edge vertex pairs and the triangles on each side */
  edges: { a: number; b: number; t1: number; t2: number; feature: boolean }[]
  triangles: Uint32Array
  normals: Float64Array
}

/** Angle between B-rep faces above which their common border is drawn; smaller ones are tangent edges. */
const FEATURE_ANGLE = (10 * Math.PI) / 180

export function buildModel(meshes: DrawMesh[]): Model {
  const ids = new Map<string, number>()
  const points: number[] = []
  const tris: number[] = []
  const faceOf: number[] = []
  let faceId = 0
  for (const m of meshes) {
    const local = new Map<number, number>()
    const vertex = (i: number) => {
      const cached = local.get(i)
      if (cached != null) return cached
      const p = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]
      const key = p.map((v) => Math.round(v * 1000)).join(',')
      let id = ids.get(key)
      if (id == null) {
        id = points.length / 3
        ids.set(key, id)
        points.push(...p)
      }
      local.set(i, id)
      return id
    }
    for (const f of m.faces) {
      for (let t = f.first; t <= f.last; t++) {
        tris.push(vertex(m.index[t * 3]), vertex(m.index[t * 3 + 1]), vertex(m.index[t * 3 + 2]))
        faceOf.push(faceId)
      }
      faceId++
    }
  }
  const p = new Float64Array(points)
  const triangles = new Uint32Array(tris)
  const count = triangles.length / 3
  const normals = new Float64Array(count * 3)
  for (let t = 0; t < count; t++) {
    const v = (j: number): Vec3 => {
      const i = triangles[t * 3 + j] * 3
      return [p[i], p[i + 1], p[i + 2]]
    }
    const a = sub(v(1), v(0))
    const b = sub(v(2), v(0))
    const n: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    const len = Math.hypot(...n) || 1
    normals.set([n[0] / len, n[1] / len, n[2] / len], t * 3)
  }
  const byKey = new Map<string, { a: number; b: number; tris: number[] }>()
  for (let t = 0; t < count; t++)
    for (let j = 0; j < 3; j++) {
      const a = triangles[t * 3 + j]
      const b = triangles[t * 3 + ((j + 1) % 3)]
      if (a === b) continue
      const key = a < b ? `${a},${b}` : `${b},${a}`
      const e = byKey.get(key)
      if (e) e.tris.push(t)
      else byKey.set(key, { a: Math.min(a, b), b: Math.max(a, b), tris: [t] })
    }
  const edges: Model['edges'] = []
  const cosFeature = Math.cos(FEATURE_ANGLE)
  for (const e of byKey.values()) {
    const [t1, t2 = -1] = e.tris
    let feature = e.tris.length !== 2
    if (!feature && faceOf[t1] !== faceOf[t2]) {
      const c = normals[t1 * 3] * normals[t2 * 3] + normals[t1 * 3 + 1] * normals[t2 * 3 + 1] + normals[t1 * 3 + 2] * normals[t2 * 3 + 2]
      feature = c < cosFeature
    }
    edges.push({ a: e.a, b: e.b, t1, t2, feature })
  }
  return { points: p, edges, triangles, normals }
}

/** Visible lines of one view, in view coordinates (right, up), mm. */
export function projectView(model: Model, view: ViewDef): Seg[] {
  const { points, triangles, normals } = model
  const n = points.length / 3
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const ds = new Float64Array(n)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]]
    xs[i] = dot(p, view.right)
    ys[i] = dot(p, view.up)
    ds[i] = dot(p, view.toViewer)
    minX = Math.min(minX, xs[i])
    maxX = Math.max(maxX, xs[i])
    minY = Math.min(minY, ys[i])
    maxY = Math.max(maxY, ys[i])
  }
  const size = Math.max(maxX - minX, maxY - minY)
  const px = Math.max(size / 2400, 0.05)
  const w = Math.ceil((maxX - minX) / px) + 3
  const h = Math.ceil((maxY - minY) / px) + 3
  const depth = new Float32Array(w * h).fill(-Infinity)
  const gx = (x: number) => (x - minX) / px + 1
  const gy = (y: number) => (y - minY) / px + 1

  // depth buffer: largest depth (nearest the viewer) per pixel centre
  for (let t = 0; t < triangles.length / 3; t++) {
    const [i0, i1, i2] = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]]
    const x0 = gx(xs[i0]), y0 = gy(ys[i0]), x1 = gx(xs[i1]), y1 = gy(ys[i1]), x2 = gx(xs[i2]), y2 = gy(ys[i2])
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-12) continue
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const xb = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)))
    const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const yb = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)))
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const cx = x + 0.5
        const cy = y + 0.5
        const l1 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area
        const l2 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area
        const l3 = 1 - l1 - l2
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
        const d = l1 * ds[i0] + l2 * ds[i1] + l3 * ds[i2]
        const k = y * w + x
        if (d > depth[k]) depth[k] = d
      }
  }
  const nearest = (x: number, y: number) => {
    // lowest of the 3×3 neighbourhood: an edge on a visible surface is never below all its neighbours
    const cx = Math.floor(gx(x))
    const cy = Math.floor(gy(y))
    let lo = Infinity
    for (let yy = cy - 1; yy <= cy + 1; yy++)
      for (let xx = cx - 1; xx <= cx + 1; xx++)
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) lo = Math.min(lo, depth[yy * w + xx])
    return lo
  }
  const eps = px * 2 + size * 1e-5
  // −1 back, 0 edge-on, +1 facing the viewer; an outline runs where this changes (rounded profile corners
  // meet the side faces tangentially, and a side face seen exactly edge-on is neither front nor back)
  const facing = (t: number) => {
    const c = normals[t * 3] * view.toViewer[0] + normals[t * 3 + 1] * view.toViewer[1] + normals[t * 3 + 2] * view.toViewer[2]
    return c > 1e-6 ? 1 : c < -1e-6 ? -1 : 0
  }

  const segs: Seg[] = []
  for (const e of model.edges) {
    const silhouette = e.t2 >= 0 && facing(e.t1) !== facing(e.t2)
    if (!e.feature && !silhouette) continue
    const ax = xs[e.a], ay = ys[e.a], bx = xs[e.b], by = ys[e.b]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 1e-6) continue
    const steps = Math.max(2, Math.ceil(len / (px * 0.7)))
    let runStart = -1
    for (let s = 0; s <= steps; s++) {
      const u = s / steps
      const x = ax + (bx - ax) * u
      const y = ay + (by - ay) * u
      const d = ds[e.a] + (ds[e.b] - ds[e.a]) * u
      const visible = d >= nearest(x, y) - eps
      if (visible && runStart < 0) runStart = s
      if ((!visible || s === steps) && runStart >= 0) {
        const end = visible ? s : s - 1
        if (end > runStart) {
          const u0 = runStart / steps
          const u1 = end / steps
          segs.push([ax + (bx - ax) * u0, ay + (by - ay) * u0, ax + (bx - ax) * u1, ay + (by - ay) * u1])
        }
        runStart = -1
      }
    }
  }
  return mergeCollinear(segs)
}

/** Joins chained segments that continue in the same direction (tessellated straight edges). */
function mergeCollinear(segs: Seg[]): Seg[] {
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`
  const at = new Map<string, number[]>()
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) at.set(k, [...(at.get(k) ?? []), i])
  })
  const used = new Uint8Array(segs.length)
  const out: Seg[] = []
  const dir = (s: Seg) => {
    const l = Math.hypot(s[2] - s[0], s[3] - s[1])
    return [(s[2] - s[0]) / l, (s[3] - s[1]) / l]
  }
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    let s: Seg = [...segs[i]]
    for (let grew = true; grew; ) {
      grew = false
      const [dx, dy] = dir(s)
      for (const end of [1, 0]) {
        const k = end ? key(s[2], s[3]) : key(s[0], s[1])
        for (const j of at.get(k) ?? []) {
          if (used[j]) continue
          const o = segs[j]
          const [ox, oy] = dir(o)
          if (Math.abs(dx * oy - dy * ox) > 1e-4) continue
          const oStartsHere = key(o[0], o[1]) === k
          const far: [number, number] = oStartsHere ? [o[2], o[3]] : [o[0], o[1]]
          const joint = end ? [s[2], s[3]] : [s[0], s[1]]
          const ahead = ((far[0] - joint[0]) * dx + (far[1] - joint[1]) * dy) * (end ? 1 : -1)
          if (ahead <= 1e-6) {
            // lying back over this one (two edges seen on the same line): a duplicate when it ends within it
            if (-ahead <= Math.hypot(s[2] - s[0], s[3] - s[1]) + 1e-6) used[j] = 1
            continue
          }
          used[j] = 1
          s = end ? [s[0], s[1], far[0], far[1]] : [far[0], far[1], s[2], s[3]]
          grew = true
          break
        }
      }
    }
    out.push(s)
  }
  return out
}

export interface DrawingInput {
  meshes: DrawMesh[]
  cog: Vec3 | null
  /** title lines (ASCII) */
  title: string[]
}

/** Lays out the three views with overall dimensions and the COG mark; returns DXF (R12) text. */
export function drawingDxf({ meshes, cog, title }: DrawingInput): string {
  const model = buildModel(meshes)
  const dxf = new DxfWriter()
  const views = [VIEWS.front, VIEWS.top, VIEWS.side].map((v) => ({ v, segs: projectView(model, v) }))
  const boxes = views.map(({ segs }) => bbox(segs))
  const size = Math.max(...boxes.map((b) => Math.max(b.x1 - b.x0, b.y1 - b.y0)))
  const gap = Math.max(60, size * 0.12)
  const text = Math.max(3.5, Math.round(size / 120))
  // third-angle: top view above the front view, right side view to its right
  const [front, top, side] = boxes
  const offsets: [number, number][] = [
    [-front.x0, -front.y0],
    [-front.x0, front.y1 - front.y0 + gap - top.y0],
    [front.x1 - front.x0 + gap - side.x0, -front.y0],
  ]
  views.forEach(({ v, segs }, i) => {
    const [ox, oy] = offsets[i]
    for (const s of segs) dxf.line('OUTLINE', s[0] + ox, s[1] + oy, s[2] + ox, s[3] + oy)
    const b = boxes[i]
    const box = { x0: b.x0 + ox, y0: b.y0 + oy, x1: b.x1 + ox, y1: b.y1 + oy }
    dxf.dimension(box.x0, box.y0, box.x1, box.y0, -gap * 0.35, text)
    dxf.dimension(box.x0, box.y0, box.x0, box.y1, gap * 0.35, text)
    dxf.text('TEXT', (box.x0 + box.x1) / 2, box.y0 - gap * 0.7, text, v.name, true)
    if (cog) {
      const x = dot(cog, v.right) + ox
      const y = dot(cog, v.up) + oy
      const r = text * 1.2
      dxf.circle('COG', x, y, r)
      dxf.line('COG', x - r * 1.8, y, x + r * 1.8, y)
      dxf.line('COG', x, y - r * 1.8, x, y + r * 1.8)
      dxf.text('COG', x + r * 2, y + r * 0.6, text * 0.8, 'COG')
    }
  })
  title.forEach((line, i) => dxf.text('TEXT', 0, -gap * 1.4 - i * text * 1.8, text, line))
  return dxf.toString()
}

const bbox = (segs: Seg[]) => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const s of segs) {
    b.x0 = Math.min(b.x0, s[0], s[2])
    b.x1 = Math.max(b.x1, s[0], s[2])
    b.y0 = Math.min(b.y0, s[1], s[3])
    b.y1 = Math.max(b.y1, s[1], s[3])
  }
  return b
}

const LAYERS: [string, number][] = [
  ['OUTLINE', 7],
  ['DIM', 3],
  ['COG', 1],
  ['TEXT', 7],
]

class DxfWriter {
  private out: string[] = []
  private put(...pairs: (string | number)[]) {
    for (let i = 0; i < pairs.length; i += 2) this.out.push(String(pairs[i]), typeof pairs[i + 1] === 'number' ? fix(pairs[i + 1] as number) : String(pairs[i + 1]))
  }
  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.put(0, 'LINE', 8, layer, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0)
  }
  circle(layer: string, x: number, y: number, r: number) {
    this.put(0, 'CIRCLE', 8, layer, 10, x, 20, y, 30, 0, 40, r)
  }
  text(layer: string, x: number, y: number, height: number, value: string, centred = false) {
    this.put(0, 'TEXT', 8, layer, 10, x, 20, y, 30, 0, 40, height, 1, value.replace(/[^\x20-\x7e]/g, '?'))
    if (centred) this.put(72, '1', 11, x, 21, y, 31, 0)
  }
  /** Linear dimension between two points, drawn as lines and text, offset perpendicular to it */
  dimension(x1: number, y1: number, x2: number, y2: number, offset: number, height: number) {
    const horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1)
    const value = Math.hypot(x2 - x1, y2 - y1)
    const tick = height * 0.6
    if (horizontal) {
      const y = y1 + offset
      this.line('DIM', x1, y1, x1, y + Math.sign(offset) * tick)
      this.line('DIM', x2, y2, x2, y + Math.sign(offset) * tick)
      this.line('DIM', x1, y, x2, y)
      for (const x of [x1, x2]) this.line('DIM', x - tick / 2, y - tick / 2, x + tick / 2, y + tick / 2)
      this.text('DIM', (x1 + x2) / 2, y + height * 0.4, height, fix(value, 1), true)
    } else {
      const x = x1 - offset
      this.line('DIM', x1, y1, x - Math.sign(offset) * tick, y1)
      this.line('DIM', x2, y2, x - Math.sign(offset) * tick, y2)
      this.line('DIM', x, y1, x, y2)
      for (const y of [y1, y2]) this.line('DIM', x - tick / 2, y - tick / 2, x + tick / 2, y + tick / 2)
      this.put(0, 'TEXT', 8, 'DIM', 10, x - height * 0.4, 20, (y1 + y2) / 2, 30, 0, 40, height, 1, fix(value, 1), 50, 90, 72, '1', 11, x - height * 0.4, 21, (y1 + y2) / 2, 31, 0)
    }
  }
  toString() {
    const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC']
    const tables = [
      '0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LTYPE', '70', '1',
      '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
      '0', 'ENDTAB',
      '0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length),
      ...LAYERS.flatMap(([name, color]) => ['0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS']),
      '0', 'ENDTAB',
      '0', 'ENDSEC',
    ]
    return [...head, ...tables, '0', 'SECTION', '2', 'ENTITIES', ...this.out, '0', 'ENDSEC', '0', 'EOF', ''].join('\n')
  }
}

const fix = (v: number, digits = 4) => String(Number(v.toFixed(digits)))
