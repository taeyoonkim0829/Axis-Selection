import { describe, expect, it } from 'vitest'
import { defaultGantry, type GantryAxis, type GantryInputs } from '../calc/gantry'
import { gantryJoint } from '../calc/gantryKits'
import { adapters, axes, kits, motors } from '../data'
import type { Axis, AxisAdapter } from '../data/types'
import { buildCombo, comboDrawings, defaultComboOptions, type ComboSelection } from './combo'
import { parseDrawingPath, type AdapterMeta, type Drawing } from './drawings'
import { buildGantry, type GantryAxisDrawing } from './gantry'

const texts = import.meta.glob<string>('../../data/*/Festo/Drawings/**/*.stp', { query: '?raw', import: 'default', eager: true })
const metas = import.meta.glob<unknown>('../../data/*/Festo/Drawings/**/*.json', { import: 'default', eager: true })
const all: Drawing[] = Object.keys(texts).map((key) => {
  const path = key.slice('../../'.length)
  return { ...parseDrawingPath(path)!, url: path, meta: metas[key.replace(/\.stp$/, '.json')] ?? null }
})
const load = async (d: Drawing) => texts[`../../${d.path}`]

type OcctMesh = { name: string; attributes: { position: { array: number[] } } }
type Occt = { ReadStepFile: (data: Uint8Array, params: null) => { success: boolean; meshes: OcctMesh[] } }
const occt = import('occt-import-js').then((m) => (m.default as () => Promise<Occt>)())

/** bounding box of each mesh whose name matches */
async function boxes(step: string, re: RegExp) {
  const result = (await occt).ReadStepFile(new TextEncoder().encode(step), null)
  expect(result.success).toBe(true)
  return result.meshes
    .filter((m) => re.test(m.name))
    .map((m) => {
      const lo = [Infinity, Infinity, Infinity]
      const hi = [-Infinity, -Infinity, -Infinity]
      const p = m.attributes.position.array
      for (let i = 0; i < p.length; i += 3)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[i + k])
          hi[k] = Math.max(hi[k], p[i + k])
        }
      return { name: m.name, lo, hi }
    })
}

/** an axis of the data with the first motor and kit that have drawings */
function axisDrawing(a: GantryAxis, axis: Axis, stroke: number, g: GantryInputs): GantryAxisDrawing {
  for (const kit of kits.filter((k) => k.axisCode === axis.interfaceCode && k.type === 'axial' && !k.special))
    for (const motor of motors.filter((m) => m.maker === 'Festo' && m.interfaceCode === kit.motorCode)) {
      const sel: ComboSelection = { axis, axisModel: `${axis.model}-${stroke}`, stroke, motor, gearbox: null, kit }
      const found = comboDrawings(sel, all)
      if (found.missing.length === 0)
        return {
          axis: a,
          sel,
          found,
          req: { mounting: a === 'z' ? 'vertical' : a === 'y' ? g.yMounting : g.xMounting, cog: { x: 0, y: 0, z: 50 } },
          options: defaultComboOptions,
        }
    }
  throw new Error(`no drawings for ${axis.model}`)
}

describe('gantry kits', () => {
  const find = (family: string, size: number, drive: Axis['drive'], longSlide = false, variant = '') =>
    axes.find((x) => x.family === family && x.size === size && x.drive === drive && x.longSlide === longSlide && (x.variant || '') === variant)!
  const wallY: GantryInputs = { ...defaultGantry, yMounting: 'wall' }

  it('picks the adapter plate by the Z stroke (type C up to 100 mm on ELGT-120/90, else type B)', () => {
    const [y, z] = [find('ELGT', 120, 'spindle'), find('ELGT', 90, 'spindle')]
    expect(gantryJoint(wallY, 'y', 'z', y, z, 100, adapters).kit?.model).toBe('EHAM-MA-L9-120-L9-90-S')
    expect(gantryJoint(wallY, 'y', 'z', y, z, 300, adapters).kit?.model).toBe('EHAM-MA-L9-120-L9-90')
    const long = gantryJoint(wallY, 'y', 'z', y, z, 600, adapters)
    expect(long.status).toBe('warn')
    expect(long.noteArgs?.max).toBe(500)
  })

  it('needs the long slide on the ELGD base axis and two kits under two X axes', () => {
    const y = find('ELGD', 80, 'belt')
    const short = gantryJoint(wallY, 'x', 'y', find('ELGD', 80, 'belt'), y, 500, adapters)
    expect(short.kit?.model).toBe('EHAM-AK-E24-80-E24-80-MR-S')
    expect(short.status).toBe('warn')
    const ok = gantryJoint(wallY, 'x', 'y', find('ELGD', 80, 'belt', true), y, 500, adapters)
    expect(ok.status).toBe('ok')
    expect(ok.quantity).toBe(2)
    // mirror images, both walls reaching inwards: the first X axis (−Y) takes MR, reaching to +Y
    expect(ok.kits.map((k) => k.model)).toEqual(['EHAM-AK-E24-80-E24-80-MR-S', 'EHAM-AK-E24-80-E24-80-ML-S'])
  })

  it('takes the angle kit hand whose wall reaches towards the carried axis', () => {
    const [x, y] = [find('ELGT', 160, 'spindle'), find('ELGT', 120, 'spindle')]
    const single = { ...wallY, xParallel: { ...wallY.xParallel, mode: 'single' as const } }
    const at = (dy: number) => gantryJoint({ ...single, offsets: { ...single.offsets, xy: { x: 0, y: dy, z: 0 } } }, 'x', 'y', x, y, 500, adapters).kit?.model
    // seen facing the Y slide (from −X), ML reaches to the right (−Y), MR to the left (+Y)
    expect(at(300)).toBe('EHAM-AK-L9-160-L9-120-MR')
    expect(at(-300)).toBe('EHAM-AK-L9-160-L9-120-ML')
    expect(at(0)).toBe('EHAM-AK-L9-160-L9-120-ML')
  })

  it('has no kit for Z on a floor-mounted Y', () => {
    const j = gantryJoint(defaultGantry, 'y', 'z', find('ELGT', 120, 'spindle'), find('ELGT', 90, 'spindle'), 300, adapters)
    expect(j.kind).toBeNull()
    expect(j.status).toBe('warn')
  })
})

