import { useState } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { Settings } from '../calc/types'
import type { AxisFamily, DriveKind } from '../data/types'
import { CheckTable, CollapseTitle, Ratio, SortTh, StatusBadge, ToggleGroup } from './common'
import { statusRank, useSort } from './useSort'
import { driveLabel, fmt } from './format'

interface Props {
  results: AxisEvaluation[]
  selectedId: string | null
  onSelect: (id: string) => void
  settings: Settings
  onSettings: (settings: Settings) => void
}

const families: AxisFamily[] = ['ELGT', 'ELGD', 'EGC']
const drives: DriveKind[] = ['belt', 'spindle']

const ratioOf = (e: AxisEvaluation, label: string) => e.checks.find((c) => c.label === label)?.ratio ?? null

export function AxisStep({ results, selectedId, onSelect, settings, onSettings }: Props) {
  const [showFailed, setShowFailed] = useState(false)
  const [detailOpen, setDetailOpen] = useState(true)
  const passing = results.filter((r) => r.status !== 'fail')
  const {
    sorted: rows,
    sort,
    toggle,
  } = useSort(showFailed ? results : passing, {
    status: (e) => statusRank[e.status],
    model: (e) => e.axis.model,
    drive: (e) => driveLabel[e.axis.drive],
    mass: (e) => e.axisMass,
    speed: (e) => ratioOf(e, '속도'),
    accel: (e) => ratioOf(e, '가속도'),
    force: (e) => ratioOf(e, '이송력 Fx'),
    torque: (e) => ratioOf(e, '구동 토크'),
    fv: (e) => ratioOf(e, '가이드 하중 비교값 fv'),
  })
  const th = { sort, onSort: toggle }
  const selected = results.find((r) => r.axis.id === selectedId)

  return (
    <section className="panel step" id="step-axis">
      <header className="step-head">
        <h2>
          <span className="step-no">1</span> 직교 축 선정
        </h2>
        <span className="muted">
          적합 {passing.length} / 검토 {results.length}
        </span>
        <label className="toggle small">
          <input type="checkbox" checked={showFailed} onChange={(e) => setShowFailed(e.target.checked)} />
          <span>부적합 포함</span>
        </label>
      </header>
      <div className="step-filters">
        <ToggleGroup
          options={drives}
          selected={settings.drives}
          label={(d) => driveLabel[d]}
          onChange={(v) => onSettings({ ...settings, drives: v })}
        />
        <ToggleGroup options={families} selected={settings.families} onChange={(v) => onSettings({ ...settings, families: v })} />
      </div>

      {rows.length === 0 ? (
        <p className="empty">조건을 만족하는 축이 없습니다. 부적합 포함을 켜서 초과 항목을 확인하세요.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh id="status" {...th}>
                  판정
                </SortTh>
                <SortTh id="model" {...th}>
                  모델명
                </SortTh>
                <SortTh id="drive" {...th}>
                  구동
                </SortTh>
                <SortTh id="mass" num {...th}>
                  축 질량
                </SortTh>
                <SortTh id="speed" {...th}>
                  속도
                </SortTh>
                <SortTh id="accel" {...th}>
                  가속도
                </SortTh>
                <SortTh id="force" {...th}>
                  이송력
                </SortTh>
                <SortTh id="torque" {...th}>
                  구동 토크
                </SortTh>
                <SortTh id="fv" {...th}>
                  가이드 fv
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.axis.id}
                  className={e.axis.id === selectedId ? 'selected' : ''}
                  onClick={() => onSelect(e.axis.id)}
                  tabIndex={0}
                  onKeyDown={(k) => k.key === 'Enter' && onSelect(e.axis.id)}
                >
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="model">{e.axis.model}</td>
                  <td>{driveLabel[e.axis.drive]}</td>
                  <td className="num">{fmt(e.axisMass, 1)} kg</td>
                  <td>
                    <Ratio ratio={ratioOf(e, '속도')} />
                  </td>
                  <td>
                    <Ratio ratio={ratioOf(e, '가속도')} />
                  </td>
                  <td>
                    <Ratio ratio={ratioOf(e, '이송력 Fx')} />
                  </td>
                  <td>
                    <Ratio ratio={ratioOf(e, '구동 토크')} />
                  </td>
                  <td>
                    <Ratio ratio={ratioOf(e, '가이드 하중 비교값 fv')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="detail">
          <CollapseTitle open={detailOpen} onToggle={() => setDetailOpen(!detailOpen)}>
            {selected.axis.model} 세부사항
          </CollapseTitle>
          {detailOpen && (
            <>
              <CheckTable checks={selected.checks} />
              <dl className="info">
                {selected.info.map((i) => (
                  <div key={i.label}>
                    <dt>{i.label}</dt>
                    <dd>
                      {fmt(i.value, 3)} {i.unit}
                      {i.note && <span className="muted"> ({i.note})</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}
