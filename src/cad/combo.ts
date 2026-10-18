import type { Mounting, Requirements } from '../calc/types'
import type { Axis, Gearbox, Kit, Motor } from '../data/types'
import { assemble, sourceNotice, type AssemblyPart } from './assemble'
import {
  axisDrawingsFor,
  gearboxDrawingFor,
  kitDrawingFor,
  motorDrawingFor,
  type AxisMeta,
  type Drawing,
  type GearboxMeta,
  type KitMeta,
  type MotorMeta,
} from './drawings'
import { add, apply, cross, dot, identity, mate, rotate, scale, sub, turnAbout, type Frame, type Transform } from './geometry'
import { parseStep, writeStep, type Vec3 } from './step'
import { stretchPart } from './stretch'

export type PartRole = 'axis' | 'kit' | 'gearbox' | 'motor'

export interface ComboSelection {
  axis: Axis
  /** ordered axis model (stroke filled in) */
  axisModel: string
  /** mm, ordered stroke */
  stroke: number
  motor: Motor
  gearbox: Gearbox | null
  kit: Kit
}

/** Drawings found for a selection; `missing` lists the parts without one (no assembly then). */
export interface ComboDrawings {
  axis: Drawing<AxisMeta> | null
  motor: Drawing<MotorMeta> | null
  motorOtherOptions: boolean
  gearbox: Drawing<GearboxMeta> | null
  kit: Drawing<KitMeta> | null
  missing: PartRole[]
}

export function comboDrawings(sel: ComboSelection, all?: Drawing[]): ComboDrawings {
  const axis = axisDrawingsFor(sel.axis, sel.stroke, all)[0] ?? null
  const motor = motorDrawingFor(sel.motor, all)
  const gearbox = sel.gearbox ? gearboxDrawingFor(sel.gearbox, all) : null
  const kit = kitDrawingFor(sel.kit, all)
  const missing: PartRole[] = []
  if (!axis) missing.push('axis')
  if (!kit?.meta) missing.push('kit')
  if (sel.gearbox && !gearbox?.meta) missing.push('gearbox')
  if (!motor) missing.push('motor')
  return { axis, motor: motor?.drawing ?? null, motorOtherOptions: motor?.otherOptions ?? false, gearbox, kit, missing }
}

// Festo convention (flange at z = 0, shaft +z, connector +y); Mitsubishi's flange motors have their connectors at −y
const defaultMotorMeta = (maker: string): MotorMeta => ({
  flange: { origin: [0, 0, 0], axis: [0, 0, -1], up: [0, 1, 0] },
  ...(maker === 'Mitsubishi' ? { connector: [0, -1, 0] } : {}),
})

/** Direction seen from the motor end of the axis, looking along the axis with the slide surface up. */
export type Side = 'up' | 'down' | 'left' | 'right'
export const SIDES: readonly Side[] = ['up', 'down', 'left', 'right']

/**
 * Assembly orientation: the side a parallel kit puts the motor on (kit turned about the axis drive shaft) and where
 * the motor connector points (any kit). `motorConnector` null = automatic: away from the axis with a parallel kit
 * (the kit side), up with an axial kit.
 */
export interface ComboOptions {
  kitSide: Side
  motorConnector: Side | null
}
export const defaultComboOptions: ComboOptions = { kitSide: 'down', motorConnector: null }

export const connectorSide = (options: ComboOptions, parallel: boolean): Side =>
  options.motorConnector ?? (parallel ? options.kitSide : 'up')

const opposite: Record<Side, Side> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** Warnings about the chosen orientation (Korean source text), shown in step 5 and the report. */
export function assemblyWarnings(options: ComboOptions, parallel: boolean): string[] {
  if (!parallel) return []
  const warnings: string[] = []
  if (connectorSide(options, parallel) === opposite[options.kitSide])
    warnings.push('모터 커넥터가 축 쪽을 향합니다. 간섭을 확인하세요.')
  if (options.kitSide === 'up')
    warnings.push('모터가 슬라이드 쪽에 있어 슬라이드·소재와 간섭할 수 있으므로 사용 가능한 스트로크가 줄어들 수 있습니다.')
  return warnings
}

/** World axes (Z up): the slide travels along X on floor and wall; vertical puts the motor on top. */
export function mountingFrame(mounting: Mounting): { travel: Vec3; normal: Vec3 } {
  if (mounting === 'floor') return { travel: [1, 0, 0], normal: [0, 0, 1] }
  if (mounting === 'wall') return { travel: [1, 0, 0], normal: [0, -1, 0] }
  return { travel: [0, 0, -1], normal: [0, -1, 0] }
}

export interface ComboPart {
  role: PartRole
  name: string
  transform: Transform
}

export interface Combo {
  name: string
  /** assembled STEP text */
  step: string
  parts: ComboPart[]
  /** payload centre of gravity, world mm (slide centre at the start position = origin) */
  cog: Vec3
  slideCentre: Vec3
  /** axis file stroke and the length change applied to reach the ordered stroke */
  axisStroke: number
  stretch: number
}

/** Second, parallel axis: `spacing` mm beside the first along the slide's lateral (+y) direction */
export interface TwinAxis {
  spacing: number
  /** true: it has its own kit, gearbox and motor (motor sync); false: driven through a connecting shaft (not drawn) */
  drive: boolean
}

