import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { BoxDef } from '../world/types'

const CELL = 0.5
/** Obstacles are inflated by this (≈ guard radius + margin). */
const INFLATE = 0.3
const MAX_EXPANSIONS = 40000

/** Binary min-heap of grid indices keyed by f-score. */
class Heap {
  private items: number[] = []
  constructor(private readonly f: Float32Array) {}
  get size() {
    return this.items.length
  }
  clear() {
    this.items.length = 0
  }
  push(i: number) {
    const a = this.items
    a.push(i)
    let k = a.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (this.f[a[p]] <= this.f[a[k]]) break
      ;[a[p], a[k]] = [a[k], a[p]]
      k = p
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1
        let m = k
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r
        if (m === k) break
        ;[a[m], a[k]] = [a[k], a[m]]
        k = m
      }
    }
    return top
  }
}

/**
 * 2D walkability grid over the level for guard navigation. Built once from static colliders that obstruct a
 * walking person (probed at knee and chest height). Doors are left walkable — guards open them.
 */
export class NavGrid {
  readonly w: number
  readonly h: number
  readonly blocked: Uint8Array
  private readonly g: Float32Array
  private readonly f: Float32Array
  private readonly came: Int32Array
  private readonly stamp: Uint32Array
  private readonly closed: Uint32Array
  private search = 0
  private readonly heap: Heap

  constructor(readonly bounds: readonly [number, number, number, number], boxes: BoxDef[]) {
    this.w = Math.ceil((bounds[2] - bounds[0]) / CELL)
    this.h = Math.ceil((bounds[3] - bounds[1]) / CELL)
    const n = this.w * this.h
    this.blocked = new Uint8Array(n)
    this.g = new Float32Array(n)
    this.f = new Float32Array(n)
    this.came = new Int32Array(n)
    this.stamp = new Uint32Array(n)
    this.closed = new Uint32Array(n)
    this.heap = new Heap(this.f)
    for (const b of boxes) this.rasterize(b)
  }

