import type { GuardKind } from '../ai/guardBrain'
import {
  acUnit, barrel, barrelGroup, building, bush, container, crateStack, electricalBox, fence, forklift, fuelTank, generator,
  hangar, helipad, jersey, pallet, pipeRun, place, radioMast, roadLine, sandbags, stairs, tower, towerLadder, transformer, truck, utilityPole, wall,
} from './builders'
import type { AreaDef, BoxDef, CableDef, GuardSpawn, InteriorDef, LampDef, LevelLayout, ReinforcementSquadDef } from './types'

/*
 * Base layout (x east, z south; the player approaches from the south).
 *
 *   OUTSIDE (z > 52)  →  forward watchtower + chicane  →  GUARD POST (main gate, z = 44)  →  FENCE (x -62..66, z -66..44)
 *   → ROADS (N-S main road, E-W cross road)  →  WAREHOUSE (keycard)  →  COMMAND BUILDING (intel)  →  SECURITY AREA (radio)
 *   →  EXTRACTION (helipad, NW)
 *
 * Routes in: main gate (direct), west drainage ditch + fence breach (stealth), east personnel gate (alternative),
 * east utility tunnel → maintenance building → power station → security compound back gate (maintenance route),
 * warehouse roof stairs → pipe-bridge catwalk over the security wall (elevated).
 */

const interiors: InteriorDef[] = [{ min: [63, -0.5, -17.2], max: [73.2, 2.5, -14.8] }] // utility tunnel
const bld = (r: { boxes: BoxDef[]; interior: InteriorDef }) => {
  interiors.push(r.interior)
  return r.boxes
}

// ---- perimeter fence ---------------------------------------------------------------------------
const FX1 = -62, FX2 = 66, FZ1 = -66, FZ2 = 44
const perimeter: BoxDef[] = [
  ...fence(FX1, FZ2, -4.6, FZ2), ...fence(4.6, FZ2, FX2, FZ2),
  ...fence(FX1, FZ1, FX2, FZ1),
  ...fence(FX1, FZ1, FX1, -8.8), ...fence(FX1, -7.2, FX1, FZ2), // west breach at z = -8
  ...fence(FX2, FZ1, FX2, -17.6), ...fence(FX2, -14.4, FX2, 11.2), ...fence(FX2, 12.8, FX2, FZ2), // tunnel at z = -16, personnel gate at z = 12
  // damaged fence flap at the breach
  { p: [FX1 - 0.4, 0.5, -8.2], s: [0.04, 1.0, 1.1], mat: 'fence', yaw: 0.9, rz: 0.5, collide: false },
  // gate pillars, boom barrier and gate signs
  { p: [-4.6, 1.8, FZ2], s: [0.7, 3.6, 0.7], mat: 'concrete' },
  { p: [4.6, 1.8, FZ2], s: [0.7, 3.6, 0.7], mat: 'concrete' },
  { p: [0, 1.05, FZ2 - 0.6], s: [0.1, 8.4, 0.1], mat: 'paintedMetal', shape: 'cyl', rz: Math.PI / 2, color: 0xc8b030, collide: false },
  { p: [-4.6, 0.6, FZ2 - 0.6], s: [0.4, 1.2, 0.4], mat: 'paintedMetal', color: 0x3a3c34 },
  // east personnel gate frame
  { p: [FX2, 1.4, 11.1], s: [0.12, 2.8, 0.12], mat: 'metal', collide: false },
  { p: [FX2, 1.4, 12.9], s: [0.12, 2.8, 0.12], mat: 'metal', collide: false },
]

// ---- outside approach --------------------------------------------------------------------------
const outside: BoxDef[] = [
  ...tower(14, 62, 6, 0),
  ...jersey(-2, 58, 0.15), ...jersey(2.4, 64, -0.1), ...jersey(-2.2, 70, 0.05),
  ...sandbags(-9, 50, 0.3, 4.2), ...sandbags(9, 49, -0.4, 3.6),
  // warning boards
  { p: [-6, 1.0, 96], s: [0.1, 2.0, 0.1], mat: 'metal' }, { p: [-6, 2.1, 96], s: [1.6, 0.9, 0.06], mat: 'paintedMetal', color: 0xb0302a },
  { p: [6.5, 1.0, 76], s: [0.1, 2.0, 0.1], mat: 'metal' }, { p: [6.5, 2.1, 76], s: [1.6, 0.9, 0.06], mat: 'paintedMetal', color: 0xc8b030 },
  // rocks scattered on the approach for cover
  { p: [-11, 0.7, 84], s: [2.8, 1.6, 2.2], mat: 'rock', yaw: 0.4, rx: 0.1 },
  { p: [12, 0.6, 92], s: [2.4, 1.3, 2.0], mat: 'rock', yaw: -0.3, rz: 0.12 },
  { p: [-16, 0.9, 66], s: [3.6, 2.0, 3.0], mat: 'rock', yaw: 1.1 },
  { p: [19, 0.7, 78], s: [3.0, 1.6, 2.6], mat: 'rock', yaw: 0.2, rx: -0.1 },
  { p: [24, 0.6, 52], s: [2.4, 1.3, 2.0], mat: 'rock', yaw: 0.8 },
  { p: [-24, 0.8, 56], s: [3.4, 1.7, 2.4], mat: 'rock', yaw: -0.5 },
  // burned-out car wreck by the road
  ...place([
    { p: [0, 0.6, 0], s: [1.8, 0.8, 4.2], mat: 'rust' }, { p: [0, 1.25, 0.3], s: [1.6, 0.6, 2.0], mat: 'rust' },
    { p: [0, 0.3, 0], s: [1.9, 0.3, 4.0], mat: 'metal', color: 0x2a2826, collide: false },
  ], 9, 104, 0.6),
]

