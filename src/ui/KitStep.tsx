import { orderKits, type KitMatch, type KitType } from '../calc/kitSelection'
import type { Kit } from '../data/types'
import { useT } from '../i18n'

interface Props {
  /** null until a motor is selected */
  match: KitMatch | null
  /** Standard kits of the match, ordered by `orderKits` */
  rows: Kit[]
  /** Kit type the selected axis data assumes */
  axisType: KitType
  selectedId: string | null
  onSelect: (id: string) => void
}

const typeLabel: Record<KitType, string> = { axial: '직렬', parallel: '병렬' }

export function KitStep({ match, rows, axisType, selectedId, onSelect }: Props) {
  const t = useT()
  const selected = rows.find((k) => k.id === selectedId)

  return (
    <section className="panel step" id="step-kit">
      <header className="step-head">
        <h2>
          <span className="step-no">4</span> {t('모터-축 연결키트')}
        </h2>
        {match && (
          <span className="muted">
            {t('축 {axis} · {side} {motor}', {
              axis: match.axisCode ?? '—',
              side: t(match.motorSide === 'gearbox' ? '감속기' : '모터'),
              motor: match.motorCode ?? '—',
            })}
          </span>
        )}
      </header>

      {!match ? (
        <p className="empty">{t('모터를 선택하면 축과 모터(감속기)의 인터페이스 코드에 맞는 키트를 찾습니다.')}</p>
      ) : (
        <>
          <KitTable match={match} rows={rows} selectedId={selectedId} onSelect={onSelect} />
          {selected && selected.type !== axisType && (
            <p className="muted small-print">
              {selected.type === 'parallel'
                ? t('선택한 축 데이터는 직렬 연결 기준입니다. 병렬 키트를 쓸 경우 1단계에서 같은 축의 병렬 키트(_parallel kit) 데이터가 있으면 그 축으로 검토하세요.')
                : t('선택한 축 데이터는 병렬 키트 기준입니다.')}
            </p>
          )}
          {match.special.length > 0 && <SpecialKits kits={orderKits(match.special, axisType)} />}
        </>
      )}
    </section>
  )
}

function KitTable({
  match,
  rows,
  selectedId,
  onSelect,
}: {
  match: KitMatch
  rows: Kit[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const t = useT()
  if (!match.axisCode)
    return <p className="empty">{t('이 축의 인터페이스 코드가 없습니다. 축 데이터(JSON)의 interfaceCode를 입력하세요.')}</p>
  if (!match.motorCode) {
    return (
      <p className="empty">
        {match.motorSide === 'gearbox'
          ? t('이 감속기의 인터페이스 코드가 없습니다. 감속기 데이터(JSON)의 interfaceCode를 입력하세요.')
          : t('이 모터의 인터페이스 코드가 없습니다. 모터 데이터(JSON)의 interfaceCode를 입력하세요.')}
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="empty">
        {t('축 {axis} · {motor} 조합의 연결키트가 없습니다.', { axis: match.axisCode, motor: match.motorCode })}
      </p>
    )
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('연결 방식')}</th>
            <th>{t('품명')}</th>
            <th>{t('견시창')}</th>
            <th>{t('커플링 / 풀리 품번')}</th>
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
              <td>{t(typeLabel[k.type])}</td>
              <td className="model">{k.product}</td>
              <td>{k.window ? 'O' : 'X'}</td>
              <td>{(k.type === 'axial' ? k.coupling : k.pulley) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SpecialKits({ kits }: { kits: Kit[] }) {
  const t = useT()
  return (
    <div className="gearbox-pick">
      <h4>{t('SA 특수품 (참고용 · TEC 문의 필요)')}</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('품명')}</th>
              <th>{t('프로젝트')}</th>
              <th>{t('제작 대상 모터')}</th>
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
