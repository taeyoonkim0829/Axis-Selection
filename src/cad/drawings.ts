import type { Axis, Gearbox, Kit, Motor } from '../data/types'
import type { Frame } from './geometry'
import type { StretchSpec } from './stretch'
import type { Vec3 } from './step'

// Manufacturer CAD files (STEP) live next to the product data: data/<kind>/<maker>/Drawings/…/<partNumber>_<model>.stp,
// each with a JSON of the same name holding its mating frames (see data/README.md).

export type DrawingKind = 'axes' | 'motors' | 'gearboxes' | 'kits'

export interface AxisMeta {
  /** mm, stroke of the model in the file */
  stroke: number
  /** drive shaft: at the axis end face, `axis` pointing out towards the motor */
  drive: Frame
  /** slide mounting surface centre at the start position; `travel` = away from the motor */
  slide: { origin: Vec3; normal: Vec3; travel: Vec3 }
  /** how to change the length for other strokes */
  stretch?: StretchSpec
}
export interface KitMeta {
  axisFace: Frame
  motorFace: Frame
}
export interface GearboxMeta {
  /** output flange (axis / kit side) and input flange (motor side) */
  output: Frame
  input: Frame
}
export interface MotorMeta {
  flange: Frame
}

export interface Drawing<M = unknown> {
  kind: DrawingKind
  maker: string
  /** data/… path, for messages */
  path: string
  url: string
  partNumber: string | null
  /** model name from the file name */
  model: string
  meta: M | null
}

const stepUrls = import.meta.glob<string>('../../data/*/*/Drawings/**/*.{stp,step,STP,STEP}', {
  query: '?url',
  import: 'default',
  eager: true,
})
const metaFiles = import.meta.glob<unknown>('../../data/*/*/Drawings/**/*.json', { import: 'default', eager: true })

export function parseDrawingPath(path: string): Pick<Drawing, 'kind' | 'maker' | 'partNumber' | 'model' | 'path'> | null {
  const m = /data\/(axes|motors|gearboxes|kits)\/([^/]+)\/Drawings\/(?:.*\/)?([^/]+)\.(?:stp|step)$/i.exec(path)
  if (!m) return null
  const [, kind, maker, base] = m
  const named = /^(\d{5,})_(.+)$/.exec(base)
  return {
    kind: kind as DrawingKind,
    maker,
    path: path.slice(path.indexOf('data/')),
    partNumber: named?.[1] ?? null,
    model: named?.[2] ?? base,
  }
}

export const drawings: Drawing[] = Object.entries(stepUrls).flatMap(([path, url]) => {
  const info = parseDrawingPath(path)
  if (!info) return []
  const meta = metaFiles[path.replace(/\.[^.]+$/, '.json')] ?? null
  return [{ ...info, url, meta }]
})

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Axis drawings of the axis's type (any stroke), the one needing the least length change first. */
export function axisDrawingsFor(axis: Axis, stroke: number, all = drawings): Drawing<AxisMeta>[] {
  const code = axis.typeCode ?? axis.model
  const re = new RegExp(`^${code.split('…').map(escape).join('\\d+')}$`)
  return (all.filter((d) => d.kind === 'axes' && d.meta && re.test(d.model)) as Drawing<AxisMeta>[]).sort(
    (a, b) => Math.abs(a.meta!.stroke - stroke) - Math.abs(b.meta!.stroke - stroke),
  )
}

export interface MotorDrawingMatch {
  drawing: Drawing<MotorMeta>
  /** the file is another option of the same motor (encoder, shaft …), same size */
  otherOptions: boolean
}

/**
 * The motor's drawing: same model or order code, else (Festo) another option variant of the same motor —
 * the order code adds option letters after the model (EMMT-AS-60-S-HS-RS, -RMY), B = brake, which changes the length.
 */
export function motorDrawingFor(motor: Motor, all = drawings): MotorDrawingMatch | null {
  const list = all.filter((d) => d.kind === 'motors' && d.maker === motor.maker) as Drawing<MotorMeta>[]
  const exact = list.find(
    (d) =>
      d.model === motor.model ||
      (motor.orderCode != null && d.model === motor.orderCode) ||
      (motor.partNumber != null && d.partNumber === motor.partNumber),
  )
  if (exact) return { drawing: exact, otherOptions: false }
  if (motor.maker !== 'Festo') return null
  const base = motor.brake ? motor.model.replace(/-B$/, '') : motor.model
  const variant = list.find((d) => {
    if (!d.model.startsWith(`${base}-`)) return false
    const options = d.model.slice(base.length + 1)
    return !options.includes('-') && options.includes('B') === motor.brake
  })
  return variant ? { drawing: variant, otherOptions: true } : null
}

export const kitDrawingFor = (kit: Kit, all = drawings) =>
  (all.find(
    (d) => d.kind === 'kits' && (d.model === kit.product || (kit.partNumber != null && d.partNumber === kit.partNumber)),
  ) as Drawing<KitMeta> | undefined) ?? null

export const gearboxDrawingFor = (gearbox: Gearbox, all = drawings) =>
  (all.find(
    (d) =>
      d.kind === 'gearboxes' &&
      (d.model === gearbox.model || (gearbox.partNumber != null && d.partNumber === gearbox.partNumber)),
  ) as Drawing<GearboxMeta> | undefined) ?? null
