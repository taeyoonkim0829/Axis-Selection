import { describe, expect, it } from 'vitest'
import { axes, brakingResistors, cables, controllers, motors } from '../data'
import { evaluateAxis } from './axisSelection'
import { attachController, selectController } from './controllerSelection'
import { evaluateDrive } from './motorSelection'
import { defaultSettings, type Requirements } from './types'

const data = { controllers, resistors: brakingResistors, cables }
const req: Requirements = { stroke: 500, velocity: 0.5, acceleration: 5, jerk: 0, payload: 10, cog: { x: 0, y: 0, z: 0 }, mounting: 'floor' }
const run = (axisId: string, motorId: string, r: Partial<Requirements> = {}, s: Partial<typeof defaultSettings> = {}) => {
  const settings = { ...defaultSettings, ...s }
  const ev = evaluateAxis(axes.find((a) => a.id === axisId)!, { ...req, ...r }, settings)!
  const drive = evaluateDrive(ev, motors.find((m) => m.id === motorId)!, null, settings)
  return { ev, drive, settings, selection: selectController(ev, drive, settings, data)! }
}

describe('selectController', () => {
  it('picks the smallest drive of the motor voltage class that carries the required current', () => {
    const { selection } = run('ELGD-BS-KF-60-…10P', 'EMMT-AS-60-M-HS')
    expect(selection.controller!.model).toBe('CMMT-AS-C2-11A-P3-MP-S1')
    // Festo's preferred combination is shown when it differs
    expect(selection.preferred!.model).toBe('CMMT-AS-C3-11A-P3-MP-S1')
    expect(selection.status).toBe('ok')
    // LS winding: 230 V single-phase drives
    expect(run('ELGD-BS-KF-60-…10P', 'EMMT-AS-60-S-LS').selection.controller!.voltageClass).toBe('3A')
    expect(run('ELGD-BS-KF-60-…10P', 'EMMT-ST-57-M', { velocity: 0.2 }).selection.controller!.family).toBe('CMMT-ST')
  })

  it('selects the motor cable by length and cross-section', () => {
    const at = (motor: string, cableLength: number) => run('ELGD-BS-KF-60-…10P', motor, {}, { cableLength }).selection.cables
    expect(at('EMMT-AS-60-M-HS', 5)[0]).toMatchObject({ type: 'NEBM-M23G15-EH-5-Q7N-R3LEG14', partNumber: '5251375', configurable: false })
    // no standard length: configurable cable
    expect(at('EMMT-AS-60-M-HS', 12)[0]).toMatchObject({ type: 'NEBM-M23/40', partNumber: '8190874', configurable: true })
    // EMMT-ST-57: 0.5 mm² up to 5 m, 0.75 mm² up to 10 m
    expect(at('EMMT-ST-57-M', 5)[0].type).toBe('NEBM-M17G12-EH-5-Q6N-LE12')
    expect(at('EMMT-ST-57-M', 7.5)[0].type).toBe('NEBM-M17G12-EH-7.5-Q7N-LE12')
    // EMMB-AS: motor, encoder, encoder adapter and, with brake, the brake cable
    expect(at('EMMB-AS-60-04-B', 5).map((c) => c.role)).toEqual(['motor', 'encoder', 'adapter', 'brake'])
    expect(at('EMMB-AS-60-04', 5).map((c) => c.role)).toEqual(['motor', 'encoder', 'adapter'])
  })

  it('warns beyond the cable selection table', () => {
    const { selection } = run('ELGD-BS-KF-60-…10P', 'EMMT-AS-60-M-HS', {}, { cableLength: 40 })
    expect(selection.cables.some((c) => c.role === 'motor')).toBe(false)
    expect(selection.checks.find((c) => c.label === '모터 케이블 길이')!.status).toBe('warn')
  })

  it('adds an external braking resistor when the integrated one is too small', () => {
    const { selection } = run('EGC-185-...-BS-40P-KF-GK', 'EMMT-AS-190-M-HS', { payload: 200, velocity: 1, acceleration: 5, mounting: 'vertical' })
    expect(selection.resistor.averagePower).toBeGreaterThan(selection.controller!.internalResistor!.nominalPower)
    expect(selection.resistor.required).toBe(true)
    expect(selection.controller!.brakingResistors).toContain(selection.resistor.item!.model)
    // a small horizontal move regenerates nothing: no-load torque and friction take the braking
    expect(run('ELGD-BS-KF-60-…10P', 'EMMT-AS-60-M-HS').selection.resistor.required).toBe(false)
  })

  it('folds the drive package verdict into the motor and skips other makers', () => {
    const { ev, drive, settings } = run('ELGD-BS-KF-60-…10P', 'EMMT-AS-60-M-HS')
    expect(attachController(ev, drive, settings, data).controller!.controller).not.toBeNull()
    const other = evaluateDrive(ev, motors.find((m) => m.maker === 'Mitsubishi')!, null, settings)
    expect(selectController(ev, other, settings, data)).toBeNull()
  })
})

describe('stepper torque-speed curve', () => {
  it('fails when the required torque exceeds the 48 V curve at speed', () => {
    const curve = (velocity: number) =>
      run('ELGD-BS-KF-60-…10P', 'EMMT-ST-57-M', { velocity }).drive.checks.find((c) => c.label === '토크-회전수 선도')!
    expect(curve(0.2).status).toBe('ok')
    expect(curve(0.5).status).toBe('fail')
    // open loop: the curve is divided by a safety factor
    const open = run('ELGD-BS-KF-60-…10P', 'EMMS-ST-57-M', { velocity: 0.1 }).drive.checks.find((c) => c.label === '토크-회전수 선도')!
    expect(open.limit).toBeCloseTo(1.4 / 1.5, 2)
  })
})
