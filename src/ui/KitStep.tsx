import { kitsOf, type KitMatch, type KitType, type KitWindow } from '../calc/kitSelection'
import type { Kit } from '../data/types'
import { RadioGroup, ToggleGroup } from './common'

interface Props {
  /** null until a motor is selected */
  match: KitMatch | null
  /** Kit type the selected axis data assumes */
  axisType: KitType
  type: KitType
  onType: (type: KitType) => void
  /** Window variants to list; at least one */
  windows: KitWindow[]
  onWindows: (windows: KitWindow[]) => void
  selectedId: string | null
  onSelect: (id: string) => void
}

const typeLabel: Record<KitType, string> = { axial: '직렬 키트', parallel: '병렬 키트' }
const windowLabel: Record<KitWindow, string> = { plain: '일반', window: '견시창' }

export function KitStep({ match, axisType, type, onType, windows, onWindows, selectedId, onSelect }: Props) {
  const kits = match?.kits ?? []
  const rows = kitsOf(kits, type, windows)
  const special = kitsOf(match?.special ?? [], type, windows)

  return (
    <section className="panel step" id="step-kit">
      <header className="step-head">
        <h2>
          <span className="step-no">4</span> 모터-축 연결키트
        </h2>
        {match && (
          <span className="muted">
            축 {match.axisCode ?? '—'} · {match.motorSide === 'gearbox' ? '감속기' : '모터'} {match.motorCode ?? '—'}
          </span>
        )}
      </header>

      {!match ? (
        <p className="empty">모터를 선택하면 축과 모터(감속기)의 인터페이스 코드에 맞는 키트를 찾습니다.</p>
      ) : (
        <>
          <div className="step-filters">
            <RadioGroup
              options={['axial', 'parallel'] as const}
              value={type}
              onChange={onType}
              label={(t) => `${typeLabel[t]} (${kitsOf(kits, t).length})`}
            />
            <ToggleGroup
              options={['plain', 'window'] as const}
              selected={windows}
              onChange={onWindows}
              label={(w) => `${windowLabel[w]} (${kitsOf(kits, type, [w]).length})`}
            />
          </div>
          {type !== axisType && (
            <p className="muted small-print">
              {type === 'parallel'
                ? '선택한 축 데이터는 직렬 연결 기준입니다. 병렬 키트를 쓸 경우 1단계에서 같은 축의 병렬 키트(_parallel kit) 데이터가 있으면 그 축으로 검토하세요.'
                : '선택한 축 데이터는 병렬 키트 기준입니다.'}
            </p>
          )}
          <KitTable match={match} rows={rows} type={type} windows={windows} selectedId={selectedId} onSelect={onSelect} />
          {special.length > 0 && <SpecialKits kits={special} />}
        </>
      )}
    </section>
  )
}

function KitTable({
  match,
  rows,
  type,
  windows,
  selectedId,
  onSelect,
}: {
  match: KitMatch
  rows: Kit[]
  type: KitType
  windows: KitWindow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (!match.axisCode)
    return <p className="empty">이 축의 인터페이스 코드가 없습니다. 축 데이터(JSON)의 interfaceCode를 입력하세요.</p>
  if (!match.motorCode) {
    const side = match.motorSide === 'gearbox' ? '감속기' : '모터'
    return (
      <p className="empty">
        이 {side}의 인터페이스 코드가 없습니다. {side} 데이터(JSON)의 interfaceCode를 입력하세요.
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="empty">
        축 {match.axisCode} · {match.motorCode} 조합의 {typeLabel[type]}({windows.map((w) => windowLabel[w]).join('·')})가
        없습니다.
      </p>
    )
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>품명</th>
            <th>견시창</th>
            <th>{type === 'axial' ? '커플링' : '풀리 품번'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr
              key={k.id}
              className={k.id === selectedId ? 'selected' : ''}
              onClick={() => onSelect(k.id)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(k.id)}
            >
              <td className="model">{k.product}</td>
              <td>{k.window ? 'O' : 'X'}</td>
              <td>{(type === 'axial' ? k.coupling : k.pulley) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SpecialKits({ kits }: { kits: Kit[] }) {
  return (
    <div className="gearbox-pick">
      <h4>SA 특수품 (참고용 · TEC 문의 필요)</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>품명</th>
              <th>프로젝트</th>
              <th>제작 대상 모터</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((k) => (
              <tr key={k.id}>
                <td className="model">{k.product}</td>
                <td>{k.sa?.projectNo ?? '—'}</td>
                <td>{[k.sa?.motorMaker, k.sa?.motorModel].filter(Boolean).join(' ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
