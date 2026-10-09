import type { GuardKind } from '../ai/guardBrain'
import type { ComputerDef } from './computers'
import type { Vector3Tuple } from 'three'

export type MaterialKey =
  | 'ground' | 'dirt' | 'asphalt' | 'concrete' | 'concreteDark' | 'plaster' | 'blocks' | 'roof' | 'corrugated'
  | 'wood' | 'crate' | 'container' | 'metal' | 'paintedMetal' | 'rust' | 'fence' | 'glass' | 'sandbag' | 'canvas'
  | 'rock' | 'rubber' | 'foliage' | 'invisible'

/** Surface category for footsteps, bullet impacts and penetration. */
export type Surface = 'concrete' | 'metal' | 'wood' | 'dirt' | 'grass' | 'asphalt' | 'glass' | 'vehicle' | 'fabric' | 'foliage' | 'flesh'

/**
 * A box (or vertical cylinder) of world geometry. Rendered into merged, chunked static meshes and given a static collider.
 * Rotation is Euler YXZ: `yaw` (around Y), then `rx`, then `rz`.
 */
export interface BoxDef {
  /** Centre position. */
  p: Vector3Tuple
  /** Full size (w, h, d). For cylinders the diameter is s[0]. */
  s: Vector3Tuple
  mat: MaterialKey
  color?: number
  yaw?: number
  rx?: number
  rz?: number
  shape?: 'box' | 'cyl'
  collide?: boolean
  /** Defaults to true for everything but flat decals/roads. */
  castShadow?: boolean
  /** Collides and blocks sight/bullets like its material, but isn't drawn: a detailed prop model draws it (see PropDef). */
  hidden?: boolean
}

export interface LampDef {
  position: Vector3Tuple
  /** Lit radius on the ground used by the stealth system. */
  radius: number
  /** Whether to spawn a real (dynamic) light. Keep these few. */
  realLight?: boolean
  /** Wall-mounted security light: points along this yaw instead of straight down. */
  yaw?: number
  /** Draw a post under the lamp head. */
  post?: boolean
  /** Tall floodlight mast with several heads (big lit radius). */
  tower?: boolean
}

export interface GuardSpawn {
  id: string
  patrol: Vector3Tuple[]
  /** For single-point guards: direction to face. */
  faceTowards?: [number, number]
  waitTime?: number
  visionRange?: number
  /** Officers carry the keycard. */
  carries?: string
  /** Squad membership (SquadSystem). */
  squad?: string
  leader?: boolean
  /** Soldier type (default rifleman). */
  kind?: GuardKind
}

export interface ReinforcementSource {
  id: string
  /** Spoken in radio traffic, e.g. "the barracks". */
  label: string
  position: Vector3Tuple
  /** Troops arrive by truck along this vehicle route instead of on foot. */
  convoy?: { vehicle: string; route: string }
}

export interface ReinforcementSquadDef {
  id: string
  source: string
  /** Alert level at which this squad may be dispatched. */
  minLevel: number
  guards: GuardSpawn[]
}

export interface AudioZoneDef {
  id: string
  rect: [number, number, number, number]
  loops: { kind: 'hum' | 'generator' | 'radio'; level: number }[]
  /** How much of the outdoor wind/insect bed survives inside (0..1). */
  outdoor: number
}

export interface AreaDef {
  /** Spoken name, e.g. "the warehouse". */
  label: string
  rect: [number, number, number, number]
}

export interface InteractableDef {
  id: string
  position: Vector3Tuple
  /** Verb shown in the prompt, e.g. "hack terminal". */
  label: string
}

export interface DoorDef {
  id: string
  /** Hinge position (floor level). */
  hinge: Vector3Tuple
  /** Yaw of the closed door leaf, which extends along local +X from the hinge. */
  yaw: number
  width: number
  height: number
  /** Opening direction: +1 or -1 (swing sign). */
  swing: 1 | -1
  /** Keycard id needed to open it. */
  lockedBy?: string
  /** Seconds of hold-E to bypass the lock electronically (quiet). */
  hackTime?: number
  /** Seconds of hold-E to force it (cut, pry) — makes noise. */
  forceTime?: number
  /** Locks again (keycards rejected) when the facility goes to full lockdown. */
  lockdown?: boolean
  /** Shown in prompts. */
  label?: string
  mat?: MaterialKey
}

