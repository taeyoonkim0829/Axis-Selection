import { useState } from 'react'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Settings } from '../calc/types'
import { motorFamilies } from '../data'
import type { MotorMaker } from '../data/types'
import { CheckTable, CollapseTitle, Ratio, SortTh, StatusBadge, ToggleButton, ToggleGroup } from './common'
import { statusRank, useSort } from './useSort'
import { fmt } from './format'

interface Props {
  /** One row per motor; a motor that fails direct drive may carry the gearbox it would need (a hint only) */
  results: DriveEvaluation[]
  /** The selected motor with the gearbox actually chosen in step 3 (direct drive by default) */
  selected: DriveEvaluation | null
  onSelect: (id: string) => void
  settings: Settings
  onSettings: (settings: Settings) => void
}

const makers: MotorMaker[] = ['Festo', 'Siemens', 'Mitsubishi']

const ROW_LIMIT = 60

export function MotorStep({ results, selected, onSelect, settings, onSettings }: Props) {
  const selectedId = selected?.motor.id ?? null
  const [showFailed, setShowFailed] = useState(false)
  const [detailOpen, setDetailOpen] = useState(true)
  const passing = results.filter((r) => r.status !== 'fail')
  const {
    sorted: listed,
    sort,
    toggle,
  } = useSort(showFailed ? results : passing, {
    status: (d) => statusRank[d.status],
    maker: (d) => d.motor.maker,
    model: (d) => d.motor.model,
    power: (d) => d.motor.ratedPower,
    gearbox: (d) => d.gearbox?.ratio ?? 1,
    peak: (d) => d.peakTorque / d.motor.peakTorque,
    rms: (d) => d.rmsTorque / d.motor.ratedTorque,
    speed: (d) => d.maxMotorSpeed / d.motor.ratedSpeed,
    inertia: (d) => d.checks.find((c) => c.label === '관성비')?.ratio ?? null,
  })
  const th = { sort, onSort: toggle }
  const rows = listed.slice(0, ROW_LIMIT)
  const familyOptions = settings.makers.flatMap((m) => motorFamilies[m])
  const excluded = settings.excludedMotorFamilies
  const onMakers = (v: MotorMaker[]) => {
    // Never leave every listed family switched off: re-enable the remaining makers' families.
    const options = v.flatMap((m) => motorFamilies[m])
    const all = options.every((f) => excluded.includes(f))
    onSettings({
      ...settings,
      makers: v,
      excludedMotorFamilies: all ? excluded.filter((f) => !options.includes(f)) : excluded,
    })
  }

  return (
    <section className="panel step" id="step-motor">
      <header className="step-head">
        <h2>
          <span className="step-no">2</span> 모터 선정
        </h2>
        <span className="muted">적합 {passing.length}</span>
        <label className="toggle small">
          <input type="checkbox" checked={showFailed} onChange={(e) => setShowFailed(e.target.checked)} />
          <span>부적합 포함</span>
        </label>
      </header>
      <div className="step-filters">
        <ToggleGroup options={makers} selected={settings.makers} onChange={onMakers} />
        <ToggleButton
          label="브레이크 모터만"
          checked={settings.requireBrake}
          onChange={(v) => onSettings({ ...settings, requireBrake: v })}
        />
      </div>
      <div className="step-filters">
        <ToggleGroup
          options={familyOptions}
          selected={familyOptions.filter((f) => !excluded.includes(f))}
          onChange={(v) =>
            onSettings({
              ...settings,
              excludedMotorFamilies: [
                ...excluded.filter((f) => !familyOptions.includes(f)),
                ...familyOptions.filter((f) => !v.includes(f)),
              ],
            })
          }
        />
      </div>

      {rows.length === 0 ? (
        <p className="empty">조건을 만족하는 모터가 없습니다. 다른 축을 선택해 보세요.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh id="status" {...th}>
                  판정
                </SortTh>
                <SortTh id="maker" {...th}>
                  메이커
                </SortTh>
                <SortTh id="model" {...th}>
                  모델명
                </SortTh>
                <SortTh id="power" num {...th}>
                  정격 출력
                </SortTh>
                <SortTh id="gearbox" {...th}>
                  감속기
                </SortTh>
                <SortTh id="peak" {...th}>
                  최대 토크
                </SortTh>
                <SortTh id="rms" {...th}>
                  실효 토크
                </SortTh>
                <SortTh id="speed" {...th}>
                  회전수
                </SortTh>
                <SortTh id="inertia" {...th}>
                  관성비
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const inertia = d.checks.find((c) => c.label === '관성비')
                return (
                  <tr
                    key={d.motor.id}
                    className={d.motor.id === selectedId ? 'selected' : ''}
                    onClick={() => onSelect(d.motor.id)}
                    tabIndex={0}
                    onKeyDown={(k) => k.key === 'Enter' && onSelect(d.motor.id)}
                  >
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>{d.motor.maker}</td>
                    <td className="model">
                      {d.motor.model}
                      {d.motor.brake && <span className="tag">브레이크</span>}
                    </td>
                    <td className="num">{d.motor.ratedPower ? `${fmt(d.motor.ratedPower, 0)} W` : '—'}</td>
                    <td>{d.gearbox ? `${d.gearbox.ratio}:1 필요` : '직결'}</td>
                    <td>
                      <Ratio ratio={d.peakTorque / d.motor.peakTorque} />
                    </td>
                    <td>
                      <Ratio ratio={d.rmsTorque / d.motor.ratedTorque} />
                    </td>
                    <td>
                      <SpeedRatio drive={d} />
                    </td>
                    <td>
                      <Ratio ratio={inertia?.ratio ?? null} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {listed.length > ROW_LIMIT && <p className="muted small-print">상위 {ROW_LIMIT}개만 표시합니다.</p>}
        </div>
      )}

      {selected && (
        <div className="detail">
          <CollapseTitle open={detailOpen} onToggle={() => setDetailOpen(!detailOpen)}>
            {selected.motor.model}
            {selected.gearbox && ` + ${selected.gearbox.model}`} 세부사항
          </CollapseTitle>
          {detailOpen && (
            <>
              <CheckTable checks={selected.checks} />
              <dl className="info">
                <div>
                  <dt>시리즈</dt>
                  <dd>{[selected.motor.series, selected.motor.description].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
                <div>
                  <dt>정격 / 최대 토크</dt>
                  <dd>
                    {fmt(selected.motor.ratedTorque, 3)} / {fmt(selected.motor.peakTorque, 3)} Nm
                  </dd>
                </div>
                <div>
                  <dt>로터 관성</dt>
                  <dd>{fmt(selected.motor.inertia, 4)} kg·cm²</dd>
                </div>
                {selected.motor.amplifier && (
                  <div>
                    <dt>앰프</dt>
                    <dd>{selected.motor.amplifier}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Motor speed as a share of the rated speed. Above rated speed is only a warning
 * (torque drops); above the maximum speed fails.
 */
export function SpeedRatio({ drive }: { drive: DriveEvaluation }) {
  const ratio = drive.maxMotorSpeed / drive.motor.ratedSpeed
  const overMax = drive.checks.some(
    (c) => (c.label === '최대 회전수' || c.label === '감속기 최대 입력 회전수') && c.status === 'fail',
  )
  return <Ratio ratio={ratio} status={overMax ? 'fail' : ratio > 1 ? 'warn' : undefined} />
}
