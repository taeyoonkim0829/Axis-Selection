// Gantry kits: the Festo part joining a carried axis's profile to the slide of the axis below it (EHAM angle and
// adapter kits, EAHF-E24 profile mountings), from the axis data sheets' combination tables (data/adapters).
import type { Axis, AxisAdapter, AdapterAxis } from '../data/types'
import { axisMounting, slideFrame, type GantryAxis, type GantryInputs, type Vec } from './gantry'
import type { Status } from './types'

/** One joint of the gantry: `carried` sits on the slide(s) of `base` */
export interface GantryJoint {
  base: GantryAxis
  carried: GantryAxis
  /** the geometry the mountings need: angle (slides facing across each other), plate (facing the same way) */
  kind: 'angle' | 'plate' | null
  /** the kit on the first base slide (`kits[0]`) */
  kit: AxisAdapter | null
  /** one kit per base slide (two X axes carry the Y axis at both ends), in slide order (first axis at −l); angle
   *  kits take the hand whose wall reaches towards the carried axis (`kitHand`), so two X axes get a mirrored pair */
  kits: AxisAdapter[]
  quantity: number
  /** world mm from the base axis's (arrangement) centre: the carried axis's mounting point (profile centre) and
   *  the kits' centre. With one angle kit the carried axis lies along the bracket as the assembly instructions
   *  show (`aligned`: its end at the kit's `carriedEnd`, the entered offset only picks the side), else at the
   *  entered offset; the kits sit on the base slide(s) */
  offset: Vec
  kitAt: Vec
  aligned: boolean
  /** two base slides, aligned: the carried axis's end at the first bracket; how far its other end lies beyond the
   *  second bracket's position (mm, negative: short of it) and the base spacing that puts both ends at their
   *  brackets */
  span?: { mismatch: number; spacing: number }
  status: Status
  /** Korean source text with `{name}` placeholders */
  note: string
  noteArgs?: Record<string, string | number>
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * Lateral positions (mm along the base slide's l, from the arrangement centre) of the base axis members carrying
 * the next axis: two X axes at ∓spacing/2, an X axis with LM guides where the layout puts the axis, else 0.
 */
function baseSlides(g: GantryInputs, base: GantryAxis): number[] {
  const p = g.xParallel
  if (base !== 'x' || p.mode === 'single' || !(p.spacing > 0)) return [0]
  if (p.mode === 'guides') return [p.guideCount === 2 ? (p.guideAxisEdge ? -p.spacing : 0) : -p.spacing / 2]
  return [-p.spacing / 2, p.spacing / 2]
}

/**
 * The hand of an angle kit on a base slide at lateral position `at`. The mirror-image versions differ in the side
 * the wall reaches to from the foot on the base slide (EHAM-AK assembly instructions, product variants): seen
 * facing the carried slide, …-ML reaches to the right (along n_base × n_carried), …-MR to the left. The wall goes
 * towards the carried axis's mounting point (between two X axes: inwards); on the slide itself, left.
 */
export function kitHand(g: GantryInputs, base: GantryAxis, carried: GantryAxis, at: number): 'left' | 'right' {
  const b = slideFrame(base, axisMounting(g, base))
  const c = slideFrame(carried, axisMounting(g, carried))
  const o = carried === 'z' ? g.offsets.yz : g.offsets.xy
  const towards = dot([o.x, o.y, o.z], c.t) - at * dot(b.l, c.t)
  const left = dot(cross(b.n, c.n), c.t)
  if (Math.abs(towards) < 1e-6) return 'left'
  return towards * left > 0 ? 'left' : 'right'
}

/**
 * The joint geometry for the two mountings: plate when both slides face the same way (Y on X floor-on-floor, Z on a
 * wall-mounted Y), angle when the carried slide faces across the base slide's normal and the carried axis travels
 * across that normal (X on the floor, Y on its side); else null (Z on a floor-mounted Y needs a custom bracket).
 */
export function jointKind(g: GantryInputs, base: GantryAxis, carried: GantryAxis): GantryJoint['kind'] {
  const b = slideFrame(base, axisMounting(g, base))
  const c = slideFrame(carried, axisMounting(g, carried))
  if (dot(b.n, c.n) > 0.99) return 'plate'
  if (Math.abs(dot(b.n, c.n)) < 1e-6 && Math.abs(dot(b.n, c.t)) < 1e-6) return 'angle'
  return null
}

const fits = (list: AdapterAxis[], axis: Axis) =>
  list.find(
    // variant: "" or null for the standard version
    (x) => x.family === axis.family && (x.variant || null) === (axis.variant || null) && x.size === axis.size && x.drive === axis.drive,
  )

/**
 * Where the carried axis and the kits sit (see `GantryJoint.offset`). `length` (mm, overall length of the carried
 * axis) null when unknown: the carried axis then stays at the entered offset.
 */
function placement(
  g: GantryInputs,
  base: GantryAxis,
  carried: GantryAxis,
  kits: AxisAdapter[],
  slides: number[],
  length: number | null,
): Pick<GantryJoint, 'offset' | 'kitAt' | 'aligned' | 'span'> & { short?: boolean } {
  const b = slideFrame(base, axisMounting(g, base))
  const c = slideFrame(carried, axisMounting(g, carried))
  const o = carried === 'z' ? g.offsets.yz : g.offsets.xy
  const v = [o.x, o.y, o.z]
  const along = dot(v, c.t)
  const at = slides.reduce((s, x) => s + x, 0) / slides.length
  const across = v.map((x, i) => x - along * c.t[i])
  const vec = (w: number[]): Vec => ({ x: w[0] + 0, y: w[1] + 0, z: w[2] + 0 })
  const kitAt = vec(across.map((x, i) => x + at * b.l[i]))
  if (!length || !kits.length || kits.some((k) => !k.hand || k.carriedEnd == null)) return { offset: o, kitAt, aligned: false }
  // the wall's reach along the carried travel and the foot's position on it; the carried axis's end at carriedEnd
  // from the foot, its body beyond (two base slides: at the first one's bracket, reaching inwards)
  const reach = (k: AxisAdapter) => (k.hand === 'left' ? 1 : -1) * Math.sign(dot(cross(b.n, c.n), c.t))
  const foot = (i: number) => slides[i] * dot(b.l, c.t)
  const r0 = reach(kits[0])
  const centre = foot(0) + r0 * (kits[0].carriedEnd! + length / 2)
  const offset = vec(across.map((x, i) => x + centre * c.t[i]))
  if (kits.length < 2) return { offset, kitAt, aligned: true }
  // the other end against the second bracket's position for it
  const end = centre + (r0 * length) / 2
  const mismatch = r0 * (end - (foot(1) + reach(kits[1]) * kits[1].carriedEnd!))
  const spacing = Math.abs(slides[1] - slides[0]) + mismatch
  return { offset, kitAt, aligned: true, span: { mismatch, spacing }, short: r0 * (end - foot(1)) < 0 }
}

/**
 * The kit for a joint: the data's kits of that geometry fitting both axes, the one for the carried stroke first, the
 * left-hand version of mirror-image pairs. Warns when the base axis needs the long slide, the carried stroke is out
 * of the kit's range, or no kit fits.
 */
export function gantryJoint(
  g: GantryInputs,
  base: GantryAxis,
  carried: GantryAxis,
  baseAxis: Axis,
  carriedAxis: Axis,
  carriedStroke: number,
  adapters: AxisAdapter[],
  carriedLength: number | null = null,
): GantryJoint {
  const slides = baseSlides(g, base)
  const joint = pickJoint(g, base, carried, baseAxis, carriedAxis, carriedStroke, adapters, slides)
  const { short, ...place } = placement(g, base, carried, joint.kits, slides, carriedLength)
  // the carried axis not reaching the second base slide hangs on one bracket only
  if (short && joint.status === 'ok')
    return {
      ...joint,
      ...place,
      status: 'warn',
      note: '{axis}축이 두 번째 {base}축의 브래킷까지 닿지 않습니다. {base}축 간격을 {spacing} mm로 하면 양 끝이 브래킷 끝에 맞습니다.',
      noteArgs: { axis: carried.toUpperCase(), base: base.toUpperCase(), spacing: Math.round(place.span!.spacing * 10) / 10 },
    }
  return { ...joint, ...place }
}

function pickJoint(
  g: GantryInputs,
  base: GantryAxis,
  carried: GantryAxis,
  baseAxis: Axis,
  carriedAxis: Axis,
  carriedStroke: number,
  adapters: AxisAdapter[],
  slides: number[],
): Omit<GantryJoint, 'offset' | 'kitAt' | 'aligned'> {
  const quantity = slides.length
  const pair = `${base.toUpperCase()}–${carried.toUpperCase()}`
  if (carried === 'z' && g.zMode === 'profile')
    return { base, carried, kind: null, kit: null, kits: [], quantity, status: 'warn', note: '프로파일 이동형 Z축용 조합 키트 데이터가 없습니다. 장착 부품을 별도로 준비하세요.' }
  const kind = jointKind(g, base, carried)
  if (!kind)
    return {
      base,
      carried,
      kind,
      kit: null,
      kits: [],
      quantity,
      status: 'warn',
      note: '{pair}: 이 설치 방향 조합에 맞는 Festo 조합 키트가 없습니다. 장착 브래킷을 별도로 설계하세요.',
      noteArgs: { pair },
    }
  const inRange = (k: AxisAdapter) => !k.carriedStroke || (carriedStroke >= k.carriedStroke[0] && carriedStroke <= k.carriedStroke[1])
  const candidates = adapters
    .filter((k) => k.joint === kind && fits(k.base, baseAxis) && fits(k.carried, carriedAxis))
    .sort((a, b) => Number(inRange(b)) - Number(inRange(a)) || Number(b.hand !== 'right') - Number(a.hand !== 'right'))
  // the same kit in the hand each slide needs (the mirror image, when the data has it)
  const kits = candidates.length
    ? slides.map((at) => {
        const k = candidates[0]
        if (!k.hand) return k
        const hand = kitHand(g, base, carried, at)
        return candidates.find((x) => x.hand === hand && x.model.replace(/-M[LR]/, '') === k.model.replace(/-M[LR]/, '')) ?? k
      })
    : []
  const kit = kits[0] ?? null
  if (!kit)
    return {
      base,
      carried,
      kind,
      kit,
      kits,
      quantity,
      status: 'warn',
      note: '{pair}: {base} → {carried} 조합의 Festo 조합 키트가 데이터에 없습니다. 장착 부품을 별도로 준비하세요.',
      noteArgs: { pair, base: `${baseAxis.family}-${baseAxis.variant ? `${baseAxis.variant}-` : ''}${baseAxis.size}`, carried: `${carriedAxis.family}-${carriedAxis.variant ? `${carriedAxis.variant}-` : ''}${carriedAxis.size}` },
    }
  if (fits(kit.base, baseAxis)?.longSlide && !baseAxis.longSlide)
    return { base, carried, kind, kit, kits, quantity, status: 'warn', note: '{kit}: {axis}축은 롱 슬라이드(-L) 축이어야 합니다.', noteArgs: { kit: kit.model, axis: base.toUpperCase() } }
  if (!inRange(kit))
    return {
      base,
      carried,
      kind,
      kit,
      kits,
      quantity,
      status: 'warn',
      note: '{kit}: {axis}축 스트로크 {stroke} mm가 키트 범위 {min} … {max} mm를 벗어납니다.',
      noteArgs: { kit: kit.model, axis: carried.toUpperCase(), stroke: carriedStroke, min: kit.carriedStroke![0], max: kit.carriedStroke![1] },
    }
  return { base, carried, kind, kit, kits, quantity, status: 'ok', note: '{kit}', noteArgs: { kit: kitList(kits) } }
}

/** The kits of a joint as one line: `EHAM-AK-…-ML × 2`, or both hands `…-ML × 1 · …-MR × 1` */
export function kitList(kits: AxisAdapter[], partNumbers = false): string {
  const count = new Map<AxisAdapter, number>()
  for (const k of kits) {
    const same = [...count.keys()].find((x) => x.model === k.model) ?? k
    count.set(same, (count.get(same) ?? 0) + 1)
  }
  return [...count].map(([k, n]) => `${k.model}${partNumbers ? ` (${k.partNumber})` : ''} × ${n}`).join(' · ')
}
