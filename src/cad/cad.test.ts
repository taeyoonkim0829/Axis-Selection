import { describe, expect, it } from 'vitest'
import { axes, kits, motors, shafts } from '../data'
import { buildCombo, comboDrawings, defaultComboOptions, drivePositionWords, DRIVE_POSITIONS, type ComboSelection } from './combo'
import { motorDrawingFor, parseDrawingPath, shaftDrawingFor, type Drawing, type ShaftMeta } from './drawings'
import { apply, invert, mate, type Frame } from './geometry'
import { closure, parseStep, pointOf, refs, typeOf, writeStep, type StepFile } from './step'
import { stretchPart, type StretchSpec } from './stretch'
import { definitionByName, shapeOf, solidsOf } from './structure'

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

type OcctMesh = { name: string; attributes: { position: { array: number[] } } }
type Occt = { ReadStepFile: (data: Uint8Array, params: null) => { success: boolean; meshes: OcctMesh[] } }
const occt = import('occt-import-js').then((m) => (m.default as () => Promise<Occt>)())

async function meshBox(step: string) {
  const result = (await occt).ReadStepFile(new TextEncoder().encode(step), null)
  expect(result.success).toBe(true)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  // each mesh's own box, by name
  const parts: { name: string; lo: number[]; hi: number[] }[] = []
  for (const m of result.meshes) {
    const p = m.attributes.position.array
    const part = { name: m.name, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        part.lo[k] = Math.min(part.lo[k], p[i + k])
        part.hi[k] = Math.max(part.hi[k], p[i + k])
      }
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], part.lo[k])
      hi[k] = Math.max(hi[k], part.hi[k])
    }
    parts.push(part)
  }
  return { lo, hi, meshes: result.meshes.length, parts }
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

  // the profile's mounting holes (x = 36, on the base y = 0) at z = −650 … −50, every 100 mm; the circle at −100
  // (fixed end) is another feature
  const holes = (file: StepFile) => {
    const rep = shapeOf(file, definitionByName(file, spec.stretch.part)!)!
    const z = new Set<number>()
    for (const solid of solidsOf(file, rep))
      for (const id of closure(file, solid)) {
        const body = file.entities.get(id)!
        if (typeOf(body) !== 'CIRCLE') continue
        const centre = pointOf(file.entities.get(refs(file.entities.get(refs(body)[0])!)[0])!)!
        if (Math.abs(centre[0] - 36) < 0.01 && Math.abs(centre[1]) < 0.01) z.add(Math.round(centre[2] * 10) / 10)
      }
    return [...z].filter((v) => v !== -100).sort((a, b) => a - b)
  }

  it.each([
    [137, 8],
    [300, 10],
    [-57, 6],
    [-130, 5],
  ])('keeps the hole pitch when the length changes by %i mm', async (delta, count) => {
    expect(holes(axisFile)).toEqual([-650, -550, -450, -350, -250, -150, -50])
    const { file, pitch } = stretchPart(axisFile, spec.stretch, delta)
    expect(pitch).toBe(100)
    const z = holes(file)
    expect(z.length).toBe(count)
    expect(z.slice(1).map((v, i) => v - z[i])).toEqual(Array(count - 1).fill(100))
    // the holes at the fixed end stay; the rest of the length goes between the pattern and the moving end
    expect(z.at(-1)).toBe(-50)
    const end = (await meshBox(writeStep(file))).lo[2]
    expect(end).toBeCloseTo(-698.5 - delta, 0)
    expect(z[0] - end).toBeGreaterThan(40)
  })

  it('keeps a one-off feature in place when whole pitches are removed', () => {
    // ELGT-BS-160-500: mounting holes every 100 mm, a centring slot (x = 0, r 4, z ≈ −600) 126.5 mm from the moving
    // end; Festo's 300 model has it at −400
    const path = 'data/axes/Festo/Drawings/ELGT/8124517_ELGT-BS-160-500-10P'
    const meta = metas[`../../${path}.json`] as { stretch: StretchSpec }
    const slot = (file: StepFile) => {
      const rep = shapeOf(file, definitionByName(file, meta.stretch.part)!)!
      const z = new Set<number>()
      for (const solid of solidsOf(file, rep))
        for (const id of closure(file, solid)) {
          const body = file.entities.get(id)!
          if (typeOf(body) !== 'CIRCLE' || !/,4\.?\)/.test(body)) continue
          const centre = pointOf(file.entities.get(refs(file.entities.get(refs(body)[0])!)[0])!)!
          if (Math.abs(centre[0]) < 0.01) z.add(Math.round(centre[2]))
        }
      return [...z].sort((a, b) => a - b)
    }
    const file = parseStep(text(`${path}.stp`))
    expect(slot(file)).toEqual([-601, -599, -201, -199, -100])
    const r = stretchPart(file, meta.stretch, -200)
    expect(r.pitch).toBe(100)
    expect(slot(r.file)).toEqual([-401, -399, -201, -199, -100])
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

  it('places the second axis of a twin arrangement beside the first', async () => {
    const sel = selection(500)
    const found = comboDrawings(sel, testDrawings)
    const cog = { mounting: 'floor' as const, cog: { x: 0, y: 0, z: 0 } }
    const single = await meshBox((await buildCombo(sel, found, cog, load)).step)
    const shaft = await buildCombo(sel, found, cog, load, undefined, { spacing: 400, drive: false })
    expect(shaft.parts.map((p) => p.role)).toEqual(['axis', 'kit', 'motor', 'axis'])
    const box = await meshBox(shaft.step)
    expect(box.meshes).toBe(single.meshes + 7)
    // floor: +y is the lateral direction (normal × travel); the copy sits 400 mm over
    expect(box.hi[1] - box.lo[1]).toBeCloseTo(single.hi[1] - single.lo[1] + 400, 0)
    const motorSync = await buildCombo(sel, found, cog, load, undefined, { spacing: 400, drive: true })
    expect(motorSync.parts).toHaveLength(6)
  }, 30000)

  it('joins two belt axes with the KSK connecting shaft, lengthened to the spacing', async () => {
    const paths = [
      'data/axes/Festo/Drawings/EGC/3013354_EGC-80-500-TB-KF-0H-GK.stp',
      'data/kits/Festo/Drawings/EAMM-A/557983_EAMM-A-L48-60G.stp',
      files[2],
      'data/shafts/Festo/Drawings/562521_KSK-80-200.stp',
    ]
    const list: Drawing[] = paths.map((path) => ({
      ...parseDrawingPath(path)!,
      url: path,
      meta: metas[`../../${path.replace(/.stp$/, '.json')}`] ?? null,
    }))
    const sel: ComboSelection = {
      axis: axes.find((a) => a.id === 'EGC-80-...-TB-KF-GK')!,
      axisModel: 'EGC-80-500-TB-KF-0H-GK',
      stroke: 500,
      motor: motors.find((m) => m.model === 'EMMT-AS-60-S-HS')!,
      gearbox: null,
      kit: kits.find((k) => k.product === 'EAMM-A-L48-60G')!,
    }
    const found = comboDrawings(sel, list)
    const drawing = shaftDrawingFor(shafts.find((s) => s.model === 'KSK-80')!, list)!
    expect(drawing.path).toBe(paths[3])
    const cog = { mounting: 'floor' as const, cog: { x: 0, y: 0, z: 0 } }
    // spacing 400 − drive width 82 = LN 318
    const twin = { spacing: 400, drive: false }
    const plain = await buildCombo(sel, found, cog, load, undefined, twin)
    const combo = await buildCombo(sel, found, cog, load, undefined, { ...twin, shaft: { model: 'KSK-80-318', length: 318, drawing } })
    expect(combo.parts.map((p) => p.role)).toEqual(['axis', 'kit', 'motor', 'axis', 'shaft'])
    // the cover cap on the shaft side of the first axis is gone (the second's moved to its other head); the shaft
    // adds its two drive shafts and the tube part
    expect((await meshBox(combo.step)).meshes).toBe((await meshBox(plain.step)).meshes - 1 + 3)
    // the end faces sit on the drive covers facing each other (y = ±41 about each axis, the second 400 mm over)
    const meta = drawing.meta as ShaftMeta
    const shaft = combo.parts[4].transform
    expect(apply(shaft, meta.end.origin)[1]).toBeCloseTo(41, 1)
    expect(apply(shaft, [0, 0, meta.length / 2 + 118])[1]).toBeCloseTo(400 - 41, 1)
    // the motor went to the shaft end away from the second axis
    expect(apply(combo.parts[2].transform, [0, 0, 0])[1]).toBeLessThan(0)
    // the second axis is the first's mirror image: turned end for end, its slide (standing out to −y on the first)
    // at the far end of the travel, its drive at the head on the first's drive end (−x)
    const parts = (await meshBox(combo.step)).parts
    const [s1, s2] = parts.filter((p) => p.name.includes('GPTB1')).sort((a, b) => a.lo[1] - b.lo[1])
    expect(s1.lo[1] + s2.hi[1]).toBeCloseTo(400, 0)
    expect(s1.hi[1] + s2.lo[1]).toBeCloseTo(400, 0)
    expect(s2.lo[0]).toBeCloseTo(s1.lo[0], 0)
    // caps: none on the shaft side of either drive head, the second's outer side capped; both far ends capped
    const caps = parts.filter((p) => p.name.includes('(CUP)'))
    expect(caps.filter((c) => c.hi[0] < 0).map((c) => Math.round(c.lo[1]))).toEqual([440])
    expect(caps.filter((c) => c.lo[0] > 500)).toHaveLength(4)
    // the lengthened shaft alone: 318 mm plus the drive shafts reaching 24 mm into each axis
    const stretched = stretchPart(parseStep(text(paths[3])), meta.stretch, 118).file
    const box = await meshBox(writeStep(stretched))
    expect(box.hi[2] - box.lo[2]).toBeCloseTo(318 + 2 * 24, 0)
  }, 60000)

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

  it('turns the parallel kit and the motor to the chosen sides', async () => {
    const sel = selection(800, 'EMMT-AS-60-S-HS', 'EAMM-U-87-T46-60P-114')
    const found = comboDrawings(sel, testDrawings)
    const options = { ...defaultComboOptions, kitSide: 'right', motorConnector: 'right' } as const
    const combo = await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, options)
    const box = await meshBox(combo.step)
    // seen from the motor end (−X, looking +X, slide up), right is −Y: motor centre 114 mm off, connector 71 mm further
    expect(box.lo[1]).toBeCloseTo(-114 - 71, 0)
    expect(box.hi[1]).toBeCloseTo(58.1, 0)
    // nothing hangs below the axis profile any more
    expect(box.lo[2]).toBeCloseTo(-90, 0)
  })

  it("turns the second axis's parallel kit and motor on their own under motor sync", async () => {
    const sel = selection(800, 'EMMT-AS-60-S-HS', 'EAMM-U-87-T46-60P-114')
    const found = comboDrawings(sel, testDrawings)
    const twin = { spacing: 400, drive: true }
    const req = { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } } as const
    const same = await meshBox((await buildCombo(sel, found, req, load, defaultComboOptions, twin)).step)
    const options = { ...defaultComboOptions, twinKitSide: 'left', twinMotorConnector: 'left' } as const
    const turned = await meshBox((await buildCombo(sel, found, req, load, options, twin)).step)
    // both motors below the axes; then the second one (at +y) turned to its left (+Y), the first one still below
    expect(same.hi[1]).toBeCloseTo(400 + 58.1, 0)
    expect(turned.hi[1]).toBeCloseTo(400 + 114 + 71, 0)
    expect(turned.lo[2]).toBeCloseTo(same.lo[2], 0)
    expect(turned.meshes).toBe(same.meshes)
  }, 60000)

  it('puts the motor of a belt axis on either shaft end and either end of the axis', async () => {
    const axis = axes.find((a) => a.id === 'EGC-70-...-TB-KF-GK')!
    const sel: ComboSelection = {
      axis,
      axisModel: 'EGC-70-300-TB-KF-0H-GK',
      stroke: 300,
      motor: motors.find((m) => m.model === 'EMMT-AS-60-S-HS')!,
      gearbox: null,
      kit: kits.find((k) => k.product === 'EAMM-A-L38-60P-G2' && k.axisCode === 'L38')!,
    }
    const paths = ['data/axes/Festo/Drawings/EGC/3012492_EGC-70-300-TB-KF-0H-GK.stp', 'data/kits/Festo/Drawings/EAMM-A/8197454_EAMM-A-L38-60P-G2.stp', files[2]]
    const own = paths.map((path) => ({ ...parseDrawingPath(path)!, url: path, meta: metas[`../../${path.replace(/\.stp$/, '.json')}`] ?? null }))
    const found = comboDrawings(sel, own)
    expect(found.missing).toEqual([])
    const boxes = []
    for (const drive of DRIVE_POSITIONS) {
      const combo = await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, { ...defaultComboOptions, drive })
      boxes.push(await meshBox(combo.step))
    }
    const [plain, side, end, both] = boxes
    // the motor stands out sideways: the other shaft end mirrors it across the axis, the other end turns the axis
    // about the slide normal through the slide centre
    expect(side.lo[1]).toBeCloseTo(-plain.hi[1], 0)
    expect(end.lo[0]).toBeCloseTo(-plain.hi[0], 0)
    expect(end.lo[1]).toBeCloseTo(-plain.hi[1], 0)
    expect(both.lo[1]).toBeCloseTo(plain.lo[1], 0)
    // the shaft cover cap moves to the end the motor left
    expect(new Set(boxes.map((b) => b.meshes)).size).toBe(1)
    const meta = found.axis!.meta!
    const words = DRIVE_POSITIONS.map((p) => drivePositionWords(meta, 'floor', p))
    expect(new Set(words.map((w) => `${w.end} ${w.side}`)).size).toBe(4)
    // the EGC slide stands out to −x, the file's drive shaft end is at +x: 우측 is the slide side
    expect(words.map((w) => `${w.end} ${w.side}`)).toEqual(['앞 좌측', '앞 우측', '뒤 좌측', '뒤 우측'])
    expect(words.map((w) => w.order)).toEqual([0, 1, 2, 3])
    // motor sync: the second axis (at +y) is the first's mirror image, the EGC-TB-KF slide standing out to one side:
    // turned end for end with its slide at the far end of the travel and its drive at the other head
    const twin = { spacing: 400, drive: true }
    const mirrored = await meshBox((await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, defaultComboOptions, twin)).step)
    // symmetric about the plane between the axes, along the same stretch of travel
    expect(mirrored.lo[1]).toBeCloseTo(plain.lo[1], 0)
    expect(mirrored.lo[1] + mirrored.hi[1]).toBeCloseTo(400, 0)
    expect(mirrored.lo[0]).toBeCloseTo(plain.lo[0], 0)
    expect(mirrored.hi[0]).toBeCloseTo(plain.hi[0], 0)
    const pair = (key: string) => mirrored.parts.filter((p) => p.name.includes(key)).sort((a, b) => a.lo[1] - b.lo[1])
    // the slides: the first stands out to −y, the second to +y, at the same place along the travel
    const [s1, s2] = pair('GPTB1')
    expect(s1.lo[1] + s1.hi[1]).toBeLessThan(-5)
    expect(s1.lo[1] + s2.hi[1]).toBeCloseTo(400, 0)
    expect(s2.lo[0]).toBeCloseTo(s1.lo[0], 0)
    // the motors at the same end, mirrored
    const [m1, m2] = pair('EMMT')
    expect(m2.lo[0]).toBeCloseTo(m1.lo[0], 0)
    expect(m1.lo[1] + m2.hi[1]).toBeCloseTo(400, 0)
    // caps: the drive heads open on the motor side only, the far heads capped on both sides
    const caps = mirrored.parts.filter((p) => p.name.includes('(CUP)'))
    expect(caps.filter((c) => Math.abs(c.lo[0] - m1.lo[0]) < 100)).toHaveLength(2)
    expect(caps).toHaveLength(6)
    // or its own position, here the other shaft end: the motor (inwards like the first) turns outwards
    const turned = await meshBox(
      (
        await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, { ...defaultComboOptions, twinDrive: DRIVE_POSITIONS[1] }, twin)
      ).step,
    )
    expect(turned.hi[1]).toBeGreaterThan(mirrored.hi[1] + 100)
    expect(turned.meshes).toBe(mirrored.meshes)
    // the drive train is assembled on the turned axis: a connector to the left (along the travel, seen from the
    // first's motor end) points the same way on both motors
    const left = await meshBox(
      (await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, { ...defaultComboOptions, motorConnector: 'left' }, twin)).step,
    )
    const [l1, l2] = left.parts.filter((p) => p.name.includes('EMMT')).sort((a, b) => a.lo[1] - b.lo[1])
    expect(l1.hi[0] - l1.lo[0]).toBeGreaterThan(m1.hi[0] - m1.lo[0] + 30)
    expect(l2.lo[0]).toBeCloseTo(l1.lo[0], 0)
    expect(l2.hi[0]).toBeCloseTo(l1.hi[0], 0)
    // the same value on the second (left seen from its own motor end) points the other way
    const same = await meshBox(
      (
        await buildCombo(
          sel,
          found,
          { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } },
          load,
          { ...defaultComboOptions, motorConnector: 'left', twinMotorConnector: 'left' },
          twin,
        )
      ).step,
    )
    const [, o2] = same.parts.filter((p) => p.name.includes('EMMT')).sort((a, b) => a.lo[1] - b.lo[1])
    expect(Math.abs(o2.lo[0] - l1.lo[0])).toBeGreaterThan(20)
  }, 60000)

  it('turns the motor of an axial kit to the chosen connector side', async () => {
    const sel = selection(800)
    const found = comboDrawings(sel, testDrawings)
    const options = { ...defaultComboOptions, kitSide: 'down', motorConnector: 'right' } as const
    const combo = await buildCombo(sel, found, { mounting: 'floor', cog: { x: 0, y: 0, z: 0 } }, load, options)
    const box = await meshBox(combo.step)
    // seen from the motor end, right is −Y: the connector reaches 71 mm off the shaft, past the profile (50 mm)
    expect(box.lo[1]).toBeCloseTo(-71, 0)
  })
})