// ---- gate checkpoint (guard post) ---------------------------------------------------------------
const checkpoint: BoxDef[] = [
  ...bld(building(-8.5, 38.5, 3.4, 3.4, 2.7, { doors: { e: [0] }, windows: { s: [0], n: [0], w: [0] }, color: 0x8a8a74 })),
  ...sandbags(7.5, 39.5, 0, 3.6), ...sandbags(9.4, 37.8, Math.PI / 2, 3.0),
  ...barrel(-6.2, 36.2, 0x4a3a28), // burn barrel
  ...barrelGroup(11, 41, 3, 0x45502e),
  ...electricalBox(-10.4, 36.6, Math.PI),
]

// ---- roads -------------------------------------------------------------------------------------
const ROADS: [number, number, number, number][] = [
  [-4, 44, 4, 210], // approach
  [-4, -56, 4, 44], // main N-S
  [-58, 4, 62, 11], // E-W
  [8, -18, 22, -12], // to warehouse door
]
const roadBoxes: BoxDef[] = [
  ...ROADS.map(([x1, z1, x2, z2]): BoxDef => ({ p: [(x1 + x2) / 2, 0.02, (z1 + z2) / 2], s: [x2 - x1, 0.04, z2 - z1], mat: 'asphalt', collide: false, castShadow: false })),
  ...roadLine(0, 205, 0, 46), ...roadLine(0, 40, 0, -54), ...roadLine(-56, 7.5, 60, 7.5),
]

// ---- motor pool (SW) -----------------------------------------------------------------------------
const motorPool: BoxDef[] = [
  // open-sided vehicle shed
  ...[-44, -36, -28].flatMap((x) => [-0.5, 7.5].map((dz): BoxDef => ({ p: [x, 2.2, 26 + dz], s: [0.25, 4.4, 0.25], mat: 'paintedMetal', color: 0x4a4e44 }))),
  { p: [-36, 4.5, 29.5], s: [18, 0.2, 9.5], mat: 'roof' },
  ...truck(-41, 30, Math.PI, 0x4c5434),
  ...fuelTank(-52, 20, 0.05), ...fuelTank(-52, 26, -0.03, 6, 2.2, 0x7a7e6a),
  ...barrelGroup(-47, 17.5, 6, 0x6a3022), ...barrel(-44.5, 18.5, 0x45502e, true),
  ...generator(-30, 18.2, 0),
  ...crateStack(-22, 34, 2), ...crateStack(-20.6, 34.4, 1), ...pallet(-18, 37, 0.2, 4),
  ...jersey(-14, 18, Math.PI / 2), ...jersey(-14, 14.5, Math.PI / 2),
]

// ---- barracks (SE) -------------------------------------------------------------------------------
const barracks: BoxDef[] = [
  ...bld(building(37, 24, 30, 10, 3.6, { doors: { s: [0], n: [-8] }, windows: { s: [-11, -6, 6, 11], n: [-3, 4, 11] }, color: 0x7e8066, roofMat: 'roof' })),
  ...transformer(57, 30),
  ...electricalBox(22.2, 22, Math.PI / 2), ...electricalBox(52.2, 26, -Math.PI / 2),
  ...crateStack(24, 32, 1), ...barrelGroup(50, 32, 2),
  ...sandbags(37, 35, 0, 4.8, 2),
]

// ---- warehouse (keycard) --------------------------------------------------------------------------
const WH = { cx: 37, cz: -12, w: 26, d: 24, h: 8 }
const warehouse: BoxDef[] = [
  ...bld(hangar(WH.cx, WH.cz, WH.w, WH.d, WH.h, { w: [[0, 6, 5]], s: [[8, 1.4, 2.3]] })),
  // big door lintel trim + sliding door leaf parked open
  { p: [23.7, 2.6, -16.2], s: [0.12, 5.2, 4], mat: 'corrugated', color: 0x6e7468 },
  // office in the SE corner
  ...wall(42, 49.6, -8, 3, false, [{ at: -1.6, width: 1.2, top: 2.2, open: true }, { at: 1.8, width: 1.6, sill: 1, top: 2.1 }], 'blocks', 0.2),
  ...wall(-8, -0.3, 42, 3, true, [{ at: 0, width: 1.6, sill: 1, top: 2.1 }], 'blocks', 0.2),
  { p: [46, 3.05, -4.15], s: [7.6, 0.1, 7.7], mat: 'concreteDark' },
  { p: [47.2, 0.4, -6.6], s: [1.8, 0.8, 0.8], mat: 'metal', color: 0x4a4e44 }, // desk
  { p: [49.2, 0.9, -2], s: [0.5, 1.8, 0.9], mat: 'metal', color: 0x5a6050 }, // filing cabinet
  // storage
  ...crateStack(27, -4, 3), ...crateStack(28.4, -4.2, 2), ...crateStack(27.2, -5.6, 1),
  ...crateStack(33, -20, 2), ...crateStack(34.3, -20.2, 1), ...crateStack(30, -14, 2, 1.2, 0.3),
  ...container(42, -18.5, 0, 0x2f5a6b), ...container(42, -21.4, 0, 0x7a3b2e),
  ...forklift(36, -8, 0.6),
  ...pallet(38, -3, 0, 3), ...pallet(39.4, -3, 0.1, 2),
  ...barrelGroup(46.5, -12, 4),
  // external stairs to the roof (north side) and the landing
  ...stairs(26, -25.8, -Math.PI / 2, 1.3, 8.3, 14),
  { p: [40.8, 8.2, -25.2], s: [1.8, 0.2, 1.6], mat: 'paintedMetal', color: 0x4a4e48 },
  ...pipeRun(37, 1.2, 0, 24, 3.2, 2), // pipes along the south wall
]

