// Axis sizing: motion profile, required force/torque at the axis drive shaft,
// guide load comparison value, deflection and life. Motor-independent.
import type { Axis } from '../data/types'
import { dwellPhase, moveProfile, samplePhases, type MoveProfile, type Phase } from './motionProfile'
import { check, verticalForward, worstStatus, type Check, type Requirements, type Settings, type Status } from './types'

export const G = 9.81
/** N/mm², aluminium profile (Excel deflection sheet) */
const YOUNGS_MODULUS = 70000
/** Reference distance of the guide load comparison value [km] */
const GUIDE_REFERENCE_LIFE_KM = 5000
/** Ball screw life below this is shown in red [km] */
export const SCREW_LIFE_MIN_KM = 5000

export interface AxisSample {
  /** m/s, signed (+ = forward; vertical: see `verticalForward`) */
  v: number
  /** m/s² */
  a: number
  dir: 1 | -1 | 0
  dt: number
  move: number
  /** rad/s and rad/s² at the axis drive shaft */
  omega: number
  alpha: number
  /** Nm at the axis drive shaft, before drive efficiency */
  torque: number
  /** N the drive must apply to the slide */
  force: number
  /** N, process force from pressing (`Phase.load`) */
  load: number
}

/** Drive-shaft load for one kinematic state */
export type DriveState = Pick<AxisSample, 'omega' | 'alpha' | 'torque' | 'force'>

export interface InfoItem {
  label: string
  value: number
  unit: string
  /** Korean source text with `{name}` placeholders filled from `noteArgs` */
  note?: string
  noteArgs?: Record<string, string | number>
  /** shown in red (ball screw life under SCREW_LIFE_MIN_KM) */
  alert?: boolean
}

export interface AxisEvaluation {
  axis: Axis
  /** Model and order number for the required stroke */
  order: AxisOrder
  status: Status
  checks: Check[]
  info: InfoItem[]
  /** Forward move (vertical: up, or down when pressing top-down); with pressing the approach move (the press move when there is none) */
  profile: MoveProfile
  /** Return move */
  backProfile: MoveProfile
  /** Press move and hold at the end of the forward move; null without pressing */
  press: { profile: MoveProfile; distance: number; force: number; holdTime: number } | null
  /** The cycle: forward (approach, press, hold), return, then one dwell */
  cyclePhases: Phase[]
  /** One move with the dwell at its end, for the forward / return views */
  forwardPhases: Phase[]
  backPhases: Phase[]
  /** m/s, highest velocity of the cycle */
  peakVelocity: number
  /** Drive-shaft load at velocity v [m/s] and acceleration a [m/s²] while moving in direction dir, with process force load [N] */
  driveAt: (v: number, a: number, dir: 1 | -1 | 0, load?: number) => DriveState
  cycleTime: number
  /** payload + slide, kg */
  movingMass: number
  /** mm per revolution of the axis drive shaft */
  feed: number
  efficiency: number
  /** kg·cm² at the axis drive shaft (Festo J0 + JH·stroke + JL·payload) */
  inertia: number
  samples: AxisSample[]
  guideFv: number
  axisMass: number
}

/** What to order for an axis and a required stroke. */
export interface AxisOrder {
  /** Type code with the ordered stroke filled in (ESBF), else the data model name */
  model: string
  partNumber: string | null
  /** mm, the ordered stroke; null when the axis is not ordered by stroke here */
  stroke: number | null
  /** true when no standard stroke fits and the stroke is configured (modular product system) */
  modular: boolean
}

/**
 * ESBF comes in standard strokes with their own order numbers: the required stroke is rounded up to the
 * next one. Longer strokes are configured in the modular product system (stroke rounded up to a whole mm,
 * ordered by module number). Other axes keep their data model name.
 */
export function axisOrder(axis: Axis, stroke: number): AxisOrder {
  if (!axis.strokePartNumbers) return { model: axis.model, partNumber: null, stroke: null, modular: false }
  const standard = Object.keys(axis.strokePartNumbers)
    .map(Number)
    .sort((a, b) => a - b)
    .find((s) => s >= stroke)
  const ordered = standard ?? Math.ceil(stroke)
  return {
    model: axis.model.replace('…', String(ordered)),
    partNumber: standard != null ? axis.strokePartNumbers[String(standard)] : (axis.moduleNumber ?? null),
    stroke: ordered,
    modular: standard == null,
  }
}

export function axisFeed(axis: Axis): number | null {
  if (axis.drive === 'spindle') return axis.spindlePitch
  return axis.feedConstant ?? (axis.pulleyDiameter ? Math.PI * axis.pulleyDiameter : null)
}

