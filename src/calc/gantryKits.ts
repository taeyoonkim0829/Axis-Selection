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
  /** world mm from the base axis's (arrangement) centre: the carried axis's mounting point (body centre) and the
   *  kits' centre. With kit fit data the carried axis sits where the kit holds it (`aligned`, `placement`), else
   *  at the entered offset; the kits sit on the base slide(s) */
  offset: Vec
  kitAt: Vec
  aligned: boolean
  /** the kit's pins and screws hold the carried axis at its drive end (ELGT): `flange` is the drive flange's
   *  position along the carried travel (world mm from the base centre), `driveSign` the end the drive is at (+1:
   *  +t, as the calc otherwise assumes; −1 when the kit puts it at −t) */
  pinned: boolean
  flange: number | null
  driveSign: 1 | -1
  /** two base slides: the carried axis is held at the first; `mismatch` (mm) is how far the second kit misses its
   *  place on it (pinned: its screws against the profile's threaded bores, modulo their pitch; clamped: the far end
   *  against the second bracket's end position); `spacing` the base spacing that fits (nearest the entered one, the
   *  kits clear of each other, the carried axis reaching the second kit; null when none), `clear` the smallest base
   *  spacing at which the two kits' walls do not collide */
  span?: { mismatch: number; spacing: number | null; clear: number }
  /** two base slides: the kits' walls reaching towards each other overlap at this spacing */
  interference: boolean
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
 * Where the carried axis and the kits sit (see `GantryJoint.offset`), from the kit's fit for the carried axis
 * (`AdapterAxis.end`, assembly instructions): along the body direction from the first base slide (angle kits: the
 * wall's reach; plates: from the drive end at +t, as the calc takes it) the near end at `end`, the body beyond. A
 * pinned axis has its drive there. `length` (mm, drive flange to far end) null when unknown: the carried axis then
 * stays at the entered offset.
 */
function placement(
  g: GantryInputs,
  base: GantryAxis,
  carried: GantryAxis,
  carriedAxis: Axis,
  kits: AxisAdapter[],
  slides: number[],
  length: number | null,
): Pick<GantryJoint, 'offset' | 'kitAt' | 'aligned' | 'pinned' | 'flange' | 'driveSign' | 'span' | 'interference'> & { short?: boolean } {
  const b = slideFrame(base, axisMounting(g, base))
  const c = slideFrame(carried, axisMounting(g, carried))
  const o = carried === 'z' ? g.offsets.yz : g.offsets.xy
  const v = [o.x, o.y, o.z]
  const along = dot(v, c.t)
  const at = slides.reduce((s, x) => s + x, 0) / slides.length
  const across = v.map((x, i) => x - along * c.t[i])
  const vec = (w: number[]): Vec => ({ x: w[0] + 0, y: w[1] + 0, z: w[2] + 0 })
  const kitAt = vec(across.map((x, i) => x + at * b.l[i]))
  const fit = kits.length ? fits(kits[0].carried, carriedAxis) : undefined
  const free = { offset: o, kitAt, aligned: false, pinned: false, flange: null, driveSign: 1 as const, interference: false }
  if (!length || !fit || fit.end == null || (kits[0].joint === 'angle' && kits.some((k) => !k.hand))) return free
  // the body's direction along the carried travel (angle kits: the wall's reach), the foot's position on it
  const body = (k: AxisAdapter) => (k.joint === 'plate' ? -1 : (k.hand === 'left' ? 1 : -1) * Math.sign(dot(cross(b.n, c.n), c.t)))
  const foot = (i: number) => slides[i] * dot(b.l, c.t)
  const r0 = body(kits[0])
  const near = foot(0) + r0 * fit.end
  const centre = near + (r0 * length) / 2
  const pinned = !!fit.pinned
  const placed = {
    offset: vec(across.map((x, i) => x + centre * c.t[i])),
    kitAt,
    aligned: true,
    pinned,
    flange: pinned ? near : null,
    // pinned: the drive end is the near one, opposite the body
    driveSign: (pinned ? -r0 : 1) as 1 | -1,
    interference: false,
  }
  if (kits.length < 2) return placed
  const d = r0 * (foot(1) - foot(0))
  const spacing = Math.abs(slides[1] - slides[0])
  // the mirrored walls reach towards each other: they collide below twice their reach (2 mm clearance)
  const clear = 2 * Math.max(...kits.map((k) => k.wall?.[1] ?? 0)) + 2
  const interference = spacing < clear
  if (pinned && fit.threads && fit.screws) {
    // the second kit (mirrored) only screws on: its screws at d − a, the profile's bores at end + first + k·pitch
    // (the first kit's screws sit on them, so a ≡ end + first): d ≡ 2·(end + first) modulo the pitch
    const { first, pitch } = fit.threads
    const target = 2 * (fit.end + first)
    const mismatch = ((((d - target) % pitch) + pitch * 1.5) % pitch) - pitch / 2
    // the profile has to reach past the second kit's farthest screw: d ≤ end + length + nearest screw − 5
    const reaches = (x: number) => fit.end! + length >= x - fit.screws![0] + 5
    let fitting: number | null = null
    for (let k = Math.ceil((clear - target) / pitch); target + k * pitch <= fit.end + length + fit.screws[0] - 5; k++) {
      const x = target + k * pitch
      if (x >= clear && reaches(x) && (fitting == null || Math.abs(x - spacing) < Math.abs(fitting - spacing))) fitting = x
    }
    return { ...placed, span: { mismatch, spacing: fitting, clear }, interference, short: !reaches(d) || Math.abs(mismatch) > 0.5 }
  }
  // clamped: the far end against the second bracket's position for it (both ends at their brackets)
  const ideal = 2 * fit.end + length
  return {
    ...placed,
    span: { mismatch: ideal - spacing, spacing: ideal >= clear ? ideal : null, clear },
    interference,
    short: fit.end + length < d,
  }
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
  const { short, ...place } = placement(g, base, carried, carriedAxis, joint.kits, slides, carriedLength)
  const span = place.span
  const args = {
    axis: carried.toUpperCase(),
    base: base.toUpperCase(),
    spacing: Math.round((span?.spacing ?? 0) * 10) / 10,
    clear: Math.round((span?.clear ?? 0) * 10) / 10,
  }
  const warn = (note: string) => ({ ...joint, ...place, status: 'warn' as const, note, noteArgs: args })
  if (joint.status === 'ok' && span) {
    // the kits colliding, then the second kit off the carried axis's bores or the carried axis not reaching it
    if (span.spacing == null)
      return warn(
        place.interference
          ? '두 {base}축의 조합 키트가 서로 겹칩니다(간섭). {base}축 간격은 {clear} mm 이상이어야 하는데 그 간격에서는 {axis}축이 두 번째 키트에 맞게 닿지 않습니다. 더 긴 {axis}축 스트로크가 필요합니다.'
          : '{axis}축이 짧아 두 번째 {base}축 키트에 맞는 간격이 없습니다. 더 긴 {axis}축 스트로크가 필요합니다.',
      )
    if (place.interference) return warn('두 {base}축의 조합 키트가 서로 겹칩니다(간섭). {base}축 간격을 {spacing} mm로 하면 겹치지 않고 맞습니다.')
    if (short)
      return warn(
        place.pinned
          ? '두 번째 {base}축 키트의 볼트가 {axis}축 나사 구멍에 맞지 않거나 {axis}축이 닿지 않습니다. {base}축 간격을 {spacing} mm로 하면 맞습니다.'
          : '{axis}축이 두 번째 {base}축의 브래킷까지 닿지 않습니다. {base}축 간격을 {spacing} mm로 하면 양 끝이 브래킷 끝에 맞습니다.',
      )
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
): Omit<GantryJoint, 'offset' | 'kitAt' | 'aligned' | 'pinned' | 'flange' | 'driveSign' | 'interference'> {
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
    // Festo kits only: custom brackets (made to order) are listed by `beamBrackets`
    .filter((k) => !k.custom && k.joint === kind && fits(k.base, baseAxis) && fits(k.carried, carriedAxis))
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

/**
 * Custom cross beams (data/adapters/Custom, `joint: 'beam'`) carrying a Z axis across two X axes of the given type
 * (XZ: the beam bolted between two Festo angle kits in place of the carried ELGT profile, the Z axis on a Festo
 * EHAM-MA plate). The app has no XZ arrangement yet, so the gantry joint never picks one; this lists them.
 */
export function beamBrackets(xAxis: Axis, zAxis: Axis | null, adapters: AxisAdapter[]): AxisAdapter[] {
  return adapters.filter((k) => k.custom && k.joint === 'beam' && !!fits(k.base, xAxis) && (!zAxis || !!fits(k.carried, zAxis)))
}

/** The kits of a joint as one line: `EHAM-AK-…-ML × 2`, or both hands `…-ML × 1 · …-MR × 1` */
export function kitList(kits: AxisAdapter[], partNumbers = false): string {
  const count = new Map<AxisAdapter, number>()
  for (const k of kits) {
    const same = [...count.keys()].find((x) => x.model === k.model) ?? k
    count.set(same, (count.get(same) ?? 0) + 1)
  }
  return [...count].map(([k, n]) => `${k.model}${partNumbers ? ` (${k.partNumber ?? '주문 제작'})` : ''} × ${n}`).join(' · ')
}
