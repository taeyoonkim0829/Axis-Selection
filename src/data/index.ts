import type { Axis, BrakingResistor, Cable, ConnectingShaft, Controller, Gearbox, Kit, Motor } from './types'

// Product data is maintained directly in these JSON files (see data/README.md):
// one file per maker and product family, data/<kind>/<maker>/<family>.json
// kind = axes | motors | gearboxes | kits | drives | brakingResistors | cables | shafts.
// Files excluded with `!` stay in data/ but are not offered in the app (discontinued: Mitsubishi HF-KP/HF-SP,
// Apex PA).
type DataFile = { items: unknown[] }
const axisFiles = import.meta.glob<DataFile>('../../data/axes/*/*.json', { eager: true, import: 'default' })
const motorFiles = import.meta.glob<DataFile>(['../../data/motors/*/*.json', '!../../data/motors/Mitsubishi/HF-*.json'], {
  eager: true,
  import: 'default',
})
const gearboxFiles = import.meta.glob<DataFile>(['../../data/gearboxes/*/*.json', '!../../data/gearboxes/Apex/PA.json'], {
  eager: true,
  import: 'default',
})
const kitFiles = import.meta.glob<DataFile>('../../data/kits/*/*.json', { eager: true, import: 'default' })
const controllerFiles = import.meta.glob<DataFile>('../../data/drives/*/*.json', { eager: true, import: 'default' })
const resistorFiles = import.meta.glob<DataFile>('../../data/brakingResistors/*/*.json', { eager: true, import: 'default' })
const cableFiles = import.meta.glob<DataFile>('../../data/cables/*/*.json', { eager: true, import: 'default' })
const shaftFiles = import.meta.glob<DataFile>('../../data/shafts/*/*.json', { eager: true, import: 'default' })

const items = <T,>(files: Record<string, DataFile>) => Object.values(files).flatMap((f) => f.items as T[])

export const axes = items<Axis>(axisFiles)
export const motors = items<Motor>(motorFiles)
export const gearboxes = items<Gearbox>(gearboxFiles)
export const kits = items<Kit>(kitFiles)
export const controllers = items<Controller>(controllerFiles)
export const brakingResistors = items<BrakingResistor>(resistorFiles)
export const cables = items<Cable>(cableFiles)
export const shafts = items<ConnectingShaft>(shaftFiles)

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
