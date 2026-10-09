import type { Vector3Tuple } from 'three'

interface Base {
  id: string
  label: string
  /** Secondary objectives run in parallel with the primaries, never block the mission and only affect the results. */
  optional?: boolean
}

/**
 * Objective kinds. Primaries complete strictly in order; optionals are all active from the start.
 * reach = ReachLocation, enter = reach an area by any route, interact = Interact, hack = HackTerminal,
 * collect = CollectIntel / items, disable = DisableSystem, destroy = DestroyObject, eliminate = EliminateTarget,
 * avoid = keep something from happening (fails on the event, completes at mission end), extract = Extract.
 */
export type ObjectiveDef =
  | (Base & { kind: 'reach'; position: Vector3Tuple; radius: number })
  /** Enter a rectangular area by any route: [minX, minZ, maxX, maxZ]. */
  | (Base & { kind: 'enter'; rect: [number, number, number, number]; marker?: Vector3Tuple })
  | (Base & { kind: 'eliminate'; targetId: string })
  | (Base & { kind: 'collect'; itemId: string })
  | (Base & { kind: 'interact'; interactId: string })
  | (Base & { kind: 'hack'; interactId: string; duration: number })
  | (Base & { kind: 'disable'; interactId: string; duration: number })
  | (Base & { kind: 'destroy'; targets: string[] })
  | (Base & { kind: 'avoid'; event: 'alarm' })
  | (Base & { kind: 'extract'; position: Vector3Tuple; radius: number })

export interface Approach {
  name: string
  text: string
  /** Suggested route for the briefing map: [x, z] points. */
  path?: [number, number][]
}

export interface MissionDef {
  id: string
  name: string
  /** Short paragraph used on menus. */
  briefing: string
  /** Full briefing sections (optional for test missions). */
  situation?: string
  intel?: string[]
  approaches?: Approach[]
  objectives: ObjectiveDef[]
  /** Seconds the player must hold the LZ once extraction is called. */
  extractionTime?: number
}

/** Gameplay events the objective manager listens to. */
export type MissionEvent =
  | { type: 'position'; x: number; z: number }
  | { type: 'killed'; entityId: string }
  | { type: 'collected'; itemId: string }
  | { type: 'interacted'; interactId: string }
  | { type: 'destroyed'; targetId: string }
  | { type: 'alarm' }
  | { type: 'extracted' }
