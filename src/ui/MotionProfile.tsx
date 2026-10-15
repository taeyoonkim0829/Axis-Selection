import { useState } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Settings } from '../calc/types'
import { ProfileChart } from './ProfileChart'
import { fmt } from './format'

interface Props {
  axis: AxisEvaluation
  drive: DriveEvaluation | null
  settings: Settings
  vertical: boolean
}

export function MotionProfile({ axis, drive, settings, vertical }: Props) {
  const [open, setOpen] = useState(true)
  const p = axis.profile
  return (
    <section className="panel">
      <ProfileChart
        axis={axis}
        drive={drive}
        settings={settings}
        vertical={vertical}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      <dl className="profile">
          <div>
            <dt>최고 속도</dt>
            <dd>
              {fmt(p.peakVelocity, 3)} m/s{!p.reachedVelocity && <span className="warn-text"> (설정 속도 미도달)</span>}
            </dd>
          </div>
          <div>
            <dt>최대 가속도</dt>
            <dd>{fmt(p.peakAcceleration, 2)} m/s²</dd>
          </div>
          <div>
            <dt>가속 시간</dt>
            <dd>{fmt(p.accelTime, 3)} s</dd>
          </div>
          <div>
            <dt>등속 시간</dt>
            <dd>{fmt(p.constantTime, 3)} s</dd>
          </div>
          <div>
            <dt>이동 시간 (편도)</dt>
            <dd>{fmt(p.moveTime, 3)} s</dd>
          </div>
          <div>
            <dt>사이클 (왕복)</dt>
            <dd>{fmt(axis.cycleTime, 3)} s</dd>
          </div>
        </dl>
    </section>
  )
}
