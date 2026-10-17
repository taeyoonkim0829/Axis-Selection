import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { selectAxes, type AxisEvaluation } from './calc/axisSelection'
import { attachController } from './calc/controllerSelection'
import { attachKit, findKits } from './calc/kitSelection'
import { evaluateDrive, gearboxOptionsFor, selectMotors, type DriveEvaluation } from './calc/motorSelection'
import { defaultPress, defaultSettings, verticalForward, type Requirements, type Settings } from './calc/types'
import { axes, brakingResistors, cables, controllers, kits, motors } from './data'
import { LangProvider, storedLang, storeLang, translate, useT, type Lang } from './i18n'
import { AxisStep } from './ui/AxisStep'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { GearboxStep } from './ui/GearboxStep'
import { InputPanel } from './ui/InputPanel'
import { DrawingStep } from './ui/DrawingStep'
import { KitStep } from './ui/KitStep'
import { MotionProfile } from './ui/MotionProfile'
import type { ProfileView } from './ui/ProfileChart'
import { MotorStep } from './ui/MotorStep'
import { openPendingTab, reportTitle, reportToPdf } from './ui/pdfExport'
import { Report } from './ui/Report'
import { RouteRail } from './ui/RouteRail'

const initialRequirements: Requirements = {
  stroke: 500,
  velocity: 0.5,
  acceleration: 5,
  jerk: 0,
  payload: 10,
  cog: { x: 0, y: 0, z: 50 },
  mounting: 'floor',
  press: defaultPress,
}

interface Inputs {
  req: Requirements
  settings: Settings
  setReq: (req: Requirements) => void
  setSettings: (settings: Settings) => void
  lang: Lang
  setLang: (lang: Lang) => void
}

export default function App() {
  const [lang, setLang] = useState<Lang>(storedLang)
  useEffect(() => storeLang(lang), [lang])
  const [req, setReq] = useState(initialRequirements)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const inputs: Inputs = { req, settings, setReq, setSettings, lang, setLang }

  // A failing calculation or chart must not blank the page: the inputs stay, and editing one retries.
  return (
    <LangProvider value={lang}>
      <ErrorBoundary resetKeys={[req, settings, lang]} fallback={(error, retry) => <Fallback {...inputs} error={error} retry={retry} />}>
        <Workspace {...inputs} />
      </ErrorBoundary>
    </LangProvider>
  )
}

function Footer() {
  return (
    <footer className="app-footer">
      © 2026. Kim Taeyoon. All rights reserved.
      <br />
      <a href="mailto:theo.kim0829@gmail.com">theo.kim0829@gmail.com</a>
    </footer>
  )
}

