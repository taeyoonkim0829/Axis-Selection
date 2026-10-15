import type { DriveEvaluation } from '../calc/motorSelection'
import { Ratio, StatusBadge } from './common'
import { SpeedRatio } from './MotorStep'
import { useT } from '../i18n'

interface Props {
  /** Direct drive plus every compatible gearbox for the selected motor; empty until a motor is selected */
  options: DriveEvaluation[]
  selected: DriveEvaluation | null
  /** null = no gearbox */
  onSelect: (gearboxId: string | null) => void
}

export function GearboxStep({ options, selected, onSelect }: Props) {
  const t = useT()
  const selectedId = selected?.gearbox?.id ?? null
  // Clicking the selected gearbox again drops it (back to direct drive).
  const pick = (id: string | null) => onSelect(id === selectedId ? null : id)
  return (
    <section className="panel step" id="step-gearbox">
      <header className="step-head">
        <h2>
          <span className="step-no">3</span> {t('감속기 선정')}
        </h2>
        {selected && (
          <span className="muted">
            {t('{model} 호환 {n}', { model: selected.motor.model, n: options.length - 1 })}
          </span>
        )}
      </header>

      {!selected ? (
        <p className="empty">{t('모터를 선택하면 그 모터와 호환되는 감속기를 검토합니다.')}</p>
      ) : (
        <>
          <p className="muted small-print">
            {options.length <= 1
              ? t('이 모터와 호환되는 감속기 데이터가 없어 직결로 검토합니다.')
              : t('감속기를 선택하지 않으면 직결(축-키트-모터)로 검토합니다. 선택한 감속기를 다시 누르면 해제됩니다.')}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('판정')}</th>
                  <th>{t('메이커')}</th>
                  <th>{t('모델명')}</th>
                  <th className="num">{t('감속비')}</th>
                  <th>{t('최대 토크')}</th>
                  <th>{t('실효 토크')}</th>
                  <th>{t('회전수')}</th>
                  <th>{t('관성비')}</th>
                </tr>
              </thead>
              <tbody>
                {options.map((d) => {
                  const id = d.gearbox?.id ?? null
                  const inertia = d.checks.find((c) => c.label === '관성비')
                  return (
                    <tr
                      key={id ?? 'direct'}
                      className={id === selectedId ? 'selected' : ''}
                      onClick={() => pick(id)}
                      tabIndex={0}
                      onKeyDown={(k) => k.key === 'Enter' && pick(id)}
                    >
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td>{d.gearbox?.maker ?? '—'}</td>
                      <td className="model">{d.gearbox ? d.gearbox.model : t('선택 안 함 (직결)')}</td>
                      <td className="num">{d.gearbox ? `${d.gearbox.ratio}:1` : '—'}</td>
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
          </div>
        </>
      )}
    </section>
  )
}
