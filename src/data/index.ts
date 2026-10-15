import type { Axis, Gearbox, Kit, Motor } from './types'

// Product data is maintained directly in these JSON files (see data/README.md):
// one file per maker and product family, data/<kind>/<maker>/<family>.json
type DataFile = { items: unknown[] }
const axisFiles = import.meta.glob<DataFile>('../../data/axes/*/*.json', { eager: true, import: 'default' })
const motorFiles = import.meta.glob<DataFile>('../../data/motors/*/*.json', { eager: true, import: 'default' })
const gearboxFiles = import.meta.glob<DataFile>('../../data/gearboxes/*/*.json', { eager: true, import: 'default' })
const kitFiles = import.meta.glob<DataFile>('../../data/kits/*/*.json', { eager: true, import: 'default' })

const items = <T,>(files: Record<string, DataFile>) => Object.values(files).flatMap((f) => f.items as T[])

export const axes = items<Axis>(axisFiles)
export const motors = items<Motor>(motorFiles)
export const gearboxes = items<Gearbox>(gearboxFiles)
export const kits = items<Kit>(kitFiles)

/** Families of each maker present in the data, sorted by name. */
export const motorFamilies = Object.fromEntries(
  (['Festo', 'Siemens', 'Mitsubishi'] as const).map((maker) => [
    maker,
    [...new Set(motors.filter((m) => m.maker === maker).map((m) => m.family))].sort(),
  ]),
) as Record<Motor['maker'], string[]>

/** Gearboxes whose compatibility list names this motor (Apex lists Mitsubishi frame codes like "KP053"). */
export function gearboxesFor(motor: Motor, all: Gearbox[] = gearboxes): Gearbox[] {
  return all.filter((g) => g.compatibleMotors?.some((code) => motor.model.includes(code)))
}