// ---- pipe-bridge catwalk: warehouse roof → server building roof (elevated route) ---------------
const catwalk: BoxDef[] = (() => {
  const z0 = -24.5, z1 = -45.4, y0 = 8.3, y1 = 4.45
  const len = Math.hypot(z0 - z1, y0 - y1), rx = -Math.atan2(y0 - y1, z0 - z1)
  const cz = (z0 + z1) / 2, cy = (y0 + y1) / 2
  const out: BoxDef[] = [
    { p: [44, cy, cz], s: [1.3, 0.1, len], mat: 'paintedMetal', rx, color: 0x3e423a },
    { p: [43.3, cy + 1.0, cz], s: [0.05, 0.05, len], mat: 'metal', rx, collide: false },
    { p: [44.7, cy + 1.0, cz], s: [0.05, 0.05, len], mat: 'metal', rx, collide: false },
    { p: [45.2, cy - 0.3, cz], s: [0.4, len, 0.4], mat: 'paintedMetal', shape: 'cyl', rx: Math.PI / 2 + rx, color: 0x7a7a68, collide: false },
    { p: [42.8, cy - 0.3, cz], s: [0.3, len, 0.3], mat: 'rust', shape: 'cyl', rx: Math.PI / 2 + rx, collide: false },
  ]
  for (let k = 1; k < 4; k++) {
    const t = k / 4, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t
    out.push({ p: [44, (y - 0.4) / 2, z], s: [0.3, y - 0.4, 0.3], mat: 'paintedMetal', color: 0x4a4e44 })
  }
  return out
})()

// ---- container yard (centre) ----------------------------------------------------------------------
const yard: BoxDef[] = [
  ...container(12, -26, 0, 0x5c6b2f), ...container(12, -26, 0.03, 0x7a6a2e, 1), ...container(12, -29, 0, 0x2f5a6b),
  ...container(16, 18, Math.PI / 2, 0x7a3b2e), ...container(10, 28, 0.1, 0x5c6b2f),
  ...crateStack(8, -2, 2), ...crateStack(9.3, -2.2, 1), ...crateStack(-8, -14, 1), ...crateStack(-8, -15.3, 2),
  ...crateStack(-10, 24, 1), ...crateStack(14, 0, 2, 1.2, 0.4),
  ...jersey(-7, 2, 0), ...jersey(10, 12.5, 0.1), ...jersey(-12, -48, Math.PI / 2),
  ...sandbags(-6, -20, Math.PI / 2, 3.6), ...barrelGroup(16, -8, 3),
  ...pallet(-9, 30, 0.3, 5), ...pallet(-10.3, 31.4, -0.2, 3),
]

// ---- command building (intel) -------------------------------------------------------------------
const CB = { cx: -30, cz: -32, w: 26, d: 16, h: 4.2 }
const command: BoxDef[] = [
  ...bld(building(CB.cx, CB.cz, CB.w, CB.d, CB.h, {
    doors: { s: [-6], e: [3], w: [-4] },
    windows: { s: [-10, 0, 4, 9], n: [-9, -2, 6, 10], e: [-3], w: [3] },
    color: 0xa8a48e, parapet: true,
  })),
  // corridor wall (hall to the south, rooms to the north) and room divider
  ...wall(-42.7, -17.3, -32, CB.h, false, [{ at: -6, width: 1.2, top: 2.2, open: true }, { at: 7, width: 1.2, top: 2.2, open: true }], 'plaster', 0.2, 0xb4b09a),
  ...wall(-39.7, -32.1, -30, CB.h, true, [], 'plaster', 0.2, 0xb4b09a),
  // furniture
  { p: [-20, 0.4, -38.9], s: [2.2, 0.8, 0.8], mat: 'metal', color: 0x3a3f44 }, // terminal desk
  { p: [-23.5, 0.95, -39.5], s: [1.2, 1.9, 0.5], mat: 'metal', color: 0x4c5048 }, // server rack
  { p: [-17.8, 1.0, -35], s: [0.6, 2.0, 1.8], mat: 'metal', color: 0x5a6050 }, // lockers
  { p: [-36, 0.38, -36], s: [2.4, 0.76, 1.2], mat: 'wood' }, // briefing table
  { p: [-42.4, 0.9, -36], s: [0.5, 1.8, 2.4], mat: 'metal', color: 0x5a6050 },
  { p: [-26, 0.4, -27], s: [1.6, 0.8, 0.8], mat: 'metal', color: 0x4a4e44 }, // hall desk
  ...acUnit(-36, CB.h + 0.2, -35), ...acUnit(-24, CB.h + 0.2, -29),
  ...radioMast(-14, -42, 18),
  ...electricalBox(-43.2, -27, Math.PI / 2),
  ...sandbags(-30, -21.2, 0, 4.2, 2),
  ...barrelGroup(-46, -26, 3),
]

