// Gantry kits: the Festo part joining a carried axis's profile to the slide of the axis below it (EHAM angle and
// adapter kits, EAHF-E24 profile mountings), from the axis data sheets' combination tables (data/adapters).
import type { Axis, AxisAdapter, AdapterAxis } from '../data/types'
import { axisMounting, slideFrame, type GantryAxis, type GantryInputs } from './gantry'
import type { Status } from './types'

/** One joint of the gantry: `carried` sits on the slide(s) of `base` */
export interface GantryJoint {
  base: GantryAxis
  carried: GantryAxis
  /** the geometry the mountings need: angle (slides facing across each other), plate (facing the same way) */
  kind: 'angle' | 'plate' | null
  kit: AxisAdapter | null
  /** kits needed: one per base slide (two X axes carry the Y axis at both ends) */
  quantity: number
  status: Status
  /** Korean source text with `{name}` placeholders */
  note: string
  noteArgs?: Record<string, string | number>
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

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
): GantryJoint {
  const quantity = base === 'x' && (g.xParallel.mode === 'twinMotor' || g.xParallel.mode === 'twinShaft') ? 2 : 1
  const pair = `${base.toUpperCase()}–${carried.toUpperCase()}`
  if (carried === 'z' && g.zMode === 'profile')
    return { base, carried, kind: null, kit: null, quantity, status: 'warn', note: '프로파일 이동형 Z축용 조합 키트 데이터가 없습니다. 장착 부품을 별도로 준비하세요.' }
  const kind = jointKind(g, base, carried)
  if (!kind)
    return {
      base,
      carried,
      kind,
      kit: null,
      quantity,
      status: 'warn',
      note: '{pair}: 이 설치 방향 조합에 맞는 Festo 조합 키트가 없습니다. 장착 브래킷을 별도로 설계하세요.',
      noteArgs: { pair },
    }
  const inRange = (k: AxisAdapter) => !k.carriedStroke || (carriedStroke >= k.carriedStroke[0] && carriedStroke <= k.carriedStroke[1])
  const candidates = adapters
    .filter((k) => k.joint === kind && fits(k.base, baseAxis) && fits(k.carried, carriedAxis))
    .sort((a, b) => Number(inRange(b)) - Number(inRange(a)) || Number(b.hand !== 'right') - Number(a.hand !== 'right'))
  const kit = candidates[0] ?? null
  if (!kit)
    return {
      base,
      carried,
      kind,
      kit,
      quantity,
      status: 'warn',
      note: '{pair}: {base} → {carried} 조합의 Festo 조합 키트가 데이터에 없습니다. 장착 부품을 별도로 준비하세요.',
      noteArgs: { pair, base: `${baseAxis.family}-${baseAxis.variant ? `${baseAxis.variant}-` : ''}${baseAxis.size}`, carried: `${carriedAxis.family}-${carriedAxis.variant ? `${carriedAxis.variant}-` : ''}${carriedAxis.size}` },
    }
  if (fits(kit.base, baseAxis)?.longSlide && !baseAxis.longSlide)
    return { base, carried, kind, kit, quantity, status: 'warn', note: '{kit}: {axis}축은 롱 슬라이드(-L) 축이어야 합니다.', noteArgs: { kit: kit.model, axis: base.toUpperCase() } }
  if (!inRange(kit))
    return {
      base,
      carried,
      kind,
      kit,
      quantity,
      status: 'warn',
      note: '{kit}: {axis}축 스트로크 {stroke} mm가 키트 범위 {min} … {max} mm를 벗어납니다.',
      noteArgs: { kit: kit.model, axis: carried.toUpperCase(), stroke: carriedStroke, min: kit.carriedStroke![0], max: kit.carriedStroke![1] },
    }
  return { base, carried, kind, kit, quantity, status: 'ok', note: '{kit} × {n}', noteArgs: { kit: kit.model, n: quantity } }
}
