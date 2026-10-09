import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Procedural PBR texture sets (albedo / normal / roughness / AO) generated on a canvas at load time.
 * Every pattern is tileable. Swap any set for authored (KTX2-compressed) textures later — callers only see `PbrSet`.
 */
export interface PbrSet {
  map: Texture
  normalMap: Texture
  roughnessMap: Texture
  aoMap: Texture
}

type RGB = [number, number, number]

// ---- tileable value noise ------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function lattice(period: number, seed: number) {
  const r = rng(seed)
  const g = new Float32Array(period * period)
  for (let i = 0; i < g.length; i++) g[i] = r()
  return g
}

const fade = (t: number) => t * t * (3 - 2 * t)

/** Tileable fBm in [0,1]. u,v in [0,1). */
class Noise {
  private readonly grids: Float32Array[] = []
  constructor(private readonly base: number, private readonly octaves: number, seed: number) {
    for (let o = 0; o < octaves; o++) this.grids.push(lattice(base << o, seed + o * 101))
  }
  at(u: number, v: number) {
    let sum = 0, amp = 0.5, norm = 0
    for (let o = 0; o < this.octaves; o++) {
      const p = this.base << o
      const g = this.grids[o]
      const x = u * p, y = v * p
      const xi = Math.floor(x), yi = Math.floor(y)
      const xf = fade(x - xi), yf = fade(y - yi)
      const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p
      const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p
      const a = g[y0 * p + x0], b = g[y0 * p + x1], c = g[y1 * p + x0], d = g[y1 * p + x1]
      sum += amp * (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf)
      norm += amp
      amp *= 0.5
    }
    return sum / norm
  }
}

// ---- generator ---------------------------------------------------------------------------------

interface Sample {
  /** Linear-ish albedo 0..255. */
  color: RGB
  /** Height 0..1 for normal + AO derivation. */
  height: number
  roughness: number
}

type Pattern = (u: number, v: number) => Sample

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function canvas(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function toTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  return t
}

function generate(pattern: Pattern, size: number, normalStrength: number): PbrSet {
  const n = size * size
  const heights = new Float32Array(n)
  const albedo = canvas(size), rough = canvas(size), normal = canvas(size), ao = canvas(size)
  const aImg = albedo.getContext('2d')!.createImageData(size, size)
  const rImg = rough.getContext('2d')!.createImageData(size, size)
  const nImg = normal.getContext('2d')!.createImageData(size, size)
  const oImg = ao.getContext('2d')!.createImageData(size, size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const s = pattern(x / size, y / size)
      heights[i] = s.height
      aImg.data[i * 4] = s.color[0]
      aImg.data[i * 4 + 1] = s.color[1]
      aImg.data[i * 4 + 2] = s.color[2]
      aImg.data[i * 4 + 3] = 255
      const r = Math.max(0, Math.min(255, s.roughness * 255))
      rImg.data[i * 4] = rImg.data[i * 4 + 1] = rImg.data[i * 4 + 2] = r
      rImg.data[i * 4 + 3] = 255
    }
  }
  // normals (Sobel) and cavity AO from the height field, wrapping at edges so it stays tileable
  const h = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1))
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1))
      let nx = -dx * normalStrength, ny = dy * normalStrength
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len; ny /= len
      nImg.data[i * 4] = (nx * 0.5 + 0.5) * 255
      nImg.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255
      nImg.data[i * 4 + 2] = (nz / len * 0.5 + 0.5) * 255
      nImg.data[i * 4 + 3] = 255
      const avg = (h(x - 2, y) + h(x + 2, y) + h(x, y - 2) + h(x, y + 2)) / 4
      const cavity = Math.min(1, Math.max(0, 1 - (avg - heights[i]) * 4))
      oImg.data[i * 4] = oImg.data[i * 4 + 1] = oImg.data[i * 4 + 2] = cavity * 255
      oImg.data[i * 4 + 3] = 255
    }
  }
  albedo.getContext('2d')!.putImageData(aImg, 0, 0)
  rough.getContext('2d')!.putImageData(rImg, 0, 0)
  normal.getContext('2d')!.putImageData(nImg, 0, 0)
  ao.getContext('2d')!.putImageData(oImg, 0, 0)
  return { map: toTexture(albedo, true), roughnessMap: toTexture(rough, false), normalMap: toTexture(normal, false), aoMap: toTexture(ao, false) }
}

