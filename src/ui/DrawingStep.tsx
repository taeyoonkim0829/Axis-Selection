import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Requirements } from '../calc/types'
import {
  buildCombo,
  comboDrawings,
  defaultComboOptions,
  SIDES,
  type Combo,
  type ComboOptions,
  type ComboSelection,
  type PartRole,
  type Side,
} from '../cad/combo'
import type { Drawing } from '../cad/drawings'
import type { PartMesh } from '../cad/occt'
import type { Kit } from '../data/types'
import { useT } from '../i18n'
import { RadioGroup } from './common'
import { mountingLabel } from './format'

const ComboViewer = lazy(() => import('./ComboViewer'))

interface Props {
  axis: AxisEvaluation | null
  drive: DriveEvaluation | null
  kit: Kit | null
  req: Requirements
}

const roleLabel: Record<PartRole, string> = { axis: '축', kit: '연결키트', gearbox: '감속기', motor: '모터' }
const sideLabel: Record<Side, string> = { up: '상', down: '하', left: '좌', right: '우' }
const opposite: Record<Side, Side> = { up: 'down', down: 'up', left: 'right', right: 'left' }

const loadText = async (d: Drawing) => {
  const res = await fetch(d.url)
  if (!res.ok) throw new Error(`${d.path}: ${res.status}`)
  return res.text()
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_')

/** Step 5: the manufacturers' CAD models of the selection, assembled — 3D preview, STEP and DXF export. */
export function DrawingStep({ axis, drive, kit, req }: Props) {
  const t = useT()
  const selection: ComboSelection | null =
    axis && drive && kit
      ? { axis: axis.axis, axisModel: axis.order.model, stroke: axis.order.stroke ?? req.stroke, motor: drive.motor, gearbox: drive.gearbox, kit }
      : null
  const found = selection ? comboDrawings(selection) : null
  // parallel kits: kit and motor connector side, seen from the motor end of the axis
  const [sides, setSides] = useState<ComboOptions>(defaultComboOptions)
  const parallel = kit?.type === 'parallel'
  const key = selection
    ? [
        selection.axis.id,
        selection.stroke,
        selection.motor.id,
        selection.gearbox?.id,
        selection.kit.id,
        req.mounting,
        req.cog.x,
        req.cog.y,
        req.cog.z,
        parallel ? `${sides.kitSide}/${sides.motorConnector}` : '',
      ].join('|')
    : ''

  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef<{ key: string; combo: Promise<Combo>; meshes?: Promise<PartMesh[]> } | null>(null)
  const [shown, setShown] = useState<{ key: string; combo: Combo; meshes: PartMesh[] } | null>(null)

  const entryFor = () => {
    if (cache.current?.key !== key) cache.current = { key, combo: buildCombo(selection!, found!, req, loadText, sides) }
    return cache.current
  }
  const meshesFor = async () => {
    const entry = entryFor()
    const combo = await entry.combo
    entry.meshes ??= import('../cad/occt').then((m) => m.tessellate(combo.step, combo.parts.length))
    return { combo, meshes: await entry.meshes }
  }
  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await job()
    } catch (e) {
      cache.current = null
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(null)
    }
  }

  const showPreview = () =>
    run(t('3D 모델을 만드는 중…'), async () => {
      const { combo, meshes } = await meshesFor()
      setShown({ key, combo, meshes })
      setPreview(true)
    })
  const exportStep = () =>
    run(t('STEP 파일을 만드는 중…'), async () => {
      const combo = await entryFor().combo
      download(`${fileSafe(combo.parts.map((p) => p.name).join('_'))}.step`, combo.step, 'application/step')
    })
  const exportDxf = () =>
    run(t('DXF 도면을 만드는 중…'), async () => {
      const { combo, meshes } = await meshesFor()
      const { drawingDxf } = await import('../cad/dxf')
      const title = [
        combo.name,
        `Stroke ${selection!.stroke} mm, mounting: ${req.mounting}, COG (x, y, z) = (${req.cog.x}, ${req.cog.y}, ${req.cog.z}) mm` +
          (parallel ? `, parallel kit: motor ${sides.kitSide}, connector ${sides.motorConnector} (seen from the motor end)` : ''),
        'Third-angle projection, units: mm. 3D models: manufacturer CAD data (see STEP header for licence).',
      ]
      download(`${fileSafe(combo.parts.map((p) => p.name).join('_'))}.dxf`, drawingDxf({ meshes, cog: combo.cog, title }), 'application/dxf')
    })


  const rows: { role: PartRole; model: string; drawing: Drawing | null; note: string | null }[] =
    selection && found
      ? [
          {
            role: 'axis',
            model: axis!.order.model,
            drawing: found.axis,
            note:
              found.axis && found.axis.meta && (found.axis.meta as { stroke: number }).stroke !== selection.stroke
                ? t('스트로크 {from} mm 모델을 {to} mm로 길이 보정', {
                    from: (found.axis.meta as { stroke: number }).stroke,
                    to: selection.stroke,
                  })
                : null,
          },
          { role: 'kit', model: selection.kit.product, drawing: found.kit, note: found.kit && !found.kit.meta ? t('정합 정보(JSON) 없음') : null },
          ...(selection.gearbox
            ? [
                {
                  role: 'gearbox' as const,
                  model: selection.gearbox.model,
                  drawing: found.gearbox,
                  note: found.gearbox && !found.gearbox.meta ? t('정합 정보(JSON) 없음') : null,
                },
              ]
            : []),
          {
            role: 'motor',
            model: selection.motor.model,
            drawing: found.motor,
            note: found.motorOtherOptions ? t('같은 모터의 다른 옵션 도면') : null,
          },
        ]
      : []
  const ready = found != null && found.missing.length === 0

  // once opened, the preview follows the selection (state is set only after the async work)
  const stale = preview && ready && shown != null && shown.key !== key
  useEffect(() => {
    if (!stale) return
    let cancelled = false
    meshesFor()
      .then(({ combo, meshes }) => {
        if (!cancelled) setShown({ key, combo, meshes })
      })
      .catch((e: unknown) => {
        cache.current = null
        if (!cancelled) setError(String(e instanceof Error ? e.message : e))
      })
    return () => {
      cancelled = true
    }
  }, [key, stale]) // eslint-disable-line react-hooks/exhaustive-deps -- rebuild when the selection changes

  return (
    <section className="panel step" id="step-drawing">
      <header className="step-head">
        <h2>
          <span className="step-no">5</span> {t('조합 도면')}
        </h2>
        {selection && <span className="muted">{t('설치 방향: {mounting}', { mounting: t(mountingLabel[req.mounting]) })}</span>}
      </header>
      {!selection ? (
        <p className="empty">{t('축, 모터, 연결키트를 선택하면 제조사 도면으로 조합 모델을 만듭니다.')}</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('구분')}</th>
                  <th>{t('모델명')}</th>
                  <th>{t('도면 파일')}</th>
                  <th>{t('비고')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.role}>
                    <td>{t(roleLabel[r.role])}</td>
                    <td className="model">{r.model}</td>
                    <td className={r.drawing ? undefined : 'fail-text'}>
                      {r.drawing ? [r.drawing.partNumber, r.drawing.model].filter(Boolean).join(' ') : t('도면 없음')}
                    </td>
                    <td className="muted">{r.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ready && (
            <p className="muted small-print">
              {t('도면이 없는 부품이 있어 조합할 수 없습니다. data/<종류>/<메이커>/Drawings/에 STEP 파일과 정합 정보(JSON)를 넣으세요.')}
            </p>
          )}
          {parallel && (
            <div className="drawing-sides">
              <span>{t('키트 조립 방향 (모터 위치)')}</span>
              <RadioGroup
                options={SIDES}
                value={sides.kitSide}
                onChange={(kitSide) => setSides((s) => ({ ...s, kitSide }))}
                label={(s) => t(sideLabel[s])}
              />
              <span>{t('모터 조립 방향 (커넥터)')}</span>
              <RadioGroup
                options={SIDES}
                value={sides.motorConnector}
                onChange={(motorConnector) => setSides((s) => ({ ...s, motorConnector }))}
                label={(s) => t(sideLabel[s])}
              />
              <p className="muted small-print">
                {t('모터 쪽 축 끝에서 축을 바라볼 때 기준이며, 슬라이드 면이 상입니다.')}
                {sides.motorConnector === opposite[sides.kitSide] && (
                  <span className="warn-text"> {t('모터 커넥터가 축 쪽을 향합니다. 간섭을 확인하세요.')}</span>
                )}
                {sides.kitSide === 'up' && (
                  <span className="warn-text">
                    {' '}
                    {t('모터가 슬라이드 쪽에 있어 슬라이드·소재와 간섭할 수 있으므로 사용 가능한 스트로크가 줄어들 수 있습니다.')}
                  </span>
                )}
              </p>
            </div>
          )}
          <div className="drawing-actions">
            <button type="button" className="action-btn" onClick={showPreview} disabled={!ready || busy != null}>
              {t(preview ? '3D 미리보기 새로 고침' : '3D 미리보기')}
            </button>
            <button type="button" className="action-btn" onClick={exportStep} disabled={!ready || busy != null}>
              {t('STEP 내보내기')}
            </button>
            <button type="button" className="action-btn" onClick={exportDxf} disabled={!ready || busy != null}>
              {t('DXF 내보내기')}
            </button>
            {(busy ?? (stale && t('3D 모델을 만드는 중…'))) && <span className="muted">{busy ?? t('3D 모델을 만드는 중…')}</span>}
          </div>
          {error && <p className="fail-text small-print">{t('도면을 만들지 못했습니다: {error}', { error })}</p>}
          {preview && shown && (
            <Suspense fallback={<p className="muted small-print">{t('3D 뷰어를 불러오는 중…')}</p>}>
              <ComboViewer meshes={shown.meshes} roles={shown.combo.parts.map((p) => p.role)} cog={shown.combo.cog} />
            </Suspense>
          )}
          <p className="muted small-print">
            {t('제조사 CAD 데이터(STEP)를 그대로 조립합니다. 무게 중심(빨간 점)은 슬라이드 중심(시작 위치) 기준입니다. DXF는 정면·평면·우측면도(제3각법)입니다.')}
          </p>
        </>
      )}
    </section>
  )
}
