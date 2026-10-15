import { useEffect, useRef, useState } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Check, Status } from '../calc/types'
import type { Kit } from '../data/types'
import { koSubjectParticle, langSwitchLabel, useT, type Lang } from '../i18n'
import { pct, statusLabel } from './format'

interface Props {
  axis: AxisEvaluation | null
  drive: DriveEvaluation | null
  kit: Kit | null
  /** Builds the PDF and opens it in a new tab */
  onExport: () => void
  /** true while the PDF is being made */
  exporting: boolean
  lang: Lang
  onLang: (lang: Lang) => void
}

const stepIds = ['step-axis', 'step-motor', 'step-gearbox', 'step-kit'] as const

/** The most heavily loaded check, the number that decides the margin. */
function tightest(checks: Check[]): Check | null {
  return checks.reduce<Check | null>((max, c) => (c.ratio != null && (!max || c.ratio > (max.ratio ?? 0)) ? c : max), null)
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
  empty,
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
  const t = useT()
  const go = () => document.getElementById(stepIds[no - 1])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <li className={`sign${active ? ' sign-active' : ''}`}>
      <button type="button" className="sign-btn" onClick={go} aria-current={active ? 'step' : undefined}>
        <span className="sign-no">{no}</span>
        <span className="sign-body">
          <span className="sign-name">{name}</span>
          <span className={`sign-value${value ? '' : ' sign-empty'}`}>{value ?? empty ?? t('선택 안 됨')}</span>
          {(status || detail) && (
            <span className="sign-detail">
              {status && <span className={`sign-status sign-status-${status}`}>{t(statusLabel[status])}</span>}
              {detail && <span>{detail}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

export function RouteRail({ axis, drive, kit, onExport, exporting, lang, onLang }: Props) {
  const t = useT()
  const active = useActiveStep()
  const axisTight = axis && tightest(axis.checks)
  const driveTight = drive && tightest(drive.checks)
  const g = drive?.gearbox

  const dialog = useRef<HTMLDialogElement>(null)
  const missing = [!axis && t('직교 축'), !drive && t('모터'), !kit && t('연결키트')].filter((m): m is string => !!m)
  const missingText = missing.join(', ')
  const exportClick = () => (missing.length ? dialog.current?.showModal() : onExport())

  return (
    <header className="rail">
      <div className="rail-inner">
        <div className="rail-brand">
          <span className="rail-title">Axis Selection</span>
          <span className="rail-sub">{t('직교 축 · 모터 · 연결키트 선정')}</span>
        </div>
        <ol className="signs" aria-label={t('선정 경로')}>
          <Sign
            no={1}
            name={t('직교 축')}
            value={axis?.axis.model ?? null}
            status={axis?.status}
            detail={axisTight ? `${t(axisTight.label)} ${pct(axisTight.ratio)}` : undefined}
            active={active === 0}
          />
          <Sign
            no={2}
            name={t('모터')}
            value={drive ? drive.motor.model : null}
            status={drive?.status}
            detail={
              drive ? `${drive.motor.maker}${driveTight ? ` · ${t(driveTight.label)} ${pct(driveTight.ratio)}` : ''}` : undefined
            }
            active={active === 1}
          />
          <Sign
            no={3}
            name={t('감속기')}
            value={drive ? (g ? g.model : t('감속기 미사용')) : null}
            detail={g ? `${g.maker} · ${g.ratio}:1` : undefined}
            active={active === 2}
          />
          <Sign
            no={4}
            name={t('연결키트')}
            value={kit?.product ?? null}
            empty={drive ? t('해당 키트 없음') : undefined}
            detail={kit ? t('축 {axis} · {motor}', { axis: kit.axisCode, motor: kit.motorCode }) : undefined}
            active={active === 3}
          />
        </ol>
        <div className="rail-actions">
          <button type="button" className="rail-action" onClick={exportClick} disabled={exporting}>
            {exporting ? t('PDF 생성 중…') : t('PDF로 내보내기')}
          </button>
          <button
            type="button"
            className="rail-action"
            lang={lang === 'ko' ? 'en' : 'ko'}
            onClick={() => onLang(lang === 'ko' ? 'en' : 'ko')}
          >
            {langSwitchLabel[lang]}
          </button>
        </div>
        <dialog ref={dialog} className="notice" aria-labelledby="notice-title">
          <h2 id="notice-title">{t('PDF로 내보낼 수 없습니다')}</h2>
          <p>
            {t('{items} 선정되지 않았습니다.', {
              items: lang === 'ko' ? missingText + koSubjectParticle(missingText) : missingText,
            })}
            <br />
            {t('직교 축, 모터, 연결키트를 먼저 선정하세요.')}
          </p>
          <form method="dialog">
            <button type="submit" className="notice-ok" autoFocus>
              {t('확인')}
            </button>
          </form>
        </dialog>
      </div>
    </header>
  )
}
