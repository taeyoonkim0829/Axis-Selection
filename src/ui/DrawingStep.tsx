import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { axisCog, type AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Requirements } from '../calc/types'
import {
  assemblyWarnings,
  buildCombo,
  comboDrawings,
  connectorSide,
  DRIVE_POSITIONS,
  drivePositionWords,
  SIDES,
  type Combo,
  type ComboOptions,
  type ComboSelection,
  type PartRole,
  type TwinAxis,
} from '../cad/combo'
import type { AxisMeta, Drawing } from '../cad/drawings'
import { stepText } from '../cad/stepText'
import type { PartMesh } from '../cad/occt'
import type { Kit } from '../data/types'
import { useT } from '../i18n'
import { RadioGroup } from './common'
import { mountingLabel, sideLabel } from './format'
import { isStaleBuild, STALE_BUILD_NOTICE } from './staleBuild'

const ComboViewer = lazy(() => import('./ComboViewer'))

interface Props {
  axis: AxisEvaluation | null
  drive: DriveEvaluation | null
  kit: Kit | null
  req: Requirements
  /** assembly orientation (kept in Workspace, the report prints it) */
  sides: ComboOptions
  onSides: (sides: ComboOptions) => void
}

const roleLabel: Record<PartRole, string> = { axis: '축', kit: '연결키트', gearbox: '감속기', motor: '모터' }

/** Drawing files fetched once per page (a rebuild for another spacing or orientation reuses them); failures are dropped */
const fileCache = new Map<string, Promise<string>>()

async function fetchText(d: Drawing, attempts = 2): Promise<string> {
  try {
    const res = await fetch(d.url)
    if (!res.ok) throw new Error(`${d.path}: ${res.status}`)
    return await stepText(await res.arrayBuffer())
  } catch (e) {
    // A network error (server reloading, file locked by a sync client) is retried once after a short pause
    if (attempts > 1 && e instanceof TypeError) {
      await new Promise((r) => setTimeout(r, 500))
      return fetchText(d, attempts - 1)
    }
    throw e instanceof TypeError ? new Error(`${d.path}: ${e.message}`) : e
  }
}

const loadText = (d: Drawing) => {
  let text = fileCache.get(d.url)
  if (!text) {
    text = fetchText(d)
    fileCache.set(d.url, text)
    text.catch(() => fileCache.delete(d.url))
  }
  return text
}

