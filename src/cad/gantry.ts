import { gantryChain, slideFrame, axisMounting, type GantryAxis, type GantryInputs } from '../calc/gantry'
import type { Requirements } from '../calc/types'
import type { AxisAdapter } from '../data/types'
import { assemble, sourceNotice, type AssemblyPart } from './assemble'
import { comboParts, type Combo, type ComboDrawings, type ComboOptions, type ComboSelection, type PartRole, type TwinAxis } from './combo'
import type { AdapterMeta, Drawing } from './drawings'
import { add, apply, compose, cross, dot, identity, mate, rotate, scale, sub, type Frame, type Transform } from './geometry'
import { parseStep, writeStep, type Vec3 } from './step'

// Gantry drawing: each axis's combination (axis, kit, gearbox, motor; two X axes when X is a twin arrangement) turned
// into the gantry's world frame (X, Y horizontal, Z up, as calc/gantry.ts), the base axis at the origin, every
// carried axis on the slide(s) below it through its gantry kit (data/adapters), else at the entered mounting point.

export interface GantryAxisDrawing {
  axis: GantryAxis
  sel: ComboSelection
  found: ComboDrawings
  /** the axis's mounting and, for the tool axis, the payload COG in its slide frame (calc convention) */
  req: Pick<Requirements, 'mounting' | 'cog'>
  options: ComboOptions
  twin?: TwinAxis
}

export interface GantryJointDrawing {
  base: GantryAxis
  carried: GantryAxis
  /** one per base slide, in slide order (`GantryJoint.kits`); the mirror-image angle kits are placed by their hand */
  kits: { kit: AxisAdapter; drawing: Drawing<AdapterMeta> | null }[]
  /** world mm from the base axis's (arrangement) centre: the carried axis's mounting point as the calc takes it
   *  (`GantryJoint.offset`: along an angle kit, as the assembly instructions place it); absent = the entered one */
  offset?: { x: number; y: number; z: number }
  /** a kit pinning the carried axis (`GantryJoint.flange` / `driveSign`): its drive flange's position along the carried
   *  travel from the base centre, and the end its drive is at (+1: +t) */
  flange?: number | null
  driveSign?: 1 | -1
}

export interface GantryCombo extends Combo {
  /** joints placed without a kit drawing (at the entered mounting point), as `X–Y` */
  unkitted: string[]
}

const near = (a: Vec3, b: Vec3) => dot(a, b) > 0.999

/** World frame of an axis: slide normal and travel (the drive sits at the +t end, as calc/gantry.ts assumes) */
function worldOf(g: GantryInputs, a: GantryAxis) {
  const f = slideFrame(a, axisMounting(g, a))
  return { n: f.n as Vec3, t: f.t as Vec3 }
}

/**
 * The kit placed on a base slide (`at`, slide normal `n`): its base frame on the slide, turned about the normal so
 * the carried face holds the carried axis with its slide facing `carriedNormal` and its travel along `travel`.
 */
function placeKit(meta: AdapterMeta, at: Vec3, n: Vec3, travel: Vec3, carriedNormal: Vec3, upward?: Vec3): Transform | null {
  for (const s of [1, -1]) {
    const k = mate(identity, { origin: at, axis: n, up: scale(travel, s) }, { origin: meta.base.origin, axis: meta.base.axis, up: meta.carried.up })
    // a plate fits either way round: `upward` is where its carried up has to point (the pinned axis's body)
    if (near(rotate(k, meta.carried.axis), carriedNormal) && (!upward || dot(rotate(k, meta.carried.up), upward) > 0)) return k
  }
  return null
}

/** The way a kit's carried face reaches from its foot along the carried travel (file coordinates) */
const reach = (meta: AdapterMeta): Vec3 => scale(meta.carried.up, dot(sub(meta.carried.origin, meta.base.origin), meta.carried.up))

