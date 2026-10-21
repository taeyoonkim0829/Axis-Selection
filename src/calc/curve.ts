/** Linear interpolation in a data sheet curve of [x, y] points (sorted by x), held flat beyond its ends. */
export function curveAt(curve: [number, number][], x: number): number {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (x <= x1) {
      const [x0, y0] = curve[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return curve[curve.length - 1][1]
}
