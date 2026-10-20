import { BufferAttribute, BufferGeometry, EdgesGeometry } from 'three'
import { EDGE_ANGLE, type TessellateReply, type TessellateRequest } from './occt'
import { meshStep } from './occtMesh'

// Tessellation worker: one request at a time, meshes sent back with their buffers transferred.
self.addEventListener('message', async (e: MessageEvent<TessellateRequest>) => {
  const { id, step, partCount } = e.data
  let reply: TessellateReply
  const transfer: Transferable[] = []
  try {
    const meshes = await meshStep(step, partCount)
    for (const m of meshes) {
      // the 3D view's edge lines, here rather than on the page (the slowest part of showing a model)
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(m.positions, 3))
      g.setIndex(new BufferAttribute(m.index, 1))
      m.edges = new EdgesGeometry(g, EDGE_ANGLE).getAttribute('position').array as Float32Array
      transfer.push(m.positions.buffer, m.index.buffer, m.edges.buffer, ...(m.normals ? [m.normals.buffer] : []))
    }
    reply = { id, meshes }
  } catch (err) {
    reply = { id, error: String(err instanceof Error ? err.message : err) }
  }
  self.postMessage(reply, { transfer })
})
