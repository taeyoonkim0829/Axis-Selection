// Motor (+ optional gearbox) sizing against an evaluated axis.
import { gearboxesFor } from '../data'
import type { Gearbox, Motor } from '../data/types'
import type { AxisEvaluation, AxisSample } from './axisSelection'
import { check, worstStatus, type Check, type Settings, type Status } from './types'

export interface DriveEvaluation {
  motor: Motor
  gearbox: Gearbox | null
  status: Status
  checks: Check[]
  peakTorque: number
  rmsTorque: number
  /** rpm */
  maxMotorSpeed: number
  inertiaRatio: number
  /** W, averaged over the cycle */
  regenPower: number | null
}

type ShaftState = Pick<AxisSample, 'omega' | 'alpha' | 'torque' | 'dir'>

/** Motor shaft torque [Nm] for a drive-shaft state: gearbox ratio, efficiency and motor-side inertia applied. */
export function motorTorqueFn(axisEval: AxisEvaluation, motor: Motor, gearbox: Gearbox | null, settings: Settings) {
  const ratio = gearbox?.ratio ?? 1
  const efficiency = axisEval.efficiency * (gearbox?.efficiency ? gearbox.efficiency / 100 : 1)
  // kg·m²: rotor (incl. brake) + gearbox input + coupling, all on the motor shaft
  const motorSideInertia = (motor.inertia + (gearbox?.inertia ?? 0) + settings.couplingInertia) * 1e-4
  return (s: ShaftState) => {
    const loadTorque = s.torque / ratio
    let motorLoadTorque = loadTorque
    if (s.dir !== 0) motorLoadTorque = s.torque * s.omega >= 0 ? loadTorque / efficiency : loadTorque * efficiency
    return motorLoadTorque + motorSideInertia * s.alpha * ratio
  }
}

export function evaluateDrive(
  axisEval: AxisEvaluation,
  motor: Motor,
  gearbox: Gearbox | null,
  settings: Settings,
): DriveEvaluation {
  const ratio = gearbox?.ratio ?? 1
  const motorTorque = motorTorqueFn(axisEval, motor, gearbox, settings)

  let peak = 0
  let peakOutput = 0
  let sumSquares = 0
  // Constant-velocity segments (moving, a = 0): peak torque and time spent above the rated torque
  let constantPeak = 0
  let constantOverTime = 0
  const negativeEnergy = [0, 0]
  for (const s of axisEval.samples) {
    const torque = motorTorque(s)
    peak = Math.max(peak, Math.abs(torque))
    if (s.dir !== 0 && Math.abs(s.a) < 1e-9) {
      constantPeak = Math.max(constantPeak, Math.abs(torque))
      if (Math.abs(torque) > motor.ratedTorque) constantOverTime += s.dt
    }
    peakOutput = Math.max(peakOutput, Math.abs(s.torque))
    sumSquares += torque * torque * s.dt
    const power = torque * s.omega * ratio
    if (s.move >= 0 && power < 0) negativeEnergy[s.move] -= power * s.dt
  }
  const rms = Math.sqrt(sumSquares / axisEval.cycleTime)
  const maxMotorSpeed = ((axisEval.profile.peakVelocity * 60000) / axisEval.feed) * ratio
  const loadInertia = axisEval.inertia / ratio ** 2 + (gearbox?.inertia ?? 0) + settings.couplingInertia
  const inertiaRatio = loadInertia / motor.inertia

  const checks: Check[] = [
    check('최대 토크', peak, motor.peakTorque, 'Nm'),
    check('실효 토크', rms, motor.ratedTorque, 'Nm'),
    constantTorqueCheck(constantPeak, constantOverTime, motor.ratedTorque, settings.conservative),
    // Exceeding the rated speed only warns (torque drops above it).
    maxMotorSpeed > motor.ratedSpeed
      ? {
          ...check('정격 회전수', maxMotorSpeed, motor.ratedSpeed, 'rpm'),
          status: 'warn',
          note: '정격 회전수 초과 구간에서는 토크가 감소합니다. 모터 토크-속도 선도를 확인하세요.',
        }
      : check('정격 회전수', maxMotorSpeed, motor.ratedSpeed, 'rpm'),
    check('최대 회전수', maxMotorSpeed, motor.maxSpeed ?? motor.ratedSpeed, 'rpm'),
  ]
  checks.push(check('관성비', inertiaRatio, motor.allowableInertiaRatio ?? settings.defaultInertiaRatio, '배'))

  let regenPower: number | null = null
  if (motor.reverseEfficiency != null) {
    const reverse = motor.reverseEfficiency
    const capacitor = motor.capacitorEnergy ?? 0
    regenPower = negativeEnergy.reduce((sum, e) => sum + Math.max(0, reverse * e - capacitor), 0) / axisEval.cycleTime
    if (regenPower > 0) {
      const allowed = motor.regenPower ?? 0
      checks.push({
        label: '회생 전력',
        value: regenPower,
        limit: allowed > 0 ? allowed : null,
        unit: 'W',
        ratio: allowed > 0 ? regenPower / allowed : null,
        status: regenPower > allowed ? 'warn' : 'ok',
        note: regenPower > allowed ? '외부 회생 저항 검토 필요' : undefined,
      })
    }
  }

  if (gearbox) {
    checks.push(check('감속기 최대 토크', peakOutput / axisEval.efficiency, gearbox.maxTorque, 'Nm'))
    // The gearbox input turns at motor speed.
    checks.push(check('감속기 최대 입력 회전수', maxMotorSpeed, gearbox.maxInputSpeed, 'rpm'))
  }

  return {
    motor,
    gearbox,
    status: worstStatus(checks),
    checks,
    peakTorque: peak,
    rmsTorque: rms,
    maxMotorSpeed,
    inertiaRatio,
    regenPower,
  }
}