export function axisMass(axis: Axis, stroke: number): number {
  return axis.baseMass + (axis.massPer10mm * stroke) / 10
}

/** Ball screw load factor fw by speed (Excel "Ball Screw 수명계산"). */
export function screwLoadFactor(v: number): number {
  if (v <= 0.25) return 1.2
  if (v <= 1) return 1.5
  if (v <= 2) return 2
  return 3.5
}

/** Linear interpolation in a [x, y] curve, clamped to its ends. */
export function curveAt(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return curve[curve.length - 1][1]
}

export interface GuideLoads {
  Fy: number
  Fz: number
  Mx: number
  My: number
  Mz: number
}

/** Static + inertial guide loads from the payload centre of gravity (N, Nm). */
export function guideLoads(req: Requirements, mass: number, accel: number): GuideLoads {
  const x = Math.abs(req.cog.x) / 1000
  const y = Math.abs(req.cog.y) / 1000
  const z = Math.abs(req.cog.z) / 1000
  const weight = mass * G
  const inertial = mass * accel
  switch (req.mounting) {
    case 'floor':
      return { Fy: 0, Fz: weight, Mx: y * weight, My: x * weight + z * inertial, Mz: y * inertial }
    case 'wall':
      return { Fy: weight, Fz: 0, Mx: z * weight, My: z * inertial, Mz: y * inertial + x * weight }
    case 'vertical': {
      const axial = weight + inertial
      return { Fy: 0, Fz: 0, Mx: 0, My: z * axial, Mz: y * axial }
    }
  }
}

export function guideComparisonValue(loads: GuideLoads, axis: Axis): { fv: number; missing: string[] } {
  const pairs: [keyof GuideLoads, number | null][] = [
    ['Fy', axis.FyMax],
    ['Fz', axis.FzMax],
    ['Mx', axis.MxMax],
    ['My', axis.MyMax],
    ['Mz', axis.MzMax],
  ]
  let fv = 0
  const missing: string[] = []
  for (const [key, max] of pairs) {
    if (loads[key] === 0) continue
    if (max && max > 0) fv += Math.abs(loads[key]) / max
    else missing.push(key)
  }
  return { fv, missing }
}

function lifeYears(km: number, strokeMm: number, cycleTime: number, hoursPerDay: number): number {
  const kmPerYear = ((2 * strokeMm) / 1e6) * (3600 / cycleTime) * hoursPerDay * 365
  return km / kmPerYear
}

function lifeNote(km: number, strokeMm: number, cycleTime: number, hoursPerDay: number) {
  return { note: '약 {years}년', noteArgs: { years: lifeYears(km, strokeMm, cycleTime, hoursPerDay).toFixed(1) } }
}

/** Press move of the forward stroke, or null when pressing is off or its inputs are not positive. */
function pressCycle(req: Requirements): AxisEvaluation['press'] {
  const p = req.press
  if (!p?.enabled || !(p.distance > 0 && p.speed > 0 && p.force >= 0)) return null
  const distance = Math.min(p.distance, req.stroke)
  return {
    profile: moveProfile(distance / 1000, p.speed, req.acceleration, req.jerk, 1),
    distance,
    force: p.force,
    holdTime: Math.max(0, p.holdTime),
  }
}

