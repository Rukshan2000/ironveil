import type { BoxDef, InteriorDef, MaterialKey, LadderDef } from './types'

type Side = 'n' | 's' | 'e' | 'w'
type V3 = [number, number, number]

/** Moves/rotates locally-authored parts (yaw only) into the world. */
export function place(parts: BoxDef[], x: number, z: number, yaw = 0, y = 0): BoxDef[] {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return parts.map((b) => ({
    ...b,
    p: [x + b.p[0] * c + b.p[2] * s, y + b.p[1], z - b.p[0] * s + b.p[2] * c],
    yaw: (b.yaw ?? 0) + yaw,
  }))
}

const box = (p: V3, s: V3, mat: MaterialKey, extra: Partial<BoxDef> = {}): BoxDef => ({ p, s, mat, ...extra })
const cyl = (p: V3, d: number, h: number, mat: MaterialKey, extra: Partial<BoxDef> = {}): BoxDef => ({ p, s: [d, h, d], mat, shape: 'cyl', ...extra })

export interface Opening {
  /** Centre along the wall, relative to the wall's centre. */
  at: number
  width: number
  /** Doors: 0 sill. Windows: sill height. */
  sill?: number
  /** Top of the opening. */
  top?: number
  /** Leave the opening empty (no glass) — doorways, broken windows. */
  open?: boolean
}

/**
 * A wall running along X (from→to at z=`at`), or along Z when `alongZ`. Openings become doorways (sill 0) or
 * glazed windows with frames. Returns separate pieces so bullets/vision treat glass correctly.
 */
export function wall(
  from: number, to: number, at: number, height: number, alongZ = false,
  openings: Opening[] = [], mat: MaterialKey = 'concrete', thickness = 0.3, color?: number,
): BoxDef[] {
  const out: BoxDef[] = []
  const lo = Math.min(from, to), hi = Math.max(from, to), mid0 = (lo + hi) / 2
  const seg = (a: number, b: number, y0: number, y1: number, m: MaterialKey = mat, t = thickness, extra: Partial<BoxDef> = {}) => {
    if (b - a < 0.01 || y1 - y0 < 0.01) return
    const mid = (a + b) / 2, len = b - a, h = y1 - y0
    out.push(alongZ
      ? { p: [at, y0 + h / 2, mid], s: [t, h, len], mat: m, color: m === mat ? color : undefined, ...extra }
      : { p: [mid, y0 + h / 2, at], s: [len, h, t], mat: m, color: m === mat ? color : undefined, ...extra })
  }
  let cursor = lo
  for (const o of [...openings].sort((a, b) => a.at - b.at)) {
    const a = mid0 + o.at - o.width / 2, b = mid0 + o.at + o.width / 2
    const sill = o.sill ?? 0, top = Math.min(height, o.top ?? (sill > 0 ? sill + 1.2 : 2.3))
    seg(cursor, a, 0, height)
    seg(a, b, 0, sill)
    seg(a, b, top, height)
    if (sill > 0 && !o.open) {
      seg(a, b, sill, top, 'glass', 0.03, { castShadow: false })
      // frame + mullion
      seg(a, b, sill - 0.05, sill, 'paintedMetal', thickness + 0.06, { color: 0x3a3c36, collide: false })
      seg(a, b, top, top + 0.05, 'paintedMetal', thickness + 0.06, { color: 0x3a3c36, collide: false })
      seg((a + b) / 2 - 0.03, (a + b) / 2 + 0.03, sill, top, 'paintedMetal', thickness * 0.5, { color: 0x3a3c36, collide: false })
    }
    cursor = b
  }
  seg(cursor, hi, 0, height)
  return out
}

export interface BuildingOpts {
  doors?: Partial<Record<Side, number[]>>
  windows?: Partial<Record<Side, number[]>>
  mat?: MaterialKey
  roofMat?: MaterialKey
  color?: number
  doorWidth?: number
  doorHeight?: number
  floor?: MaterialKey
  /** Flat concrete roof with parapet instead of a metal sheet roof. */
  parapet?: boolean
}

