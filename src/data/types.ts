// Shapes of the JSON files in data/. Field units are listed in data/README.md
// (mm, kg, N, Nm, kg·cm², m/s, m/s², rpm).

export type AxisFamily = 'ELGT' | 'ELGD' | 'EGC' | 'ESBF'
export type DriveKind = 'belt' | 'spindle'

export interface Axis {
  id: string
  family: AxisFamily
  variant: '' | 'HD' | 'WD'
  size: number | null
  drive: DriveKind
  slide: 'GK' | 'GV'
  longSlide: boolean
  model: string
  category: string | null
  guideType: string | null
  strokeRangeText: string | null
  speedLimitStroke: number | null
  maxStroke: number
  maxFeedForce: number
  /** N, ELGD-BS: max. feed force with a parallel kit (data sheet p.6), when lower than with an axial kit */
  maxFeedForceParallel?: number | null
  noLoadTorque: number
  maxDrivingTorque: number | null
  maxSpeed: number
  maxAcceleration: number
  repeatability: number | null
  baseMass: number
  massPer10mm: number
  slideMass: number
  /** kg per 10 mm stroke added to the moving mass (ESBF piston rod); absent for slide axes */
  slideMassPer10mm?: number | null
  /** ball screw axes: [working stroke mm, max. speed m/s], read from the data sheet speed-stroke curve */
  speedCurve?: [number, number][] | null
  /** ELGD-BS: [working stroke mm, max. feed force N] towards the motor (screw buckling), read from the data sheet curve */
  feedForceCurve?: [number, number][] | null
  /** ESBF: [rod length mm, max. pressure force N] — buckling limit, read from the data sheet curve */
  pressureForceCurve?: [number, number][] | null
  /** ESBF: [stroke mm, max. lateral force on the piston rod N], read from the data sheet curve; replaces the guide check */
  rodLateralForceCurve?: [number, number][] | null
  pulleyDiameter: number | null
  feedConstant: number | null
  spindleDiameter: number | null
  spindlePitch: number | null
  inertiaJ0: number
  inertiaJHPerMeter: number
  inertiaJLPerKg: number
  FxMax: number | null
  FyMax: number | null
  FzMax: number | null
  MxMax: number | null
  MyMax: number | null
  MzMax: number | null
  Iy: number | null
  Iz: number | null
  baseLength: number | null
  slideLength: number | null
  screwDynamicLoadRating: number | null
  /** ESBF-BS: the screw life also ends after this many switching cycles (round trips) */
  maxSwitchingCycles?: number | null
  allowableDeflection: number | null
  standardStrokes: number[] | string[] | null
  /** Released mounting positions: 'horizontal' only for ELGT-TB (data sheet); absent = any */
  mountingPosition?: 'any' | 'horizontal' | null
  /** Order type code with … where the stroke goes (ELGT-BS, ELGD, EGC); `model` when missing (ESBF) */
  typeCode?: string | null
  /** order number per standard stroke (mm as key) */
  strokePartNumbers?: Record<string, string> | null
  /** module number for other strokes (modular product system) */
  moduleNumber?: string | null
  /** mm, strokes the modular product system takes: any whole mm in `variable` [min, max], plus the `fixed` ones */
  moduleStrokes?: { variable: [number, number] | null; fixed: number[] } | null
  /** mechanical interface code for mounting kits; null when unknown */
  interfaceCode: string | null
}

export type MotorMaker = 'Festo' | 'Siemens' | 'Mitsubishi'

export interface Motor {
  id: string
  maker: MotorMaker
  /** product family from the model name: Festo EMMT, Siemens 1FK2, Mitsubishi HK-KT */
  family: string
  brake: boolean
  model: string
  description: string | null
  series: string | null
  ratedPower: number | null
  ratedTorque: number
  peakTorque: number
  ratedSpeed: number
  maxSpeed: number | null
  /** kg·cm², including the brake on brake models */
  inertia: number
  allowableInertiaRatio: number | null
  reverseEfficiency: number | null
  capacitorEnergy: number | null
  regenPower: number | null
  amplifier: string | null
  /** mechanical interface code for mounting kits; brake and non-brake models share it; null when unknown */
  interfaceCode: string | null
}

export interface Gearbox {
  id: string
  /** i, e.g. 5 for 5:1 */
  ratio: number
  model: string
  /** model prefix: Apex AB/PA/AE…, Festo EMGA */
  family: string
  maker: string
  flangeSize: number | null
  compatibleMotors: string[] | null
  continuousTorque: number | null
  maxTorque: number | null
  /** kg·cm², at the input (motor) side */
  inertia: number
  /** % */
  efficiency: number | null
  /** mechanical interface code for mounting kits, at the output (axis) side; null when unknown */
  interfaceCode: string | null
  /** interface code at the drive (motor) side; equals the motor's interfaceCode. null when unknown (all Apex for now) */
  driveCode?: string | null
  /** rpm (Festo EMGA, Apex AB/ABR) */
  maxInputSpeed?: number
  // Festo EMGA only (from the Festo documentation)
  /** order number */
  partNumber?: string
  // Apex AB/ABR only (from the Apex catalog)
  /** 1 or 2 */
  stage?: number
  /** rpm */
  nominalInputSpeed?: number
  /** Nm, T2NOT = 3 × continuousTorque */
  emergencyStopTorque?: number
  /** arcmin per backlash class: P0 micro, P1 reduced, P2 standard; null = not made */
  backlashArcmin?: { P0: number | null; P1: number | null; P2: number | null }
}

/**
 * One Festo motor mounting kit for one axis/motor interface code pair (a kit listed for several codes
 * appears once per pair). It fits when `axisCode` equals the axis's `interfaceCode` and `motorCode` equals
 * the motor's, or the gearbox's when a gearbox sits in between.
 */
export interface Kit {
  /** product|axisCode|motorCode */
  id: string
  family: 'axial' | 'parallel'
  /** axial (EAMM-A, coupling) or parallel (EAMM-U, belt) */
  type: 'axial' | 'parallel'
  /** null for SA kits */
  partNumber: string | null
  product: string
  axisCode: string
  motorCode: string
  /** inspection window */
  window: boolean
  /** axial kits: coupling type (Jaw, Disk) */
  coupling?: string | null
  /** parallel kits: pulley part number, when ordered separately */
  pulley?: string | null
  /** SA = custom-made in Korea; codes come from the kit name, ask TEC before using */
  special: boolean
  sa?: { projectNo: string | null; motorMaker: string | null; motorModel: string | null } | null
  // From the EAMM-A / EAMM-U data sheets; null for kits not in them (e.g. the BF…/EB… kits, older K… kits)
  /** kg·cm² */
  inertia: number | null
  /** Nm, max. permissible transferable torque */
  transmissibleTorque: number | null
  /** i (1 for every EAMM-U) */
  ratio: number | null
  efficiency: number | null
  /** rpm */
  maxSpeed: number | null
  /** Nm, parallel kits: no-load driving torque */
  noLoadTorque?: number | null
  /** kg */
  mass: number | null
  /** mm */
  length: number | null
  /** data sheet row the values come from when it is the kit's current generation (…-G2) */
  dataSource?: string | null
}
