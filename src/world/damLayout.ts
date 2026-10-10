import type { GuardKind } from '../ai/guardBrain'
import {
  barrel, barrelGroup, building, bush, container, crateStack, electricalBox, fence, fuelTank, generator, jersey, pallet,
  pipeRun, radioMast, roadLine, sandbags, tower, towerLadder, transformer, truck, utilityPole,
} from './builders'
import type { AreaDef, BoxDef, CableDef, GuardSpawn, InteriorDef, LampDef, LevelLayout, ReinforcementSquadDef } from './types'

/*
 * Tessaly Dam (x east, z south; the player comes up the valley from the south).
 *
 *   RESERVOIR (z < -58, scenery)  |  DAM WALL (z -58..-50, crest at y 14: two snipers + searchlights)
 *   EAST WORKS (fenced, x 10..66): control house (sluice controller) at the dam's foot, generator shed, switchyard,
 *     barracks, motor pool, road gate (south)
 *   RIVER (from the spillway, south down the valley)  →  WEST BANK: engineer's hut (ledger), jetty (extraction by boat)
 *
 * Routes in: up the river channel and through the broken fence where it meets the water (quiet, wet), the road gate
 * (watched), or over the footbridge to the west bank and across.
 */

/** River course, upstream (spillway) first. Shared by the channels, the water surface and the boats. */
export const RIVER: [number, number][] = [[0, -44], [2, -20], [-6, 10], [-14, 40], [-12, 80], [-4, 130], [2, 175], [4, 215]]
const WATER_Y = -1.25
const DAM = { z1: -58, z2: -50, h: 14 }

const interiors: InteriorDef[] = []
const bld = (r: { boxes: BoxDef[]; interior: InteriorDef }) => {
  interiors.push(r.interior)
  return r.boxes
}

// ---- the dam -----------------------------------------------------------------------------------
const dam: BoxDef[] = [
  { p: [0, DAM.h / 2, (DAM.z1 + DAM.z2) / 2], s: [260, DAM.h, DAM.z2 - DAM.z1], mat: 'concrete', color: 0x9a988c },
  // crest parapets and the road along the top
  { p: [0, DAM.h + 0.55, DAM.z2 + 0.15], s: [260, 1.1, 0.3], mat: 'concreteDark' },
  { p: [0, DAM.h + 0.55, DAM.z1 - 0.15], s: [260, 1.1, 0.3], mat: 'concreteDark' },
  { p: [0, DAM.h + 0.02, (DAM.z1 + DAM.z2) / 2], s: [260, 0.04, 3], mat: 'asphalt', collide: false, castShadow: false },
  // sluice gates between the piers, and the spillway apron below them
  ...[-15, -5, 5, 15].map((x): BoxDef => ({ p: [x, 5, DAM.z2 + 0.15], s: [8, 7, 0.3], mat: 'rust', color: 0x4a3c30 })),
  ...[-20, -10, 0, 10, 20].map((x): BoxDef => ({ p: [x, DAM.h / 2, DAM.z2 + 0.8], s: [1.4, DAM.h, 1.6], mat: 'concreteDark' })),
  { p: [0, 0.05, -47], s: [36, 0.1, 6], mat: 'concreteDark', collide: false, castShadow: false },
  // gate-hoist housings on the crest
  ...[-15, 15].map((x): BoxDef => ({ p: [x, DAM.h + 1.5, -54], s: [5, 3, 4], mat: 'paintedMetal', color: 0x5a6050 })),
  ...radioMast(46, -54, 10).map((b): BoxDef => ({ ...b, p: [b.p[0], b.p[1] + DAM.h, b.p[2]] })),
]

