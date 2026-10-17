import { describe, expect, it } from 'vitest'
import { axes, kits, motors } from '../data'
import { buildCombo, comboDrawings, type ComboSelection } from './combo'
import { parseDrawingPath, type Drawing } from './drawings'
import { apply, invert, mate, type Frame } from './geometry'
import { parseStep, writeStep } from './step'
import { stretchPart, type StretchSpec } from './stretch'

const files = [
  'data/axes/Festo/Drawings/ELGT/BS/8124427_ELGT-BS-90-500-20P.stp',
  'data/kits/Festo/Drawings/EAMM-A/4824833_EAMM-A-T46-60P.stp',
  'data/motors/Festo/Drawings/EMMT-AS/8160632_EMMT-AS-60-S-HS-RMY.stp',
]
const texts = import.meta.glob<string>('../../data/*/*/Drawings/**/*.stp', { query: '?raw', import: 'default', eager: true })
const metas = import.meta.glob<unknown>('../../data/*/*/Drawings/**/*.json', { import: 'default', eager: true })
const text = (path: string) => texts[`../../${path}`]
const testDrawings: Drawing[] = files.map((path) => ({
  ...parseDrawingPath(path)!,
  url: path,
  meta: metas[`../../${path.replace(/\.stp$/, '.json')}`],
}))
const load = async (d: Drawing) => text(d.path)

const selection = (stroke: number): ComboSelection => ({
  axis: axes.find((a) => a.model === 'ELGT-BS-90-…20P')!,
  axisModel: `ELGT-BS-90-${stroke}-20P`,
  stroke,
  motor: motors.find((m) => m.model === 'EMMT-AS-60-S-HS')!,
  gearbox: null,
  kit: kits.find((k) => k.product === 'EAMM-A-T46-60P' && k.axisCode === 'T46-90')!,
})

type OcctMesh = { attributes: { position: { array: number[] } } }
type Occt = { ReadStepFile: (data: Uint8Array, params: null) => { success: boolean; meshes: OcctMesh[] } }
const occt = import('occt-import-js').then((m) => (m.default as () => Promise<Occt>)())

async function meshBox(step: string) {
  const result = (await occt).ReadStepFile(new TextEncoder().encode(step), null)
  expect(result.success).toBe(true)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const m of result.meshes) {
    const p = m.attributes.position.array
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[i + k])
        hi[k] = Math.max(hi[k], p[i + k])
      }
  }
  return { lo, hi, meshes: result.meshes.length }
}

describe('STEP', () => {
  it('reads and writes a file without changing its entities', () => {
    const file = parseStep(text(files[1]))
    const again = parseStep(writeStep(file))
    expect(again.entities.size).toBe(file.entities.size)
    expect([...again.entities.values()]).toEqual([...file.entities.values()])
  })

  it('mates a child frame onto a parent frame', () => {
    const parent: Frame = { origin: [0, 57.5, 40], axis: [0, 0, 1], up: [0, 1, 0] }
    const child: Frame = { origin: [0, 0, 47], axis: [0, 0, -1], up: [0, 1, 0] }
    const t = mate({ r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }, parent, child)
    expect(apply(t, [0, 0, 47]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 57.5, 40])
    // the child's axis turns onto the parent's
    const back = invert(t)
    expect(apply(back, [0, 57.5, 41]).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 46])
  })
})

describe('axis stretch', () => {
  const axisFile = parseStep(text(files[0]))
  const spec = testDrawings[0].meta as { stretch: StretchSpec }

  it.each([300, 200, -100, -250, -400])('changes the length by %i mm', async (delta) => {
    const { file, cut } = stretchPart(axisFile, spec.stretch, delta)
    expect(cut).toBeGreaterThan(-645)
    const box = await meshBox(writeStep(file))
    // the file is 738.5 mm long along z (−698.5 … 40)
    expect(box.hi[2]).toBeCloseTo(57.4, 0)
    expect(box.lo[2]).toBeCloseTo(-698.5 - delta, 0)
  })
})

describe('combination', () => {
  it('finds the drawings of the selection', () => {
    const found = comboDrawings(selection(500), testDrawings)
    expect(found.missing).toEqual([])
    expect(found.motorOtherOptions).toBe(true)
  })

  it.each(['floor', 'wall', 'vertical'] as const)('assembles axis, kit and motor (%s)', async (mounting) => {
    const sel = selection(800)
    const combo = await buildCombo(sel, comboDrawings(sel, testDrawings), { mounting, cog: { x: 0, y: 0, z: 50 } }, load)
    const box = await meshBox(combo.step)
    expect(box.meshes).toBe(7 + 16 + 1)
    // floor: motor end at −X, axis 738.5 + 300 mm long, motor 114.5 mm behind the kit (47 mm) at the axis end face
    const length = 738.5 + 300 + 47 + 114.5
    const extent = box.hi.map((h, k) => h - box.lo[k])
    const along = mounting === 'vertical' ? 2 : 0
    expect(extent[along]).toBeCloseTo(length, 0)
    expect(combo.cog).toEqual(mounting === 'floor' ? [0, 0, 50] : [0, -50, 0])
  })
})