describe('gantry drawing', () => {
  it('builds a long twin X axis (more entity ids than a call takes as arguments)', async () => {
    // ELGT lengthened by whole hole pitches: 3000 mm takes the file past 100 000 entities
    const x = axes.find((a) => a.family === 'ELGT' && a.drive === 'spindle' && a.size === 160)!
    const d = axisDrawing('x', x, 3000, defaultGantry)
    const combo = await buildCombo(d.sel, d.found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, defaultComboOptions, {
      spacing: 600,
      drive: true,
    })
    expect(combo.parts.filter((p) => p.role === 'axis')).toHaveLength(2)
  }, 120000)

  it('stands Y on the X slide with an angle kit and hangs Z on the Y slide with an adapter plate (ELGT)', async () => {
    const g: GantryInputs = { ...defaultGantry, yMounting: 'wall', xParallel: { ...defaultGantry.xParallel, mode: 'single' } }
    const elgt = (size: number) => axes.find((x) => x.family === 'ELGT' && x.drive === 'spindle' && x.size === size)!
    const [x, y, z] = [elgt(160), elgt(120), elgt(90)]
    const parts = [axisDrawing('x', x, 1000, g), axisDrawing('y', y, 500, g), axisDrawing('z', z, 300, g)]
    const xy = gantryJoint(g, 'x', 'y', x, y, 500, adapters)
    const yz = gantryJoint(g, 'y', 'z', y, z, 300, adapters)
    expect(xy.kit?.model).toBe('EHAM-AK-L9-160-L9-120-ML')
    expect(yz.kit?.model).toBe('EHAM-MA-L9-120-L9-90')
    const drawing = (k: AxisAdapter) => (all.find((d) => d.kind === 'adapters' && d.partNumber === k.partNumber) as Drawing<AdapterMeta>) ?? null
    const combo = await buildGantry(
      g,
      parts,
      [xy, yz].map((j) => ({ base: j.base, carried: j.carried, kits: j.kits.map((kit) => ({ kit, drawing: drawing(kit) })) })),
      load,
    )
    expect(combo.unkitted).toEqual([])
    const found = await boxes(combo.step, /EHAM|ELGT-BS/)
    const kitXY = found.find((b) => /EHAM-AK/.test(b.name))!
    const kitYZ = found.find((b) => /EHAM-MA/.test(b.name))!
    // the angle kit stands on the X slide (top at z = 0), the plate on the Y slide (facing −X)
    expect(kitXY.lo[2]).toBeCloseTo(0, 0)
    expect(kitYZ.lo[0]).toBeLessThan(0)
  }, 120000)

  it('mirrors the angle kits under two X axes, both walls reaching inwards', async () => {
    const g: GantryInputs = { ...defaultGantry, config: 'xy', yMounting: 'wall', xParallel: { ...defaultGantry.xParallel, mode: 'twinMotor', spacing: 1000 } }
    const elgt = (size: number) => axes.find((x) => x.family === 'ELGT' && x.drive === 'spindle' && x.size === size)!
    const [x, y] = [elgt(160), elgt(120)]
    const xy = gantryJoint(g, 'x', 'y', x, y, 1000, adapters)
    const drawing = (k: AxisAdapter) => (all.find((d) => d.kind === 'adapters' && d.partNumber === k.partNumber) as Drawing<AdapterMeta>) ?? null
    const combo = await buildGantry(
      g,
      [{ ...axisDrawing('x', x, 800, g), twin: { spacing: 1000, drive: true } }, axisDrawing('y', y, 1000, g)],
      [{ base: 'x', carried: 'y', kits: xy.kits.map((kit) => ({ kit, drawing: drawing(kit) })) }],
      load,
    )
    const found = (await boxes(combo.step, /EHAM-AK/)).filter((b) => /EHAM-AK/.test(b.name))
    expect(found.map((b) => b.name.replace(/^\d+ /, '').replace(/---.*$/, '')).sort()).toEqual(['EHAM-AK-L9-160-L9-120-ML', 'EHAM-AK-L9-160-L9-120-MR'])
    // each wall (470 mm, foot at one end over its X axis at ∓500) lies mostly between the X axes
    for (const b of found) expect(Math.abs((b.lo[1] + b.hi[1]) / 2)).toBeLessThan(450)
  }, 120000)
})
