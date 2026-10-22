import { useState } from 'react'
import { useT } from '../i18n'
import { applySkin, currentSkin, SKINS } from './skin'

export function Footer() {
  const t = useT()
  const [skin, setSkin] = useState(currentSkin)
  return (
    <footer className="app-footer">
      {/* design alternatives on the same screen (skin.ts) */}
      <div className="skin-switch" role="group" aria-label={t('화면 시안')}>
        <span>{t('화면 시안')}</span>
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={skin === s.id}
            onClick={() => {
              applySkin(s.id)
              setSkin(s.id)
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      © 2026. Kim Taeyoon. All rights reserved.
      <br />
      <a href="mailto:theo.kim0829@gmail.com">theo.kim0829@gmail.com</a>
    </footer>
  )
}