/** Hollow building with doorways, glazed windows, plinth, roof and (returned) interior volume. */
export function building(cx: number, cz: number, w: number, d: number, h: number, o: BuildingOpts = {}): { boxes: BoxDef[]; interior: InteriorDef } {
  const mat = o.mat ?? 'plaster'
  const t = 0.3
  const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - d / 2, z2 = cz + d / 2
  const dw = o.doorWidth ?? 1.4, dh = o.doorHeight ?? 2.3
  const openings = (side: Side): Opening[] => [
    ...(o.doors?.[side] ?? []).map((at) => ({ at, width: dw, top: dh, open: true })),
    ...(o.windows?.[side] ?? []).map((at) => ({ at, width: 1.6, sill: 1.0, top: Math.min(h - 0.5, 2.2) })),
  ]
  const boxes: BoxDef[] = [
    ...wall(x1, x2, z1 + t / 2, h, false, openings('n'), mat, t, o.color),
    ...wall(x1, x2, z2 - t / 2, h, false, openings('s'), mat, t, o.color),
    ...wall(z1 + t, z2 - t, x1 + t / 2, h, true, openings('w'), mat, t, o.color),
    ...wall(z1 + t, z2 - t, x2 - t / 2, h, true, openings('e'), mat, t, o.color),
    // floor slab + plinth so the building sits on the ground instead of floating
    box([cx, 0.03, cz], [w - 0.1, 0.06, d - 0.1], o.floor ?? 'concreteDark', { collide: false, castShadow: false }),
    box([cx, 0.15, z1 - 0.06], [w + 0.12, 0.3, 0.12], 'concreteDark', { collide: false }),
    box([cx, 0.15, z2 + 0.06], [w + 0.12, 0.3, 0.12], 'concreteDark', { collide: false }),
    box([x1 - 0.06, 0.15, cz], [0.12, 0.3, d + 0.24], 'concreteDark', { collide: false }),
    box([x2 + 0.06, 0.15, cz], [0.12, 0.3, d + 0.24], 'concreteDark', { collide: false }),
  ]
  if (o.parapet) {
    boxes.push(box([cx, h + 0.1, cz], [w, 0.2, d], 'concreteDark'))
    boxes.push(...wall(x1, x2, z1 + 0.1, 0.9, false, [], mat, 0.2, o.color).map(raise(h)))
    boxes.push(...wall(x1, x2, z2 - 0.1, 0.9, false, [], mat, 0.2, o.color).map(raise(h)))
    boxes.push(...wall(z1, z2, x1 + 0.1, 0.9, true, [], mat, 0.2, o.color).map(raise(h)))
    boxes.push(...wall(z1, z2, x2 - 0.1, 0.9, true, [], mat, 0.2, o.color).map(raise(h)))
  } else {
    boxes.push(box([cx, h + 0.1, cz], [w + 0.8, 0.2, d + 0.8], o.roofMat ?? 'roof'))
  }
  // downpipes at the corners
  for (const [px, pz] of [[x1 - 0.1, z1 - 0.1], [x2 + 0.1, z2 + 0.1]]) boxes.push(cyl([px, h / 2, pz], 0.1, h, 'metal', { collide: false, color: 0x5a5c58 }))
  return { boxes, interior: { min: [x1 + t, -0.5, z1 + t], max: [x2 - t, h + 0.15, z2 - t] } }
}

const raise = (by: number) => (b: BoxDef): BoxDef => ({ ...b, p: [b.p[0], b.p[1] + by, b.p[2]] })

