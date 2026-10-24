import { describe, expect, it } from 'vitest'
import { adapterDrawingFor, drawings, type AdapterMeta } from '../cad/drawings'
import { adapters, axes } from '../data'
import type { Axis } from '../data/types'
import { defaultGantry, type GantryInputs } from './gantry'
import { beamBrackets, gantryJoint } from './gantryKits'

// Custom cross beams (data/adapters/Custom): a Z axis across two ELGT-BS X axes on a pair of EHAM-AK-L9 angle kits
const elgt = (size: number) => axes.find((x) => x.family === 'ELGT' && x.drive === 'spindle' && x.size === size)!
const custom = adapters.filter((k) => k.custom)

describe('custom brackets', () => {
  it('lists one Z beam per ELGT-BS X size, for the Z the EHAM-MA plate on its pad takes', () => {
    const pairs: [number, number][] = [
      [90, 90],
      [120, 90],
      [160, 120],
    ]
    for (const [x, z] of pairs) {
      const found = beamBrackets(elgt(x), elgt(z), adapters)
      expect(found.map((k) => k.model)).toEqual([`BR-ELGT-BS-${x}-ELGT-BS-${z}-1`])
      expect(found[0].partNumber).toBeNull()
    }
    expect(beamBrackets(elgt(160), elgt(90), adapters)).toEqual([])
  })

  it('never takes the place of a Festo kit', () => {
    const g: GantryInputs = { ...defaultGantry, config: 'xy', yMounting: 'wall', parallel: { ...defaultGantry.parallel, x: { ...defaultGantry.parallel.x, mode: 'twinMotor', spacing: 1000 } } }
    for (const [x, y] of [
      [90, 90],
      [120, 120],
      [160, 160],
    ] as const) {
      const j = gantryJoint(g, 'x', 'y', elgt(x), elgt(y), 500, adapters)
      expect(j.kits.length).toBe(2)
      for (const k of j.kits) expect(k.custom).toBeFalsy()
    }
  })

  it('sits between the Festo kits it names: their carried end, part numbers and frames', () => {
    expect(custom.length).toBe(3)
    for (const b of custom) {
      const [ml, mr] = b.beam!.kits.map((m) => adapters.find((k) => k.model === m)!)
      expect([ml.hand, mr.hand]).toEqual(['left', 'right'])
      const fit = ml.carried.find((c) => c.size === b.base[0].size)!
      expect(fit.end).toBe(b.beam!.end)
      // the X spacing range: the kits' walls clear of each other at the shortest beam (2 mm), as gantryJoint's `clear`
      expect(b.beam!.length[0] + 2 * b.beam!.end).toBeCloseTo(2 * ml.wall![1] + 2)
      for (const k of [ml, mr]) expect(b.accessories.some((a) => a.partNumber === k.partNumber && a.quantity === 1)).toBe(true)
      // the frames on the beam's own model: kit side on the profile centreline (the kit's carried frame), the Z pad
      // (EHAM-MA base frame) in the middle of the reference length
      const own = adapterDrawingFor(b, drawings)!
      expect(own.model).toBe(b.model)
      const kitMeta = adapterDrawingFor(ml, drawings)!.meta!
      const meta = own.meta as AdapterMeta & { length: number; baseB: AdapterMeta['base'] }
      expect(meta.length).toBe(b.beam!.referenceLength)
      // beam bottom 22 mm above the X slide surface (kit foot top at 20)
      expect(meta.base.origin[2] + 22).toBeCloseTo(kitMeta.carried.origin[1])
      expect(meta.baseB.origin[0]).toBe(meta.length)
      expect(meta.carried.origin[0]).toBe(meta.length / 2)
      expect(b.mass).toBeCloseTo(b.beam!.massPerMeter * (meta.length / 1000))
    }
  })

  it('carries the Z axis like the EHAM-MA plate it names', () => {
    for (const b of custom) {
      const plate = adapters.find((k) => k.family === 'EHAM-MA' && b.accessories[2].model === k.model)!
      expect(b.carried).toEqual(plate.carried)
      const z: Axis = elgt(b.carried[0].size)
      expect(beamBrackets(elgt(b.base[0].size), z, adapters)).toContain(b)
    }
  })
})