/** ms an input change must settle before the open preview is rebuilt (typing 1500 builds once, not four times) */
const REBUILD_DELAY = 400

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
export function DrawingStep({ axis, drive, kit, req: input, sides, onSides }: Props) {
  // The drawing is built from the first axis: the COG is placed relative to its slide centre.
  const req = { ...input, cog: axisCog(input) }
  const t = useT()
  const selection: ComboSelection | null =
    axis && drive && kit
      ? { axis: axis.axis, axisModel: axis.order.model, stroke: axis.order.stroke ?? req.stroke, motor: drive.motor, gearbox: drive.gearbox, kit }
      : null
  const found = selection ? comboDrawings(selection) : null
  const parallel = kit?.type === 'parallel'
  const connector = connectorSide(sides, parallel)
  // belt axes: the motor on either drive shaft end, the axis either way round
  const axisMeta = (found?.axis?.meta as AxisMeta | null | undefined) ?? null
  const turnable = axis?.axis.drive === 'belt' && axisMeta != null
  const positionIndex = DRIVE_POSITIONS.findIndex((p) => p.otherEnd === sides.drive.otherEnd && p.otherSide === sides.drive.otherSide)
  const positions = turnable
    ? [0, 1, 2, 3].sort(
        (a, b) =>
          drivePositionWords(axisMeta!, req.mounting, DRIVE_POSITIONS[a]).order -
          drivePositionWords(axisMeta!, req.mounting, DRIVE_POSITIONS[b]).order,
      )
    : []
  const positionLabel = (i: number) => {
    const w = drivePositionWords(axisMeta!, req.mounting, DRIVE_POSITIONS[i])
    return `${t(w.end)} · ${t(w.side)}`
  }
  // Twin arrangement: the second axis beside the first (with its own drive train under motor sync); LM guides are not drawn
  const twin: TwinAxis | undefined =
    axis && axis.layout.axes > 1 && input.parallel
      ? { spacing: input.parallel.spacing, drive: axis.layout.mode === 'twinMotor' }
      : undefined
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
        parallel ? sides.kitSide : '',
        connector,
        turnable ? positionIndex : '',
        twin ? `${twin.spacing}/${twin.drive}` : '',
      ].join('|')
    : ''

  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef<{ key: string; combo: Promise<Combo>; meshes?: Promise<PartMesh[]> } | null>(null)
  const [shown, setShown] = useState<{ key: string; combo: Combo; meshes: PartMesh[] } | null>(null)
  // stable between renders: the viewer rebuilds its scene (and WebGL context) whenever a prop changes
  const shownRoles = useMemo(() => shown?.combo.parts.map((p) => p.role) ?? [], [shown])

  const entryFor = () => {
    if (cache.current?.key !== key) cache.current = { key, combo: buildCombo(selection!, found!, req, loadText, sides, twin) }
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
      setError(isStaleBuild(e) ? STALE_BUILD_NOTICE : String(e instanceof Error ? e.message : e))
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
          (turnable && positionIndex > 0 ? `, drive ${sides.drive.otherEnd ? 'at the other end' : ''}${sides.drive.otherEnd && sides.drive.otherSide ? ', ' : ''}${sides.drive.otherSide ? 'on the other shaft end' : ''}` : '') +
          (parallel ? `, parallel kit: motor ${sides.kitSide}` : '') +
          `, motor connector ${connector} (seen from the motor end)`,
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
              [
                found.axis && found.axis.meta && (found.axis.meta as { stroke: number }).stroke !== selection.stroke
                  ? t('스트로크 {from} mm 모델을 {to} mm로 길이 보정', {
                      from: (found.axis.meta as { stroke: number }).stroke,
                      to: selection.stroke,
                    })
                  : null,
                // the CAD models are the standard version: one slide
                axis!.options?.slides.length ? t('추가 슬라이드 {codes}는 도면에 없음', { codes: axis!.options.slides.join(' + ') }) : null,
              ]
                .filter(Boolean)
                .join(' · ') || null,
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
    const timer = setTimeout(() => {
      meshesFor()
        .then(({ combo, meshes }) => {
          if (cancelled) return
          setShown({ key, combo, meshes })
          setError(null)
        })
        .catch((e: unknown) => {
          cache.current = null
          if (!cancelled) setError(isStaleBuild(e) ? STALE_BUILD_NOTICE : String(e instanceof Error ? e.message : e))
        })
    }, REBUILD_DELAY)
    return () => {
      cancelled = true
      clearTimeout(timer)
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
          {axis && axis.layout.mode !== 'single' && (
            <p className="muted small-print">
              {t(
                axis.layout.mode === 'twinMotor'
                  ? '두 번째 축(모터·키트 포함)을 축 간격만큼 옆에 함께 배치합니다.'
                  : axis.layout.mode === 'twinShaft'
                    ? '두 번째 축을 축 간격만큼 옆에 함께 배치합니다. 연결축은 도면에 포함되지 않습니다.'
                    : 'LM 가이드는 도면에 포함되지 않습니다.',
              )}
            </p>
          )}
          {!ready && (
            <p className="muted small-print">
              {t('도면이 없는 부품이 있어 조합할 수 없습니다. data/<종류>/<메이커>/Drawings/에 STEP 파일과 정합 정보(JSON)를 넣으세요.')}
            </p>
          )}
          <div className="drawing-sides">
            {turnable && (
              <>
                <span>{t('모터 위치 (정면도 기준)')}</span>
                <RadioGroup
                  options={positions}
                  value={positionIndex}
                  onChange={(i) => onSides({ ...sides, drive: DRIVE_POSITIONS[i] })}
                  label={positionLabel}
                />
              </>
            )}
            {parallel && (
              <>
                <span>{t('키트 조립 방향 (모터 위치)')}</span>
                <RadioGroup
                  options={SIDES}
                  value={sides.kitSide}
                  onChange={(kitSide) => onSides({ ...sides, kitSide })}
                  label={(s) => t(sideLabel[s])}
                />
              </>
            )}
            <span>{t('모터 조립 방향 (커넥터)')}</span>
            <RadioGroup
              options={SIDES}
              value={connector}
              onChange={(motorConnector) => onSides({ ...sides, motorConnector })}
              label={(s) => t(sideLabel[s])}
            />
            <p className="muted small-print">
              {t('모터 쪽 축 끝에서 축을 바라볼 때 기준이며, 슬라이드 면이 상입니다.')}
              {assemblyWarnings(sides, parallel).map((w) => (
                <span key={w} className="warn-text">
                  {' '}
                  {t(w)}
                </span>
              ))}
            </p>
          </div>
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
          {error === STALE_BUILD_NOTICE ? (
            <p className="fail-text small-print">
              {t(STALE_BUILD_NOTICE)}{' '}
              <button type="button" className="action-btn" onClick={() => window.location.reload()}>
                {t('새로 고침')}
              </button>
            </p>
          ) : (
            error && <p className="fail-text small-print">{t('도면을 만들지 못했습니다: {error}', { error })}</p>
          )}
          {preview && shown && (
            <Suspense fallback={<p className="muted small-print">{t('3D 뷰어를 불러오는 중…')}</p>}>
              <ComboViewer meshes={shown.meshes} roles={shownRoles} cog={shown.combo.cog} />
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
