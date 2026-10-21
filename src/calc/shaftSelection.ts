// Connecting shaft (Festo KSK) between two parallel toothed belt axes driven by one motor: the size that fits the
// axis, its nominal length from the axis spacing, its inertia, and the checks of length, torque and speed.
import type { Axis, ConnectingShaft } from '../data/types'
import { curveAt } from './curve'
import { check, type Check } from './types'

export interface ShaftFit {
  shaft: ConnectingShaft
  /** mm, nominal length LN = gap between the drive covers (axis spacing − drive width) */
  length: number
  /** mm, the axis's drive width taken off the spacing */
  driveWidth: number
  /** order type with the nominal length */
  model: string
  /** kg·cm², J0 + JL·LN, at the axis drive shaft */
  inertia: number
  /** kg */
  mass: number
  /** [LN mm, rpm] max. speed for this axis */
  speedCurve: [number, number][]
}

/** The KSK for a belt axis at `spacing` mm between the axis centrelines; null when none fits the axis. */
export function connectingShaftFor(axis: Axis, spacing: number, shafts: ConnectingShaft[]): ShaftFit | null {
  if (axis.drive !== 'belt') return null
  for (const shaft of shafts) {
    const fit = shaft.axes.find((a) => a.family === axis.family && a.variant === axis.variant && a.size === axis.size)
    if (!fit) continue
    const driveWidth = axis.driveWidth ?? 0
    const length = Math.round(spacing - driveWidth)
    const m = Math.max(0, length) / 1000
    return {
      shaft,
      length,
      driveWidth,
      model: shaft.typeCode.replace('…', String(length)),
      inertia: shaft.inertiaJ0 + shaft.inertiaJLPerMeter * m,
      mass: shaft.baseMass + shaft.massPerMeter * m,
      speedCurve: fit.speedCurve,
    }
  }
  return null
}

/**
 * Checks of a fitted KSK: nominal length within the order range, the torque it carries to the second axis (Nm, that
 * axis's drive torque plus the shaft's own acceleration torque) against the rated torque, and the shaft speed (rpm)
 * against the speed curve at its length. All hard limits.
 */
export function shaftChecks(fit: ShaftFit, torque: number, rpm: number): Check[] {
  const [min, max] = fit.shaft.lengthRange
  const short = fit.length < min
  const length: Check = {
    label: '연결축 공칭 길이 LN',
    value: fit.length,
    limit: short ? min : max,
    unit: 'mm',
    ratio: short ? (fit.length > 0 ? min / fit.length : Infinity) : fit.length / max,
    status: short || fit.length > max ? 'fail' : 'ok',
    note: short ? '{model}: 최소 {min} mm. 축 간격을 늘리세요' : '{model}: 축 간격 − 구동부 폭 {width} mm',
    noteArgs: { model: fit.shaft.model, min, width: fit.driveWidth },
  }
  return [
    length,
    { ...check('연결축 전달 토크', torque, fit.shaft.ratedTorque, 'Nm'), note: '두 번째 축의 구동 토크 + 연결축 가속 토크' },
    {
      ...check('연결축 최대 회전수', rpm, curveAt(fit.speedCurve, Math.max(0, fit.length)), 'rpm'),
      note: '공칭 길이 {length} mm의 회전수 선도 기준',
      noteArgs: { length: fit.length },
    },
  ]
}

/** twinShaft on an axis without a KSK: the shaft inertia comes from the input, the shaft is not checked. */
export const noShaftCheck: Check = {
  label: '연결축 (KSK)',
  value: Number.NaN, // shown as —
  limit: null,
  unit: '',
  ratio: null,
  status: 'warn',
  note: '이 축에 맞는 KSK 연결축이 없습니다. 연결축 관성은 입력값을 사용하며, 연결축은 별도 검토하세요',
}