/** Hollow corrugated hangar: tall sheet walls on a concrete base course, big door gap and pitched-look roof. */
export function hangar(cx: number, cz: number, w: number, d: number, h: number, doors: Partial<Record<Side, [at: number, width: number, height: number][]>>, color = 0x7d8276) {
  const t = 0.25
  const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - d / 2, z2 = cz + d / 2
  const ops = (s: Side): Opening[] => (doors[s] ?? []).map(([at, width, top]) => ({ at, width, top, open: true }))
  const sides: BoxDef[] = [
    ...wall(x1, x2, z1 + t / 2, h, false, ops('n'), 'corrugated', t, color),
    ...wall(x1, x2, z2 - t / 2, h, false, ops('s'), 'corrugated', t, color),
    ...wall(z1 + t, z2 - t, x1 + t / 2, h, true, ops('w'), 'corrugated', t, color),
    ...wall(z1 + t, z2 - t, x2 - t / 2, h, true, ops('e'), 'corrugated', t, color),
  ]
  // concrete base course over the bottom metre of the sheet walls (outside face)
  const base: BoxDef[] = sides.filter((b) => b.p[1] - b.s[1] / 2 < 0.05).map((b) => ({ ...b, p: [b.p[0], 0.55, b.p[2]], s: [b.s[0] + (b.s[0] < 1 ? 0.12 : 0.02), 1.1, b.s[2] + (b.s[2] < 1 ? 0.12 : 0.02)], mat: 'concrete' as MaterialKey, color: undefined, collide: false }))
  const roof: BoxDef[] = [
    box([cx, h + 0.15, cz], [w + 1, 0.3, d + 1], 'roof', { color: 0x5f625c }),
    box([cx, h + 0.55, cz], [w + 1, 0.5, 0.6], 'roof', { color: 0x5f625c }), // ridge
  ]
  // interior steel frames
  const frames: BoxDef[] = []
  for (let x = x1 + 4; x < x2 - 1; x += 5) {
    frames.push(box([x, h - 0.3, cz], [0.25, 0.4, d - 0.6], 'paintedMetal', { color: 0x4a4e48, collide: false }))
  }
  return {
    boxes: [...sides, ...base, ...roof, ...frames, box([cx, 0.03, cz], [w - 0.1, 0.06, d - 0.1], 'concreteDark', { collide: false, castShadow: false })],
    interior: { min: [x1 + t, -0.5, z1 + t], max: [x2 - t, h + 0.15, z2 - t] } as InteriorDef,
  }
}

/** Chain-link fence with concrete posts, top rail and outward barbed-wire arms. Blocks movement and bullets? no — bullets and sight pass. */
export function fence(x1: number, z1: number, x2: number, z2: number, height = 2.6, wire = true): BoxDef[] {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const yaw = Math.atan2(-(z2 - z1), x2 - x1)
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2
  const out: BoxDef[] = [
    { p: [cx, height / 2, cz], s: [len, height, 0.04], mat: 'fence', yaw, castShadow: true },
    { p: [cx, height, cz], s: [0.06, len, 0.06], mat: 'metal', shape: 'cyl', yaw, rz: Math.PI / 2, collide: false, color: 0x8a8c88 },
  ]
  if (wire) {
    for (let k = 0; k < 3; k++) {
      out.push({ p: [cx, height + 0.15 + k * 0.17, cz], s: [len, 0.012, 0.012], mat: 'rust', yaw, collide: false, castShadow: false })
    }
  }
  const posts = Math.max(1, Math.round(len / 3))
  for (let i = 0; i <= posts; i++) {
    const t = i / posts
    out.push({ p: [x1 + (x2 - x1) * t, (height + 0.6) / 2, z1 + (z2 - z1) * t], s: [0.14, height + 0.6, 0.14], mat: 'concrete', yaw, collide: false })
  }
  return out
}