/**
 * Places axis → kit → (gearbox →) motor by their mating frames and writes one STEP assembly. The axis is
 * stretched or shortened from the file's stroke to the ordered stroke when its metadata allows it. A parallel kit
 * is turned about the drive shaft to `options.kitSide`, and the motor about its shaft so its connector points to
 * `connectorSide(options)`. `twin` adds a copy of the axis (and of its drive train) beside it.
 */
export async function buildCombo(
  sel: ComboSelection,
  found: ComboDrawings,
  req: Pick<Requirements, 'mounting' | 'cog'>,
  load: (d: Drawing) => Promise<string>,
  options: ComboOptions = defaultComboOptions,
  twin?: TwinAxis,
): Promise<Combo> {
  if (found.missing.length > 0 || !found.axis || !found.kit || !found.motor) throw new Error('drawings missing')
  const axisMeta = found.axis.meta!
  const kitMeta = found.kit.meta!
  const motorMeta = (found.motor.meta as MotorMeta | null) ?? defaultMotorMeta(sel.motor.maker)
  const [axisText, kitText, motorText, gearboxText] = await Promise.all([
    load(found.axis),
    load(found.kit),
    load(found.motor),
    found.gearbox ? load(found.gearbox) : Promise.resolve(null),
  ])

  let axisFile = parseStep(axisText)
  const stretch = sel.stroke - axisMeta.stroke
  if (stretch !== 0) {
    if (!axisMeta.stretch) throw new Error(`no stretch data for ${found.axis.model}`)
    axisFile = stretchPart(axisFile, axisMeta.stretch, stretch).file
  }

  // axis → world: slide centre at the origin, travel and slide normal by the mounting
  const world = mountingFrame(req.mounting)
  const slideFrame: Frame = { origin: axisMeta.slide.origin, axis: axisMeta.slide.travel, up: axisMeta.slide.normal }
  const axisToWorld = mate(identity, { origin: [0, 0, 0], axis: world.travel, up: world.normal }, slideFrame)
  let kitToWorld = mate(axisToWorld, axisMeta.drive, kitMeta.axisFace)
  // sides as seen from the motor end: `drive.axis` points out towards the viewer, `drive.up` is the slide side
  const out = rotate(axisToWorld, axisMeta.drive.axis)
  const up = rotate(axisToWorld, axisMeta.drive.up)
  const right = cross(up, out)
  const sideVector = (side: Side) =>
    side === 'up' ? up : side === 'down' ? scale(up, -1) : side === 'right' ? right : scale(right, -1)
  const parallel = sel.kit.type === 'parallel'
  if (parallel) {
    const offset = sub(apply(kitToWorld, kitMeta.motorFace.origin), apply(kitToWorld, kitMeta.axisFace.origin))
    const radial = sub(offset, scale(out, dot(offset, out)))
    if (Math.hypot(...radial) > 1)
      kitToWorld = turnAbout(kitToWorld, apply(axisToWorld, axisMeta.drive.origin), out, radial, sideVector(options.kitSide))
  }
  const parts: (AssemblyPart & { role: PartRole })[] = [
    { role: 'axis', name: sel.axisModel, file: axisFile, transform: axisToWorld },
    { role: 'kit', name: sel.kit.product, file: parseStep(kitText), transform: kitToWorld },
  ]
  let motorParent = { transform: kitToWorld, frame: kitMeta.motorFace }
  if (found.gearbox && gearboxText) {
    const gearboxMeta = found.gearbox.meta!
    const gearboxToWorld = mate(kitToWorld, kitMeta.motorFace, gearboxMeta.output)
    parts.push({ role: 'gearbox', name: sel.gearbox!.model, file: parseStep(gearboxText), transform: gearboxToWorld })
    motorParent = { transform: gearboxToWorld, frame: gearboxMeta.input }
  }
  let motorToWorld = mate(motorParent.transform, motorParent.frame, motorMeta.flange)
  const shaft = rotate(motorToWorld, motorMeta.flange.axis)
  const connector = rotate(motorToWorld, motorMeta.connector ?? motorMeta.flange.up)
  const target = sideVector(connectorSide(options, parallel))
  motorToWorld = turnAbout(motorToWorld, apply(motorToWorld, motorMeta.flange.origin), shaft, connector, target)
  parts.push({ role: 'motor', name: found.motor.model, file: parseStep(motorText), transform: motorToWorld })

  const lateral = cross(world.normal, world.travel)
  let name = parts.map((p) => p.name).join(' + ')
  // Second axis of a twin arrangement at +y (the COG's lateral direction), with its own drive train when it has a motor
  if (twin) {
    const shift = scale(lateral, twin.spacing)
    const copies = parts
      .filter((p) => twin.drive || p.role === 'axis')
      .map((p) => ({ ...p, name: `${p.name} (2)`, transform: { ...p.transform, t: add(p.transform.t, shift) } }))
    parts.push(...copies)
    name += ' (2 axes)'
  }
  const cog = add(add(scale(world.travel, req.cog.x), scale(lateral, req.cog.y)), scale(world.normal, req.cog.z))
  const notices = [...new Set([axisText, kitText, motorText, gearboxText].flatMap((t) => (t && sourceNotice(t)) || []))]
  const step = writeStep(assemble(name, parts, { notices }))
  return {
    name,
    step,
    parts: parts.map(({ role, name, transform }) => ({ role, name, transform })),
    cog,
    slideCentre: [0, 0, 0],
    axisStroke: axisMeta.stroke,
    stretch,
  }
}
