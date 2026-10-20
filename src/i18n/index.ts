// UI language. Korean source strings are the translation keys: `t('스트로크')` returns them as they are in
// Korean and looks them up in `en` in English. Calculation labels and notes (`Check.label`, `Check.note`)
// stay Korean in the calc layer and are translated where they are shown.
import { createContext, useContext } from 'react'
import { en, enData } from './en'

export type Lang = 'ko' | 'en'

export type Args = Record<string, string | number>

/** Text of the language switch: the language it switches to. */
export const langSwitchLabel: Record<Lang, string> = { ko: 'English', en: '한국어' }

const STORAGE_KEY = 'axispilot.lang'
/** Key used before the rename to AxisPilot; read once and moved to the new key */
const OLD_STORAGE_KEY = 'axis-selection.lang'

export function storedLang(): Lang {
  try {
    const old = localStorage.getItem(OLD_STORAGE_KEY)
    if (old != null) {
      if (localStorage.getItem(STORAGE_KEY) == null) localStorage.setItem(STORAGE_KEY, old)
      localStorage.removeItem(OLD_STORAGE_KEY)
    }
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ko'
  } catch {
    return 'ko'
  }
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // private window or blocked storage: the choice just isn't remembered
  }
  document.documentElement.lang = lang
}

/** Translates a Korean source string and fills `{name}` placeholders. Unknown strings pass through. */
export function translate(lang: Lang, text: string, args?: Args): string {
  const s = lang === 'en' ? (en[text] ?? text) : text
  return args ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in args ? String(args[k]) : m)) : s
}

/** Translates Korean text found in product data (motor series and descriptions). */
export function translateData(lang: Lang, text: string): string {
  if (lang === 'ko') return text
  return enData.reduce((s, [from, to]) => s.replace(from, to), text)
}

/** 이 after a final consonant (받침), else 가. */
export function koSubjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '이' : '가'
}

const LangContext = createContext<Lang>('ko')

/** Provides the UI language: `<LangProvider value={lang}>`. */
export const LangProvider = LangContext.Provider

export function useLang(): Lang {
  return useContext(LangContext)
}

/** `t(text, args)` for the current language. */
export function useT() {
  const lang = useContext(LangContext)
  return (text: string, args?: Args) => translate(lang, text, args)
}
