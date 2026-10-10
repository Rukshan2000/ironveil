import { CatmullRomCurve3, Vector3 } from 'three'

/** A boat lane down a river's course (layout.water.river): u = 0 upstream … 1 downstream, at the surface. */
export class RiverPath {
  readonly curve: CatmullRomCurve3
  readonly length: number
  readonly y: number

  constructor(points: [number, number][], y: number) {
    this.y = y
    this.curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, y, z)), false, 'centripetal')
    this.length = this.curve.getLength()
  }

  /** Lane parameter closest to (x, z). */
  nearest(x: number, z: number) {
    let best = 0, bestD = Infinity
    const p = new Vector3()
    for (let i = 0; i <= 400; i++) {
      this.curve.getPointAt(i / 400, p)
      const d = (p.x - x) ** 2 + (p.z - z) ** 2
      if (d < bestD) [best, bestD] = [i / 400, d]
    }
    return best
  }

  at(u: number, out = new Vector3()) {
    return this.curve.getPointAt(Math.min(1, Math.max(0, u)), out)
  }

  /** Heading (yaw, forward = (-sin, 0, -cos)) travelling downstream (`dir` 1) or upstream (-1). */
  yaw(u: number, dir: 1 | -1 = 1) {
    const t = this.curve.getTangentAt(Math.min(1, Math.max(0, u)))
    return Math.atan2(-t.x * dir, -t.z * dir)
  }
}
