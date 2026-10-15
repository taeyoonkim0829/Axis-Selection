import type { AxisFamily, DriveKind, MotorMaker } from '../data/types'

export type Mounting = 'floor' | 'wall' | 'vertical'

/** User-entered transport conditions (UI units). */
export interface Requirements {
  /** mm */
  stroke: number
  /** m/s */
  velocity: number
  /** m/s² */
  acceleration: number
  /** m/s³; 0 = unlimited (trapezoidal profile) */
  jerk: number
  /** kg */
  payload: number
  /** Payload centre of gravity relative to the slide centre, mm.
   *  x = travel direction, y = lateral on the slide surface, z = normal to the slide surface. */
  cog: { x: number; y: number; z: number }
  mounting: Mounting
  /** Pressing at the end of the forward move; absent or disabled = plain point-to-point move */
  press?: PressConditions
}

/** Press cycle: approach at the set velocity, press over the last `distance` at `speed`, hold, return. */
export interface PressConditions {
  enabled: boolean
  /** N, pressing force over the press distance and the hold */
  force: number
  /** mm, travel at press speed at the end of the stroke */
  distance: number
  /** m/s */
  speed: number
  /** s, force held at standstill */
  holdTime: number
  /** Vertical axis only: pressing upward (bottom-up) or downward (top-down); the forward move goes this way */
  direction: VerticalDirection
}

export type VerticalDirection = 'up' | 'down'

export const defaultPress: PressConditions = {
  enabled: false,
  force: 1000,
  distance: 10,
  speed: 0.01,
  holdTime: 1,
  direction: 'down',
}

/** Direction of the forward move on a vertical axis: up, or down when pressing top-down; null when not vertical. */
export function verticalForward(req: Requirements): VerticalDirection | null {
  if (req.mounting !== 'vertical') return null
  return req.press?.enabled && req.press.direction === 'down' ? 'down' : 'up'
}

/** Advanced parameters; defaults follow the Excel calc sheets. */
export interface Settings {
  /** s, once per cycle, after the return move */
  dwellTime: number
  efficiency: Record<DriveKind, number>
  friction: Record<DriveKind, number>
  /** N, process force opposing the motion (Excel Fc) */
  externalForce: number
  /** N, guide seal resistance (Excel FG) */
  guideResistance: number
  /** kg·cm², coupling inertia at the motor side */
  couplingInertia: number
  /** h/day, for converting life in km to years */
  hoursPerDay: number
  /** mm between supports for the deflection check; 0 = supported only at both ends */
  supportSpan: number
  /** used when a motor has no allowable inertia ratio in the data */
  defaultInertiaRatio: number
  families: AxisFamily[]
  drives: DriveKind[]
  makers: MotorMaker[]
  /** motor families (`Motor.family`) turned off; families not listed are included */
  excludedMotorFamilies: string[]
  requireBrake: boolean
  /** Electric cylinders (ESBF) run with an external guide that carries the payload: the rod lateral force is not checked */
  externalGuide: boolean
  /** false = motors are checked in direct drive only; true = with a compatible gearbox only */
  useGearbox: boolean
  /** Constant-velocity torque above the rated torque fails instead of warning */
  conservative: boolean
}

export const defaultSettings: Settings = {
  dwellTime: 0,
  efficiency: { spindle: 0.9, belt: 0.8 },
  friction: { spindle: 0.05, belt: 0.1 },
  externalForce: 0,
  guideResistance: 0,
  couplingInertia: 0,
  hoursPerDay: 24,
  supportSpan: 0,
  defaultInertiaRatio: 10,
  families: ['ELGT', 'ELGD', 'EGC', 'ESBF'],
  drives: ['belt', 'spindle'],
  makers: ['Festo'],
  excludedMotorFamilies: [],
  requireBrake: false,
  externalGuide: false,
  useGearbox: false,
  conservative: false,
}

export type Status = 'ok' | 'warn' | 'fail'

export interface Check {
  label: string
  value: number
  limit: number | null
  unit: string
  /** value / limit; null when there is no limit */
  ratio: number | null
  status: Status
  /** Korean source text; may contain `{name}` placeholders filled from `noteArgs` (translated in the UI) */
  note?: string
  noteArgs?: Record<string, string | number>
}

export function check(label: string, value: number, limit: number | null | undefined, unit: string, note?: string): Check {
  if (limit == null || !(limit > 0)) {
    return { label, value, limit: null, unit, ratio: null, status: 'ok', note: note ?? '데이터 없음 — 검토 생략' }
  }
  const ratio = Math.abs(value) / limit
  return { label, value, limit, unit, ratio, status: ratio <= 1 ? 'ok' : 'fail', note }
}

export function worstStatus(checks: Check[]): Status {
  if (checks.some((c) => c.status === 'fail')) return 'fail'
  if (checks.some((c) => c.status === 'warn')) return 'warn'
  return 'ok'
}
