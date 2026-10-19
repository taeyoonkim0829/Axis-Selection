// Files STEP models exported from the Festo PARTdataManager (or downloaded from festo.com) into data/…/Drawings:
//   node scripts/festo-cad/import.mjs <folder> [--dry-run] [--move]
// Each file is identified by its first PRODUCT name in the STEP data ("<partNumber> <model>---(…)"), else by its
// FILE_NAME / file name, and saved as <partNumber>_<model>.stp next to the product data. Frames (the JSON next
// to each file) are not created; the report lists the files that still need one.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { existingDrawings, root, wantedParts } from './parts.mjs'

const args = process.argv.slice(2)
const src = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const move = args.includes('--move')
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/festo-cad/import.mjs <folder with .stp files> [--dry-run] [--move]')
  process.exit(1)
}

/** "<partNumber> <model>" candidates of a STEP file, most specific first. */
function identities(file) {
  // the PRODUCT entities can sit anywhere in the DATA section
  const text = readFileSync(file, 'latin1')
  const found = []
  // configured products (module numbers) end in "_(0)" instead of "---(…)"
  const product = /PRODUCT\(\s*'(\d{5,})[ _]([^'(]+?)(?:---[^']*|_\([^']*\))?'/.exec(text)
  if (product) found.push({ partNumber: product[1], model: product[2].trim() })
  const fileName = /FILE_NAME\(\s*(?:\/\*[^*]*\*\/\s*)?'(\d{5,})_([^']+)'/.exec(text)
  if (fileName) found.push({ partNumber: fileName[1], model: fileName[2].trim() })
  const base = file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
  const named = /^(\d{5,})[_ ](.+)$/.exec(base)
  found.push(named ? { partNumber: named[1], model: named[2] } : { partNumber: null, model: base })
  return found
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(stp|step)$/i.test(e.name) ? [join(dir, e.name)] : [],
  )

const parts = wantedParts()
const existing = existingDrawings()
const filed = []
const unknown = []
for (const file of walk(src)) {
  let hit = null
  for (const id of identities(file)) {
    const model = id.model.toUpperCase().replace(/\s+/g, '')
    const part =
      parts.find((p) => p.match.test(model)) ??
      (id.partNumber ? parts.find((p) => p.kind !== 'axes' && p.partNumber === id.partNumber) : undefined)
    if (part) {
      // axes and motor variants keep the file's own model (stroke, options)
      const own = part.kind === 'axes' || (part.kind === 'motors' && model !== part.model.toUpperCase())
      hit = { part, id: { partNumber: own ? id.partNumber : (id.partNumber ?? part.partNumber), model: own ? model : part.model } }
      break
    }
  }
  if (!hit) {
    unknown.push(file)
    continue
  }
  if (!hit.id.partNumber) {
    unknown.push(file)
    continue
  }
  const name = `${hit.id.partNumber}_${hit.id.model}.stp`
  // a file already in data/ keeps its place (and its frame JSON)
  const known = existing.find((f) => f.endsWith(`/${name}`))
  const rel = known ?? `data/${hit.part.folder}/${name}`
  const target = join(root, rel)
  if (!dryRun) {
    mkdirSync(dirname(target), { recursive: true })
    if (move) renameSync(file, target)
    else copyFileSync(file, target)
  }
  filed.push({ file, target: rel, part: hit.part, json: existsSync(target.replace(/\.stp$/, '.json')) })
}

for (const f of filed) console.log(`${dryRun ? '[dry-run] ' : ''}${f.file} -> ${f.target}`)
if (unknown.length) {
  console.log(`\nNot recognised (${unknown.length}): not a part in data/, or no part number/model in the file`)
  for (const f of unknown) console.log(`  ${f}`)
}
const needFrames = filed.filter((f) => f.part.frames === 'required' && !f.json)
if (needFrames.length) {
  console.log(`\nNeed a frame JSON before the drawing step can place them (${needFrames.length}):`)
  for (const f of needFrames) console.log(`  ${f.target.replace(/\.stp$/, '.json')}`)
}
console.log(`\n${filed.length} filed, ${unknown.length} not recognised`)
