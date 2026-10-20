import { rotate, type Transform } from './geometry'
import { directionBody, mapRefs, pointBody, type StepFile } from './step'
import { rootDefinition, shapeOf } from './structure'

export interface AssemblyPart {
  /** occurrence name in the assembly tree */
  name: string
  file: StepFile
  /** part coordinates → assembly coordinates */
  transform: Transform
}

/** STEP string: plain ASCII only (Part 21 basic alphabet), quotes doubled */
const quote = (s: string) => `'${s.replace(/[^\x20-\x7e]+/g, ' ').replace(/'/g, "''")}'`

/**
 * One STEP assembly (AP203, mm) from the parts' own files: each file's entities are copied unchanged with new
 * ids, and a top assembly places each part's root product with its transform.
 */
export function assemble(
  name: string,
  parts: AssemblyPart[],
  { notices = [], timeStamp = new Date().toISOString() }: { notices?: string[]; timeStamp?: string } = {},
): StepFile {
  const entities = new Map<number, string>()
  let next = 1
  const roots: { pd: number; rep: number }[] = []
  for (const part of parts) {
    const offset = next - Math.min(...part.file.entities.keys())
    for (const [id, body] of part.file.entities) entities.set(id + offset, mapRefs(body, (r) => r + offset))
    next = Math.max(...entities.keys()) + 1
    const pd = rootDefinition(part.file)
    const rep = shapeOf(part.file, pd)
    if (rep == null) throw new Error(`STEP: ${part.name} has no shape`)
    roots.push({ pd: pd + offset, rep: rep + offset })
  }

  const add = (body: string) => {
    const id = next++
    entities.set(id, body)
    return id
  }
  const len = add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))')
  const ang = add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))')
  const sol = add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())')
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-5),#${len},'DISTANCE_ACCURACY_VALUE','')`)
  const ctx = add(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))` +
      `GLOBAL_UNIT_ASSIGNED_CONTEXT((#${len},#${ang},#${sol}))REPRESENTATION_CONTEXT(${quote(name)},'TOP_LEVEL_ASSEMBLY_PART'))`,
  )
  const app = add("APPLICATION_CONTEXT('configuration controlled 3D designs of mechanical parts and assemblies')")
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',2010,#${app})`)
  const mech = add(`MECHANICAL_CONTEXT('',#${app},'mechanical')`)
  const product = add(`PRODUCT(${quote(name)},${quote(name)},${quote(name)},(#${mech}))`)
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('assembly','',(#${product}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#${product},.NOT_KNOWN.)`)
  const design = add(`DESIGN_CONTEXT('',#${app},'design')`)
  const pd = add(`PRODUCT_DEFINITION('','',#${formation},#${design})`)
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`)
  const placement = (t: Transform) => {
    const p = add(pointBody(t.t))
    const z = add(directionBody(rotate(t, [0, 0, 1])))
    const x = add(directionBody(rotate(t, [1, 0, 0])))
    return add(`AXIS2_PLACEMENT_3D('',#${p},#${z},#${x})`)
  }
  const origin = placement({ r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] })
  const placements = parts.map((p) => placement(p.transform))
  const rep = add(`SHAPE_REPRESENTATION(${quote(name)},(${[origin, ...placements].map((id) => `#${id}`).join(',')}),#${ctx})`)
  add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`)
  parts.forEach((part, i) => {
    const label = quote(part.name)
    const nauo = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('A${i + 1}',${label},${label},#${pd},#${roots[i].pd},$)`)
    const shape = add(`PRODUCT_DEFINITION_SHAPE('','',#${nauo})`)
    const idt = add(`ITEM_DEFINED_TRANSFORMATION('','',#${origin},#${placements[i]})`)
    const rel = add(
      `(REPRESENTATION_RELATIONSHIP('','',#${roots[i].rep},#${rep})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idt})SHAPE_REPRESENTATION_RELATIONSHIP())`,
    )
    add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${rel},#${shape})`)
  })

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    // the parts' licence and origin (e.g. CADENAS, CC BY-ND 4.0) travel with the assembly
    `FILE_DESCRIPTION((${['AxisPilot assembly', ...notices].map(quote).join(',')}),'2;1');`,
    `FILE_NAME(${quote(name)},${quote(timeStamp.slice(0, 19))},('AxisPilot'),(''),'AxisPilot','AxisPilot','');`,
    "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
    'ENDSEC;',
    '',
  ].join('\n')
  return { header, entities }
}

/** Licence and origin lines of the source files' headers (FILE_NAME author / organisation) */
export function sourceNotice(text: string): string | null {
  const m = /FILE_NAME\s*\(([\s\S]*?)\);/.exec(text)
  if (!m) return null
  const strings = [...m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']*)'/g)].map((s) => s[1].trim())
  return strings.filter((s) => /licen|cadenas|copyright/i.test(s)).join(', ') || null
}
