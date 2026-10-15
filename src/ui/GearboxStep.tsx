import type { DriveEvaluation } from '../calc/motorSelection'
import { Ratio, StatusBadge } from './common'
import { SpeedRatio } from './MotorStep'
import { useT } from '../i18n'

interface Props {
  /** Every compatible gearbox for the selected motor (direct drive only when gearboxes are off); empty until a motor is selected */
  options: DriveEvaluation[]
  selected: DriveEvaluation | null
  onSelect: (gearboxId: string) => void
  /** Settings.useGearbox: off lists nothing and the drive is direct */
  useGearbox: boolean
}

export function GearboxStep({ options, selected, onSelect, useGearbox }: Props) {
  const t = useT()
  const selectedId = selected?.gearbox?.id ?? null
  return (
    <section className="panel step" id="step-gearbox">
      <header className="step-head">
        <h2>
          <span className="step-no">3</span> {t('감속기 선정')}
        </h2>
        {selected && useGearbox && (
          <span className="muted">{t('{model} 호환 {n}', { model: selected.motor.model, n: options.length })}</span>
        )}
      </header>

      {!selected ? (
        <p className="empty">
          {useGearbox
            ? t('모터를 선택하면 그 모터와 호환되는 감속기를 검토합니다.')
            : t('감속기 없이 직결(축-키트-모터)로 검토합니다. 감속기가 필요하면 2단계에서 감속기 사용을 선택하세요.')}
        </p>
      ) : !useGearbox ? (
        <p className="empty">
          {t('감속기 없이 직결(축-키트-모터)로 검토합니다. 감속기가 필요하면 2단계에서 감속기 사용을 선택하세요.')}
        </p>
      ) : (
        <>
          <p className="muted small-print">
            {t('2단계에서 추천한 감속기(통과하는 가장 낮은 감속비)가 적용되어 있습니다. 다른 감속기를 누르면 바꿀 수 있습니다.')}
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
                      onClick={() => id && onSelect(id)}
                      tabIndex={0}
                      onKeyDown={(k) => k.key === 'Enter' && id && onSelect(id)}
                    >
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td>{d.gearbox?.maker ?? '—'}</td>
                      <td className="model">{d.gearbox?.model ?? '—'}</td>
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
