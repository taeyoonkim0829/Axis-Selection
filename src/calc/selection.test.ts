import { describe, expect, it } from 'vitest'
import { axes, gearboxes, motors } from '../data'
import type { Axis, Gearbox, Motor } from '../data/types'
import { evaluateAxis, guideLoads, selectAxes, G } from './axisSelection'
import { evaluateDrive, gearboxOptionsFor, selectMotors } from './motorSelection'
import { defaultSettings, type Requirements } from './types'

const baseReq: Requirements = {
  stroke: 500,
  velocity: 0.5,
  acceleration: 5,
  jerk: 0,
  payload: 10,
  cog: { x: 0, y: 0, z: 0 },
  mounting: 'floor',
}

const spindle = { ...axes.find((a) => a.id === 'ELGT-BS-120-…10P')! }

describe('guideLoads', () => {
  it('floor mounting follows the Excel load case', () => {
    const l = guideLoads({ ...baseReq, cog: { x: 100, y: 50, z: 200 } }, 10, 5)
    expect(l.Fz).toBeCloseTo(10 * G)
    expect(l.Mx).toBeCloseTo(0.05 * 10 * G)
    expect(l.My).toBeCloseTo(0.1 * 10 * G + 0.2 * 50)
    expect(l.Mz).toBeCloseTo(0.05 * 50)
  })

  it('vertical mounting puts weight + inertia on the moments', () => {
    const l = guideLoads({ ...baseReq, mounting: 'vertical', cog: { x: 0, y: 100, z: 50 } }, 10, 5)
    expect(l.My).toBeCloseTo(0.05 * 10 * (G + 5))
    expect(l.Mz).toBeCloseTo(0.1 * 10 * (G + 5))
    expect(l.Fz).toBe(0)
  })
})

describe('torque calculation', () => {
  it('matches the closed-form trapezoid result for a horizontal spindle', () => {
    const settings = { ...defaultSettings, friction: { spindle: 0, belt: 0 } }
    const axis: Axis = { ...spindle, noLoadTorque: 0 }
    const ev = evaluateAxis(axis, baseReq, settings)!
    const motor = { ...motors[0], inertia: 1, peakTorque: 100, ratedTorque: 100 } as Motor
    const drive = evaluateDrive(ev, motor, null, settings)

    const alpha = 5 * ((2 * Math.PI) / (axis.spindlePitch! / 1000))
    const jl = ev.inertia * 1e-4
    const expected = (jl / 0.9 + 1e-4) * alpha // Excel TMa with TL = 0
    expect(drive.peakTorque).toBeCloseTo(expected, 4)
    expect(drive.inertiaRatio).toBeCloseTo(ev.inertia / 1)
    expect(drive.maxMotorSpeed).toBeCloseTo((0.5 * 60000) / axis.spindlePitch!)
  })

  it('warns on constant-velocity torque above rated, fails in conservative mode', () => {
    // Process force keeps the constant segment loaded; a long dwell keeps the RMS torque low.
    const settings = { ...defaultSettings, externalForce: 300, dwellTime: 30 }
    const ev = evaluateAxis(spindle, baseReq, settings)!
    const constantTorque = (300 * spindle.spindlePitch!) / 1000 / (2 * Math.PI) / 0.9
    const motor = { ...motors[0], ratedTorque: constantTorque * 0.8, peakTorque: 100 } as Motor
    const constantCheck = (conservative: boolean) =>
      evaluateDrive(ev, motor, null, { ...settings, conservative }).checks.find((c) => c.label === '등속 구간 토크')!

    expect(constantCheck(false).status).toBe('warn')
    expect(constantCheck(false).value).toBeGreaterThan(constantTorque)
    expect(constantCheck(true).status).toBe('fail')
    expect(evaluateDrive(ev, motor, null, settings).checks.find((c) => c.label === '실효 토크')!.status).toBe('ok')

    const strong = { ...motor, ratedTorque: constantTorque * 2 } as Motor
    expect(evaluateDrive(ev, strong, null, { ...settings, conservative: true }).checks.find((c) => c.label === '등속 구간 토크')!.status).toBe('ok')
  })

  it('fails when the motor speed exceeds the gearbox max input speed', () => {
    const ev = evaluateAxis(spindle, baseReq, defaultSettings)!
    const motor = { ...motors[0], maxSpeed: 1e5, ratedSpeed: 1e5 } as Motor
    const base = gearboxes.find((g) => g.family === 'EMGA')!
    const speedCheck = (maxInputSpeed: number) => {
      const gearbox: Gearbox = { ...base, maxInputSpeed }
      const drive = evaluateDrive(ev, motor, gearbox, defaultSettings)
      return drive.checks.find((c) => c.label === '감속기 최대 입력 회전수')!
    }
    const speed = evaluateDrive(ev, motor, base, defaultSettings).maxMotorSpeed
    expect(speedCheck(speed * 1.1).status).toBe('ok')
    expect(speedCheck(speed * 0.9).status).toBe('fail')
  })

  it('vertical axis needs holding torque during dwell', () => {
    const settings = { ...defaultSettings, dwellTime: 0.5 }
    const ev = evaluateAxis(spindle, { ...baseReq, mounting: 'vertical' }, settings)!
    const dwell = ev.samples.filter((s) => s.dir === 0)
    const holding = (ev.movingMass * G * ev.feed) / (2000 * Math.PI)
    expect(dwell[0].torque).toBeCloseTo(holding)
  })
})