export function evaluateAxis(axis: Axis, req: Requirements, settings: Settings): AxisEvaluation | null {
  const feed = axisFeed(axis)
  if (!feed || !(req.stroke > 0 && req.velocity > 0 && req.acceleration > 0)) return null

  const strokeM = req.stroke / 1000
  const press = pressCycle(req)
  const approachM = strokeM - (press?.distance ?? 0) / 1000
  const approach = approachM > 1e-9 ? moveProfile(approachM, req.velocity, req.acceleration, req.jerk, 1) : null
  const fwd = approach ?? press!.profile
  const back = moveProfile(strokeM, req.velocity, req.acceleration, req.jerk, -1)
  const dwell = settings.dwellTime > 0 ? [dwellPhase(settings.dwellTime)] : []
  // Pressing: the press move and the hold (pushing at standstill, dir +1) carry the press force.
  const pressPhases: Phase[] = press
    ? [
        ...press.profile.phases.map((p) => ({ ...p, load: press.force })),
        ...(press.holdTime > 0 ? [{ ...dwellPhase(press.holdTime), dir: 1 as const, load: press.force }] : []),
      ]
    : []
  const forwardMoves = [...(approach?.phases ?? []), ...pressPhases]
  const forwardPhases = [...forwardMoves, ...dwell]
  const backPhases = [...back.phases, ...dwell]
  // One dwell per cycle, after the return move
  const phases: Phase[] = [...forwardMoves, ...back.phases, ...dwell]
  const moves = [...forwardMoves.map(() => 0), ...back.phases.map(() => 1), ...dwell.map(() => -1)]
  const cycleTime = phases.reduce((t, p) => t + p.duration, 0)
  const peakVelocity = Math.max(fwd.peakVelocity, press?.profile.peakVelocity ?? 0)

  const vertical = req.mounting === 'vertical'
  const efficiency = settings.efficiency[axis.drive]
  const mu = settings.friction[axis.drive]
  // Mass and inertia follow the built stroke (the ordered one for ESBF), the motion the required one.
  const order = axisOrder(axis, req.stroke)
  const builtStroke = order.stroke ?? req.stroke
  const mass = req.payload + axis.slideMass + ((axis.slideMassPer10mm ?? 0) * builtStroke) / 10
  const inertia = axis.inertiaJ0 + (axis.inertiaJHPerMeter * builtStroke) / 1000 + axis.inertiaJLPerKg * req.payload
  const toRad = (2 * Math.PI) / (feed / 1000)
  // Weight opposes the forward move when it goes up and helps it when it goes down (top-down pressing).
  const gravity = vertical ? (verticalForward(req) === 'down' ? -1 : 1) * mass * G : 0
  const resistance = mu * mass * G + settings.guideResistance + settings.externalForce

  const driveAt = (v: number, a: number, dir: 1 | -1 | 0, load = 0): DriveState => {
    const sgn = v !== 0 ? Math.sign(v) : dir
    const external = gravity + sgn * resistance + load
    const torque = inertia * 1e-4 * a * toRad + (external * feed) / (2000 * Math.PI) + sgn * axis.noLoadTorque
    return { omega: v * toRad, alpha: a * toRad, torque, force: mass * a + external }
  }
  const samples: AxisSample[] = samplePhases(phases, (i) => moves[i]).map((s) => ({
    ...s,
    ...driveAt(s.v, s.a, s.dir, s.load),
  }))

  const moving = samples.filter((s) => s.dir !== 0)
  const peakForce = Math.max(...moving.map((s) => Math.abs(s.force)))
  const peakShaftTorque = Math.max(
    ...moving.map((s) => (s.torque * s.omega >= 0 ? Math.abs(s.torque) / efficiency : Math.abs(s.torque) * efficiency)),
  )

  const checks: Check[] = [
    check('스트로크', req.stroke, axis.maxStroke, 'mm'),
    check('속도', peakVelocity, axis.maxSpeed, 'm/s'),
    check('가속도', fwd.peakAcceleration, axis.maxAcceleration, 'm/s²'),
    check('이송력 Fx', peakForce, axis.maxFeedForce, 'N'),
    check('구동 토크', peakShaftTorque, axis.maxDrivingTorque, 'Nm'),
  ]

  // Electric cylinder: the pressure force is limited by buckling of the piston rod (rod length = stroke).
  // Positive force pushes in the forward direction, taken as the rod extending.
  if (axis.pressureForceCurve) {
    const compression = Math.max(0, ...samples.map((s) => s.force))
    checks.push({
      ...check('압축력 (좌굴)', compression, curveAt(axis.pressureForceCurve, req.stroke), 'N'),
      note: '로드 길이 {stroke} mm 기준, 전진 = 로드가 나가는 방향',
      noteArgs: { stroke: req.stroke },
    })
  }

  if (axis.drive === 'spindle' && axis.speedLimitStroke && req.stroke > axis.speedLimitStroke) {
    checks.push({
      label: '스트로크별 속도 한계',
      value: req.stroke,
      limit: axis.speedLimitStroke,
      unit: 'mm',
      ratio: req.stroke / axis.speedLimitStroke,
      status: 'warn',
      note: '이 스트로크부터 볼스크류 최대 속도가 줄어듭니다. 카탈로그의 속도-스트로크 선도를 확인하세요.',
    })
  }

  const loads = guideLoads(req, mass, fwd.peakAcceleration)
  let fv = 0
  if (axis.rodLateralForceCurve) {
    // Electric cylinder: without an external guide the payload hangs on the piston rod.
    const lateral = Math.hypot(loads.Fy, loads.Fz)
    checks.push(
      settings.externalGuide
        ? check('로드 횡하중 Fq', lateral, null, 'N', '외부 가이드 사용 — 검토 생략')
        : { ...check('로드 횡하중 Fq', lateral, curveAt(axis.rodLateralForceCurve, req.stroke), 'N'), note: '무게 중심 오프셋에 의한 모멘트는 포함하지 않음' },
    )
  } else {
    const guide = guideComparisonValue(loads, axis)
    fv = guide.fv
    checks.push({
      ...check('가이드 하중 비교값 fv', fv, 1, ''),
      note: guide.missing.length ? '허용값 없음: {keys}' : undefined,
      noteArgs: guide.missing.length ? { keys: guide.missing.join(', ') } : undefined,
    })
  }

  const mAxis = axisMass(axis, builtStroke)
  if (!vertical) {
    const totalLength = axis.baseLength ? req.stroke + axis.baseLength : null
    const span = settings.supportSpan > 0 ? settings.supportSpan : totalLength
    const I = req.mounting === 'floor' ? axis.Iy : axis.Iz
    if (span && I) {
      const selfWeight = mAxis * G * (totalLength ? Math.min(1, span / totalLength) : 1)
      const deflection =
        (mass * G * span ** 3) / (48 * YOUNGS_MODULUS * I) + (5 * selfWeight * span ** 3) / (384 * YOUNGS_MODULUS * I)
      const limit = axis.allowableDeflection ?? 0.5
      const c = { ...check('처짐', deflection, limit, 'mm', '지지 간격 {span} mm 기준'), noteArgs: { span: Math.round(span) } }
      checks.push(c.status === 'fail' ? { ...c, status: 'warn', note: '지지 간격 {span} mm 기준 — 중간 지지 추가 또는 지지 간격 입력 검토' } : c)
    }
  }

  const info: InfoItem[] = [
    { label: '사이클 타임 (왕복)', value: cycleTime, unit: 's' },
    { label: '이동 질량 (부하 + 슬라이드)', value: mass, unit: 'kg' },
    { label: '축 질량', value: mAxis, unit: 'kg' },
    { label: '축 관성 모멘트 (구동축 기준)', value: inertia, unit: 'kg·cm²' },
  ]
  if (fv > 0) {
    const km = GUIDE_REFERENCE_LIFE_KM / fv ** 3
    info.push({ label: '가이드 예상 수명', value: km, unit: 'km', ...lifeNote(km, req.stroke, cycleTime, settings.hoursPerDay) })
  }
  if (axis.drive === 'spindle' && axis.screwDynamicLoadRating && axis.spindlePitch) {
    let num = 0
    let den = 0
    for (const s of moving) {
      const w = Math.abs(s.v) * s.dt
      num += Math.abs(s.force) ** 3 * w
      den += w
    }
    const meanLoad = Math.cbrt(num / den)
    const loadKm = (axis.screwDynamicLoadRating / (screwLoadFactor(peakVelocity) * meanLoad)) ** 3 * axis.spindlePitch
    // ESBF-BS: the life also ends after a number of switching cycles (one cycle = one round trip of the stroke).
    const cycleKm = axis.maxSwitchingCycles ? (axis.maxSwitchingCycles * 2 * req.stroke) / 1e6 : Infinity
    const km = Math.min(loadKm, cycleKm)
    const life = lifeNote(km, req.stroke, cycleTime, settings.hoursPerDay)
    info.push({
      label: '볼스크류 예상 수명',
      value: km,
      unit: 'km',
      ...(cycleKm < loadKm
        ? {
            note: '약 {years}년 · 왕복 {cycles}회 한계',
            noteArgs: { ...life.noteArgs, cycles: axis.maxSwitchingCycles!.toLocaleString('en-US') },
          }
        : life),
      alert: km < SCREW_LIFE_MIN_KM,
    })
    if (km < SCREW_LIFE_MIN_KM) {
      checks.push({
        label: '볼스크류 수명',
        value: km,
        limit: SCREW_LIFE_MIN_KM,
        unit: 'km',
        ratio: SCREW_LIFE_MIN_KM / km,
        status: 'warn',
        note: '예상 수명 {min} km 미만',
        noteArgs: { min: SCREW_LIFE_MIN_KM },
      })
    }
  }

  return {
    axis,
    order,
    status: worstStatus(checks),
    checks,
    info,
    profile: fwd,
    backProfile: back,
    press,
    cyclePhases: phases,
    forwardPhases,
    backPhases,
    peakVelocity,
    driveAt,
    cycleTime,
    movingMass: mass,
    feed,
    efficiency,
    inertia,
    samples,
    guideFv: fv,
    axisMass: mAxis,
  }
}

const statusOrder: Record<Status, number> = { ok: 0, warn: 1, fail: 2 }

export function selectAxes(all: Axis[], req: Requirements, settings: Settings): AxisEvaluation[] {
  return all
    .filter((a) => settings.families.includes(a.family) && settings.drives.includes(a.drive))
    .map((a) => evaluateAxis(a, req, settings))
    .filter((e): e is AxisEvaluation => e !== null)
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.axisMass - b.axisMass)
}
