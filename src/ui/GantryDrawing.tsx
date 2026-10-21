import { gantryAxes, type GantryInputs } from '../calc/gantry'
import type { GantryAxis } from '../calc/gantry'
import type { ComboOptions } from '../cad/combo'
import { adapterDrawingFor } from '../cad/drawings'
import { buildGantry, type GantryAxisDrawing, type GantryJointDrawing } from '../cad/gantry'
import { useT } from '../i18n'
import type { GantryAxisResult } from '../selection'
import { comboInputs, comboKey } from './comboInputs'
import { ComboPreviewPanel } from './ComboPreviewPanel'
import { StatusBadge } from './common'
import { loadText, useComboPreview } from './useComboPreview'

const roleWords: Record<string, string> = { axis: '축', kit: '연결키트', gearbox: '감속기', motor: '모터', shaft: '연결축' }

/**
 * The whole gantry assembled: every axis's combination (its step 5) and the gantry kits joining them (data/adapters,
 * from the axis data sheets' combination tables), 3D preview, STEP and DXF.
 */
export function GantryDrawing({
  gantry,
  results,
  assemblies,
}: {
  gantry: GantryInputs
  results: GantryAxisResult[]
  assemblies: Record<GantryAxis, ComboOptions>
}) {
  const t = useT()
  const order = gantryAxes(gantry.config)
  const inputs = order.map((a) => {
    const r = results.find((x) => x.axis === a)
    const s = r?.sel
    return { a, r, ...(r?.req && s ? comboInputs(s.selectedAxis, s.selectedDrive, s.selectedKitEval?.kit ?? null, r.req) : null) }
  })
  const joints = results.flatMap((r) => (r.joint ? [r.joint] : []))
  const jointDrawings: GantryJointDrawing[] = joints.map((j) => ({
    base: j.base,
    carried: j.carried,
    kit: j.kit,
    drawing: j.kit ? adapterDrawingFor(j.kit) : null,
    quantity: j.quantity,
  }))
  const complete = inputs.every((i) => i.selection && i.found)
  const ready = complete && inputs.every((i) => i.found!.missing.length === 0)
  const key = complete
    ? [
        ...inputs.map((i) => {
          const o = assemblies[i.a]
          return `${i.a}:${comboKey(i.selection!, i.req!, i.twin)}|${o.kitSide}|${o.motorConnector}|${o.drive.otherEnd}${o.drive.otherSide}`
        }),
        ...jointDrawings.map((j) => `${j.base}${j.carried}:${j.kit?.id ?? ''}×${j.quantity}`),
        JSON.stringify(gantry.offsets),
        gantry.zMode,
        gantry.xMounting,
        gantry.yMounting,
      ].join('#')
    : ''
  const state = useComboPreview(key, ready, () =>
    buildGantry(
      gantry,
      inputs.map((i): GantryAxisDrawing => ({ axis: i.a, sel: i.selection!, found: i.found!, req: i.req!, options: assemblies[i.a], twin: i.twin })),
      jointDrawings,
      loadText,
    ),
  )
  const name = () => `Gantry_${gantry.config.toUpperCase()}_${inputs.map((i) => i.selection!.axisModel).join('_')}`
  const title = (c: { name: string }) => [
    c.name,
    `Gantry ${gantry.config.toUpperCase()}, axes at the start position; gantry kits from the axis data sheets.`,
    'Third-angle projection, units: mm. 3D models: manufacturer CAD data (see STEP header for licence).',
  ]
  const missing = inputs.flatMap((i) => (i.found?.missing.length ? [`${i.a.toUpperCase()}: ${i.found.missing.map((m) => t(roleWords[m] ?? m)).join(', ')}`] : []))
  const unkitted = state.shown?.combo.unkitted ?? []

  return (
    <section className="panel step" id="gantry-drawing">
      <header className="step-head">
        <h2>{t('조합축 도면')}</h2>
        <span className="muted">{t('{config} 조합 · 각 축의 5단계 조합 도면과 조합 키트로 조립합니다.', { config: gantry.config.toUpperCase() })}</span>
      </header>
      {!complete ? (
        <p className="empty">{t('모든 축의 축, 모터, 연결키트를 선택하면 조합축 도면을 만듭니다.')}</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('결합')}</th>
                  <th>{t('판정')}</th>
                  <th>{t('조합 키트')}</th>
                  <th>{t('품번')}</th>
                  <th>{t('수량')}</th>
                  <th>{t('비고')}</th>
                </tr>
              </thead>
              <tbody>
                {joints.map((j) => (
                  <tr key={`${j.base}${j.carried}`}>
                    <td>{t('{carried}축 → {base}축 슬라이드', { carried: j.carried.toUpperCase(), base: j.base.toUpperCase() })}</td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                    <td className="model">{j.kit?.model ?? '—'}</td>
                    <td className="num">{j.kit?.partNumber ?? '—'}</td>
                    <td className="num">{j.kit ? j.quantity : '—'}</td>
                    <td className="muted">
                      {j.status !== 'ok' ? t(j.note, j.noteArgs) : ''}
                      {j.kit?.accessories.map((x) => (
                        <span key={x.partNumber}>
                          {' '}
                          {t('함께 주문: {model} ({partNumber})', { model: x.model, partNumber: x.partNumber })}
                        </span>
                      ))}
                      {j.kit && !adapterDrawingFor(j.kit) ? ` ${t('도면 없음')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small-print">
            {t(
              '조합 키트는 ELGT-BS, ELGD 데이터시트의 조합표 기준입니다(EGC는 해당 키트 데이터 없음). 축은 시작 위치에 그리며, 위쪽 축은 키트 면에 붙이고 이동 방향 위치는 입력한 장착 오프셋을 따릅니다. 키트가 없는 결합은 입력한 장착 위치에 축만 배치합니다. 키트에 축을 고정하는 프로파일 마운팅(EAHF-…-B4)은 도면에 없습니다.',
            )}
            {unkitted.length > 0 && (
              <span className="warn-text"> {t('키트 없이 배치한 결합: {pairs}', { pairs: unkitted.join(', ') })}</span>
            )}
          </p>
          {missing.length > 0 && (
            <p className="muted small-print">{t('도면이 없는 부품이 있어 조합할 수 없습니다: {parts}', { parts: missing.join(' · ') })}</p>
          )}
          <ComboPreviewPanel state={state} ready={ready} onStep={() => state.exportStep(name)} onDxf={() => state.exportDxf(name, title)} />
        </>
      )}
    </section>
  )
}