describe('selection on real data', () => {
  it('finds passing axes and motors for a typical horizontal case', () => {
    const results = selectAxes(axes, baseReq, defaultSettings)
    const ok = results.filter((r) => r.status !== 'fail')
    expect(ok.length).toBeGreaterThan(0)
    expect(results.findIndex((r) => r.status === 'fail')).toBeGreaterThanOrEqual(ok.length)

    const drives = selectMotors(ok[0], motors, { ...defaultSettings, makers: ['Festo', 'Siemens', 'Mitsubishi'] })
    expect(drives[0].status).not.toBe('fail')
    expect(new Set(drives.filter((d) => d.status !== 'fail').map((d) => d.motor.maker)).size).toBe(3)
  })

  it('rejects axes when the stroke is too long', () => {
    const results = selectAxes(axes, { ...baseReq, stroke: 20000 }, defaultSettings)
    expect(results.every((r) => r.status === 'fail')).toBe(true)
  })

  it('brake filter keeps only brake motors', () => {
    const [first] = selectAxes(axes, { ...baseReq, mounting: 'vertical' }, defaultSettings)
    const drives = selectMotors(first, motors, { ...defaultSettings, requireBrake: true })
    expect(drives.every((d) => d.motor.brake)).toBe(true)
  })

  it('offers Apex gearboxes to HG-KR/HG-SR like their HF-KP/HF-SP counterparts', () => {
    const fits = (model: string) => gearboxOptionsFor(motors.find((m) => m.model === model)!).map((g) => g.id)
    expect(fits('HG-KR13')).toEqual(fits('HF-KP13'))
    expect(fits('HG-KR13')).toContain('AB042-3')
    expect(fits('HG-SR102')).toEqual(fits('HF-SP102'))
    expect(fits('HG-SR102').length).toBeGreaterThan(0)
    // The gearbox input side must take the motor's mounting interface.
    for (const m of motors.filter((x) => x.maker === 'Mitsubishi'))
      for (const g of gearboxOptionsFor(m)) if (g.driveCode) expect(g.driveCode, `${m.model} ${g.id}`).toBe(m.interfaceCode)
  })

  it('checks direct drive only, or each motor with its lowest passing gearbox', () => {
    const [first] = selectAxes(axes, baseReq, defaultSettings)
    const direct = selectMotors(first, motors, defaultSettings)
    expect(direct.every((d) => d.gearbox === null)).toBe(true)

    const geared = selectMotors(first, motors, { ...defaultSettings, useGearbox: true })
    expect(geared.length).toBeGreaterThan(0)
    expect(geared.every((d) => d.gearbox !== null)).toBe(true)
    for (const d of geared.filter((g) => g.status !== 'fail')) {
      const lower = gearboxOptionsFor(d.motor).filter((g) => g.ratio < d.gearbox!.ratio)
      expect(lower.every((g) => evaluateDrive(first, d.motor, g, defaultSettings).status === 'fail')).toBe(true)
    }
  })
})
