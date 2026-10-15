import { describe, expect, it } from 'vitest'
import { axes, motors } from '../data'
import { en } from './en'
import { koSubjectParticle, translate, translateData } from './index'

const HANGUL = /[가-힣]/

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.ts', '!./**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Korean string literals of a source file, and any Korean left outside string literals. */
function koreanStrings(code: string) {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
  const literal = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
  const strings: string[] = []
  const templates: string[] = []
  for (const s of stripped.match(literal) ?? []) {
    if (!s.startsWith('`')) strings.push(s)
    else {
      // Static parts of a template must not be Korean; string literals inside ${…} are checked like any other.
      if (HANGUL.test(s.replace(/\$\{[^}]*\}/g, ''))) templates.push(s)
      for (const [, expr] of s.matchAll(/\$\{([^}]*)\}/g)) strings.push(...(expr.match(literal) ?? []))
    }
  }
  const outside = stripped.replace(literal, '').split('\n').filter((line) => HANGUL.test(line))
  return { strings: strings.filter((s) => HANGUL.test(s)), templates, outside }
}

describe('translations', () => {
  it('has English for every Korean string in the source', () => {
    const missing: string[] = []
    for (const [file, code] of Object.entries(sources)) {
      const { strings, templates, outside } = koreanStrings(code)
      for (const line of outside) missing.push(`${file}: Korean outside a string literal: ${line.trim()}`)
      for (const s of templates) missing.push(`${file}: Korean in a template literal: ${s}`)
      for (const s of strings) if (!(s.slice(1, -1) in en)) missing.push(`${file}: ${s.slice(1, -1)}`)
    }
    expect(missing).toEqual([])
  })

  it('keeps placeholders and leaves no Korean in English text', () => {
    for (const [ko, text] of Object.entries(en)) {
      const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).toSorted()
      expect(names(text), ko).toEqual(names(ko))
      expect(HANGUL.test(text), text).toBe(false)
    }
  })

  it('translates the Korean text in product data', () => {
    const texts = [
      ...motors.flatMap((m) => [m.series, m.description]),
      ...axes.map((a) => (a as { category?: string }).category),
    ].filter((s): s is string => !!s && HANGUL.test(s))
    for (const s of new Set(texts)) expect(translateData('en', s), s).not.toMatch(HANGUL)
  })

  it('fills placeholders', () => {
    expect(translate('en', '적합 {pass} / 검토 {total}', { pass: 3, total: 10 })).toBe('3 passed / 10 checked')
    expect(translate('ko', '적합 {pass}', { pass: 3 })).toBe('적합 3')
    expect(translate('en', 'unknown {x}', { x: 1 })).toBe('unknown 1')
  })

  it('picks the Korean subject particle', () => {
    expect(koSubjectParticle('모터')).toBe('가')
    expect(koSubjectParticle('직교 축')).toBe('이')
  })
})
