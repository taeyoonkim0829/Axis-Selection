/** A drawing file's text from its fetched bytes: gzipped in the build (`vite.config.ts`), raw on the dev server */
export async function stepText(bytes: ArrayBuffer): Promise<string> {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new TextDecoder().decode(bytes)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}