export interface PickupDef {
  id: string
  position: Vector3Tuple
  label: string
}

export interface CameraDef {
  id: string
  position: Vector3Tuple
  /** Centre of the sweep. */
  yaw: number
  sweep: number
  pitch: number
  range: number
}

export interface SearchlightDef {
  id: string
  position: Vector3Tuple
  /** Centre yaw and half-angle of the sweep. */
  yaw: number
  sweep: number
  /** Ground distance the beam is aimed at. */
  reach: number
  /** Guard who operates it; the light dies with him. */
  operator?: string
}

export interface AlarmPanelDef {
  id: string
  position: Vector3Tuple
  yaw: number
}

export interface ZoneDef {
  id: string
  label: string
  /** [minX, minZ, maxX, maxZ] */
  rect: [number, number, number, number]
}

export interface VehicleSpawn {
  /** Stable id for scripted events (defaults to def-index). */
  id?: string
  def: string
  position: Vector3Tuple
  yaw: number
}

/** Interior volume (inner bounds of a building) — darkens ambient light and marks the player as indoors. */
export interface InteriorDef {
  min: Vector3Tuple
  max: Vector3Tuple
}

export interface CableDef {
  from: Vector3Tuple
  to: Vector3Tuple
  sag: number
}

export interface AmbientSourceDef {
  kind: 'hum' | 'generator' | 'radio' | 'fire'
  position: Vector3Tuple
}

export interface LevelLayout {
  playerStart: Vector3Tuple
  playerYaw: number
  boxes: BoxDef[]
  lamps: LampDef[]
  guards: GuardSpawn[]
  /** Reaction forces dispatched by the ReinforcementManager as the alert level rises. */
  reinforcements: { sources: ReinforcementSource[]; squads: ReinforcementSquadDef[]; maxActive: number; cooldown: number }
  interactables: InteractableDef[]
  /** Workstations and server-rack faces (visual props; hackable ones link to an interactable). */
  computers?: ComputerDef[]
  pickups: PickupDef[]
  doors: DoorDef[]
  cameras: CameraDef[]
  searchlights: SearchlightDef[]
  alarmPanels: AlarmPanelDef[]
  restrictedZones: ZoneDef[]
  interiors: InteriorDef[]
  vehicles: VehicleSpawn[]
  /** Detailed parked-vehicle models drawn over their hidden collision boxes. Ground is y = 0. */
  props: PropDef[]
  /** Named waypoint routes for AI-driven vehicles. */
  vehicleRoutes: Record<string, Vector3Tuple[]>
  audioZones: AudioZoneDef[]
  /** Named areas used in radio reports ("movement near the warehouse"). */
  areas: AreaDef[]
  cables: CableDef[]
  ambientSources: AmbientSourceDef[]
  /** Smoke emitters (burn barrels, exhausts). */
  smoke: Vector3Tuple[]
  /** Flat road rectangles [minX, minZ, maxX, maxZ] (asphalt footsteps, terrain flattening). */
  roads: [number, number, number, number][]
  /** Area kept flat for the base; terrain rises outside it. [minX, minZ, maxX, maxZ] */
  flatArea: [number, number, number, number]
  /** Extra flattened/lowered channels: [x1, z1, x2, z2, width, depth]. Depth > 0 digs a ditch. */
  channels: [number, number, number, number, number, number][]
  /** Visual marker for the extraction zone. */
  extraction: { position: Vector3Tuple; radius: number }
  /** Bounds used by the minimap and nav grid: [minX, minZ, maxX, maxZ]. */
  bounds: [number, number, number, number]
}

/** A parked vehicle model (non-drivable scenery). Position is x, z; front faces local -Z. */
export interface PropDef {
  model: 'truck' | 'truck-open' | 'forklift'
  position: [number, number]
  yaw: number
}