/** Lattice watchtower with platform, rails, roof and a ladder. */
export function tower(x: number, z: number, height = 6, yaw = 0): BoxDef[] {
  const parts: BoxDef[] = []
  const L = 1.5
  for (const [dx, dz] of [[-L, -L], [L, -L], [-L, L], [L, L]] as const) {
    parts.push(box([dx, height / 2, dz], [0.22, height, 0.22], 'paintedMetal', { color: 0x4e5244 }))
  }
  // cross braces on each face
  const brace = Math.atan2(height / 2, 2 * L)
  for (let k = 0; k < 2; k++) {
    const y = height * (0.25 + k * 0.5)
    const len = Math.hypot(2 * L, height / 2)
    parts.push(box([0, y, -L], [len, 0.08, 0.08], 'metal', { rz: k % 2 ? brace : -brace, collide: false }))
    parts.push(box([0, y, L], [len, 0.08, 0.08], 'metal', { rz: k % 2 ? -brace : brace, collide: false }))
    parts.push(box([-L, y, 0], [0.08, 0.08, len], 'metal', { rx: k % 2 ? brace : -brace, collide: false }))
    parts.push(box([L, y, 0], [0.08, 0.08, len], 'metal', { rx: k % 2 ? -brace : brace, collide: false }))
  }
  parts.push(
    box([0, height, 0], [3.6, 0.25, 3.6], 'wood'),
    box([0, height + 0.6, -1.75], [3.6, 1.0, 0.08], 'paintedMetal', { color: 0x4e5244 }),
    box([0, height + 0.6, 1.75], [3.6, 1.0, 0.08], 'paintedMetal', { color: 0x4e5244 }),
    box([-1.75, height + 0.6, 0], [0.08, 1.0, 3.6], 'paintedMetal', { color: 0x4e5244 }),
    box([1.75, height + 0.6, 0.6], [0.08, 1.0, 2.4], 'paintedMetal', { color: 0x4e5244 }),
    box([0, height + 2.7, 0], [4.2, 0.15, 4.2], 'roof', { collide: false }),
    // sandbags inside the parapet
    box([0, height + 0.35, -1.5], [3.0, 0.45, 0.4], 'sandbag', { collide: false }),
    // ladder
    box([2.2, height / 2, -0.25], [0.06, height + 0.8, 0.06], 'metal', { collide: false }),
    box([2.2, height / 2, 0.25], [0.06, height + 0.8, 0.06], 'metal', { collide: false }),
  )
  for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]] as const) {
    parts.push(box([dx, height + 1.65, dz], [0.1, 2.1, 0.1], 'metal', { collide: false }))
  }
  for (let y = 0.4; y < height; y += 0.4) parts.push(box([2.2, y, 0], [0.04, 0.04, 0.5], 'metal', { collide: false, castShadow: false }))
  return place(parts, x, z, yaw)
}

/** The climbable ladder of a `tower(x, z, height, yaw)`: foot of the ladder outside, step-off onto the platform. */
export function towerLadder(x: number, z: number, height: number, yaw = 0): LadderDef {
  const at = (lx: number, y: number): [number, number, number] => [x + lx * Math.cos(yaw), y, z - lx * Math.sin(yaw)]
  return { bottom: at(2.75, 0), top: at(0.9, height + 0.13) }
}

/** Straight staircase rising along local -Z from (x, z). Each step is climbable by the character controller's autostep. */
export function stairs(x: number, z: number, yaw: number, width: number, rise: number, run: number, mat: MaterialKey = 'paintedMetal'): BoxDef[] {
  const steps = Math.ceil(rise / 0.25)
  const sh = rise / steps, sd = run / steps
  const parts: BoxDef[] = []
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * sh
    parts.push(box([0, top - 0.05, -(i + 0.5) * sd], [width, 0.1, sd + 0.02], mat, { color: 0x4a4e48, collide: false }))
  }
  const ang = Math.atan2(rise, run), len = Math.hypot(rise, run)
  // walk surface: one smooth ramp through the step noses (character controllers climb ramps far more reliably than steps)
  parts.push(box([0, rise / 2 - 0.02, -run / 2], [width, 0.06, len + 0.1], 'invisible', { rx: ang }))
  for (const sx of [-width / 2, width / 2]) {
    parts.push(box([sx, rise / 2, -run / 2], [0.08, 0.3, len], 'paintedMetal', { rx: ang, collide: false, color: 0x3d403a }))
    parts.push(box([sx, rise / 2 + 1, -run / 2], [0.04, 0.04, len], 'metal', { rx: ang, collide: false }))
    parts.push(box([sx, rise + 0.5, -run], [0.05, 1, 0.05], 'metal', { collide: false }))
  }
  return place(parts, x, z, yaw)
}

