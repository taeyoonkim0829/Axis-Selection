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

/** 'plain' = without inspection window (일반), 'window' = with one (견시창) */
export type KitWindow = 'plain' | 'window'

/** Kits of one type, optionally only those with one of the given window variants. */
export function kitsOf(kits: Kit[], type: KitType, windows?: readonly KitWindow[]): Kit[] {
  return kits.filter((k) => k.type === type && (!windows || windows.includes(k.window ? 'window' : 'plain')))
}