// ---- security area (radio / server room) ------------------------------------------------------------
const SA = { x1: 24, x2: 58, z1: -64, z2: -32, h: 3.2 }
const security: BoxDef[] = [
  ...wall(SA.x1, SA.x2, SA.z2, SA.h, false, [{ at: -11, width: 4, top: SA.h, open: true }], 'concrete', 0.4),
  { p: [SA.x1 + 6, 1.4, SA.z2], s: [4, 2.8, 0.12], mat: 'paintedMetal', color: 0x3e4636 }, // closed vehicle gate
  ...wall(SA.x1, SA.x2, SA.z1, SA.h, false, [], 'concrete', 0.4),
  ...wall(SA.z1, SA.z2, SA.x1, SA.h, true, [{ at: -0.4 + 0, width: 1.2, top: 2.2, open: true }], 'concrete', 0.4),
  ...wall(SA.z1, SA.z2, SA.x2, SA.h, true, [{ at: 0, width: 1.2, top: 2.2, open: true }], 'concrete', 0.4), // back gate at z = -48
  // coping on the wall tops
  ...[SA.z1, SA.z2].map((z): BoxDef => ({ p: [(SA.x1 + SA.x2) / 2, SA.h + 0.05, z], s: [SA.x2 - SA.x1 + 0.5, 0.1, 0.55], mat: 'concreteDark', collide: false })),
  ...[SA.x1, SA.x2].map((x): BoxDef => ({ p: [x, SA.h + 0.05, (SA.z1 + SA.z2) / 2], s: [0.55, 0.1, SA.z2 - SA.z1], mat: 'concreteDark', collide: false })),
  ...bld(building(44, -50, 14, 10, 4.2, { doors: { w: [0], e: [-2] }, windows: { s: [-3, 3], n: [0] }, color: 0x8e9078 })),
  // control room (west) / server room (east) partition
  ...wall(-54.7, -45.3, 43.5, 4.2, true, [{ at: 0, width: 1.2, top: 2.2, open: true }], 'plaster', 0.2, 0xa4a690),
  { p: [40.2, 0.4, -54.1], s: [4.4, 0.8, 0.8], mat: 'metal', color: 0x3a3f44 }, // control desk
  { p: [40, 0.45, -48.4], s: [2.2, 0.9, 1.4], mat: 'wood', color: 0x5a5040 }, // map table
  { p: [37.7, 1.1, -46.6], s: [0.6, 2.2, 1.4], mat: 'metal', color: 0x5a6050 }, // cabinet
  { p: [49.4, 0.45, -50], s: [0.8, 0.9, 2.2], mat: 'metal', color: 0x3a3f44 }, // radio console
  ...[-53.2, -51.6, -48.4, -46.8].map((z): BoxDef => ({ p: [46, 1.0, z], s: [0.9, 2.0, 0.7], mat: 'metal', color: 0x2e3230 })), // server racks
  ...tower(54, -60, 7, Math.PI),
  ...generator(30, -60, Math.PI / 2),
  ...crateStack(30, -38, 1), ...crateStack(52, -38, 2), ...barrelGroup(31, -52, 4),
  ...electricalBox(36.8, -46, Math.PI / 2),
]

// ---- maintenance building + utility tunnel under the east fence (maintenance route) -------------------
const maintenance: BoxDef[] = [
  ...bld(building(59, -16, 8, 10, 3.6, { doors: { e: [0], w: [2] }, windows: { n: [0] }, color: 0x7a7c68, mat: 'blocks' })),
  // tunnel: two walls, a roof slab and a lip; the fence runs over it
  ...wall(63, 73, -17.35, 2.5, false, [], 'concreteDark', 0.3),
  ...wall(63, 73, -14.65, 2.5, false, [], 'concreteDark', 0.3),
  { p: [68, 2.62, -16], s: [10, 0.25, 3.0], mat: 'concrete' },
  { p: [73.1, 2.2, -16], s: [0.3, 0.8, 3.0], mat: 'concrete' }, // headwall over the mouth
  ...pipeRun(68, -17.0, 0, 9, 2.1, 2),
  { p: [68, 0.05, -16], s: [10, 0.1, 2.4], mat: 'concreteDark', collide: false, castShadow: false },
  // workshop clutter
  { p: [56.2, 0.45, -19.6], s: [2.4, 0.9, 0.8], mat: 'wood', color: 0x5a4a38 }, // workbench
  { p: [61.8, 0.9, -12.6], s: [0.6, 1.8, 1.6], mat: 'metal', color: 0x5a6050 }, // shelving
  ...barrel(57, -12.4, 0x6a3022), ...generator(60.4, -19.5, 0),
  ...crateStack(54, -24, 1), ...barrelGroup(53.5, -6, 3),
]

// ---- power station: transformers + uplink feed on the east strip ----------------------------------------
const powerStation: BoxDef[] = [
  ...transformer(62, -38), ...transformer(62, -54),
  { p: [63, 0.15, -46], s: [3.2, 0.3, 3.0], mat: 'concrete' },
  { p: [63, 1.45, -46], s: [1.6, 2.6, 2.2], mat: 'paintedMetal', color: 0x5a6050 }, // uplink transformer
  { p: [62.18, 1.3, -46], s: [0.06, 0.7, 0.5], mat: 'paintedMetal', color: 0xb0302a, collide: false }, // breaker door
  ...[-0.6, 0.6].map((dz): BoxDef => ({ p: [63, 3.05, -46 + dz], s: [0.18, 0.6, 0.18], mat: 'metal', shape: 'cyl', color: 0x8a6a40, collide: false })),
  ...utilityPole(64.8, -46), ...electricalBox(58.65, -42, -Math.PI / 2),
]