export function crateStack(x: number, z: number, count: number, size = 1.2, yaw = 0): BoxDef[] {
  const out: BoxDef[] = []
  for (let i = 0; i < count; i++) {
    const p: V3 = [x + (i % 2) * 0.05, size / 2 + i * size, z]
    out.push({ p, s: [size, size, size], mat: 'crate', yaw: yaw + i * 0.15 })
    // dark steel corner bands
    out.push({ p, s: [size + 0.02, 0.08, size + 0.02], mat: 'metal', yaw: yaw + i * 0.15, collide: false, color: 0x2e302c })
  }
  return out
}

export function container(x: number, z: number, yaw: number, color: number, stacked = 0): BoxDef[] {
  const y = stacked * 2.6
  return place([
    box([0, 1.3, 0], [6.06, 2.6, 2.44], 'container', { color }),
    // door end: locking bars + frame
    box([3.04, 1.3, 0], [0.04, 2.5, 2.3], 'paintedMetal', { color, collide: false }),
    box([3.07, 1.3, -0.5], [0.04, 2.4, 0.05], 'metal', { collide: false }),
    box([3.07, 1.3, 0.5], [0.04, 2.4, 0.05], 'metal', { collide: false }),
    // corner castings
    box([0, 0.06, 0], [6.1, 0.12, 2.48], 'metal', { collide: false, color: 0x2a2a28 }),
    box([0, 2.54, 0], [6.1, 0.12, 2.48], 'metal', { collide: false, color: 0x2a2a28 }),
  ], x, z, yaw, y)
}

export function barrel(x: number, z: number, color = 0x45502e, tipped = false): BoxDef[] {
  if (tipped) return [cyl([x, 0.3, z], 0.6, 0.9, 'paintedMetal', { color, rz: Math.PI / 2, yaw: x })]
  return [
    cyl([x, 0.45, z], 0.6, 0.9, 'paintedMetal', { color }),
    cyl([x, 0.3, z], 0.62, 0.04, 'metal', { color, collide: false }),
    cyl([x, 0.62, z], 0.62, 0.04, 'metal', { color, collide: false }),
  ]
}

export function barrelGroup(x: number, z: number, n: number, color?: number): BoxDef[] {
  const out: BoxDef[] = []
  for (let i = 0; i < n; i++) out.push(...barrel(x + (i % 3) * 0.66, z + Math.floor(i / 3) * 0.66, color))
  return out
}

/** Concrete jersey barrier. */
export function jersey(x: number, z: number, yaw = 0): BoxDef[] {
  return place([
    box([0, 0.2, 0], [3, 0.4, 0.6], 'concrete'),
    box([0, 0.6, 0], [3, 0.5, 0.32], 'concrete'),
    box([0, 0.86, 0], [3, 0.08, 0.2], 'concrete', { collide: false }),
  ], x, z, yaw)
}

/** Curved-look sandbag wall: staggered layers of bags. */
export function sandbags(x: number, z: number, yaw: number, length: number, layers = 3): BoxDef[] {
  const parts: BoxDef[] = []
  const bag = 0.6
  for (let l = 0; l < layers; l++) {
    const n = Math.floor(length / bag) - (l % 2)
    for (let i = 0; i < n; i++) {
      const lx = -length / 2 + bag / 2 + i * bag + (l % 2) * bag / 2
      parts.push(box([lx, 0.13 + l * 0.24, 0], [bag - 0.03, 0.26, 0.42 - l * 0.03], 'sandbag', { collide: false, yaw: ((i * 7 + l * 3) % 5 - 2) * 0.03 }))
    }
  }
  parts.push(box([0, (layers * 0.24) / 2, 0], [length, layers * 0.24 + 0.05, 0.42], 'invisible'))
  return place(parts, x, z, yaw)
}