// ---- east works: fence, road gate ------------------------------------------------------------------
const FX1 = 10, FX2 = 66, FZ1 = -48, FZ2 = 36
const perimeter: BoxDef[] = [
  ...fence(FX1, FZ2, 25.4, FZ2), ...fence(34.6, FZ2, FX2, FZ2),
  ...fence(FX2, FZ1, FX2, FZ2), ...fence(FX1, FZ1, FX2, FZ1),
  ...fence(FX1, FZ1, FX1, -12), ...fence(FX1, -8, FX1, FZ2), // broken where it meets the river, z = -10
  { p: [FX1 - 0.4, 0.5, -10.4], s: [0.04, 1.0, 1.4], mat: 'fence', yaw: 0.9, rz: 0.5, collide: false },
  { p: [25.4, 1.8, FZ2], s: [0.7, 3.6, 0.7], mat: 'concrete' },
  { p: [34.6, 1.8, FZ2], s: [0.7, 3.6, 0.7], mat: 'concrete' },
  { p: [30, 1.05, FZ2 - 0.6], s: [0.1, 8.4, 0.1], mat: 'paintedMetal', shape: 'cyl', rz: Math.PI / 2, color: 0xc8b030, collide: false },
  ...bld(building(38.5, 39.5, 3.4, 3.4, 2.7, { doors: { w: [0] }, windows: { s: [0], n: [0] }, color: 0x8a8a74 })), // gate hut
  ...sandbags(22, 40, 0, 3.6), ...jersey(28, 48, 0.1), ...jersey(32, 56, -0.1),
  ...barrel(41, 42, 0x4a3a28), // burn barrel
]

// ---- roads ---------------------------------------------------------------------------------------
const ROADS: [number, number, number, number][] = [
  [26, 36, 34, 210], // valley road
  [26, -40, 34, 36], // through the works
  [12, 4, 60, 10], // cross road
]
const roadBoxes: BoxDef[] = [
  ...ROADS.map(([x1, z1, x2, z2]): BoxDef => ({ p: [(x1 + x2) / 2, 0.02, (z1 + z2) / 2], s: [x2 - x1, 0.04, z2 - z1], mat: 'asphalt', collide: false, castShadow: false })),
  ...roadLine(30, 205, 30, 38), ...roadLine(30, 34, 30, -38),
]

// ---- control house (sluice controller) at the dam's foot ----------------------------------------------------
const control: BoxDef[] = [
  ...bld(building(40, -42, 12, 8, 4.2, { doors: { s: [-3], w: [1] }, windows: { s: [2], e: [0] }, color: 0x8e9078, parapet: true })),
  { p: [40, 0.45, -44.9], s: [3.2, 0.9, 0.8], mat: 'metal', color: 0x3a3f44 }, // gate-controller console
  { p: [44.6, 1.0, -44.6], s: [0.9, 2.0, 0.7], mat: 'metal', color: 0x2e3230 }, // relay cabinets
  { p: [44.6, 1.0, -43.6], s: [0.9, 2.0, 0.7], mat: 'metal', color: 0x2e3230 },
  { p: [35.4, 0.4, -40], s: [0.8, 0.8, 1.8], mat: 'wood', color: 0x5a5040 }, // logbook desk
  // penstock pipes from the dam into the powerhouse wall
  ...pipeRun(52, -49, 0, 12, 1.4, 2),
  ...electricalBox(46.2, -38, -Math.PI / 2),
]

// ---- switchyard + backup generator shed ------------------------------------------------------------------
const power: BoxDef[] = [
  ...transformer(56, -40), ...transformer(61, -40), ...transformer(56, -32),
  ...bld(building(58, -20, 8, 6, 3.4, { doors: { w: [0] }, windows: { n: [0] }, color: 0x7a7c68, mat: 'blocks' })),
  ...generator(60, -20, Math.PI / 2),
  ...fuelTank(64, -12, 0.05, 4, 1.8),
  ...utilityPole(52, -28), ...utilityPole(52, -12),
  ...barrelGroup(55, -14, 3, 0x6a3022),
]

// ---- barracks + motor pool -------------------------------------------------------------------------------
const barracks: BoxDef[] = [
  ...bld(building(48, 22, 22, 9, 3.6, { doors: { s: [0], w: [0] }, windows: { s: [-7, 7], n: [-5, 5] }, color: 0x7e8066, roofMat: 'roof' })),
  ...sandbags(48, 30, 0, 4.8, 2), ...crateStack(60, 30, 1),
  ...truck(18, 24, Math.PI / 2, 0x4c5434),
  ...container(18, 14, Math.PI / 2, 0x5c6b2f), ...container(20.6, 14, Math.PI / 2, 0x2f5a6b),
  ...crateStack(22, -4, 2), ...crateStack(23.3, -4.2, 1), ...pallet(18, -16, 0.2, 3),
  ...barrelGroup(16, 30, 4),
  ...jersey(36, -6, Math.PI / 2), ...jersey(24, -24, 0.2),
  ...crateStack(38, -28, 2), ...crateStack(18, -36, 1),
]

