import { fbm, type Terrain } from './terrain'
import type { BoxDef, LevelLayout } from './types'

export interface Plant {
  x: number
  y: number
  z: number
  scale: number
  rot: number
}

export interface Vegetation {
  /** Trees and bushes bucketed into spatial chunks so each instanced mesh can be frustum/shadow culled. */
  trees: Plant[][]
  bushes: Plant[][]
  /** Grass clumps bucketed into square chunks for distance culling. */
  grass: { cx: number; cz: number; plants: Plant[] }[]
  /** Trunk colliders + bush vision-blockers. */
  colliders: BoxDef[]
}

const GRASS_CHUNK = 24

function rand(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const rectDist = (x: number, z: number, r: readonly number[]) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]))

/** Deterministic scatter of trees, bushes and grass over the wild part of the terrain. */
export function generateVegetation(layout: LevelLayout, terrain: Terrain): Vegetation {
  const r = rand(1234)
  const nearRoad = (x: number, z: number, m: number) => layout.roads.some((rd) => rectDist(x, z, rd) < m)
  const trees: Plant[] = []
  const bushes: Plant[] = []
  const colliders: BoxDef[] = []

  // trees: jittered grid, kept to forest-noise patches outside the base and off the roads
  for (let gx = -190; gx < 190; gx += 7.5) {
    for (let gz = -190; gz < 190; gz += 7.5) {
      const x = gx + (r() - 0.5) * 6, z = gz + (r() - 0.5) * 6
      const d = rectDist(x, z, layout.flatArea)
      if (d < 10 || nearRoad(x, z, 9)) continue
      const forest = fbm(x * 0.018 + 40, z * 0.018 - 12, 3) + Math.min(0.25, d / 300)
      if (forest < 0.56) continue
      const y = terrain.height(x, z)
      if (y < -0.6) continue // ditch bed
      const scale = 0.75 + r() * 0.65
      trees.push({ x, y, z, scale, rot: r() * Math.PI * 2 })
      colliders.push({ p: [x, y + 3, z], s: [0.45 * scale, 6, 0.45 * scale], mat: 'invisible', shape: 'cyl' })
    }
  }

  // bushes: the hand-placed ones from the layout plus a light scatter
  for (const b of layout.boxes) {
    if (b.mat !== 'foliage') continue
    bushes.push({ x: b.p[0], y: terrain.height(b.p[0], b.p[2]), z: b.p[2], scale: b.s[0] / 1.6, rot: r() * 6 })
  }
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * 340, z = (r() - 0.5) * 340
    if (rectDist(x, z, layout.flatArea) < 4 || nearRoad(x, z, 5)) continue
    const s = 0.8 + r() * 0.9
    const y = terrain.height(x, z)
    bushes.push({ x, y, z, scale: s, rot: r() * 6 })
    colliders.push({ p: [x, y + s * 0.65, z], s: [1.6 * s, 1.3 * s, 1.6 * s], mat: 'foliage', shape: 'cyl' })
  }

  // grass clumps
  const chunks = new Map<string, { cx: number; cz: number; plants: Plant[] }>()
  for (let i = 0; i < 52000; i++) {
    const x = (r() - 0.5) * 300, z = (r() - 0.35) * 300
    const w = terrain.wildness(x, z)
    if (w < 0.45 || r() > w) continue
    if (fbm(x * 0.06, z * 0.06, 2) < 0.38) continue // bare patches
    const kx = Math.floor(x / GRASS_CHUNK), kz = Math.floor(z / GRASS_CHUNK)
    const key = `${kx},${kz}`
    let c = chunks.get(key)
    if (!c) chunks.set(key, (c = { cx: (kx + 0.5) * GRASS_CHUNK, cz: (kz + 0.5) * GRASS_CHUNK, plants: [] }))
    c.plants.push({ x, y: terrain.height(x, z), z, scale: 0.6 + r() * 0.7 * w, rot: r() * Math.PI })
  }

  return { trees: bucket(trees, 60), bushes: bucket(bushes, 60), grass: [...chunks.values()], colliders }
}

function bucket(plants: Plant[], size: number): Plant[][] {
  const m = new Map<string, Plant[]>()
  for (const p of plants) {
    const k = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`
    m.set(k, [...(m.get(k) ?? []), p])
  }
  return [...m.values()]
}