/** Horizontal fuel tank on concrete saddles. */
export function fuelTank(x: number, z: number, yaw: number, length = 6, diameter = 2.2, color = 0x9a9a8e): BoxDef[] {
  return place([
    cyl([0, diameter / 2 + 0.5, 0], diameter, length, 'paintedMetal', { color, rz: Math.PI / 2 }),
    box([-length / 3, 0.4, 0], [0.5, 0.8, diameter * 0.8], 'concrete'),
    box([length / 3, 0.4, 0], [0.5, 0.8, diameter * 0.8], 'concrete'),
    box([0, diameter + 0.55, 0], [0.5, 0.2, 0.5], 'metal', { collide: false }),
    cyl([length / 2 + 0.2, 0.9, 0.6], 0.1, 1.6, 'metal', { collide: false }),
  ], x, z, yaw)
}

/** Static military truck (decor + cover). Front faces local -Z. */
export function truck(x: number, z: number, yaw: number, color = 0x4c5434, covered = true): BoxDef[] {
  const parts: BoxDef[] = [
    box([0, 0.75, 0], [1.2, 0.25, 7.2], 'metal', { color: 0x262824 }), // frame
    box([0, 1.55, -2.7], [2.3, 1.5, 1.8], 'paintedMetal', { color }), // cab
    box([0, 1.95, -3.62], [2.0, 0.7, 0.04], 'glass', { castShadow: false }), // windscreen
    box([0, 1.05, -3.75], [2.2, 0.6, 0.3], 'paintedMetal', { color }), // bumper/grille
    box([0, 1.15, 1.0], [2.4, 0.7, 4.6], 'paintedMetal', { color }), // bed
    box([0, 1.0, -0.25], [2.3, 0.6, 0.5], 'invisible'), // closes gap between cab and bed for collision
  ]
  if (covered) parts.push(box([0, 2.45, 1.0], [2.45, 1.9, 4.5], 'canvas'))
  for (const wz of [-2.6, 0.6, 2.2]) {
    for (const wx of [-1.05, 1.05]) {
      parts.push(cyl([wx, 0.55, wz], 1.1, 0.42, 'rubber', { rz: Math.PI / 2 }))
      parts.push(cyl([wx * 1.02, 0.55, wz], 0.55, 0.44, 'metal', { rz: Math.PI / 2, collide: false, color: 0x3a3c30 }))
    }
  }
  return place(parts.map((p) => ({ ...p, hidden: true })), x, z, yaw) // drawn by the 'truck' prop model
}

/** Forklift collision (drawn by the 'forklift' prop model). */
export function forklift(x: number, z: number, yaw: number): BoxDef[] {
  return place(([
    box([0, 0.75, 0.2], [1.1, 0.9, 1.8], 'paintedMetal', { color: 0xa08a2a }),
    box([0, 1.9, 0.1], [1.0, 0.08, 1.2], 'metal', { collide: false }),
    box([-0.48, 1.4, -0.5], [0.06, 1.1, 0.06], 'metal', { collide: false }),
    box([0.48, 1.4, -0.5], [0.06, 1.1, 0.06], 'metal', { collide: false }),
    box([0, 1.2, -0.95], [0.9, 2.2, 0.1], 'metal', { color: 0x2a2a28 }),
    box([-0.3, 0.08, -1.5], [0.12, 0.06, 1.1], 'metal', { collide: false }),
    box([0.3, 0.08, -1.5], [0.12, 0.06, 1.1], 'metal', { collide: false }),
    cyl([-0.55, 0.3, -0.5], 0.6, 0.25, 'rubber', { rz: Math.PI / 2, collide: false }),
    cyl([0.55, 0.3, -0.5], 0.6, 0.25, 'rubber', { rz: Math.PI / 2, collide: false }),
    cyl([-0.5, 0.25, 0.8], 0.5, 0.22, 'rubber', { rz: Math.PI / 2, collide: false }),
    cyl([0.5, 0.25, 0.8], 0.5, 0.22, 'rubber', { rz: Math.PI / 2, collide: false }),
  ] as BoxDef[]).map((p) => ({ ...p, hidden: true })), x, z, yaw)
}