/** The page after an error: the inputs and an error notice in place of the results. */
function Fallback({ req, settings, setReq, setSettings, lang, setLang, error, retry }: Inputs & { error: Error; retry: () => void }) {
  const t = useT()
  return (
    <div className="app">
      <RouteRail axis={null} drive={null} kit={null} onExport={() => {}} exporting={false} lang={lang} onLang={setLang} />
      <main className="layout">
        <InputPanel req={req} settings={settings} onReq={setReq} onSettings={setSettings} />
        <div className="results">
          <section className="panel error-panel" role="alert">
            <h2>{t('계산 중 오류가 발생했습니다')}</h2>
            <p>{t('입력값을 바꾸면 다시 계산합니다. 같은 오류가 계속되면 페이지를 새로고침하세요.')}</p>
            <pre className="error-message">{error.message}</pre>
            <button type="button" className="error-retry" onClick={retry}>
              {t('다시 시도')}
            </button>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

/** Mounting kit, then Festo drive package: both verdicts fold into the drive option's status. */
function attachParts(axisEval: AxisEvaluation, drive: DriveEvaluation, settings: Settings) {
  return attachController(axisEval, attachKit(axisEval, drive, kits, settings), settings, { controllers, resistors: brakingResistors, cables })
}

function Workspace({ req, settings, setReq, setSettings, lang, setLang }: Inputs) {
  const [axisId, setAxisId] = useState<string | null>(null)
  const [motorId, setMotorId] = useState<string | null>(null)
  // Gearbox picked in step 3; null = the motor step's recommendation (direct drive unless useGearbox)
  const [gearboxId, setGearboxId] = useState<string | null>(null)
  const [kitId, setKitId] = useState<string | null>(null)
  // Motion profile view (왕복 / 전진 / 복귀); the PDF prints the same view
  const [profileView, setProfileView] = useState<ProfileView>('cycle')

  const deferredReq = useDeferredValue(req)
  const deferredSettings = useDeferredValue(settings)
  const axisResults = useMemo(() => selectAxes(axes, deferredReq, deferredSettings), [deferredReq, deferredSettings])

  // Keep the user's pick while it is still listed; otherwise fall back to the best candidate.
  const selectedAxis = axisResults.find((r) => r.axis.id === axisId) ?? axisResults.find((r) => r.status !== 'fail') ?? null
  const motorResults = useMemo(
    () =>
      selectedAxis ? selectMotors(selectedAxis, motors, deferredSettings, (d) => attachParts(selectedAxis, d, deferredSettings)) : [],
    [selectedAxis, deferredSettings],
  )
  const motorResult = motorResults.find((r) => r.motor.id === motorId) ?? null
  const selectedMotor = motorResult?.motor ?? null
  // Direct drive only, or each compatible gearbox when the motor step is set to use one; only a handful,
  // so cheap to evaluate on every render.
  const gearboxOptions =
    selectedAxis && selectedMotor
      ? (deferredSettings.useGearbox ? gearboxOptionsFor(selectedMotor) : [null]).map((g) =>
          attachParts(selectedAxis, evaluateDrive(selectedAxis, selectedMotor, g, deferredSettings), deferredSettings),
        )
      : []
  // The user's gearbox pick in step 3, else the one the motor step recommended.
  const selectedDrive =
    gearboxOptions.find((o) => o.gearbox && o.gearbox.id === gearboxId) ??
    gearboxOptions.find((o) => (o.gearbox?.id ?? null) === (motorResult?.gearbox?.id ?? null)) ??
    gearboxOptions[0] ??
    null

  const kitMatch =
    selectedAxis && selectedDrive ? findKits(selectedAxis.axis, selectedDrive.motor, selectedDrive.gearbox, kits) : null
  // Kits checked by attachKit, in list order; the user's pick, else the drive's recommended kit
  const kitEvals = selectedDrive?.kits ?? []
  const selectedKitEval = kitEvals.find((e) => e.kit.id === kitId) ?? selectedDrive?.kit ?? null
  const selectedKit = selectedKitEval?.kit ?? null

  // PDF export: the report is mounted off screen only while the PDF is being made.
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)
  const pdfTab = useRef<Window | null>(null)
  const startExport = () => {
    pdfTab.current = openPendingTab(lang)
    setExporting(true)
  }
  useEffect(() => {
    if (!exporting || !reportRef.current || !selectedAxis) return
    const title = reportTitle(selectedAxis.order.model, lang)
    reportToPdf(reportRef.current, title)
      .then((blob) => {
        const url = URL.createObjectURL(new File([blob], `${title}.pdf`, { type: 'application/pdf' }))
        const tab = pdfTab.current
        if (tab && !tab.closed) tab.location.href = url
        else window.open(url, '_blank')
      })
      .catch((error: unknown) => {
        pdfTab.current?.close()
        window.alert(`${translate(lang, 'PDF를 만들지 못했습니다.')}\n${String(error)}`)
      })
      .finally(() => setExporting(false))
  }, [exporting]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once per export

  return (
    <>
      <div className="app">
        <RouteRail
          axis={selectedAxis}
          drive={selectedDrive}
          kit={selectedKitEval}
          onExport={startExport}
          exporting={exporting}
          lang={lang}
          onLang={setLang}
        />
        <main className="layout">
          <InputPanel req={req} settings={settings} onReq={setReq} onSettings={setSettings} />
          <div className="results">
            {selectedAxis && (
              <MotionProfile
                axis={selectedAxis}
                drive={selectedDrive}
                settings={deferredSettings}
                vertical={verticalForward(deferredReq)}
                view={profileView}
                onView={setProfileView}
              />
            )}
            <AxisStep
              results={axisResults}
              selectedId={selectedAxis?.axis.id ?? null}
              onSelect={(id) => {
                setAxisId(id)
                setMotorId(null)
                setGearboxId(null)
              }}
              settings={settings}
              onSettings={setSettings}
            />
            {selectedAxis ? (
              <MotorStep
                results={motorResults}
                selected={selectedDrive}
                onSelect={(id) => {
                  setMotorId(id)
                  setGearboxId(null)
                }}
                settings={settings}
                onSettings={setSettings}
              />
            ) : (
              <section className="panel step" id="step-motor">
                <p className="empty">{translate(lang, '먼저 직교 축을 선택하세요.')}</p>
              </section>
            )}
            <GearboxStep
              options={gearboxOptions}
              selected={selectedDrive}
              onSelect={setGearboxId}
              useGearbox={deferredSettings.useGearbox}
            />
            <KitStep
              match={kitMatch}
              rows={kitEvals}
              selectedId={selectedKit?.id ?? null}
              onSelect={setKitId}
            />
            <DrawingStep axis={selectedAxis} drive={selectedDrive} kit={selectedKit} req={deferredReq} />
          </div>
        </main>
        <Footer />
      </div>
      {exporting && selectedAxis && (
        <div className="report-stage" ref={reportRef} aria-hidden="true">
          <Report
            req={deferredReq}
            settings={deferredSettings}
            axis={selectedAxis}
            drive={selectedDrive}
            kitMatch={kitMatch}
            kit={selectedKitEval}
            profileView={profileView}
          />
        </div>
      )}
    </>
  )
}
