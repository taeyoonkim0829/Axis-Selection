import { useState } from 'react'
import { accelerationForTime, accelTimeFor, minAccelTime } from '../calc/motionProfile'
import { defaultPress, type Mounting, type PressConditions, type Requirements, type Settings } from '../calc/types'
import { useT } from '../i18n'
import cogImage from '../../images/center_of_gravity.png'
import { NumberField, RadioGroup, ToggleButton } from './common'
import { fmt, kgf, mountingLabel, pressDirectionLabel } from './format'

type AccelMode = 'acceleration' | 'time'
const accelModeLabel: Record<AccelMode, string> = { acceleration: '가속도', time: '가속 시간' }

interface Props {
  req: Requirements
  settings: Settings
  onReq: (req: Requirements) => void
  onSettings: (settings: Settings) => void
}

export function InputPanel({ req, settings, onReq, onSettings }: Props) {
  const t = useT()
  const set = <K extends keyof Requirements>(key: K, value: Requirements[K]) => onReq({ ...req, [key]: value })
  const setCog = (axis: 'x' | 'y' | 'z', value: number) => onReq({ ...req, cog: { ...req.cog, [axis]: value } })
  const setS = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettings({ ...settings, [key]: value })
  const press = req.press ?? defaultPress
  const setPress = <K extends keyof PressConditions>(key: K, value: PressConditions[K]) =>
    onReq({ ...req, press: { ...press, [key]: value } })

  // Acceleration can be entered directly or as the time to reach the velocity; the calculation always uses
  // req.acceleration, so in time mode it is re-derived whenever velocity, time or jerk changes.
  const [accelMode, setAccelMode] = useState<AccelMode>('acceleration')
  const [accelTime, setAccelTime] = useState(() => round(accelTimeFor(req.velocity, req.acceleration, req.jerk)))
  const setMotion = (patch: Partial<Pick<Requirements, 'velocity' | 'jerk'>>, time = accelTime) => {
    const next = { ...req, ...patch }
    if (accelMode === 'time') next.acceleration = accelerationForTime(next.velocity, time, next.jerk)
    onReq(next)
  }
  const changeAccelMode = (mode: AccelMode) => {
    if (mode === 'time') setAccelTime(round(accelTimeFor(req.velocity, req.acceleration, req.jerk)))
    else onReq({ ...req, acceleration: round(req.acceleration) })
    setAccelMode(mode)
  }
  const minTime = minAccelTime(req.velocity, req.jerk)

  const setMounting = (mounting: Mounting) => {
    onReq({ ...req, mounting })
    // A vertical axis must not drop the load on power loss.
    if ((mounting === 'vertical') !== settings.requireBrake) setS('requireBrake', mounting === 'vertical')
  }

  return (
    <aside className="inputs">
      <div className="panel inputs-main">
        <section>
          <h2>{t('사용 조건')}</h2>
          <div className="field">
            <span className="field-label">{t('축 설치 방향')}</span>
            <div className="segmented" role="radiogroup">
              {(Object.keys(mountingLabel) as Mounting[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={req.mounting === m}
                  className={req.mounting === m ? 'active' : ''}
                  onClick={() => setMounting(m)}
                >
                  {t(mountingLabel[m])}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <NumberField label={t('스트로크')} unit="mm" value={req.stroke} min={1} onChange={(v) => set('stroke', v)} />
            <NumberField label={t('소재 무게')} unit="kg" value={req.payload} onChange={(v) => set('payload', v)} />
          </div>
          <div className="field">
            <span className="field-label">{t('가속 입력')}</span>
            <div className="segmented" role="radiogroup">
              {(Object.keys(accelModeLabel) as AccelMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={accelMode === m}
                  className={accelMode === m ? 'active' : ''}
                  onClick={() => changeAccelMode(m)}
                >
                  {t(accelModeLabel[m])}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <NumberField
              label={t('속도')}
              unit="m/s"
              value={req.velocity}
              min={0.001}
              onChange={(v) => setMotion({ velocity: v })}
            />
            {accelMode === 'acceleration' ? (
              <NumberField
                label={t('가속도')}
                unit="m/s²"
                value={req.acceleration}
                min={0.001}
                onChange={(v) => set('acceleration', v)}
                hint={t('가속 시간 {time} s', { time: fmt(accelTimeFor(req.velocity, req.acceleration, req.jerk), 3) })}
              />
            ) : (
              <NumberField
                label={t('가속 시간')}
                unit="s"
                value={accelTime}
                min={0.001}
                onChange={(time) => {
                  setAccelTime(time)
                  setMotion({}, time)
                }}
                hint={
                  accelTime < minTime
                    ? t('저크 제한으로 최소 {time} s', { time: fmt(minTime, 3) })
                    : t('가속도 {accel} m/s²', { accel: fmt(req.acceleration, 2) })
                }
              />
            )}
            <NumberField label={t('저크')} unit="m/s³" value={req.jerk} onChange={(v) => setMotion({ jerk: v })} />
            <NumberField label={t('휴지 시간')} unit="s" value={settings.dwellTime} onChange={(v) => setS('dwellTime', v)} />
          </div>
        </section>

        <section>
          <h2>{t('소재 무게 중심')}</h2>
          <div className="grid-3">
            <NumberField label="X" unit="mm" value={req.cog.x} min={-1e6} onChange={(v) => setCog('x', v)} />
            <NumberField label="Y" unit="mm" value={req.cog.y} min={-1e6} onChange={(v) => setCog('y', v)} />
            <NumberField label="Z" unit="mm" value={req.cog.z} min={-1e6} onChange={(v) => setCog('z', v)} />
          </div>
          <details className="cog-details">
            <summary>{t('무게 중심 입력 가이드')}</summary>
            <img className="cog-image" src={cogImage} alt={t('축 형태별 X, Y, Z 좌표 방향')} />
            <p className="help cog-help">
              {t('슬라이드 중심 기준 거리')}
              <br />
              {t('X = 이동 방향')}
              <br />
              {t('Y = 슬라이드 면의 측면 방향')}
              <br />
              {t('Z = 슬라이드 면에서 위쪽')}
            </p>
          </details>
        </section>
      </div>

      <section className="panel application">
        <h2>{t('어플리케이션 선택')}</h2>
        <div className="segmented" role="radiogroup">
          {(['general', 'press'] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={press.enabled === (a === 'press')}
              className={press.enabled === (a === 'press') ? 'active' : ''}
              onClick={() => setPress('enabled', a === 'press')}
            >
              {t(a === 'press' ? '프레싱' : '일반')}
            </button>
          ))}
        </div>
        <p className="field-hint application-hint">
          {press.enabled
            ? t('전진 끝에서 압착 구간을 압착 속도로 누른 뒤 유지하고 복귀')
            : t('스트로크를 왕복 이송')}
        </p>
        {press.enabled && req.mounting === 'vertical' && (
          <div className="field">
            <span className="field-label">{t('압착 방향')}</span>
            <RadioGroup
              options={['down', 'up'] as const}
              value={press.direction}
              onChange={(v) => setPress('direction', v)}
              label={(v) => t(pressDirectionLabel[v])}
            />
          </div>
        )}
        {press.enabled && (
          <div className="grid-2">
            <NumberField
              label={t('압착력')}
              unit="N"
              value={press.force}
              onChange={(v) => setPress('force', v)}
              hint={kgf(press.force)}
            />
            <NumberField
              label={t('압착 구간')}
              unit="mm"
              value={press.distance}
              min={0.001}
              onChange={(v) => setPress('distance', v)}
              hint={press.distance >= req.stroke ? t('스트로크 전체를 압착') : t('스트로크 끝에서')}
            />
            <NumberField
              label={t('압착 속도')}
              unit="m/s"
              value={press.speed}
              min={0.0001}
              onChange={(v) => setPress('speed', v)}
            />
            <NumberField label={t('가압 유지 시간')} unit="s" value={press.holdTime} onChange={(v) => setPress('holdTime', v)} />
          </div>
        )}
      </section>

      <details className="panel settings">
        <summary>{t('상세 설정')}</summary>
        <div className="grid-2">
          <NumberField
            label={t('구동 효율 (스핀들)')}
            value={settings.efficiency.spindle}
            min={0.01}
            onChange={(v) => setS('efficiency', { ...settings.efficiency, spindle: v })}
          />
          <NumberField
            label={t('구동 효율 (벨트)')}
            value={settings.efficiency.belt}
            min={0.01}
            onChange={(v) => setS('efficiency', { ...settings.efficiency, belt: v })}
          />
          <NumberField
            label={t('마찰 계수 (스핀들)')}
            value={settings.friction.spindle}
            onChange={(v) => setS('friction', { ...settings.friction, spindle: v })}
          />
          <NumberField
            label={t('마찰 계수 (벨트)')}
            value={settings.friction.belt}
            onChange={(v) => setS('friction', { ...settings.friction, belt: v })}
          />
          <NumberField
            label={t('외부 반력 Fc')}
            unit="N"
            value={settings.externalForce}
            onChange={(v) => setS('externalForce', v)}
          />
          <NumberField
            label={t('가이드 저항 FG')}
            unit="N"
            value={settings.guideResistance}
            onChange={(v) => setS('guideResistance', v)}
          />
          <NumberField
            label={t('커플링 관성')}
            unit="kg·cm²"
            value={settings.couplingInertia}
            onChange={(v) => setS('couplingInertia', v)}
          />
          <NumberField
            label={t('기본 허용 관성비')}
            unit={t('배')}
            value={settings.defaultInertiaRatio}
            min={0.1}
            onChange={(v) => setS('defaultInertiaRatio', v)}
            hint={t('모터 데이터에 없을 때')}
          />
          <NumberField
            label={t('지지 간격')}
            unit="mm"
            value={settings.supportSpan}
            onChange={(v) => setS('supportSpan', v)}
            hint={t('0 = 양 끝만 지지')}
          />
          <NumberField
            label={t('일 가동 시간')}
            unit="h"
            value={settings.hoursPerDay}
            min={0.1}
            onChange={(v) => setS('hoursPerDay', v)}
          />
        </div>
        <div className="field">
          <span className="field-label">{t('보수적 판정')}</span>
          <ToggleButton
            label={settings.conservative ? t('켜짐') : t('꺼짐')}
            checked={settings.conservative}
            onChange={(v) => setS('conservative', v)}
          />
          <span className="field-hint">{t('켜면 등속 구간 토크가 정격 토크를 넘을 때 주의 대신 부적합')}</span>
        </div>
      </details>
    </aside>
  )
}

/** Keeps converted values readable in the input (e.g. 0.1 instead of 0.09999999999999999). */
function round(n: number): number {
  return Number(n.toPrecision(6))
}