export function pallet(x: number, z: number, yaw = 0, stack = 1): BoxDef[] {
  const out: BoxDef[] = []
  for (let i = 0; i < stack; i++) out.push(box([x, 0.07 + i * 0.15, z], [1.2, 0.14, 1.0], 'wood', { yaw, collide: i === stack - 1 }))
  return out
}

/** Wall/pole-mounted electrical cabinet with conduit to the ground. */
export function electricalBox(x: number, z: number, yaw: number): BoxDef[] {
  return place([
    box([0, 1.3, 0], [0.8, 1.1, 0.35], 'paintedMetal', { color: 0x6f7462 }),
    box([0, 1.3, -0.18], [0.74, 1.04, 0.02], 'metal', { collide: false, color: 0x5a5e50 }),
    box([0.25, 1.3, -0.2], [0.04, 0.12, 0.03], 'metal', { collide: false, color: 0x1a1a1a }),
    cyl([0.25, 0.37, 0], 0.08, 0.75, 'metal', { collide: false }),
    box([0, 0.37, 0.1], [0.12, 0.74, 0.12], 'metal', { collide: false, color: 0x4a4a44 }),
  ], x, z, yaw)
}

/** Pad-mounted transformer + fenced enclosure. */
export function transformer(x: number, z: number): BoxDef[] {
  return [
    box([x, 0.15, z], [3.4, 0.3, 3.0], 'concrete'),
    box([x, 1.2, z], [1.8, 1.8, 1.4], 'paintedMetal', { color: 0x6a7060 }),
    ...[-0.6, 0, 0.6].map((dx) => cyl([x + dx, 2.4, z], 0.16, 0.6, 'metal', { collide: false, color: 0x8a6a40 })),
    ...[-1.1, 1.1].map((dx) => box([x + dx * 1.2, 1.2, z], [0.3, 1.6, 1.3], 'metal', { collide: false, color: 0x55584e })),
    ...fence(x - 2.2, z + 2, x + 2.2, z + 2, 2.2, false), ...fence(x - 2.2, z - 2, x + 2.2, z - 2, 2.2, false),
    ...fence(x - 2.2, z - 2, x - 2.2, z + 2, 2.2, false), ...fence(x + 2.2, z - 2, x + 2.2, z + 2, 2.2, false),
  ]
}

export function generator(x: number, z: number, yaw: number): BoxDef[] {
  return place([
    box([0, 0.2, 0], [2.6, 0.4, 1.4], 'metal', { color: 0x2a2c28 }),
    box([0, 1.0, 0], [2.4, 1.2, 1.2], 'paintedMetal', { color: 0x5c6a3c }),
    box([0.8, 1.0, -0.62], [0.6, 0.6, 0.04], 'metal', { collide: false, color: 0x222222 }),
    cyl([-0.9, 1.9, 0.3], 0.14, 0.8, 'rust', { collide: false }),
  ], x, z, yaw)
}

/** Wooden utility pole with crossarm and insulators; cables are added separately. */
export function utilityPole(x: number, z: number, yaw = 0, height = 8): BoxDef[] {
  return place([
    cyl([0, height / 2, 0], 0.26, height, 'wood', { color: 0x8a7a64 }),
    box([0, height - 0.6, 0], [2.2, 0.14, 0.14], 'wood', { collide: false, color: 0x7a6a54 }),
    ...[-0.9, 0, 0.9].map((dx) => cyl([dx, height - 0.42, 0], 0.08, 0.22, 'concrete', { collide: false, color: 0x8a9a8a })),
  ], x, z, yaw)
}

