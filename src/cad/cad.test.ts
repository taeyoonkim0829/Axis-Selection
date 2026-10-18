import { describe, expect, it } from 'vitest'
import { axes, kits, motors } from '../data'
import { buildCombo, comboDrawings, type ComboSelection } from './combo'
import { motorDrawingFor, parseDrawingPath, type Drawing } from './drawings'
import { apply, invert, mate, type Frame } from './geometry'
import { parseStep, writeStep } from './step'
import { stretchPart, type StretchSpec } from './stretch'

const files = [
  'data/axes/Festo/Drawings/ELGT/BS/8124427_ELGT-BS-90-500-20P.stp',
  'data/kits/Festo/Drawings/EAMM-A/4824833_EAMM-A-T46-60P.stp',
  'data/motors/Festo/Drawings/EMMT-AS/8160632_EMMT-AS-60-S-HS-RMY.stp',
  'data/motors/Mitsubishi/Drawings/HG-KR/hg-kr43_.stp',
  'data/kits/Festo/Drawings/EAMM-U/4824069_EAMM-U-87-T46-60P-114.stp',
]
const texts = import.meta.glob<string>(
  [
    '../../data/*/Festo/Drawings/**/*.stp',
    '../../data/motors/Mitsubishi/Drawings/HG-KR/hg-kr43_.stp',
  ],
  { query: '?raw', import: 'default', eager: true },
)
// every drawing file's path, not loaded
const allPaths = Object.keys(import.meta.glob('../../data/*/*/Drawings/**/*.{stp,step,STP,STEP}'))
const metas = import.meta.glob<unknown>('../../data/*/*/Drawings/**/*.json', { import: 'default', eager: true })
const text = (path: string) => texts[`../../${path}`]
const testDrawings: Drawing[] = files.map((path) => ({
  ...parseDrawingPath(path)!,
  url: path,
  meta: metas[`../../${path.replace(/\.stp$/, '.json')}`] ?? null,
}))
const load = async (d: Drawing) => text(d.path)

const selection = (stroke: number, motor = 'EMMT-AS-60-S-HS', kit = 'EAMM-A-T46-60P'): ComboSelection => ({
  axis: axes.find((a) => a.model === 'ELGT-BS-90-…20P')!,
  axisModel: `ELGT-BS-90-${stroke}-20P`,
  stroke,
  motor: motors.find((m) => m.model === motor)!,
  gearbox: null,
  kit: kits.find((k) => k.product === kit && k.axisCode === 'T46-90')!,
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

describe('drawing files', () => {
  it('reads model names from Mitsubishi file names', () => {
    const name = (file: string) => parseDrawingPath(`data/motors/Mitsubishi/Drawings/${file}`)?.names
    expect(name('HG-KR/hg-kr13b_.stp')).toEqual(['HG-KR13B'])
    expect(name('HG-AK/x/hg-ak0136_b_.stp')).toEqual(['HG-AK0136'])
    expect(name('HG-JR/hg-jr12k1(4)_.stp')).toEqual(['HG-JR12K1', 'HG-JR12K14'])
    expect(name('HG-JR/hg-jr103b.stp')).toEqual(['HG-JR103B'])
  })

  it('has a drawing for every HG-KR, HG-SR and HG-JR motor', () => {
    const all = allPaths.map((path) => ({ ...parseDrawingPath(path)!, url: path, meta: null }))
    const hg = motors.filter((m) => /^HG-(KR|SR|JR)/.test(m.model))
    expect(hg.length).toBe(50)
    expect(hg.filter((m) => !motorDrawingFor(m, all)).map((m) => m.model)).toEqual([])
  })

  it('matches HK motors without the voltage class in the model', () => {
    const all = allPaths.map((path) => ({ ...parseDrawingPath(path)!, url: path, meta: null }))
    const found = motors.filter((m) => /^HK-/.test(m.model) && motorDrawingFor(m, all))
    expect(motorDrawingFor(motors.find((m) => m.model === 'HK-KT13WB (200V)')!, all)?.drawing.model).toBe('HK-KT13WB')
    // every HK-MT and HK-RT; HK-KT/ST without their 400 V class (…4W) and a few sizes (no file yet)
    expect(motors.filter((m) => /^HK-(MT|RT)/.test(m.model)).every((m) => found.includes(m))).toBe(true)
    expect(found.length).toBe(96)
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
    // floor: motor end at −X; axis end face 730 + 300 mm from the far end (the shaft stub sits in the kit),
    // kit 47 mm, motor 114.5 mm behind its flange
    const length = 730 + 300 + 47 + 114.5
    const extent = box.hi.map((h, k) => h - box.lo[k])
    const along = mounting === 'vertical' ? 2 : 0
    expect(extent[along]).toBeCloseTo(length, 0)
    expect(combo.cog).toEqual(mounting === 'floor' ? [0, 0, 50] : [0, -50, 0])
  })

  it('mounts a Mitsubishi motor by its flange (z = 0, shaft +z) without a JSON', async () => {
    const sel = selection(500, 'HG-KR43')
    const found = comboDrawings(sel, testDrawings)
    expect(found.motor?.path).toBe(files[3])
    const combo = await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load)
    const box = await meshBox(combo.step)
    // HG-KR43 is 98.3 mm behind its flange
    expect(box.hi[0] - box.lo[0]).toBeCloseTo(730 + 47 + 98.3, 0)
  })

  it('folds the motor back under the axis with the parallel kit', async () => {
    const sel = selection(800, 'EMMT-AS-60-S-HS', 'EAMM-U-87-T46-60P-114')
    const found = comboDrawings(sel, testDrawings)
    expect(found.kit?.path).toBe(files[4])
    const combo = await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load)
    const box = await meshBox(combo.step)
    expect(box.meshes).toBe(7 + 20 + 1)
    // the housing reaches 34.8 mm beyond the axis end face; the motor lies alongside the axis
    expect(box.hi[0] - box.lo[0]).toBeCloseTo(730 + 300 + 34.8, 0)
    // below the axis: kit 114 mm centre distance, motor connector pointing away from the axis (71 mm off centre);
    // above the drive shaft the kit housing (39.5 mm) stands out over the profile (37 mm)
    expect(box.hi[2] - box.lo[2]).toBeCloseTo(39.5 + 114 + 71, 0)
  })
})
