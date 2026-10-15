// Motor–axis mounting kit lookup by mechanical interface code.
import type { Axis, Gearbox, Kit, Motor } from '../data/types'

export type KitType = Kit['type']

export interface KitMatch {
  axisCode: string | null
  /** The motor's interface code, or the gearbox's (output side) when a gearbox sits in between */
  motorCode: string | null
  motorSide: 'motor' | 'gearbox'
  /** Standard kits (axial and parallel, with and without inspection window) in file order */
  kits: Kit[]
  /** SA (custom-made) kits whose name codes match; reference only */
  special: Kit[]
}

/**
 * Default kit type for an axis. Axes exported with a parallel kit ("_parallel kit") include its effect
 * in their data, so they take a parallel kit; any other axis is evaluated as an axial (inline) build.
 */
export function kitTypeFor(axis: Axis): KitType {
  return axis.parallelKit ? 'parallel' : 'axial'
}

export function findKits(axis: Axis, motor: Motor, gearbox: Gearbox | null, all: Kit[]): KitMatch {
  const axisCode = axis.interfaceCode
  const motorCode = gearbox ? gearbox.interfaceCode : motor.interfaceCode
  const matches = axisCode && motorCode ? all.filter((k) => k.axisCode === axisCode && k.motorCode === motorCode) : []
  return {
    axisCode,
    motorCode,
    motorSide: gearbox ? 'gearbox' : 'motor',
    kits: matches.filter((k) => !k.special),
    special: matches.filter((k) => k.special),
  }
}

/** All kits in one list: the axis's kit type first, then without inspection window before with one. */
export function orderKits(kits: Kit[], axisType: KitType): Kit[] {
  const rank = (k: Kit) => (k.type === axisType ? 0 : 2) + (k.window ? 1 : 0)
  return kits.toSorted((a, b) => rank(a) - rank(b))
}
