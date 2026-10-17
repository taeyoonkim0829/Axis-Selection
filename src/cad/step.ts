// Minimal STEP (ISO 10303-21) reader/writer: enough to stretch an axis body and to assemble the
// manufacturers' files into one assembly without touching their geometry.

export interface StepFile {
  header: string
  /** entity id → its text after `#id=` (without the `;`), line breaks removed */
  entities: Map<number, string>
}

/** Splits the DATA section into entities; `;` and `#` inside strings are left alone. */
export function parseStep(text: string): StepFile {
  const dataAt = text.indexOf('DATA;')
  if (dataAt < 0) throw new Error('STEP: no DATA section')
  const header = text.slice(0, dataAt)
  const entities = new Map<number, string>()
  let i = dataAt + 5
  let start = i
  let inString = false
  for (; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'") inString = !inString
    else if (ch === ';' && !inString) {
      const raw = text.slice(start, i).trim()
      start = i + 1
      if (raw === 'ENDSEC') break
      const m = /^#(\d+)\s*=\s*([\s\S]*)$/.exec(raw)
      if (m) entities.set(Number(m[1]), m[2].replace(/\r?\n/g, ''))
    }
  }
  return { header, entities }
}

/** Calls `fn` for each `#id` reference outside strings and puts its result in place. */
export function mapRefs(body: string, fn: (id: number) => number): string {
  let out = ''
  let inString = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === "'") inString = !inString
    if (ch === '#' && !inString) {
      let j = i + 1
      while (j < body.length && body[j] >= '0' && body[j] <= '9') j++
      out += `#${fn(Number(body.slice(i + 1, j)))}`
      i = j - 1
    } else out += ch
  }
  return out
}

export function refs(body: string): number[] {
  const ids: number[] = []
  mapRefs(body, (id) => (ids.push(id), id))
  return ids
}

/** Entity type name (`CARTESIAN_POINT`); complex entities `( A() B() )` give `''`. */
export const typeOf = (body: string) => /^\s*([A-Z0-9_]*)/.exec(body)![1]

/** Every entity reachable from `root`. */
export function closure(file: StepFile, root: number): Set<number> {
  const seen = new Set<number>()
  const stack = [root]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const body = file.entities.get(id)
    if (body) stack.push(...refs(body))
  }
  return seen
}

/** Ids referencing each entity. */
export function referrers(file: StepFile): Map<number, number[]> {
  const by = new Map<number, number[]>()
  for (const [id, body] of file.entities)
    for (const r of refs(body)) {
      const list = by.get(r)
      if (list) list.push(id)
      else by.set(r, [id])
    }
  return by
}

export type Vec3 = [number, number, number]

const pointRe = /^CARTESIAN_POINT\(\s*'[^']*'\s*,\s*\(([^)]*)\)\s*\)$/

export function pointOf(body: string): Vec3 | null {
  const m = pointRe.exec(body)
  if (!m) return null
  const v = m[1].split(',').map(Number)
  return v.length === 3 && v.every(Number.isFinite) ? (v as Vec3) : null
}

export const num = (v: number) => {
  if (Object.is(v, -0) || Math.abs(v) < 1e-12) return '0.'
  const s = String(Number(v.toPrecision(15)))
  return s.includes('.') || s.includes('e') ? s.replace('e', 'E') : `${s}.`
}

export const pointBody = (p: Vec3) => `CARTESIAN_POINT('',(${p.map(num).join(',')}))`
export const directionBody = (d: Vec3) => `DIRECTION('',(${d.map(num).join(',')}))`

export function writeStep(file: StepFile): string {
  const lines = [file.header.trimEnd(), 'DATA;']
  for (const [id, body] of file.entities) lines.push(`#${id}=${body};`)
  lines.push('ENDSEC;', 'END-ISO-10303-21;', '')
  return lines.join('\n')
}

/** Splits the arguments of `NAME(a,b,(c,d),'e')` at the top level. */
export function args(body: string): string[] {
  const open = body.indexOf('(')
  const parts: string[] = []
  let depth = 0
  let inString = false
  let start = open + 1
  for (let i = open + 1; i < body.length; i++) {
    const ch = body[i]
    if (ch === "'") inString = !inString
    if (inString) continue
    if (ch === '(') depth++
    else if (ch === ')') {
      if (depth === 0) {
        parts.push(body.slice(start, i).trim())
        break
      }
      depth--
    } else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i).trim())
      start = i + 1
    }
  }
  return parts
}

/** `(#1,#2)` → [1, 2] */
export const refList = (arg: string) => refs(arg)
