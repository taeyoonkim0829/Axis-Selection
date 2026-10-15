import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { selectAxes } from './calc/axisSelection'
import { findKits, kitsOf, kitTypeFor, type KitType, type KitWindow } from './calc/kitSelection'
import { evaluateDrive, gearboxOptionsFor, selectMotors } from './calc/motorSelection'
import { defaultSettings, type Requirements, type Settings } from './calc/types'
import { axes, kits, motors } from './data'
import { LangProvider, storedLang, storeLang, translate, type Lang } from './i18n'
import { AxisStep } from './ui/AxisStep'
import { GearboxStep } from './ui/GearboxStep'
import { InputPanel } from './ui/InputPanel'
import { KitStep } from './ui/KitStep'
import { MotionProfile } from './ui/MotionProfile'
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
}

export default function App() {
  const [lang, setLang] = useState<Lang>(storedLang)
  useEffect(() => storeLang(lang), [lang])
  const [req, setReq] = useState(initialRequirements)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [axisId, setAxisId] = useState<string | null>(null)
  const [motorId, setMotorId] = useState<string | null>(null)
  // Gearbox picked in step 3; null = the motor step's recommendation (direct drive unless useGearbox)
  const [gearboxId, setGearboxId] = useState<string | null>(null)
  // undefined = the type the axis data assumes
  const [kitType, setKitType] = useState<KitType | undefined>(undefined)
  const [kitWindows, setKitWindows] = useState<KitWindow[]>(['plain'])
  const [kitId, setKitId] = useState<string | null>(null)

  const deferredReq = useDeferredValue(req)
  const deferredSettings = useDeferredValue(settings)
  const axisResults = useMemo(() => selectAxes(axes, deferredReq, deferredSettings), [deferredReq, deferredSettings])

  // Keep the user's pick while it is still listed; otherwise fall back to the best candidate.
  const selectedAxis = axisResults.find((r) => r.axis.id === axisId) ?? axisResults.find((r) => r.status !== 'fail') ?? null
  const motorResults = useMemo(
    () => (selectedAxis ? selectMotors(selectedAxis, motors, deferredSettings) : []),
    [selectedAxis, deferredSettings],
  )
  const motorResult = motorResults.find((r) => r.motor.id === motorId) ?? null
  const selectedMotor = motorResult?.motor ?? null
  // Direct drive only, or each compatible gearbox when the motor step is set to use one; only a handful,
  // so cheap to evaluate on every render.
  const gearboxOptions =
    selectedAxis && selectedMotor
      ? (deferredSettings.useGearbox ? gearboxOptionsFor(selectedMotor) : [null]).map((g) =>
          evaluateDrive(selectedAxis, selectedMotor, g, deferredSettings),
        )
      : []
  // The user's gearbox pick in step 3, else the one the motor step recommended.
  const selectedDrive =
    gearboxOptions.find((o) => o.gearbox && o.gearbox.id === gearboxId) ??
    gearboxOptions.find((o) => (o.gearbox?.id ?? null) === (motorResult?.gearbox?.id ?? null)) ??
    gearboxOptions[0] ??
    null

  const axisKitType = selectedAxis ? kitTypeFor(selectedAxis.axis) : 'axial'
  const shownKitType = kitType ?? axisKitType
  const kitMatch =
    selectedAxis && selectedDrive ? findKits(selectedAxis.axis, selectedDrive.motor, selectedDrive.gearbox, kits) : null
  const kitRows = kitsOf(kitMatch?.kits ?? [], shownKitType, kitWindows)
  const selectedKit = kitRows.find((k) => k.id === kitId) ?? kitRows[0] ?? null

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
    const title = reportTitle(selectedAxis.axis.model, lang)
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
    <LangProvider value={lang}>
      <div className="app">
        <RouteRail
          axis={selectedAxis}
          drive={selectedDrive}
          kit={selectedKit}
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
                vertical={deferredReq.mounting === 'vertical'}
              />
            )}
            <AxisStep
              results={axisResults}
              selectedId={selectedAxis?.axis.id ?? null}
              onSelect={(id) => {
                setAxisId(id)
                setMotorId(null)
                setGearboxId(null)
                setKitType(undefined)
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
              axisType={axisKitType}
              type={shownKitType}
              onType={setKitType}
              windows={kitWindows}
              onWindows={setKitWindows}
              selectedId={selectedKit?.id ?? null}
              onSelect={setKitId}
            />
          </div>
        </main>
        <footer className="app-footer">
          © 2026. Kim Taeyoon. All rights reserved.
          <br />
          <a href="mailto:theo.kim0829@gmail.com">theo.kim0829@gmail.com</a>
        </footer>
      </div>
      {exporting && selectedAxis && (
        <div className="report-stage" ref={reportRef} aria-hidden="true">
          <Report
            req={deferredReq}
            settings={deferredSettings}
            axis={selectedAxis}
            drive={selectedDrive}
            gearboxOptions={gearboxOptions}
            kitMatch={kitMatch}
            kit={selectedKit}
          />
        </div>
      )}
    </LangProvider>
  )
}
