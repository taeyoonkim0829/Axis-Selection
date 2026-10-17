declare module 'occt-import-js' {
  export interface OcctMesh {
    name: string
    attributes: { position: { array: number[] }; normal?: { array: number[] } }
    index: { array: number[] }
    brep_faces: { first: number; last: number; color: number[] | null }[]
    color?: number[]
  }
  export interface OcctNode {
    name: string
    meshes: number[]
    children: OcctNode[]
  }
  export interface OcctResult {
    success: boolean
    root: OcctNode
    meshes: OcctMesh[]
  }
  export interface OcctParams {
    linearUnit?: 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot'
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value'
    linearDeflection?: number
    angularDeflection?: number
  }
  export interface Occt {
    ReadStepFile(content: Uint8Array, params: OcctParams | null): OcctResult
  }
  const init: (module?: { locateFile?: (name: string) => string }) => Promise<Occt>
  export default init
}
