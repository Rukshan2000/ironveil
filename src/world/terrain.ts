import { BufferAttribute, PlaneGeometry } from 'three'
import type { LevelLayout } from './types'

/** Smooth, non-tiling value noise for terrain (deterministic). */
function hash2(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z)
  const xf = x - xi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w
}
export function fbm(x: number, z: number, octaves = 4) {
  let s = 0, amp = 0.5, f = 1, n = 0
  for (let o = 0; o < octaves; o++) {
    s += vnoise(x * f, z * f) * amp
    n += amp
    amp *= 0.5
    f *= 2.03
  }
  return s / n
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Distance from (x,z) to the outside of rect (0 inside). */
const rectDist = (x: number, z: number, r: readonly number[]) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]))

function segDist(x: number, z: number, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1, dz = z2 - z1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t))
}

export const TERRAIN_SIZE = 420
const SEGMENTS = 210

export class Terrain {
  readonly size = TERRAIN_SIZE
  readonly segments = SEGMENTS
  constructor(private readonly layout: LevelLayout) {}

  /** 0 = base gravel/dirt, 1 = wild grass; used for texture splatting and footstep surfaces. */
  wildness(x: number, z: number) {
    const L = this.layout
    let w = smoothstep(2, 14, rectDist(x, z, L.flatArea))
    for (const r of L.roads) w = Math.min(w, smoothstep(1.5, 6, rectDist(x, z, r)))
    for (const c of L.channels) w = Math.min(w, smoothstep(c[4] * 0.4, c[4] * 0.9, segDist(x, z, c[0], c[1], c[2], c[3])) * 0.6 + 0.4 * w)
    // worn patches inside the base, grassy tufts along its edges
    return Math.min(1, Math.max(0, w + (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 0.7))
  }

  height(x: number, z: number) {
    const L = this.layout
    let mask = smoothstep(4, 34, rectDist(x, z, L.flatArea))
    for (const r of L.roads) mask = Math.min(mask, smoothstep(5, 16, rectDist(x, z, r)))
    const hills = (fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 5) - 0.42) * 26 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 2
    // a raised berm ring makes the horizon read as a valley the base sits in; roads cut through it
    let h = (Math.max(-1, hills) + smoothstep(60, 130, rectDist(x, z, L.flatArea)) * 9) * mask
    for (const c of L.channels) {
      const d = segDist(x, z, c[0], c[1], c[2], c[3])
      const t = 1 - smoothstep(c[4] * 0.35, c[4], d)
      h = h * (1 - t) - c[5] * t
    }
    return h
  }

  /** Render geometry with splat + macro tint attributes. */
  buildGeometry() {
    const g = new PlaneGeometry(this.size, this.size, this.segments, this.segments)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as BufferAttribute
    const uv = g.attributes.uv as BufferAttribute
    const splat = new Float32Array(pos.count)
    const color = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const y = this.height(x, z)
      pos.setY(i, y)
      uv.setXY(i, x / 7, z / 7)
      splat[i] = 1 - this.wildness(x, z)
      const k = 0.78 + fbm(x * 0.02 + 9, z * 0.02 - 4, 3) * 0.4 - Math.max(0, -y) * 0.05
      color[i * 3] = k
      color[i * 3 + 1] = k * (0.98 + fbm(x * 0.03, z * 0.03, 2) * 0.04)
      color[i * 3 + 2] = k * 0.97
    }
    g.setAttribute('splat', new BufferAttribute(splat, 1))
    g.setAttribute('color', new BufferAttribute(color, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }

  /** Heights for Rapier's heightfield: (segments+1)² samples, column-major, rows along Z and columns along X. */
  heightfield() {
    const n = this.segments + 1
    const heights = new Float32Array(n * n)
    for (let col = 0; col < n; col++) {
      for (let row = 0; row < n; row++) {
        const x = -this.size / 2 + (col / this.segments) * this.size
        const z = -this.size / 2 + (row / this.segments) * this.size
        heights[row + col * n] = this.height(x, z)
      }
    }
    return heights
  }
}