  private rasterize(b: BoxDef) {
    if (b.collide === false || b.mat === 'foliage') return
    const inv = new Matrix4().compose(new Vector3(...b.p), new Quaternion().setFromEuler(new Euler(b.rx ?? 0, b.yaw ?? 0, b.rz ?? 0, 'YXZ')), new Vector3(1, 1, 1)).invert()
    const hx = b.s[0] / 2 + INFLATE, hy = b.s[1] / 2, hz = (b.shape === 'cyl' ? b.s[0] : b.s[2]) / 2 + INFLATE
    // conservative world AABB of the inflated box
    const r = Math.hypot(b.s[0], b.s[1], b.s[2]) / 2 + INFLATE
    const [x0, z0] = this.cellOf(b.p[0] - r, b.p[2] - r)
    const [x1, z1] = this.cellOf(b.p[0] + r, b.p[2] + r)
    const p = new Vector3()
    for (let cz = Math.max(0, z0); cz <= Math.min(this.h - 1, z1); cz++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(this.w - 1, x1); cx++) {
        const wx = this.bounds[0] + (cx + 0.5) * CELL, wz = this.bounds[1] + (cz + 0.5) * CELL
        for (const y of [0.45, 1.3]) {
          p.set(wx, y, wz).applyMatrix4(inv)
          if (Math.abs(p.x) < hx && Math.abs(p.y) < hy + 0.05 && Math.abs(p.z) < hz) {
            this.blocked[cz * this.w + cx] = 1
            break
          }
        }
      }
    }
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.bounds[0]) / CELL), Math.floor((z - this.bounds[1]) / CELL)]
  }

  private center(i: number, out: Vector3, y = 0) {
    return out.set(this.bounds[0] + ((i % this.w) + 0.5) * CELL, y, this.bounds[1] + (Math.floor(i / this.w) + 0.5) * CELL)
  }

  walkable(x: number, z: number) {
    const [cx, cz] = this.cellOf(x, z)
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h && !this.blocked[cz * this.w + cx]
  }

  /** Centre of the nearest walkable cell within `maxDist` metres of (x, z), or null. */
  nearestWalkable(x: number, z: number, maxDist: number): Vector3 | null {
    const i = this.nearestFree(x, z)
    if (i < 0) return null
    const p = this.center(i, new Vector3())
    return Math.hypot(p.x - x, p.z - z) <= maxDist ? p : null
  }

  /** Every cell reachable on foot from `from` (1 = reachable). Exact flood fill — for level validation, not per-frame use. */
  floodFrom(from: Vector3): Uint8Array {
    const seen = new Uint8Array(this.w * this.h)
    const start = this.nearestFree(from.x, from.z)
    if (start < 0) return seen
    const queue = new Int32Array(this.w * this.h)
    let head = 0, tail = 0
    queue[tail++] = start
    seen[start] = 1
    const W = this.w
    while (head < tail) {
      const cur = queue[head++]
      const cx = cur % W, cz = Math.floor(cur / W)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, nz = cz + dz
          if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue
          const ni = nz * W + nx
          if (seen[ni] || this.blocked[ni]) continue
          if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue
          seen[ni] = 1
          queue[tail++] = ni
        }
      }
    }
    return seen
  }

  /** Is (x, z) inside a cell marked in a flood-fill result? */
  inFlood(flood: Uint8Array, x: number, z: number) {
    const [cx, cz] = this.cellOf(x, z)
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h && flood[cz * this.w + cx] === 1
  }

  /** Nearest walkable cell index to (x, z), searching outwards in rings. */
  private nearestFree(x: number, z: number): number {
    const [cx, cz] = this.cellOf(x, z)
    for (let r = 0; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const x2 = cx + dx, z2 = cz + dz
          if (x2 < 0 || z2 < 0 || x2 >= this.w || z2 >= this.h) continue
          const i = z2 * this.w + x2
          if (!this.blocked[i]) return i
        }
      }
    }
    return -1
  }

  /** Straight walkable line between two cells (supercover-ish DDA). */
  private lineClear(a: number, b: number) {
    let x0 = a % this.w, z0 = Math.floor(a / this.w)
    const x1 = b % this.w, z1 = Math.floor(b / this.w)
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0)
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1
    let err = dx - dz
    for (;;) {
      if (this.blocked[z0 * this.w + x0]) return false
      if (x0 === x1 && z0 === z1) return true
      const e2 = 2 * err
      if (e2 > -dz) {
        err -= dz
        x0 += sx
      }
      if (e2 < dx) {
        err += dx
        z0 += sz
      }
      // block diagonal squeezes between two blocked cells
      if (this.blocked[z0 * this.w + (x0 - sx)] && this.blocked[(z0 - sz) * this.w + x0]) return false
    }
  }

  /** A* from → to. Returns smoothed waypoints (excluding the start) or null when unreachable. */
  findPath(from: Vector3, to: Vector3): Vector3[] | null {
    const start = this.nearestFree(from.x, from.z)
    const goal = this.nearestFree(to.x, to.z)
    if (start < 0 || goal < 0) return null
    if (start === goal || this.lineClear(start, goal)) return [to.clone()]
    const s = ++this.search
    const W = this.w
    const gx = goal % W, gz = Math.floor(goal / W)
    const heur = (i: number) => {
      const dx = Math.abs((i % W) - gx), dz = Math.abs(Math.floor(i / W) - gz)
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)
    }
    this.heap.clear()
    this.g[start] = 0
    this.f[start] = heur(start)
    this.stamp[start] = s
    this.came[start] = -1
    this.heap.push(start)
    let expansions = 0
    let found = false
    while (this.heap.size && expansions++ < MAX_EXPANSIONS) {
      const cur = this.heap.pop()
      if (cur === goal) {
        found = true
        break
      }
      if (this.closed[cur] === s) continue
      this.closed[cur] = s
      const cx = cur % W, cz = Math.floor(cur / W)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue
          const nx = cx + dx, nz = cz + dz
          if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue
          const ni = nz * W + nx
          if (this.blocked[ni] || this.closed[ni] === s) continue
          if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue // no corner cutting
          const ng = this.g[cur] + (dx && dz ? Math.SQRT2 : 1)
          if (this.stamp[ni] === s && ng >= this.g[ni]) continue
          this.stamp[ni] = s
          this.g[ni] = ng
          this.f[ni] = ng + heur(ni) * 1.5
          this.came[ni] = cur
          this.heap.push(ni)
        }
      }
    }
    if (!found) return null

    const cells: number[] = []
    for (let i = goal; i !== -1; i = this.came[i]) cells.push(i)
    cells.reverse()
    // string-pull: keep only the cells where the straight line breaks
    const out: Vector3[] = []
    let anchor = 0
    for (let i = 2; i < cells.length; i++) {
      if (!this.lineClear(cells[anchor], cells[i])) {
        out.push(this.center(cells[i - 1], new Vector3(), from.y))
        anchor = i - 1
      }
    }
    out.push(to.clone())
    return out
  }

  /** A random walkable point within `radius` of `c` (for search patterns). */
  randomPoint(c: Vector3, radius: number, rng: () => number = Math.random): Vector3 | null {
    for (let k = 0; k < 12; k++) {
      const a = rng() * Math.PI * 2, r = radius * (0.3 + rng() * 0.7)
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r
      if (this.walkable(x, z)) return new Vector3(x, c.y, z)
    }
    return null
  }
}
