// Axis sizing: motion profile, required force/torque at the axis drive shaft,
// guide load comparison value, deflection and life. Motor-independent.
import type { Axis } from '../data/types'
import { dwellPhase, moveProfile, samplePhases, type MoveProfile, type Phase } from './motionProfile'
import { check, worstStatus, type Check, type Requirements, type Settings, type Status } from './types'

export const G = 9.81
/** N/mm², aluminium profile (Excel deflection sheet) */
const YOUNGS_MODULUS = 70000
/** Reference distance of the guide load comparison value [km] */
const GUIDE_REFERENCE_LIFE_KM = 5000

export interface AxisSample {
  /** m/s, signed (vertical: + = up) */
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
}

export interface AxisEvaluation {
  axis: Axis
  status: Status
  checks: Check[]
  info: InfoItem[]
  /** Forward move (vertical: up) */
  profile: MoveProfile
  /** Return move (vertical: down) */
  backProfile: MoveProfile
  /** Drive-shaft load at velocity v [m/s] and acceleration a [m/s²] while moving in direction dir */
  driveAt: (v: number, a: number, dir: 1 | -1 | 0) => DriveState
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

export function evaluateAxis(axis: Axis, req: Requirements, settings: Settings): AxisEvaluation | null {
  const feed = axisFeed(axis)
  if (!feed || !(req.stroke > 0 && req.velocity > 0 && req.acceleration > 0)) return null

  const strokeM = req.stroke / 1000
  const fwd = moveProfile(strokeM, req.velocity, req.acceleration, req.jerk, 1)
  const back = moveProfile(strokeM, req.velocity, req.acceleration, req.jerk, -1)
  const dwell = settings.dwellTime > 0 ? [dwellPhase(settings.dwellTime)] : []
  const phases: Phase[] = [...fwd.phases, ...dwell, ...back.phases, ...dwell]
  const fwdEnd = fwd.phases.length
  const backStart = fwdEnd + dwell.length
  const moveOf = (i: number) => (i < fwdEnd ? 0 : i >= backStart && i < backStart + back.phases.length ? 1 : -1)
  const cycleTime = 2 * (fwd.moveTime + settings.dwellTime)

  const vertical = req.mounting === 'vertical'
  const efficiency = settings.efficiency[axis.drive]
  const mu = settings.friction[axis.drive]
  const mass = req.payload + axis.slideMass + ((axis.slideMassPer10mm ?? 0) * req.stroke) / 10
  const inertia = axis.inertiaJ0 + (axis.inertiaJHPerMeter * req.stroke) / 1000 + axis.inertiaJLPerKg * req.payload
  const toRad = (2 * Math.PI) / (feed / 1000)
  const gravity = vertical ? mass * G : 0
  const resistance = mu * mass * G + settings.guideResistance + settings.externalForce

  const driveAt = (v: number, a: number, dir: 1 | -1 | 0): DriveState => {
    const sgn = v !== 0 ? Math.sign(v) : dir
    const external = gravity + sgn * resistance
    const torque = inertia * 1e-4 * a * toRad + (external * feed) / (2000 * Math.PI) + sgn * axis.noLoadTorque
    return { omega: v * toRad, alpha: a * toRad, torque, force: mass * a + external }
  }
  const samples: AxisSample[] = samplePhases(phases, moveOf).map((s) => ({ ...s, ...driveAt(s.v, s.a, s.dir) }))

  const moving = samples.filter((s) => s.dir !== 0)
  const peakForce = Math.max(...moving.map((s) => Math.abs(s.force)))
  const peakShaftTorque = Math.max(
    ...moving.map((s) => (s.torque * s.omega >= 0 ? Math.abs(s.torque) / efficiency : Math.abs(s.torque) * efficiency)),
  )

  const checks: Check[] = [
    check('스트로크', req.stroke, axis.maxStroke, 'mm'),
    check('속도', fwd.peakVelocity, axis.maxSpeed, 'm/s'),
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
      note: '이 스트로크부터 스핀들 최대 속도가 줄어듭니다. 카탈로그의 속도-스트로크 선도를 확인하세요.',
    })
  }

  const loads = guideLoads(req, mass, fwd.peakAcceleration)
  let fv = 0
  if (axis.rodLateralForceCurve) {
    // Electric cylinder without its own guide: the payload hangs on the piston rod.
    const c = check('로드 횡하중 Fq', Math.hypot(loads.Fy, loads.Fz), curveAt(axis.rodLateralForceCurve, req.stroke), 'N')
    checks.push(
      c.status === 'fail'
        ? { ...c, status: 'warn', note: '외부 가이드 없이 로드에 하중을 걸 때의 한계 — 외부 가이드 사용 검토' }
        : { ...c, note: '무게 중심 오프셋에 의한 모멘트는 포함하지 않음' },
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

  const mAxis = axisMass(axis, req.stroke)
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
    const km = (axis.screwDynamicLoadRating / (screwLoadFactor(fwd.peakVelocity) * meanLoad)) ** 3 * axis.spindlePitch
    info.push({ label: '볼스크류 예상 수명', value: km, unit: 'km', ...lifeNote(km, req.stroke, cycleTime, settings.hoursPerDay) })
  }

  return {
    axis,
    status: worstStatus(checks),
    checks,
    info,
    profile: fwd,
    backProfile: back,
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