/**
 * Constant-velocity torque vs the rated torque. A long dwell can hide a long, overloaded constant segment
 * in the RMS torque, so this warns (fails in conservative mode) whenever that segment exceeds the rated torque.
 */
function constantTorqueCheck(value: number, overTime: number, rated: number, conservative: boolean): Check {
  const c = check('등속 구간 토크', value, rated, 'Nm')
  if (c.status !== 'fail') return c
  return {
    ...c,
    status: conservative ? 'fail' : 'warn',
    note: conservative ? '정격 토크 초과 {time} s / 사이클' : '정격 토크 초과 {time} s / 사이클 — 열시정수 대비 길면 모터 과열 우려',
    noteArgs: { time: overTime.toFixed(2) },
  }
}

const statusOrder: Record<Status, number> = { ok: 0, warn: 1, fail: 2 }

/** Compatible gearboxes of a motor, lowest ratio first. */
export function gearboxOptionsFor(motor: Motor) {
  return gearboxesFor(motor).toSorted((a, b) => a.ratio - b.ratio)
}

/**
 * One drive option per motor. Direct drive unless `settings.useGearbox`; then the lowest passing gearbox
 * ratio (the lowest ratio when none passes), and motors without a compatible gearbox drop out.
 */
export function selectMotors(axisEval: AxisEvaluation, all: Motor[], settings: Settings): DriveEvaluation[] {
  return all
    .filter(
      (m) =>
        settings.makers.includes(m.maker) &&
        !settings.excludedMotorFamilies.includes(m.family) &&
        (!settings.requireBrake || m.brake),
    )
    .flatMap((motor) => {
      if (!settings.useGearbox) return [evaluateDrive(axisEval, motor, null, settings)]
      const geared = gearboxOptionsFor(motor).map((g) => evaluateDrive(axisEval, motor, g, settings))
      const best = geared.find((e) => e.status !== 'fail') ?? geared[0]
      return best ? [best] : []
    })
    .sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        (a.motor.ratedPower ?? Infinity) - (b.motor.ratedPower ?? Infinity) ||
        a.peakTorque / a.motor.peakTorque - b.peakTorque / b.motor.peakTorque,
    )
}