/** Industrial pipe run on supports, local +X direction. */
export function pipeRun(x: number, z: number, yaw: number, length: number, height = 2.4, pipes = 2): BoxDef[] {
  const parts: BoxDef[] = []
  for (let i = 0; i < pipes; i++) parts.push(cyl([0, height + i * 0.35, 0], 0.28, length, 'paintedMetal', { rz: Math.PI / 2, color: i ? 0x6a6050 : 0x7a7a68 }))
  for (let s = -length / 2 + 1; s <= length / 2 - 1; s += 4) {
    parts.push(box([s, height / 2, 0], [0.15, height, 0.15], 'metal'))
    parts.push(box([s, height - 0.2, 0], [0.15, 0.1, 0.9], 'metal', { collide: false }))
  }
  return place(parts, x, z, yaw)
}

/** Roof-top AC unit. */
export function acUnit(x: number, y: number, z: number): BoxDef[] {
  return [
    box([x, y + 0.45, z], [1.2, 0.9, 0.9], 'paintedMetal', { color: 0x9a9c94 }),
    cyl([x, y + 0.92, z], 0.7, 0.05, 'metal', { collide: false, color: 0x2a2a2a }),
  ]
}

/** Painted helipad with H marking. */
export function helipad(x: number, z: number): BoxDef[] {
  return [
    box([x, 0.06, z], [12, 0.12, 12], 'concrete', { collide: false, castShadow: false }),
    box([x - 1.6, 0.125, z], [0.5, 0.01, 4], 'plaster', { color: 0xe8e4d8, collide: false, castShadow: false }),
    box([x + 1.6, 0.125, z], [0.5, 0.01, 4], 'plaster', { color: 0xe8e4d8, collide: false, castShadow: false }),
    box([x, 0.125, z], [2.8, 0.01, 0.5], 'plaster', { color: 0xe8e4d8, collide: false, castShadow: false }),
    ...[0, 1, 2, 3].map((k) => box([x + Math.cos((k * Math.PI) / 2) * 5.4, 0.125, z + Math.sin((k * Math.PI) / 2) * 5.4], [k % 2 ? 6 : 0.3, 0.01, k % 2 ? 0.3 : 6], 'plaster', { color: 0xd8c040, collide: false, castShadow: false })),
  ]
}

/** Lattice radio mast. */
export function radioMast(x: number, z: number, height = 18): BoxDef[] {
  const parts: BoxDef[] = []
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [0, 0.45]] as const) parts.push(box([dx, height / 2, dz], [0.08, height, 0.08], 'metal', { collide: dx === 0 }))
  for (let y = 1; y < height; y += 1.5) parts.push(box([0, y, -0.4], [0.8, 0.04, 0.04], 'metal', { collide: false, castShadow: false }))
  parts.push(box([0, height + 0.6, 0], [0.05, 1.2, 0.05], 'metal', { collide: false }))
  return place(parts, x, z)
}

/** Painted road marking strips (dashed centre line) along a straight road. */
export function roadLine(x1: number, z1: number, x2: number, z2: number): BoxDef[] {
  const len = Math.hypot(x2 - x1, z2 - z1)
  const yaw = Math.atan2(-(z2 - z1), x2 - x1)
  const out: BoxDef[] = []
  for (let d = 2; d < len - 2; d += 6) {
    const t = d / len
    out.push({ p: [x1 + (x2 - x1) * t, 0.043, z1 + (z2 - z1) * t], s: [3, 0.004, 0.15], mat: 'plaster', color: 0xc8c4b0, yaw, collide: false, castShadow: false })
  }
  return out
}

/** Bush clump: visual foliage blocks + a sensor that blocks sight but not movement/bullets. */
export function bush(x: number, z: number, size = 1.6, y = 0): BoxDef[] {
  return [{ p: [x, y + size * 0.4, z], s: [size, size * 0.8, size], mat: 'foliage', shape: 'cyl', castShadow: false }]
}
