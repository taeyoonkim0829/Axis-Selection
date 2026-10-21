import { axisCog, type AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Requirements } from '../calc/types'
import { comboDrawings, type ComboDrawings, type ComboSelection, type TwinAxis } from '../cad/combo'
import { shaftDrawingFor } from '../cad/drawings'
import type { Kit } from '../data/types'

/**
 * What one axis's combination drawing is built from (step 5, and each axis of the gantry drawing): the selection,
 * its drawing files, the requirements with the COG relative to the first axis, and the second axis of a twin
 * arrangement (its own drive train under motor sync, else the KSK when it has a drawing; LM guides are not drawn).
 */
export function comboInputs(
  axis: AxisEvaluation | null,
  drive: DriveEvaluation | null,
  kit: Kit | null,
  input: Requirements,
): { selection: ComboSelection | null; found: ComboDrawings | null; twin: TwinAxis | undefined; req: Requirements } {
  // The drawing is built from the first axis: the COG is placed relative to its slide centre.
  const req = { ...input, cog: axisCog(input) }
  const selection: ComboSelection | null =
    axis && drive && kit
      ? { axis: axis.axis, axisModel: axis.order.model, stroke: axis.order.stroke ?? req.stroke, motor: drive.motor, gearbox: drive.gearbox, kit }
      : null
  const found = selection ? comboDrawings(selection) : null
  const shaftDrawing = axis?.shaft ? shaftDrawingFor(axis.shaft.shaft) : null
  const twin: TwinAxis | undefined =
    axis && axis.layout.axes > 1 && input.parallel
      ? {
          spacing: input.parallel.spacing,
          drive: axis.layout.mode === 'twinMotor',
          ...(axis.shaft && shaftDrawing && axis.shaft.length > 0
            ? { shaft: { model: axis.shaft.model, length: axis.shaft.length, drawing: shaftDrawing } }
            : {}),
        }
      : undefined
  return { selection, found, twin, req }
}

/** The part of a rebuild key that a combination's inputs give */
export const comboKey = (selection: ComboSelection, req: Requirements, twin: TwinAxis | undefined) =>
  [
    selection.axis.id,
    selection.stroke,
    selection.motor.id,
    selection.gearbox?.id,
    selection.kit.id,
    req.mounting,
    req.cog.x,
    req.cog.y,
    req.cog.z,
    twin ? `${twin.spacing}/${twin.drive}/${twin.shaft?.model ?? ''}` : '',
  ].join('|')