// ---- west bank: engineer's hut, footbridge, jetty -----------------------------------------------------------
const westBank: BoxDef[] = [
  ...bld(building(-34, -24, 8, 6, 3, { doors: { e: [0] }, windows: { s: [0], n: [0] }, color: 0x8a7a64, mat: 'blocks' })),
  { p: [-36.6, 0.4, -24], s: [0.8, 0.8, 1.8], mat: 'wood', color: 0x5a4a38 }, // desk (the ledger)
  { p: [-32, 0.9, -26.4], s: [1.4, 1.8, 0.5], mat: 'metal', color: 0x5a6050 }, // shelving
  ...utilityPole(-28, -30),
  // footbridge over the river at z = 2
  { p: [-4, 0.25, 2], s: [24, 0.2, 2.4], mat: 'wood', color: 0x6a5a44 },
  ...[-1.1, 1.1].map((dz): BoxDef => ({ p: [-4, 1.0, 2 + dz], s: [24, 0.06, 0.06], mat: 'metal', collide: false })),
  ...[-12, -6, 0, 6].flatMap((x) => [-1.1, 1.1].map((dz): BoxDef => ({ p: [x, -0.6, 2 + dz], s: [0.25, 2.2, 0.25], mat: 'wood', color: 0x4a3a2a, collide: false }))),
  // jetty on the west bank at z = 30
  { p: [-18, 0.15, 30], s: [10, 0.2, 3], mat: 'wood', color: 0x6a5a44 },
  ...[-22, -18, -14].flatMap((x) => [28.6, 31.4].map((z): BoxDef => ({ p: [x, -0.8, z], s: [0.3, 2.2, 0.3], mat: 'wood', color: 0x4a3a2a, collide: false }))),
  ...crateStack(-24, 33, 1), ...barrel(-21, 33.2, 0x45502e),
]

// ---- towers ------------------------------------------------------------------------------------------
const towers: BoxDef[] = [...tower(62, 32, 6, Math.PI), ...tower(14, -42, 6, 0)]

// ---- cover: rocks and reeds along the river ----------------------------------------------------------
const cover: BoxDef[] = [
  ...[[6, 60], [-18, 64], [12, 98], [-12, 112], [8, 150], [-14, 160], [-26, 18], [-24, -4], [10, 24], [12, -28]]
    .map(([x, z], i): BoxDef => ({ p: [x, 0.7, z], s: [2.6 + (i % 3) * 0.6, 1.5, 2.2], mat: 'rock', yaw: i * 0.7, rx: 0.08 })),
  ...[[-8, 50], [-20, 46], [-4, 70], [-20, 84], [2, 96], [-10, 104], [6, 120], [-12, 140], [-30, 10], [8, 40], [-8, -30], [-22, -14]]
    .flatMap(([x, z], i) => bush(x, z, 1.6 + (i % 3) * 0.5)),
]

// ---- utilities ---------------------------------------------------------------------------------------
const POLE_Z = [34, 16, -2, -20]
const poles: BoxDef[] = POLE_Z.flatMap((z) => utilityPole(36.5, z))
const cables: CableDef[] = POLE_Z.slice(1).flatMap((z, i) => [-0.9, 0, 0.9].map((dx): CableDef => ({ from: [36.5 + dx, 7.55, POLE_Z[i]], to: [36.5 + dx, 7.55, z], sag: 0.5 })))
cables.push({ from: [52, 7.55, -28], to: [52, 7.55, -12], sag: 0.6 }, { from: [52, 7.55, -28], to: [46, 4.3, -42], sag: 0.9 })

/** Reaction squad of `n` pooled guards, sent once when the security level first reaches `level`. */
function qrf(id: string, source: string, level: number, kinds: GuardKind[]): ReinforcementSquadDef {
  const guards: GuardSpawn[] = kinds.map((kind, i) => ({ id: `${id}-${i + 1}`, patrol: [[0, 0, 0]], squad: id, leader: i === 0, kind, tier: level }))
  return { id, source, minLevel: level, guards }
}

