import type { Occt, OcctNode } from 'occt-import-js'
import type { DrawMesh } from './dxf'

// OpenCascade (occt-import-js, WebAssembly ~7.6 MB) tessellates the assembled STEP for the 3D view and the DXF.
// Loaded on first use only.

export interface PartMesh extends DrawMesh {
  /** index of the assembly part (order of `Combo.parts`) */
  part: number
  normals: ArrayLike<number> | null
  name: string
}

let occt: Promise<Occt> | null = null

function loadOcct(): Promise<Occt> {
  occt ??= Promise.all([import('occt-import-js'), import('occt-import-js/dist/occt-import-js.wasm?url')]).then(
    ([{ default: init }, { default: wasmUrl }]) => init({ locateFile: () => wasmUrl }),
  )
  return occt
}

/** Meshes of the assembly, each tagged with the top-level part it belongs to. */
export async function tessellate(step: string, partCount: number): Promise<PartMesh[]> {
  const lib = await loadOcct()
  const result = lib.ReadStepFile(new TextEncoder().encode(step), {
    linearUnit: 'millimeter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.0005,
    angularDeflection: 0.3,
  })
  if (!result.success) throw new Error('STEP could not be read')
  // descend through wrapper nodes to the level holding one node per part
  let level: OcctNode[] = [result.root]
  while (level.length === 1 && level[0].children.length > 0 && level[0].meshes.length === 0) level = level[0].children
  const partOf = new Map<number, number>()
  const walk = (node: OcctNode, part: number) => {
    for (const m of node.meshes) partOf.set(m, part)
    node.children.forEach((c) => walk(c, part))
  }
  if (level.length === partCount) level.forEach((node, i) => walk(node, i))
  return result.meshes.map((m, i) => ({
    part: partOf.get(i) ?? 0,
    name: m.name,
    positions: m.attributes.position.array,
    normals: m.attributes.normal?.array ?? null,
    index: m.index.array,
    faces: m.brep_faces,
  }))
}
