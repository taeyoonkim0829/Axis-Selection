import { args, refList, refs, typeOf, type StepFile } from './step'

// Product structure of a STEP file: PRODUCT → formation → PRODUCT_DEFINITION → shape → representations.

const ofType = (file: StepFile, type: string) => [...file.entities].filter(([, b]) => typeOf(b) === type)

/** Shape representation of a product definition */
export function shapeOf(file: StepFile, pd: number): number | null {
  const pds = ofType(file, 'PRODUCT_DEFINITION_SHAPE').find(([, b]) => refs(b).at(-1) === pd)?.[0]
  if (pds == null) return null
  const sdr = ofType(file, 'SHAPE_DEFINITION_REPRESENTATION').find(([, b]) => refs(b)[0] === pds)
  return sdr ? refs(sdr[1])[1] : null
}

/** The top product definition: the one that is never a component (`related`) of an assembly usage. */
export function rootDefinition(file: StepFile): number {
  const nauo = ofType(file, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE').map(([, b]) => refs(b))
  const related = new Set(nauo.map((r) => r[1]))
  const pds = ofType(file, 'PRODUCT_DEFINITION').map(([id]) => id)
  const root = pds.find((id) => !related.has(id) && (nauo.length === 0 || nauo.some((r) => r[0] === id)))
  if (root == null) throw new Error('STEP: no root product definition')
  return root
}

/** Product definition whose PRODUCT name contains `name` */
export function definitionByName(file: StepFile, name: string): number | null {
  const product = ofType(file, 'PRODUCT').find(([, b]) => args(b)[0].includes(name))?.[0]
  if (product == null) return null
  const formation = [...file.entities].find(
    ([, b]) => typeOf(b).startsWith('PRODUCT_DEFINITION_FORMATION') && refs(b)[0] === product,
  )?.[0]
  return ofType(file, 'PRODUCT_DEFINITION').find(([, b]) => refs(b)[0] === formation)?.[0] ?? null
}

/** Solids (MANIFOLD_SOLID_BREP, BREP_WITH_VOIDS) of a shape representation, directly or via a relationship */
export function solidsOf(file: StepFile, rep: number): number[] {
  const reps = [rep]
  for (const [, b] of ofType(file, 'SHAPE_REPRESENTATION_RELATIONSHIP')) {
    const r = refs(b)
    if (r[0] === rep) reps.push(r[1])
    else if (r[1] === rep) reps.push(r[0])
  }
  const solids: number[] = []
  for (const id of reps) {
    const body = file.entities.get(id)
    if (!body) continue
    for (const item of refList(args(body)[1] ?? '')) {
      const t = typeOf(file.entities.get(item) ?? '')
      if (t === 'MANIFOLD_SOLID_BREP' || t === 'BREP_WITH_VOIDS') solids.push(item)
    }
  }
  return [...new Set(solids)]
}
