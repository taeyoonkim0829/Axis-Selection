import { useEffect, useRef, useState } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Check, Status } from '../calc/types'
import type { Kit } from '../data/types'
import { pct, statusLabel } from './format'

interface Props {
  axis: AxisEvaluation | null
  drive: DriveEvaluation | null
  kit: Kit | null
  /** Builds the PDF and opens it in a new tab */
  onExport: () => void
  /** true while the PDF is being made */
  exporting: boolean
}

const stepIds = ['step-axis', 'step-motor', 'step-gearbox', 'step-kit'] as const

/** The most heavily loaded check, the number that decides the margin. */
function tightest(checks: Check[]): Check | null {
  return checks.reduce<Check | null>((max, c) => (c.ratio != null && (!max || c.ratio > (max.ratio ?? 0)) ? c : max), null)
}

function bomText(axis: AxisEvaluation | null, drive: DriveEvaluation | null, kit: Kit | null): string {
  const g = drive?.gearbox
  const lines = [
    ['직교 축', axis ? axis.axis.model : ''],
    ['모터', drive ? `${drive.motor.maker} ${drive.motor.model}` : ''],
    ['감속기', drive ? (g ? `${g.maker} ${g.model}${g.partNumber ? ` (${g.partNumber})` : ''}` : '직결') : ''],
    ['연결키트', kit ? `${kit.product}${kit.partNumber ? ` (${kit.partNumber})` : ''}` : ''],
  ]
  return lines.map(([k, v]) => `${k}\t${v || '—'}`).join('\n')
}

/** 이 after a final consonant (받침), else 가. */
function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '이' : '가'
}

/** Highlights the step section nearest the top of the viewport. */
function useActiveStep(): number {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const els = stepIds.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const visible = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = stepIds.findIndex((id) => visible.get(id))
        if (first >= 0) setActive(first)
      },
      { rootMargin: '-140px 0px -45% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
  return active
}

function Sign({
  no,
  name,
  value,
  status,
  detail,
  empty = '선택 안 됨',
  active,
}: {
  no: number
  name: string
  value: string | null
  status?: Status
  detail?: string
  empty?: string
  active: boolean
}) {
  const go = () => document.getElementById(stepIds[no - 1])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <li className={`sign${active ? ' sign-active' : ''}`}>
      <button type="button" className="sign-btn" onClick={go} aria-current={active ? 'step' : undefined}>
        <span className="sign-no">{no}</span>
        <span className="sign-body">
          <span className="sign-name">{name}</span>
          <span className={`sign-value${value ? '' : ' sign-empty'}`}>{value ?? empty}</span>
          {(status || detail) && (
            <span className="sign-detail">
              {status && <span className={`sign-status sign-status-${status}`}>{statusLabel[status]}</span>}
              {detail && <span>{detail}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

export function RouteRail({ axis, drive, kit, onExport, exporting }: Props) {
  const active = useActiveStep()
  const [copied, setCopied] = useState(false)
  const axisTight = axis && tightest(axis.checks)
  const driveTight = drive && tightest(drive.checks)
  const g = drive?.gearbox

  const dialog = useRef<HTMLDialogElement>(null)
  const missing = [!axis && '직교 축', !drive && '모터', !kit && '연결키트'].filter((m): m is string => !!m)
  const exportClick = () => (missing.length ? dialog.current?.showModal() : onExport())

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bomText(axis, drive, kit))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <header className="rail">
      <div className="rail-inner">
        <div className="rail-brand">
          <span className="rail-title">Axis Selection</span>
          <span className="rail-sub">직교 축 · 모터 · 연결키트 선정</span>
        </div>
        <ol className="signs" aria-label="선정 경로">
          <Sign
            no={1}
            name="직교 축"
            value={axis?.axis.model ?? null}
            status={axis?.status}
            detail={axisTight ? `${axisTight.label} ${pct(axisTight.ratio)}` : undefined}
            active={active === 0}
          />
          <Sign
            no={2}
            name="모터"
            value={drive ? drive.motor.model : null}
            status={drive?.status}
            detail={drive ? `${drive.motor.maker}${driveTight ? ` · ${driveTight.label} ${pct(driveTight.ratio)}` : ''}` : undefined}
            active={active === 1}
          />
          <Sign
            no={3}
            name="감속기"
            value={drive ? (g ? g.model : '직결') : null}
            detail={drive ? (g ? `${g.maker} · ${g.ratio}:1` : '감속기 없음') : undefined}
            active={active === 2}
          />
          <Sign
            no={4}
            name="연결키트"
            value={kit?.product ?? null}
            empty={drive ? '해당 키트 없음' : undefined}
            detail={kit ? `축 ${kit.axisCode} · ${kit.motorCode}` : undefined}
            active={active === 3}
          />
        </ol>
        <div className="rail-actions">
          <button type="button" className="rail-action" onClick={copy} disabled={!axis}>
            {copied ? '복사됨' : 'BOM 복사'}
          </button>
          <button type="button" className="rail-action" onClick={exportClick} disabled={exporting}>
            {exporting ? 'PDF 생성 중…' : 'PDF로 내보내기'}
          </button>
        </div>
        <dialog ref={dialog} className="notice" aria-labelledby="notice-title">
          <h2 id="notice-title">PDF로 내보낼 수 없습니다</h2>
          <p>
            {missing.join(', ')}
            {subjectParticle(missing.at(-1) ?? '')} 선정되지 않았습니다.
            <br />
            직교 축, 모터, 연결키트를 먼저 선정하세요.
          </p>
          <form method="dialog">
            <button type="submit" className="notice-ok" autoFocus>
              확인
            </button>
          </form>
        </dialog>
      </div>
    </header>
  )
}