// ---- patterns ----------------------------------------------------------------------------------

function concrete(seed: number, tint: RGB, seams: boolean, pitRate = 0.82): Pattern {
  const blotch = new Noise(4, 5, seed), grain = new Noise(64, 2, seed + 7), pits = new Noise(128, 1, seed + 9)
  const streak = new Noise(16, 3, seed + 13)
  return (u, v) => {
    const b = blotch.at(u, v), g = grain.at(u, v), p = pits.at(u, v)
    const streaks = streak.at(u * 0.25, v * 4) // vertical rain streaks
    let k = 0.8 + b * 0.3 + (g - 0.5) * 0.12 - Math.max(0, streaks - 0.6) * 0.5
    let height = 0.5 + (g - 0.5) * 0.3
    if (p > pitRate) { k *= 0.85; height -= 0.25 } // air pockets
    if (seams && (Math.abs(v - 0.5) < 0.004 || v < 0.004)) { k *= 0.65; height -= 0.4 } // formwork joints
    return { color: shade(tint, k), height, roughness: 0.82 + g * 0.15 - b * 0.08 }
  }
}

function asphalt(seed: number): Pattern {
  const big = new Noise(4, 4, seed), grain = new Noise(128, 2, seed + 3), crack = new Noise(8, 4, seed + 5)
  return (u, v) => {
    const g = grain.at(u, v), b = big.at(u, v)
    const c = Math.abs(crack.at(u, v) - 0.5)
    const isCrack = c < 0.008
    let k = 0.55 + b * 0.25 + (g - 0.5) * 0.4
    if (g > 0.78) k += 0.35 // light aggregate stones
    if (isCrack) k *= 0.4
    return { color: shade([62, 62, 60], k), height: isCrack ? 0.1 : 0.5 + (g - 0.5) * 0.5, roughness: 0.88 + (1 - b) * 0.1 }
  }
}

function dirtGrass(seed: number, grassAmount: number): Pattern {
  const patch = new Noise(3, 5, seed), detail = new Noise(64, 3, seed + 2), blades = new Noise(96, 1, seed + 4), pebble = new Noise(80, 1, seed + 6)
  const dirt: RGB = [92, 78, 58], dryGrass: RGB = [104, 98, 62], greenGrass: RGB = [66, 78, 42]
  return (u, v) => {
    const p = patch.at(u, v), d = detail.at(u, v)
    const grassMask = smooth(0.5 - grassAmount * 0.5, 0.62 - grassAmount * 0.5, p + (d - 0.5) * 0.25)
    const bl = grassAmount < 0.2 ? 0.5 : blades.at(u * 1.6, v * 0.6)
    const grass = mixRGB(greenGrass, dryGrass, smooth(0.35, 0.75, detail.at(v, u)))
    let color = mixRGB(shade(dirt, 0.75 + d * 0.45), shade(grass, 0.7 + bl * 0.55), grassMask)
    let height = 0.4 + d * 0.2 + grassMask * bl * 0.4
    const pb = pebble.at(u, v)
    if (pb > (grassAmount < 0.2 ? 0.7 : 0.8) && grassMask < 0.5) { color = shade([118, 112, 100], 0.8 + pb * 0.3); height += 0.3 }
    return { color, height, roughness: 0.92 + d * 0.08 }
  }
}

