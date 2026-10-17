import type { Vec3 } from './step'

/** Rigid transform: p' = R·p + t, R as rows */
export interface Transform {
  r: [Vec3, Vec3, Vec3]
  t: Vec3
}

/** Mating frame on a part: `axis` points from the axis side towards the motor side, `up` is perpendicular to it. */
export interface Frame {
  origin: Vec3
  axis: Vec3
  up: Vec3
}

export const identity: Transform = {
  r: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  t: [0, 0, 0],
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]

export const rotate = (m: Transform, v: Vec3): Vec3 => [dot(m.r[0], v), dot(m.r[1], v), dot(m.r[2], v)]
export const apply = (m: Transform, p: Vec3): Vec3 => add(rotate(m, p), m.t)

/** a ∘ b: first b, then a */
export function compose(a: Transform, b: Transform): Transform {
  const col = (j: number): Vec3 => [b.r[0][j], b.r[1][j], b.r[2][j]]
  const cols = [rotate(a, col(0)), rotate(a, col(1)), rotate(a, col(2))]
  return {
    r: [0, 1, 2].map((i) => [cols[0][i], cols[1][i], cols[2][i]]) as Transform['r'],
    t: apply(a, b.t),
  }
}

export function invert(m: Transform): Transform {
  const r: Transform['r'] = [
    [m.r[0][0], m.r[1][0], m.r[2][0]],
    [m.r[0][1], m.r[1][1], m.r[2][1]],
    [m.r[0][2], m.r[1][2], m.r[2][2]],
  ]
  const inv = { r, t: [0, 0, 0] as Vec3 }
  return { r, t: scale(rotate(inv, m.t), -1) }
}

/** Rotation whose columns are the given (orthonormal, right-handed) basis vectors. */
export const fromColumns = (x: Vec3, y: Vec3, z: Vec3, t: Vec3 = [0, 0, 0]): Transform => ({
  r: [
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]],
  ],
  t,
})

/** Frame → transform from the frame's own coordinates (x = up × axis, y = up, z = axis) to the part's. */
export const frameTransform = (f: Frame) => fromColumns(cross(f.up, f.axis), f.up, f.axis, f.origin)

/** Places a child part so that its frame coincides with the parent's frame (both in their part coordinates). */
export const mate = (parentToWorld: Transform, parent: Frame, child: Frame) =>
  compose(parentToWorld, compose(frameTransform(parent), invert(frameTransform(child))))