const AREAS: AreaDef[] = [
  { label: 'the dam crest', rect: [-130, -58, 130, -50] },
  { label: 'the control house', rect: [33, -47, 47, -37] },
  { label: 'the switchyard', rect: [50, -46, 66, -28] },
  { label: 'the generator shed', rect: [52, -26, 66, -14] },
  { label: 'the barracks', rect: [36, 14, 60, 32] },
  { label: 'the motor pool', rect: [10, 10, 26, 36] },
  { label: 'the road gate', rect: [16, 32, 44, 60] },
  { label: 'the river', rect: [-22, -50, 10, 210] },
  { label: 'the engineer\'s hut', rect: [-42, -30, -26, -18] },
  { label: 'the jetty', rect: [-28, 24, -10, 36] },
  { label: 'the west bank', rect: [-100, -50, -18, 140] },
  { label: 'the valley road', rect: [20, 60, 44, 210] },
]

// world boundary (the dam closes the north)
const B = 200
const boundary: BoxDef[] = [
  { p: [0, 20, DAM.z1 - 1], s: [2 * B, 60, 1], mat: 'invisible' },
  { p: [0, 20, B], s: [2 * B, 60, 1], mat: 'invisible' },
  { p: [-B, 20, 0], s: [1, 60, 2 * B], mat: 'invisible' },
  { p: [B, 20, 0], s: [1, 60, 2 * B], mat: 'invisible' },
]

const BOXES: BoxDef[] = [
  ...dam, ...perimeter, ...roadBoxes, ...control, ...power, ...barracks, ...westBank, ...towers, ...cover, ...poles, ...boundary,
]

// crest lamps every 16 m along the dam
const crestLamps: LampDef[] = [-56, -40, -24, -8, 8, 24, 40, 56].map((x) => ({ position: [x, DAM.h + 4, DAM.z2 + 0.4], radius: 9, post: true }))