function paintedMetal(seed: number, wear: number): Pattern {
  const blotch = new Noise(4, 4, seed), scratch = new Noise(32, 3, seed + 1), rust = new Noise(6, 5, seed + 2)
  return (u, v) => {
    const b = blotch.at(u, v), s = scratch.at(u * 3, v * 0.3)
    const r = rust.at(u, v)
    const rusty = smooth(0.72 - wear * 0.2, 0.8 - wear * 0.2, r)
    const scratched = Math.abs(s - 0.5) < 0.006 * (1 + wear * 3)
    // grayscale base so vertex colour tints the paint; rust/scratches tint towards brown/steel
    let color: RGB = shade([218, 218, 212], 0.82 + b * 0.18)
    let rough = 0.55 + b * 0.15
    if (scratched) { color = [180, 180, 178]; rough = 0.35 }
    color = mixRGB(color, shade([128, 96, 72], 0.75 + r * 0.3), rusty * 0.85)
    rough = mix(rough, 0.9, rusty)
    return { color, height: 0.5 - rusty * 0.15 + (scratched ? -0.1 : 0), roughness: rough }
  }
}

function corrugated(seed: number, ridges: number, vertical: boolean, wear: number): Pattern {
  const base = paintedMetal(seed, wear)
  return (u, v) => {
    const s = base(u, v)
    const t = vertical ? u : v
    const ridge = Math.sin(t * ridges * Math.PI * 2) * 0.5 + 0.5
    return { ...s, color: shade(s.color, 0.9 + ridge * 0.12), height: ridge * 0.9 + s.height * 0.1 }
  }
}

function rust(seed: number): Pattern {
  const a = new Noise(6, 5, seed), b = new Noise(48, 3, seed + 1)
  return (u, v) => {
    const x = a.at(u, v), y = b.at(u, v)
    const color = mixRGB([96, 52, 30], [158, 92, 52], x * 0.7 + y * 0.3)
    return { color: shade(color, 0.85 + y * 0.3), height: x * 0.5 + y * 0.5, roughness: 0.85 + y * 0.15 }
  }
}

function woodPlanks(seed: number, planks: number): Pattern {
  const grain = new Noise(8, 4, seed), fine = new Noise(64, 2, seed + 3), knots = new Noise(12, 2, seed + 4)
  return (u, v) => {
    const plank = Math.floor(v * planks)
    const local = v * planks - plank
    const g = grain.at(u * 0.5 + plank * 0.37, local * 0.15 + plank * 0.21)
    const lines = Math.sin((u * 30 + g * 8) * Math.PI) * 0.5 + 0.5
    const seam = local < 0.04 || local > 0.96
    const k = 0.72 + lines * 0.12 + (fine.at(u, v) - 0.5) * 0.15 + ((plank * 7919) % 5) * 0.03
    let color = shade([150, 118, 78], k)
    if (knots.at(u, v) > 0.85) color = shade(color, 0.7)
    if (seam) color = shade(color, 0.45)
    return { color, height: seam ? 0.1 : 0.5 + lines * 0.15, roughness: 0.8 + fine.at(v, u) * 0.15 }
  }
}

function blocks(seed: number, rows: number, cols: number, tint: RGB): Pattern {
  const blotch = new Noise(4, 4, seed), grain = new Noise(64, 2, seed + 1)
  return (u, v) => {
    const row = Math.floor(v * rows)
    const off = row % 2 ? 0.5 / cols : 0
    const cu = ((u + off) * cols) % 1, cv = (v * rows) % 1
    const mortar = cu < 0.03 || cv < 0.05
    const g = grain.at(u, v), b = blotch.at(u, v)
    const k = mortar ? 0.6 : 0.82 + b * 0.25 + (g - 0.5) * 0.15 + (((row * 31 + Math.floor((u + off) * cols) * 17) % 7) - 3) * 0.015
    return { color: shade(tint, k), height: mortar ? 0.15 : 0.5 + g * 0.2, roughness: 0.88 + g * 0.1 }
  }
}

function fabric(seed: number, tint: RGB, lumps: number): Pattern {
  const weave = new Noise(128, 1, seed), lump = new Noise(lumps, 3, seed + 1)
  return (u, v) => {
    const w = (Math.sin(u * 400) * Math.sin(v * 400)) * 0.5 + 0.5
    const l = lump.at(u, v)
    return { color: shade(tint, 0.75 + l * 0.35 + (weave.at(u, v) - 0.5) * 0.1), height: l * 0.8 + w * 0.2, roughness: 0.95 }
  }
}

