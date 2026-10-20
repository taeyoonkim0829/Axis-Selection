import { useT } from '../i18n'

/** single = one axis (with its parallel arrangement), gantry = XYZ combination */
export type AppMode = 'single' | 'gantry'
const modeLabel: Record<AppMode, string> = { single: '단축 선정', gantry: '조합축 선정' }

/** Screen switch at the top of the input column, above the first input box */
export function ModeSwitch({ mode, onMode }: { mode: AppMode; onMode: (mode: AppMode) => void }) {
  const t = useT()
  return (
    <div className="segmented mode-switch" role="radiogroup" aria-label={t('선정 화면')}>
      {(Object.keys(modeLabel) as AppMode[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? 'active' : ''}
          onClick={() => mode !== m && onMode(m)}
        >
          {t(modeLabel[m])}
        </button>
      ))}
    </div>
  )
}
