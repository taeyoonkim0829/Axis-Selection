import { useState } from 'react'
import { accelerationForTime, accelTimeFor, minAccelTime } from '../calc/motionProfile'
import type { Mounting, Requirements, Settings } from '../calc/types'
import cogImage from '../../images/center_of_gravity.png'
import { NumberField, ToggleButton } from './common'
import { fmt, mountingLabel } from './format'

type AccelMode = 'acceleration' | 'time'
const accelModeLabel: Record<AccelMode, string> = { acceleration: '가속도', time: '가속 시간' }

interface Props {
  req: Requirements
  settings: Settings
  onReq: (req: Requirements) => void
  onSettings: (settings: Settings) => void
}

export function InputPanel({ req, settings, onReq, onSettings }: Props) {
  const set = <K extends keyof Requirements>(key: K, value: Requirements[K]) => onReq({ ...req, [key]: value })
  const setCog = (axis: 'x' | 'y' | 'z', value: number) => onReq({ ...req, cog: { ...req.cog, [axis]: value } })
  const setS = <K extends keyof Settings>(key: K, value: Settings[K]) => onSettings({ ...settings, [key]: value })

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
          <h2>사용 조건</h2>
          <div className="field">
            <span className="field-label">축 설치 방향</span>
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
                  {mountingLabel[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <NumberField label="스트로크" unit="mm" value={req.stroke} min={1} onChange={(v) => set('stroke', v)} />
            <NumberField label="소재 무게" unit="kg" value={req.payload} onChange={(v) => set('payload', v)} />
          </div>
          <div className="field">
            <span className="field-label">가속 입력</span>
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
                  {accelModeLabel[m]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid-2">
            <NumberField
              label="속도"
              unit="m/s"
              value={req.velocity}
              min={0.001}
              onChange={(v) => setMotion({ velocity: v })}
            />
            {accelMode === 'acceleration' ? (
              <NumberField
                label="가속도"
                unit="m/s²"
                value={req.acceleration}
                min={0.001}
                onChange={(v) => set('acceleration', v)}
                hint={`가속 시간 ${fmt(accelTimeFor(req.velocity, req.acceleration, req.jerk), 3)} s`}
              />
            ) : (
              <NumberField
                label="가속 시간"
                unit="s"
                value={accelTime}
                min={0.001}
                onChange={(t) => {
                  setAccelTime(t)
                  setMotion({}, t)
                }}
                hint={
                  accelTime < minTime
                    ? `저크 제한으로 최소 ${fmt(minTime, 3)} s`
                    : `가속도 ${fmt(req.acceleration, 2)} m/s²`
                }
              />
            )}
            <NumberField label="저크" unit="m/s³" value={req.jerk} onChange={(v) => setMotion({ jerk: v })} />
            <NumberField label="휴지 시간" unit="s" value={settings.dwellTime} onChange={(v) => setS('dwellTime', v)} />
          </div>
        </section>

        <section>
          <h2>소재 무게 중심</h2>
          <div className="grid-3">
            <NumberField label="X" unit="mm" value={req.cog.x} min={-1e6} onChange={(v) => setCog('x', v)} />
            <NumberField label="Y" unit="mm" value={req.cog.y} min={-1e6} onChange={(v) => setCog('y', v)} />
            <NumberField label="Z" unit="mm" value={req.cog.z} min={-1e6} onChange={(v) => setCog('z', v)} />
          </div>
          <details className="cog-details">
            <summary>무게 중심 입력 가이드</summary>
            <img className="cog-image" src={cogImage} alt="축 형태별 X, Y, Z 좌표 방향" />
            <p className="help cog-help">
              슬라이드 중심 기준 거리
              <br />X = 이동 방향
              <br />Y = 슬라이드 면의 측면 방향
              <br />Z = 슬라이드 면에서 위쪽
            </p>
          </details>
        </section>
      </div>

      <details className="panel settings">
        <summary>상세 설정</summary>
        <div className="grid-2">
          <NumberField
            label="구동 효율 (스핀들)"
            value={settings.efficiency.spindle}
            min={0.01}
            onChange={(v) => setS('efficiency', { ...settings.efficiency, spindle: v })}
          />
          <NumberField
            label="구동 효율 (벨트)"
            value={settings.efficiency.belt}
            min={0.01}
            onChange={(v) => setS('efficiency', { ...settings.efficiency, belt: v })}
          />
          <NumberField
            label="마찰 계수 (스핀들)"
            value={settings.friction.spindle}
            onChange={(v) => setS('friction', { ...settings.friction, spindle: v })}
          />
          <NumberField
            label="마찰 계수 (벨트)"
            value={settings.friction.belt}
            onChange={(v) => setS('friction', { ...settings.friction, belt: v })}
          />
          <NumberField
            label="외부 반력 Fc"
            unit="N"
            value={settings.externalForce}
            onChange={(v) => setS('externalForce', v)}
          />
          <NumberField
            label="가이드 저항 FG"
            unit="N"
            value={settings.guideResistance}
            onChange={(v) => setS('guideResistance', v)}
          />
          <NumberField
            label="커플링 관성"
            unit="kg·cm²"
            value={settings.couplingInertia}
            onChange={(v) => setS('couplingInertia', v)}
          />
          <NumberField
            label="기본 허용 관성비"
            unit="배"
            value={settings.defaultInertiaRatio}
            min={0.1}
            onChange={(v) => setS('defaultInertiaRatio', v)}
            hint="모터 데이터에 없을 때"
          />
          <NumberField
            label="지지 간격"
            unit="mm"
            value={settings.supportSpan}
            onChange={(v) => setS('supportSpan', v)}
            hint="0 = 양 끝만 지지"
          />
          <NumberField
            label="일 가동 시간"
            unit="h"
            value={settings.hoursPerDay}
            min={0.1}
            onChange={(v) => setS('hoursPerDay', v)}
          />
        </div>
        <div className="field">
          <span className="field-label">보수적 판정</span>
          <ToggleButton
            label={settings.conservative ? '켜짐' : '꺼짐'}
            checked={settings.conservative}
            onChange={(v) => setS('conservative', v)}
          />
          <span className="field-hint">켜면 등속 구간 토크가 정격 토크를 넘을 때 주의 대신 부적합</span>
        </div>
      </details>
    </aside>
  )
}

/** Keeps converted values readable in the input (e.g. 0.1 instead of 0.09999999999999999). */
function round(n: number): number {
  return Number(n.toPrecision(6))
}
