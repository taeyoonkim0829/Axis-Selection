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
import { add, cross, identity, mate, scale, type Frame, type Transform } from './geometry'
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

const DEFAULT_MOTOR: MotorMeta = { flange: { origin: [0, 0, 0], axis: [0, 0, -1], up: [0, 1, 0] } }

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

/**
 * Places axis → kit → (gearbox →) motor by their mating frames and writes one STEP assembly. The axis is
 * stretched or shortened from the file's stroke to the ordered stroke when its metadata allows it.
 */
export async function buildCombo(
  sel: ComboSelection,
  found: ComboDrawings,
  req: Pick<Requirements, 'mounting' | 'cog'>,
  load: (d: Drawing) => Promise<string>,
): Promise<Combo> {
  if (found.missing.length > 0 || !found.axis || !found.kit || !found.motor) throw new Error('drawings missing')
  const axisMeta = found.axis.meta!
  const kitMeta = found.kit.meta!
  const motorMeta = (found.motor.meta as MotorMeta | null) ?? DEFAULT_MOTOR
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
  const kitToWorld = mate(axisToWorld, axisMeta.drive, kitMeta.axisFace)
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
  parts.push({
    role: 'motor',
    name: found.motor.model,
    file: parseStep(motorText),
    transform: mate(motorParent.transform, motorParent.frame, motorMeta.flange),
  })

  const lateral = cross(world.normal, world.travel)
  const cog = add(add(scale(world.travel, req.cog.x), scale(lateral, req.cog.y)), scale(world.normal, req.cog.z))
  const notices = [...new Set([axisText, kitText, motorText, gearboxText].flatMap((t) => (t && sourceNotice(t)) || []))]
  const name = parts.map((p) => p.name).join(' + ')
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