// ---- helipad (extraction) ---------------------------------------------------------------------------
const extraction: BoxDef[] = [
  ...helipad(-48, -54),
  { p: [-40.5, 2.5, -46.5], s: [0.08, 5, 0.08], mat: 'metal' },
  { p: [-40.5, 4.6, -46.0], s: [0.35, 0.35, 1.0], mat: 'canvas', color: 0xd06a2a, collide: false }, // windsock
  ...barrelGroup(-56, -46, 2, 0xb0a020),
]

// ---- utilities: poles + cables along the main road ---------------------------------------------------
const POLE_Z = [40, 24, 8, -8, -24, -40]
const poles: BoxDef[] = POLE_Z.flatMap((z) => utilityPole(6.5, z))
const cables: CableDef[] = POLE_Z.slice(1).flatMap((z, i) => [-0.9, 0, 0.9].map((dx): CableDef => ({ from: [6.5 + dx, 7.55, POLE_Z[i]], to: [6.5 + dx, 7.55, z], sag: 0.5 })))
cables.push({ from: [6.5, 7.55, -24], to: [22.4, 6.4, -12], sag: 0.8 }, { from: [6.5, 7.55, 8], to: [22, 3.2, 22], sag: 0.8 })
// uplink feed: power station pole → communications building roof
cables.push({ from: [64.8, 7.55, -46], to: [50.6, 4.3, -48], sag: 1.1 }, { from: [64.8, 7.55, -46], to: [64.8, 7.55, -24], sag: 0.6 })

// ---- stealth approach: bushes along the west drainage ditch ----------------------------------------
const ditchBushes: BoxDef[] = [
  [-66, -4], [-70, -15], [-77, -6], [-84, -18], [-90, -8], [-97, -21], [-60, -3.5], [-58, -13],
  [-104, -12], [-112, -26], [-118, -16],
  // cover around the utility tunnel mouth
  [78, -11], [80, -21.5], [88, -14], [95, -24],
].flatMap(([x, z], i) => bush(x, z, 1.6 + (i % 3) * 0.5))

/** Reaction squad of `n` pooled guards, sent once when the security level first reaches `level`. */
function qrf(id: string, source: string, level: number, kinds: GuardKind[]): ReinforcementSquadDef {
  const guards: GuardSpawn[] = kinds.map((kind, i) => ({ id: `${id}-${i + 1}`, patrol: [[0, 0, 0]], squad: id, leader: i === 0, kind, tier: level }))
  return { id, source, minLevel: level, guards }
}

const AREAS: AreaDef[] = [
  { label: 'the main gate', rect: [-16, 30, 16, 62] },
  { label: 'the comms building', rect: [37, -55, 51, -45] },
  { label: 'the security compound', rect: [24, -64, 58, -32] },
  { label: 'the power station', rect: [58, -62, 70, -30] },
  { label: 'the maintenance building', rect: [52, -28, 80, -4] },
  { label: 'the warehouse', rect: [22, -26, 52, 2] },
  { label: 'the command building', rect: [-50, -48, -14, -18] },
  { label: 'the helipad', rect: [-62, -66, -36, -40] },
  { label: 'the motor pool', rect: [-60, 12, -12, 42] },
  { label: 'the barracks', rect: [18, 12, 64, 42] },
  { label: 'the container yard', rect: [-16, -34, 22, 4] },
  { label: 'the west perimeter', rect: [-130, -70, -56, 50] },
  { label: 'the east fence', rect: [62, -70, 130, 50] },
  { label: 'the south approach', rect: [-60, 44, 60, 200] },
]

// world boundary
const B = 200
const boundary: BoxDef[] = [
  { p: [0, 20, -B], s: [2 * B, 60, 1], mat: 'invisible' },
  { p: [0, 20, B], s: [2 * B, 60, 1], mat: 'invisible' },
  { p: [-B, 20, 0], s: [1, 60, 2 * B], mat: 'invisible' },
  { p: [B, 20, 0], s: [1, 60, 2 * B], mat: 'invisible' },
]

/**
 * Night lighting: lamp posts along both sides of every road and tall floodlight towers round the fence and yards.
 * Spots are generated, then dropped if they would stand in a building or right next to an existing lamp.
 */
function withRoadAndTowerLights(lamps: LampDef[]): LampDef[] {
  const solid = BOXES.filter((b) => b.collide !== false && b.p[1] + b.s[1] / 2 > 0.8)
  const clear = (x: number, z: number, margin: number) =>
    !solid.some((b) => Math.abs(x - b.p[0]) < b.s[0] / 2 + margin && Math.abs(z - b.p[2]) < b.s[2] / 2 + margin)
    && !lamps.some((l) => Math.hypot(l.position[0] - x, l.position[2] - z) < 7)
  const add = (x: number, z: number, l: Omit<LampDef, 'position'> & { y: number }) => {
    if (clear(x, z, l.tower ? 1.2 : 0.6)) lamps.push({ position: [x, l.y, z], radius: l.radius, post: l.post, tower: l.tower })
  }
  // posts along the roads, alternating sides
  for (let z = 52, i = 0; z <= 140; z += 24, i++) add(i % 2 ? 6 : -6, z, { y: 6, radius: 10, post: true })
  for (let z = 38, i = 0; z >= -52; z -= 18, i++) add(i % 2 ? 5.6 : -5.6, z, { y: 6, radius: 10, post: true })
  for (let x = -54, i = 0; x <= 58; x += 18, i++) add(x, i % 2 ? 13 : 2.2, { y: 6, radius: 10, post: true })
  // floodlight towers: fence corners, fence midpoints, yards
  for (const [x, z] of [[-57, 39], [61, 39], [-57, -61], [61, -61], [-57, -30], [61, -36], [-24, 39], [30, 39], [-28, -61], [16, -61], [-12, 22], [22, -30], [-30, 8.5]] as const) {
    add(x, z, { y: 12, radius: 18, tower: true })
  }
  return lamps
}