export const damLayout: LevelLayout = {
  playerStart: [10, 0.2, 128], // east bank, where the boat drops WREN
  playerYaw: 0,
  boxes: BOXES,
  lamps: [
    ...crestLamps,
    { position: [25, 6.5, 37], radius: 11, realLight: true, post: true }, // road gate
    { position: [40, 6, -36], radius: 10, realLight: true, post: true }, // control house yard
    { position: [40, 3.9, -42], radius: 5, realLight: true }, // control room
    { position: [58, 3.1, -20], radius: 3 }, // generator shed
    { position: [58, 6, -34], radius: 9, post: true }, // switchyard
    { position: [48, 3.3, 26.6], radius: 7, yaw: 0 }, // barracks door
    { position: [22, 6, 20], radius: 9, post: true }, // motor pool
    { position: [30, 6, -12], radius: 9, post: true },
    { position: [30, 6, 8], radius: 9, realLight: true, post: true },
    { position: [-30, 3.3, -20.8], radius: 6, yaw: Math.PI / 2 }, // engineer's hut
    { position: [-14, 4, 31.5], radius: 6, post: true }, // jetty
    { position: [-34, 2.8, -24], radius: 4 },
    { position: [62, 12, 10], radius: 18, tower: true },
    { position: [14, 12, 10], radius: 16, tower: true },
  ],
  guards: [
    // dam crest: two marksmen on the lights
    { id: 'crest-west', patrol: [[-24, DAM.h + 0.13, -53]], faceTowards: [-10, 30], visionRange: 55, squad: 'crest', kind: 'sniper' },
    { id: 'crest-east', patrol: [[24, DAM.h + 0.13, -53]], faceTowards: [20, 30], visionRange: 55, squad: 'crest', kind: 'sniper', leader: true },
    // road gate
    { id: 'gate-post', patrol: [[26, 0, 40]], faceTowards: [30, 90], squad: 'gate', leader: true },
    { id: 'gate-patrol', patrol: [[34, 0, 44], [34, 0, 70], [44, 0, 44]], waitTime: 5, squad: 'gate', kind: 'rusher' },
    { id: 'tower-se', patrol: [[62, 6.13, 32]], faceTowards: [40, 70], visionRange: 50, squad: 'gate', kind: 'sniper' },
    // works yard
    { id: 'yard', patrol: [[30, 0, 30], [30, 0, -36], [20, 0, -30], [20, 0, 6]], waitTime: 3, squad: 'works', leader: true },
    { id: 'motor', patrol: [[14, 0, 30], [22, 0, 6], [14, 0, -20]], waitTime: 4, squad: 'works', kind: 'rusher' },
    { id: 'barracks', patrol: [[48, 0, 32]], faceTowards: [30, 40], squad: 'works', kind: 'heavy' },
    // control house + switchyard
    { id: 'sluice-tech', patrol: [[38, 0, -44], [42, 0, -40], [36, 0, -40]], waitTime: 6, squad: 'control' },
    { id: 'control-door', patrol: [[37, 0, -36]], faceTowards: [30, -20], squad: 'control', kind: 'heavy', leader: true },
    { id: 'tower-river', patrol: [[14, 6.13, -42]], faceTowards: [0, -10], visionRange: 45, squad: 'control', kind: 'sniper' },
    { id: 'power-lead', patrol: [[54, 0, -24], [62, 0, -28], [54, 0, -44], [50, 0, -14]], waitTime: 4, squad: 'power', leader: true },
    // west bank
    { id: 'engineer', patrol: [[-32, 0, -24], [-34, 0, -22.6]], waitTime: 8, squad: 'west' },
    { id: 'bank-patrol', patrol: [[-24, 0, -16], [-26, 0, 22], [-20, 0, 36], [-28, 0, -8]], waitTime: 4, squad: 'west', leader: true },
  ],
  reinforcements: {
    sources: [
      { id: 'barracks', label: 'the barracks', position: [48, 0, 28] },
      { id: 'control', label: 'the control house', position: [36, 0, -36] },
      { id: 'convoy', label: 'the valley road', position: [30, 0, 30], convoy: { vehicle: 'convoy-truck', route: 'convoy' } },
    ],
    squads: [
      qrf('level-1', 'barracks', 1, ['rifleman', 'rusher']),
      qrf('level-2', 'barracks', 2, ['rifleman', 'rusher', 'heavy']),
      qrf('level-3', 'convoy', 3, ['rifleman', 'heavy', 'rifleman', 'rusher']),
      qrf('level-4', 'control', 4, ['rifleman', 'heavy', 'rusher', 'rusher', 'rifleman']),
    ],
  },
  interactables: [
    { id: 'gate-controller', position: [40, 1, -44.3], label: 'override sluice program' },
    { id: 'backup-generator', position: [57.6, 1, -20], label: 'sabotage backup generator' },
  ],
  computers: [
    { kind: 'workstation', position: [40, 0.9, -45], yaw: 0, id: 'gate-controller', title: 'SLUICE CONTROL // GATES 1-4' },
    { kind: 'workstation', position: [38.6, 0.9, -45], yaw: 0, title: 'RESERVOIR LEVEL' },
    { kind: 'workstation', position: [41.4, 0.9, -45], yaw: 0, title: 'SPILLWAY CAMS' },
  ],
  pickups: [{ id: 'eng-ledger', position: [-36.6, 0.85, -24], label: 'engineer\'s radio ledger' }],
  doors: [
    { id: 'control-south', label: 'Control house', hinge: [36.3, 0, -38.15], yaw: 0, width: 1.4, height: 2.3, swing: 1, lockdown: true, hackTime: 6, mat: 'paintedMetal' },
    { id: 'control-west', label: 'Control house', hinge: [34.15, 0, -40.3], yaw: Math.PI / 2, width: 1.4, height: 2.3, swing: -1, lockdown: true, hackTime: 6, mat: 'paintedMetal' },
    { id: 'shed-door', label: 'Generator shed', hinge: [54.15, 0, -19.3], yaw: Math.PI / 2, width: 1.4, height: 2.3, swing: 1, mat: 'paintedMetal' },
    { id: 'hut-door', hinge: [-30.15, 0, -23.3], yaw: Math.PI / 2, width: 1.4, height: 2.3, swing: -1, mat: 'wood' },
  ],
  cameras: [
    { id: 'cam-gate', position: [25, 2.9, 36.6], yaw: Math.PI, sweep: 0.6, pitch: -0.18, range: 26 },
    { id: 'cam-control', position: [46.2, 3.8, -37.6], yaw: 0.6, sweep: 0.7, pitch: -0.25, range: 24 },
    { id: 'cam-spillway', position: [9.6, 3.4, -47.6], yaw: Math.PI - 0.5, sweep: 0.6, pitch: -0.2, range: 30 },
    { id: 'cam-jetty', position: [-14, 3.8, 31.6], yaw: Math.PI / 2 + 0.4, sweep: 0.7, pitch: -0.22, range: 22 },
  ],
  searchlights: [
    { id: 'sl-crest-west', position: [-24, DAM.h + 1.8, DAM.z2 - 0.4], yaw: Math.PI - 0.25, sweep: 0.6, reach: 40, operator: 'crest-west' },
    { id: 'sl-crest-east', position: [24, DAM.h + 1.8, DAM.z2 - 0.4], yaw: Math.PI + 0.25, sweep: 0.6, reach: 40, operator: 'crest-east' },
  ],
  alarmPanels: [
    { id: 'panel-gate', position: [36.75, 1.4, 39.5], yaw: Math.PI / 2 },
    { id: 'panel-control', position: [45.7, 1.4, -42], yaw: -Math.PI / 2 },
    { id: 'panel-barracks', position: [44, 1.4, 17.65], yaw: 0 },
  ],
  restrictedZones: [
    { id: 'control', label: 'CONTROL HOUSE — RESTRICTED', rect: [34, -46, 46, -38] },
    { id: 'power', label: 'SWITCHYARD — RESTRICTED', rect: [50, -46, 66, -28] },
  ],
  interiors,
  props: [{ model: 'truck', position: [18, 24], yaw: Math.PI / 2 }],
  vehicles: [
    { def: 'jeep', position: [22, 1.2, 0], yaw: Math.PI },
    { id: 'convoy-truck', def: 'truck', position: [32, 1.4, 196], yaw: 0 },
  ],
  vehicleRoutes: {
    convoy: [[30, 0, 150], [30, 0, 90], [30, 0, 50], [30, 0, 36], [30, 0, 20]],
  },
  audioZones: [
    { id: 'control', rect: [34.3, -45.7, 45.7, -38.3], loops: [{ kind: 'hum', level: 0.9 }, { kind: 'radio', level: 0.6 }], outdoor: 0.15 },
    { id: 'shed', rect: [54.3, -22.7, 61.7, -17.3], loops: [{ kind: 'generator', level: 0.9 }], outdoor: 0.2 },
    { id: 'barracks', rect: [37.3, 17.8, 58.7, 26.2], loops: [{ kind: 'radio', level: 0.4 }], outdoor: 0.3 },
    { id: 'hut', rect: [-37.7, -26.7, -30.3, -21.3], loops: [{ kind: 'radio', level: 0.5 }], outdoor: 0.3 },
  ],
  areas: AREAS,
  cables,
  ambientSources: [
    { kind: 'generator', position: [60, 1, -20] },
    { kind: 'hum', position: [56, 1.5, -40] },
    { kind: 'hum', position: [61, 1.5, -40] },
    { kind: 'hum', position: [40, 1.5, -44] },
    { kind: 'radio', position: [-36, 1.2, -24] },
    { kind: 'radio', position: [38.5, 1.2, 39.5] },
    { kind: 'fire', position: [41, 0.9, 42] },
  ],
  smoke: [[41, 1.0, 42]],
  roads: ROADS,
  flatArea: [-70, -50, 74, 52],
  channels: RIVER.slice(1).map(([x, z], i): [number, number, number, number, number, number] => [RIVER[i][0], RIVER[i][1], x, z, 13, 2.4]),
  water: { y: WATER_Y, river: RIVER, reservoir: { y: DAM.h - 2.5, z: DAM.z1 } },
  extraction: { position: [-20, 0, 30], radius: 5 },
  ladders: [towerLadder(62, 32, 6, Math.PI), towerLadder(14, -42, 6, 0)],
  healthPacks: [[48, 22], [40, -40], [58, -20], [-34, -24], [38.5, 39.5], [18, 4], [-22, 32]],
  bounds: [-100, -50, 100, 140],
}