export async function buildGantry(
  g: GantryInputs,
  axes: GantryAxisDrawing[],
  joints: GantryJointDrawing[],
  load: (d: Drawing) => Promise<string>,
): Promise<GantryCombo> {
  const chain = gantryChain(g.config)
  const byAxis = new Map(axes.map((a) => [a.axis, a]))
  // the payload COG goes into the tool axis's combination; the combination's travel runs from the motor end, the
  // gantry's towards it, so x and y change sign
  const built = new Map(
    await Promise.all(
      chain.map(async (a) => {
        const d = byAxis.get(a)!
        const cog = { x: -d.req.cog.x, y: -d.req.cog.y, z: d.req.cog.z }
        // the carried axis sits on the slides: twin X axes side by side
        const options = { ...d.options, twinFacing: false }
        return [a, await comboParts(d.sel, d.found, { mounting: d.req.mounting, cog }, load, options, d.twin)] as const
      }),
    ),
  )
  const kitTexts = new Map(
    await Promise.all(
      [...new Map(joints.flatMap((j) => j.kits.flatMap((k) => (k.drawing ? [[k.drawing.url, k.drawing] as const] : [])))).values()].map(
        async (d) => [d.url, await load(d)] as const,
      ),
    ),
  )

  // combination → world for each axis, from the base up
  const placed = new Map<GantryAxis, Transform>()
  const kits: (AssemblyPart & { role: PartRole })[] = []
  const unkitted: string[] = []
  /** slide surface centres (start position) of a placed axis, both members of a twin arrangement */
  const slidesOf = (a: GantryAxis): Vec3[] => {
    const c = built.get(a)!
    const t = placed.get(a)!
    const twin = byAxis.get(a)!.twin
    const lateral = cross(c.slide.axis, c.slide.up)
    return [apply(t, c.slide.origin), ...(twin ? [apply(t, add(c.slide.origin, scale(lateral, twin.spacing)))] : [])]
  }
  const toWorld = (child: Frame, origin: Vec3, axis: Vec3, up: Vec3) => mate(identity, { origin, axis, up }, child)

  const bottom = chain[chain.length - 1]
  {
    const c = built.get(bottom)!
    const w = worldOf(g, bottom)
    let t = toWorld(c.slide, [0, 0, 0], w.n, scale(w.t, -1))
    placed.set(bottom, t)
    // a twin arrangement centred on the origin
    const slides = slidesOf(bottom)
    if (slides.length > 1) {
      t = { ...t, t: sub(t.t, scale(sub(slides[1], slides[0]), 0.5)) }
      placed.set(bottom, t)
    }
  }
  for (let i = chain.length - 2; i >= 0; i--) {
    const a = chain[i]
    const below = chain[i + 1]
    const c = built.get(a)!
    const w = worldOf(g, a)
    const wb = worldOf(g, below)
    const slides = slidesOf(below)
    const centre = scale(slides.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3), 1 / slides.length)
    const joint = joints.find((j) => j.base === below && j.carried === a)
    const offset = joint?.offset ?? (a === 'z' ? g.offsets.yz : g.offsets.xy)
    const target = add(centre, [offset.x, offset.y, offset.z])
    const drawn =
      joint?.kits.length && joint.kits.every((k) => k.drawing?.meta)
        ? joint.kits.map((k) => ({ kit: k.kit, url: k.drawing!.url, meta: k.drawing!.meta! }))
        : null
    const meta = drawn?.[0].meta ?? null
    const pair = `${below.toUpperCase()}–${a.toUpperCase()}`
    // moving Z profile: its slide is clamped to the Y slide, facing it
    if (a === 'z' && g.zMode === 'profile') {
      const facing = scale(wb.n, -1)
      const axis = Math.abs(dot(facing, w.t)) < 0.5 ? facing : w.n
      placed.set(a, toWorld(c.slide, target, axis, scale(w.t, -1)))
      unkitted.push(pair)
      continue
    }
    const profile: Frame = { origin: c.profile.origin, axis: scale(c.profile.axis, -1), up: c.profile.up }
    // the drive at +t as the calc takes it, at −t when the kit pins it there; a pinned plate's body away from it
    const sign = joint?.driveSign ?? 1
    const upward = drawn?.[0].kit.joint === 'plate' && joint?.flange != null ? scale(w.t, -sign) : undefined
    const first = meta ? placeKit(meta, slides[0], wb.n, w.t, w.n, upward) : null
    if (!meta || !first || !drawn) {
      placed.set(a, toWorld(profile, target, w.n, scale(w.t, -1)))
      unkitted.push(pair)
      continue
    }
    // each slide's kit with its wall reaching towards the carried axis's mounting point (two X axes: inwards, a
    // mirrored pair); on the slide itself the calc's choice
    const files = new Map<string, ReturnType<typeof parseStep>>()
    slides.slice(0, drawn.length).forEach((p, k) => {
      const want = dot(sub(target, p), w.t)
      const fits = (d: { meta: AdapterMeta }) => {
        const t = placeKit(d.meta, p, wb.n, w.t, w.n)
        return t && dot(rotate(t, reach(d.meta)), w.t) * want > 0 ? t : null
      }
      const pick = (Math.abs(want) > 1e-6 && drawn.find((d) => fits(d))) || drawn[k]
      const kt = (Math.abs(want) > 1e-6 && fits(pick)) || placeKit(pick.meta, p, wb.n, w.t, w.n, upward)
      if (!kt) return
      const url = pick.url
      if (!files.has(url)) files.set(url, parseStep(kitTexts.get(url)!))
      kits.push({ role: 'adapter', name: `${pick.kit.model}${k ? ` (${k + 1})` : ''}`, file: files.get(url)!, transform: kt })
    })
    // the carried profile on the kit face (across: on its centreline), its middle at the mounting point along its
    // travel; pinned: its drive flange where the kit's pins hold it
    const face = apply(first, meta.carried.origin)
    const along = add(face, scale(w.t, dot(sub(target, face), w.t)))
    let t = toWorld(profile, along, w.n, scale(w.t, -sign))
    if (joint?.flange != null) {
      const shift = dot(centre, w.t) + joint.flange - dot(apply(t, c.driveFlange), w.t)
      t = { ...t, t: add(t.t, scale(w.t, shift)) }
    }
    placed.set(a, t)
  }

  const parts: (AssemblyPart & { role: PartRole })[] = []
  for (const a of [...chain].reverse()) {
    const t = placed.get(a)!
    for (const p of built.get(a)!.parts) parts.push({ ...p, name: `${a.toUpperCase()} ${p.name}`, transform: compose(t, p.transform) })
  }
  parts.push(...kits)
  const tool = chain[0]
  const cog = apply(placed.get(tool)!, built.get(tool)!.cog)
  const name = `Gantry ${g.config.toUpperCase()}: ${[...chain].reverse().map((a) => `${a.toUpperCase()} ${byAxis.get(a)!.sel.axisModel}`).join(' / ')}`
  const notices = [...new Set([...[...built.values()].flatMap((c) => c.notices), ...[...kitTexts.values()].flatMap((t) => sourceNotice(t) ?? [])])]
  const step = writeStep(assemble(name, parts, { notices }))
  const bottomCombo = built.get(bottom)!
  return {
    name,
    step,
    parts: parts.map(({ role, name, transform }) => ({ role, name, transform })),
    cog,
    slideCentre: [0, 0, 0],
    axisStroke: bottomCombo.axisStroke,
    stretch: bottomCombo.stretch,
    unkitted,
  }
}