const BOXES: BoxDef[] = [
  ...perimeter, ...outside, ...checkpoint, ...roadBoxes, ...motorPool, ...barracks, ...warehouse, ...catwalk,
  ...yard, ...command, ...security, ...maintenance, ...powerStation, ...extraction, ...poles, ...ditchBushes, ...boundary,
]

export const compoundLayout: LevelLayout = {
  playerStart: [-1.5, 0.2, 128],
  playerYaw: 0,
  boxes: BOXES,
  lamps: withRoadAndTowerLights([
    { position: [-5.5, 6.5, 43], radius: 11, realLight: true, post: true },
    { position: [6.5, 6, 30], radius: 8, post: true },
    { position: [6.5, 6, 2], radius: 9, realLight: true, post: true },
    { position: [6.5, 6, -30], radius: 8, post: true },
    { position: [23.6, 6.2, -12], radius: 9, realLight: true, yaw: Math.PI / 2 },
    { position: [37, 3.3, 18.6], radius: 7, yaw: 0 },
    { position: [-36, 3.7, -23.6], radius: 6, yaw: 0 },
    { position: [-30, 6, 26], radius: 10, realLight: true, post: true },
    { position: [40, 6.5, -36], radius: 10, realLight: true, post: true },
    { position: [-42, 5, -47], radius: 9, post: true },
    { position: [14, 6.6, 62], radius: 6 },
    // interior ceiling lights
    { position: [-30, 3.9, -28], radius: 6, realLight: true },
    { position: [-22, 3.9, -36], radius: 5 },
    { position: [44, 3.9, -50], radius: 5, realLight: true },
    { position: [37, 7.4, -12], radius: 9 },
    { position: [40.5, 3.9, -50], radius: 4 },
    { position: [59, 3.3, -16], radius: 3 },
    { position: [60.4, 6, -46], radius: 7, post: true },
    // extra yard lighting so the base is lit up after dark (spots checked clear of buildings)
    ...([[6.5, 16], [6.5, -14], [-46, 30], [-20, 14], [50, 14], [12, -21], [-34, -18], [-52, -36], [-38, -56], [-58, -50],
      [30, -58], [54, -40], [66, -30], [0, 56], [-14, 40], [14, 40], [-25, -2], [-8, -22]] as const)
      .map(([x, z]) => ({ position: [x, 6, z] as [number, number, number], radius: 9, post: true })),
  ]),
  guards: [
    // gate squad
    { id: 'tower-south', patrol: [[14, 6.13, 62]], faceTowards: [2, 110], visionRange: 55, squad: 'gate', kind: 'sniper' },
    { id: 'gate-west', patrol: [[-6.5, 0, 47.5]], faceTowards: [-3, 90], squad: 'gate' },
    { id: 'gate-east', patrol: [[6, 0, 41], [6, 0, 30]], waitTime: 6, squad: 'gate', leader: true },
    { id: 'outer-patrol', patrol: [[-14, 0, 49], [-68, 0, 49], [-68, 0, -26], [-68, 0, 20]], waitTime: 4, squad: 'gate', kind: 'rusher' },
    // motor pool / yard
    { id: 'yard', patrol: [[0, 0, 30], [0, 0, -20], [12, 0, -21], [12, 0, 12]], waitTime: 3, squad: 'motor', leader: true },
    { id: 'motor-pool', patrol: [[-20, 0, 21], [-46, 0, 35], [-46, 0, 14]], waitTime: 4, squad: 'motor', kind: 'rusher' },
    // barracks
    { id: 'barracks', patrol: [[34, 0, 32]], faceTowards: [20, 44], squad: 'barracks', kind: 'heavy' },
    { id: 'barracks-patrol', patrol: [[22, 0, 14], [54, 0, 14], [60, 0, 38]], waitTime: 3, squad: 'barracks', leader: true },
    // warehouse
    { id: 'warehouse-door', patrol: [[21, 0, -9]], faceTowards: [6, -6], squad: 'warehouse' },
    { id: 'officer', patrol: [[45, 0, -4], [33, 0, -4], [33, 0, -16]], waitTime: 5, carries: 'sec-card', squad: 'warehouse', leader: true },
    // command / admin
    { id: 'command-hall', patrol: [[-40, 0, -27], [-20, 0, -27], [-24, 0, -36]], waitTime: 4, squad: 'command', leader: true },
    { id: 'command-west', patrol: [[-48, 0, -20], [-48, 0, -44], [-34, 0, -46]], waitTime: 4, squad: 'command', kind: 'rusher' },
    { id: 'helipad', patrol: [[-44, 0, -45]], faceTowards: [-28, -20], squad: 'command', kind: 'heavy' },
    // security compound
    { id: 'sec-gate', patrol: [[21, 0, -47]], faceTowards: [8, -46], squad: 'compound', kind: 'heavy' },
    { id: 'sec-yard', patrol: [[30, 0, -36], [54, 0, -36], [54, 0, -42], [30, 0, -58]], waitTime: 3, squad: 'compound', leader: true },
    { id: 'sec-tower', patrol: [[54, 7.13, -60]], faceTowards: [36, -36], visionRange: 45, squad: 'compound', kind: 'sniper' },
    { id: 'comms-tech', patrol: [[40, 0, -47], [40, 0, -52.5], [41, 0, -50]], waitTime: 7, squad: 'compound' },
    // power station / maintenance
    { id: 'power-lead', patrol: [[60.5, 0, -27], [60.5, 0, -58], [64.8, 0, -50]], waitTime: 5, squad: 'power', leader: true },
    { id: 'power-post', patrol: [[55.5, 0, -27]], faceTowards: [62, -10], squad: 'power' },
  ],
  reinforcements: {
    sources: [
      { id: 'barracks', label: 'the barracks', position: [37, 0, 30.5] },
      { id: 'motor-pool', label: 'the vehicle area', position: [-36, 0, 25] },
      { id: 'compound', label: 'the security building', position: [30, 0, -42] },
      { id: 'convoy', label: 'the south road', position: [0, 0, 14], convoy: { vehicle: 'convoy-truck', route: 'convoy' } },
    ],
    // fixed schedule, one squad per security level (+2, +3, +4, +5): told to the player in the briefing
    squads: [
      qrf('level-1', 'barracks', 1, ['rifleman', 'rusher']),
      qrf('level-2', 'motor-pool', 2, ['rifleman', 'rusher', 'heavy']),
      qrf('level-3', 'convoy', 3, ['rifleman', 'heavy', 'rifleman', 'rusher']),
      qrf('level-4', 'compound', 4, ['rifleman', 'heavy', 'rusher', 'rusher', 'rifleman']),
    ],
  },
  interactables: [
    { id: 'intel-terminal', position: [-20, 1, -38.3], label: 'download intel' },
    { id: 'comms-terminal', position: [49, 1, -50], label: 'download traffic logs' },
    { id: 'uplink-breaker', position: [62, 1.2, -46], label: 'sabotage uplink transformer' },
  ],
  computers: [
    { kind: 'workstation', position: [-20, 0.8, -39], yaw: 0, id: 'intel-terminal', title: 'CMD-NET // INTEL ARCHIVE' },
    { kind: 'workstation', position: [38.8, 0.8, -54.2], yaw: 0, title: 'PERIMETER CAMS' },
    { kind: 'workstation', position: [40.2, 0.8, -54.2], yaw: 0, title: 'SECURITY GRID' },
    { kind: 'workstation', position: [41.6, 0.8, -54.2], yaw: 0, title: 'RADIO NET' },
    { kind: 'workstation', position: [49.45, 0.9, -50.45], yaw: -Math.PI / 2, id: 'comms-terminal', title: 'COMMS RELAY // TRAFFIC' },
    { kind: 'workstation', position: [49.45, 0.9, -49.55], yaw: -Math.PI / 2, title: 'UPLINK STATUS' },
    { kind: 'rack', position: [-23.5, 0, -39.24], yaw: 0, size: [1.2, 1.9] },
    ...[-53.2, -51.6, -48.4, -46.8].flatMap((z) => [
      { kind: 'rack' as const, position: [46, 0, z + 0.36] as [number, number, number], yaw: 0, size: [0.9, 2] as [number, number] },
      { kind: 'rack' as const, position: [46, 0, z - 0.36] as [number, number, number], yaw: Math.PI, size: [0.9, 2] as [number, number] },
    ]),
  ],
  pickups: [{ id: 'sec-card', position: [47.2, 0.85, -6.6], label: 'security keycard' }],
  doors: [
    { id: 'sec-door', label: 'Compound gate', hinge: [24, 0, -47.8], yaw: Math.PI / 2, width: 1.2, height: 2.2, swing: 1, lockedBy: 'sec-card', hackTime: 9, lockdown: true, mat: 'paintedMetal' },
    { id: 'sec-back', label: 'Compound back gate', hinge: [58, 0, -47.4], yaw: Math.PI / 2, width: 1.2, height: 2.2, swing: -1, lockedBy: 'sec-card', hackTime: 7, lockdown: true, mat: 'paintedMetal' },
    { id: 'server-door', label: 'Comms building', hinge: [37.15, 0, -49.3], yaw: Math.PI / 2, width: 1.4, height: 2.3, swing: -1, lockdown: true, hackTime: 6, mat: 'paintedMetal' },
    { id: 'comms-east', label: 'Comms building', hinge: [50.85, 0, -51.3], yaw: Math.PI / 2, width: 1.4, height: 2.3, swing: 1, lockdown: true, hackTime: 6, mat: 'paintedMetal' },
    { id: 'tunnel-grate', label: 'Tunnel grate', hinge: [73, 0, -17.2], yaw: -Math.PI / 2, width: 2.4, height: 2.4, swing: 1, lockedBy: 'never', forceTime: 4, mat: 'fence' },
    { id: 'cmd-door', hinge: [-36.7, 0, -24.15], yaw: 0, width: 1.4, height: 2.3, swing: 1, mat: 'wood' },
    { id: 'office-door', hinge: [43.8, 0, -8], yaw: 0, width: 1.2, height: 2.2, swing: -1, mat: 'wood' },
  ],
  cameras: [
    { id: 'cam-sec-gate', position: [23.5, 3.5, -44.5], yaw: Math.PI / 2, sweep: 0.75, pitch: -0.3, range: 22 },
    { id: 'cam-sec-yard', position: [57.4, 3.5, -32.6], yaw: 0.85, sweep: 0.6, pitch: -0.25, range: 26 },
    { id: 'cam-command', position: [-16.8, 3.9, -23.8], yaw: -2.3, sweep: 0.7, pitch: -0.22, range: 24 },
    { id: 'cam-gate', position: [-6.7, 2.9, 40.4], yaw: Math.PI, sweep: 0.6, pitch: -0.18, range: 26 },
    { id: 'cam-maint', position: [63.2, 3.4, -21.2], yaw: 0.15, sweep: 0.55, pitch: -0.22, range: 24 },
  ],
  searchlights: [
    { id: 'sl-south', position: [14, 7.5, 63.85], yaw: Math.PI - 0.15, sweep: 0.7, reach: 34, operator: 'tower-south' },
    { id: 'sl-sec', position: [52.3, 8.5, -58.3], yaw: 2.45, sweep: 0.6, reach: 24, operator: 'sec-tower' },
  ],
  alarmPanels: [
    { id: 'panel-gate', position: [-10.05, 1.4, 38.5], yaw: Math.PI / 2 },
    { id: 'panel-barracks', position: [30, 1.4, 18.85], yaw: 0 },
    { id: 'panel-command', position: [-30, 1.4, -24.35], yaw: 0 },
    { id: 'panel-security', position: [37.05, 1.4, -47], yaw: -Math.PI / 2 },
  ],
  restrictedZones: [
    { id: 'security', label: 'SECURITY AREA', rect: [SA.x1, SA.z1, SA.x2, SA.z2] },
    { id: 'command', label: 'COMMAND — RESTRICTED', rect: [-43, -40, -17, -32] },
    { id: 'power', label: 'POWER STATION — RESTRICTED', rect: [58.3, -60, 66, -32] },
  ],
  interiors,
  props: [
    { model: 'truck', position: [-41, 30], yaw: Math.PI },
    { model: 'forklift', position: [36, -8], yaw: 0.6 },
  ],
  vehicles: [
    { def: 'jeep', position: [-34, 1.2, 7.5], yaw: -Math.PI / 2 },
    { id: 'open-truck', def: 'truck-open', position: [-32, 1.4, 30], yaw: Math.PI },
    { id: 'supply-truck', def: 'truck', position: [-2, 1.4, 172], yaw: 0 },
    { id: 'convoy-truck', def: 'truck', position: [2, 1.4, 186], yaw: 0 },
  ],
  vehicleRoutes: {
    // off the road around the chicane, through the gate, down the main road
    supply: [[-1, 0, 120], [-1, 0, 95], [-8, 0, 62], [-2, 0, 49], [0, 0, 38], [0, 0, 16], [-6, 0, 8], [-21, 0, 7]],
    convoy: [[1, 0, 120], [-1, 0, 95], [-8, 0, 62], [-2, 0, 49], [0, 0, 38], [0, 0, 16]],
  },
  audioZones: [
    { id: 'warehouse', rect: [24.3, -23.8, 49.7, -0.2], loops: [{ kind: 'generator', level: 0.35 }, { kind: 'hum', level: 0.5 }], outdoor: 0.35 },
    { id: 'comms', rect: [37.3, -54.7, 50.7, -45.3], loops: [{ kind: 'hum', level: 0.9 }, { kind: 'radio', level: 1 }], outdoor: 0.15 },
    { id: 'command', rect: [-42.7, -39.7, -17.3, -24.3], loops: [{ kind: 'radio', level: 0.6 }, { kind: 'hum', level: 0.35 }], outdoor: 0.2 },
    { id: 'maintenance', rect: [55.3, -20.7, 73.2, -11.3], loops: [{ kind: 'generator', level: 0.25 }, { kind: 'hum', level: 0.3 }], outdoor: 0.15 },
    { id: 'barracks', rect: [22.3, 19.3, 51.7, 28.7], loops: [{ kind: 'radio', level: 0.4 }], outdoor: 0.3 },
  ],
  areas: AREAS,
  cables,
  ambientSources: [
    { kind: 'generator', position: [-30, 1, 18.2] },
    { kind: 'generator', position: [30, 1, -60] },
    { kind: 'hum', position: [57, 1.5, 30] },
    { kind: 'hum', position: [46, 1.5, -50] },
    { kind: 'hum', position: [62, 1.5, -46] },
    { kind: 'hum', position: [62, 1.5, -38] },
    { kind: 'radio', position: [-20, 1.2, -38.6] },
    { kind: 'radio', position: [-8.5, 1.2, 38.5] },
    { kind: 'fire', position: [-6.2, 0.9, 36.2] },
  ],
  smoke: [[-6.2, 1.0, 36.2], [-30.9, 2.3, 18.5], [30.3, 2.3, -60.9]],
  roads: ROADS,
  flatArea: [-72, -74, 74, 52],
  channels: [
    [-150, -34, -96, -18, 8, 1.7],
    [-96, -18, -70, -9, 7, 1.6],
    [-70, -9, -57, -8, 5, 1.1],
    [73, -16, 112, -26, 7, 0], // track down to the utility tunnel
  ],
  extraction: { position: [-48, 0, -54], radius: 5 },
  // the two watchtowers' ladders (same placement as their tower() calls)
  ladders: [towerLadder(14, 62, 6, 0), towerLadder(54, -60, 7, Math.PI)],
  // health packs: barracks, warehouse, command building, motor pool, main gate, maintenance, security compound, landing pad
  healthPacks: [[37, 30.5], [40, -12], [-24, -30], [-36, 22], [-9, 40], [66, -14], [32, -40], [-44, -50]],
  bounds: [-120, -80, 120, 135],
}