function chainLink(): Pattern {
  // diamond mesh; alpha is encoded by the caller via the albedo luminance → alphaMap
  return (u, v) => {
    const a = Math.abs(((u + v) * 8) % 1 - 0.5), b = Math.abs(((u - v + 1) * 8) % 1 - 0.5)
    const wire = Math.min(a, b) > 0.43 ? 1 : 0
    return { color: wire ? [175, 178, 176] : [0, 0, 0], height: wire, roughness: 0.4 }
  }
}

function rock(seed: number): Pattern {
  const a = new Noise(4, 6, seed), b = new Noise(32, 3, seed + 1), lichen = new Noise(8, 3, seed + 2)
  return (u, v) => {
    const x = a.at(u, v), y = b.at(u, v)
    let color = shade([112, 106, 96], 0.65 + x * 0.5 + (y - 0.5) * 0.2)
    if (lichen.at(u, v) > 0.7) color = mixRGB(color, [104, 108, 74], 0.5)
    return { color, height: x * 0.7 + y * 0.3, roughness: 0.9 }
  }
}

function camo(seed: number): Pattern {
  // original four-tone woodland-style pattern
  const a = new Noise(4, 4, seed), b = new Noise(6, 4, seed + 1), weave = new Noise(128, 1, seed + 2)
  const tones: RGB[] = [[86, 92, 64], [62, 70, 48], [104, 94, 70], [44, 46, 38]]
  return (u, v) => {
    const x = a.at(u, v), y = b.at(u, v)
    const t = x > 0.6 ? 1 : y > 0.62 ? 2 : x < 0.38 && y < 0.45 ? 3 : 0
    return { color: shade(tones[t], 0.9 + (weave.at(u, v) - 0.5) * 0.2), height: weave.at(u, v), roughness: 0.92 }
  }
}

// ---- library -----------------------------------------------------------------------------------

const RECIPES = {
  concrete: () => generate(concrete(11, [176, 174, 166], true, 0.93), 512, 0.88),
  concreteDark: () => generate(concrete(17, [130, 128, 122], false, 0.93), 512, 0.88),
  plaster: () => generate(concrete(23, [228, 226, 218], false, 0.95), 512, 0.45),
  asphalt: () => generate(asphalt(31), 512, 1),
  ground: () => generate(dirtGrass(41, 0.7), 512, 0.88),
  dirt: () => generate(dirtGrass(43, 0.1), 512, 1),
  paintedMetal: () => generate(paintedMetal(51, 0.3), 512, 0.48),
  metal: () => generate(paintedMetal(53, 0.6), 256, 0.48),
  corrugated: () => generate(corrugated(61, 10, true, 0.5), 512, 2.4),
  container: () => generate(corrugated(63, 8, true, 0.35), 512, 2),
  roof: () => generate(corrugated(65, 8, false, 0.4), 512, 2),
  rust: () => generate(rust(71), 256, 1.2),
  wood: () => generate(woodPlanks(81, 5), 512, 0.8),
  blocks: () => generate(blocks(91, 8, 4, [168, 164, 152]), 512, 1),
  sandbag: () => generate(fabric(101, [140, 126, 92], 3), 256, 1.2),
  canvas: () => generate(fabric(103, [96, 98, 70], 6), 256, 0.6),
  fence: () => generate(chainLink(), 256, 0.4),
  rock: () => generate(rock(111), 512, 1.2),
  camo: () => generate(camo(121), 256, 0.32),
}

export type TextureKey = keyof typeof RECIPES
const cache = new Map<TextureKey, PbrSet>()

export function getTextures(key: TextureKey): PbrSet {
  let set = cache.get(key)
  if (!set) cache.set(key, (set = RECIPES[key]()))
  return set
}
