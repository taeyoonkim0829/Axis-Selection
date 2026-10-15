import { describe, expect, it } from 'vitest'
import { axes, gearboxes, kits, motors } from '../data'
import { findKits, kitTypeFor, orderKits } from './kitSelection'

const axis = (id: string) => axes.find((a) => a.id === id)!
const motor = (id: string) => motors.find((m) => m.id === id)!

describe('findKits', () => {
  it('reproduces the Excel kit selection tool for ELGD-BS-KF-60 + HG-KR43', () => {
    const m = findKits(axis('ELGD-BS-KF-60-…10P'), motor('HG-KR43'), null, kits)
    expect(m.axisCode).toBe('T42-60')
    expect(m.motorCode).toBe('60PA')
    const names = (type: string, window: boolean) =>
      m.kits.filter((k) => k.type === type && k.window === window).map((k) => k.product)
    expect(names('axial', false)).toEqual(['EAMM-A-T42-60P'])
    expect(names('axial', true)).toEqual(['GD060A060M1A-1000'])
    expect(names('parallel', false)).toEqual(['EAMM-U-65-T42-60P-87'])
    expect(names('parallel', true)).toEqual(['GD060U060M1A-1000'])
  })

  it('matches the gearbox output code instead of the motor when a gearbox is used', () => {
    const gearbox = gearboxes.find((g) => g.interfaceCode === '60G0')!
    const m = findKits(axis('ELGD-BS-KF-60-…10P'), motor('HG-KR43'), gearbox, kits)
    expect(m.motorSide).toBe('gearbox')
    expect(m.motorCode).toBe('60G0')
    expect(m.kits.every((k) => k.motorCode === '60G0')).toBe(true)
  })

  it('finds nothing when a code is missing', () => {
    const noCode = motors.find((m) => m.interfaceCode === null)!
    const m = findKits(axis('ELGD-BS-KF-60-…10P'), noCode, null, kits)
    expect(m.motorCode).toBeNull()
    expect(m.kits).toEqual([])
  })

  it('defaults to a parallel kit only for axes exported with one', () => {
    expect(kitTypeFor(axis('ELGD-BS-KF-60-…10P'))).toBe('axial')
    expect(kitTypeFor(axis('ELGD-BS-KF-80-…10P_parallel kit'))).toBe('parallel')
  })

  it('lists the axis kit type first, then plain before inspection window', () => {
    const m = findKits(axis('ELGD-BS-KF-60-…10P'), motor('HG-KR43'), null, kits)
    expect(orderKits(m.kits, 'axial').map((k) => k.product)).toEqual([
      'EAMM-A-T42-60P',
      'GD060A060M1A-1000',
      'EAMM-U-65-T42-60P-87',
      'GD060U060M1A-1000',
    ])
    expect(orderKits(m.kits, 'parallel')[0].product).toBe('EAMM-U-65-T42-60P-87')
  })
})
