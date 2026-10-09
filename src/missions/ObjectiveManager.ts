import type { Vector3Tuple } from 'three'
import type { MissionDef, MissionEvent, ObjectiveDef } from './types'

export type ObjectiveStatus = 'pending' | 'active' | 'done' | 'failed'

/**
 * ObjectiveSystem: primaries complete strictly in order, optionals in any order. Pure logic — feed it events, read
 * its state. Hold-to-use progress (hacks, sabotage) and destroy counts live in `progress`.
 */
export class ObjectiveManager {
  readonly status: Record<string, ObjectiveStatus> = {}
  /** 0..1 hold progress for hack/disable, destroyed-target ids for destroy. */
  readonly progress: Record<string, number> = {}
  readonly destroyed = new Set<string>()
  onCompleted?: (o: ObjectiveDef) => void
  onFailed?: (o: ObjectiveDef) => void

  constructor(readonly mission: MissionDef) {
    for (const o of mission.objectives) {
      this.status[o.id] = 'pending'
      this.progress[o.id] = 0
    }
    this.refresh()
  }

  get primaries() {
    return this.mission.objectives.filter((o) => !o.optional)
  }

  get optionals() {
    return this.mission.objectives.filter((o) => o.optional)
  }

  /** Current primary objective. */
  get current(): ObjectiveDef | null {
    return this.primaries.find((o) => this.status[o.id] !== 'done') ?? null
  }

  /** Number of primaries completed. */
  get index() {
    return this.primaries.filter((o) => this.status[o.id] === 'done').length
  }

  get complete() {
    return this.current === null
  }

  /** Everything the player can make progress on right now. */
  active(): ObjectiveDef[] {
    return this.mission.objectives.filter((o) => this.status[o.id] === 'active')
  }

  handle(e: MissionEvent) {
    if (e.type === 'destroyed') this.destroyed.add(e.targetId)
    for (const o of this.active()) {
      if (o.kind === 'avoid') {
        if (e.type === o.event) this.fail(o)
        continue
      }
      if (o.kind === 'destroy') this.progress[o.id] = o.targets.filter((t) => this.destroyed.has(t)).length
      if (matches(o, e, this)) this.finish(o)
    }
  }

  /** Mission over: "avoid" objectives that never failed are done. */
  finalize() {
    for (const o of this.active()) if (o.kind === 'avoid') this.finish(o)
  }

  /** Checkpoint restore. */
  restore(status: Record<string, ObjectiveStatus>, destroyed: string[]) {
    for (const id of Object.keys(status)) if (id in this.status) this.status[id] = status[id]
    for (const t of destroyed) this.destroyed.add(t)
    for (const o of this.mission.objectives) if (o.kind === 'destroy') this.progress[o.id] = o.targets.filter((t) => this.destroyed.has(t)).length
    this.refresh()
  }

  private finish(o: ObjectiveDef) {
    this.status[o.id] = 'done'
    this.refresh()
    this.onCompleted?.(o)
  }

  private fail(o: ObjectiveDef) {
    this.status[o.id] = 'failed'
    this.onFailed?.(o)
  }

  private refresh() {
    const cur = this.current
    for (const o of this.mission.objectives) {
      if (this.status[o.id] !== 'pending') continue
      if (o.optional || o === cur) this.status[o.id] = 'active'
    }
  }
}

function matches(o: ObjectiveDef, e: MissionEvent, m: ObjectiveManager): boolean {
  switch (o.kind) {
    case 'reach':
      return e.type === 'position' && Math.hypot(e.x - o.position[0], e.z - o.position[2]) <= o.radius
    case 'enter':
      return e.type === 'position' && e.x > o.rect[0] && e.x < o.rect[2] && e.z > o.rect[1] && e.z < o.rect[3]
    case 'eliminate':
      return e.type === 'killed' && e.entityId === o.targetId
    case 'collect':
      return e.type === 'collected' && e.itemId === o.itemId
    case 'interact':
    case 'hack':
    case 'disable':
      return e.type === 'interacted' && e.interactId === o.interactId
    case 'destroy':
      return m.progress[o.id] >= o.targets.length
    case 'extract':
      return e.type === 'extracted'
    case 'avoid':
      return false
  }
}

interface TargetSource {
  layout: { interactables: { id: string; position: Vector3Tuple }[] }
  pickups: { id: string; position: Vector3Tuple; taken: boolean }[]
}

/** World position of an objective (for markers, compass, tactical map), or null when it has none. */
export function objectivePosition(o: ObjectiveDef, s: TargetSource): Vector3Tuple | null {
  switch (o.kind) {
    case 'reach':
    case 'extract':
      return o.position
    case 'enter':
      return o.marker ?? [(o.rect[0] + o.rect[2]) / 2, 0, (o.rect[1] + o.rect[3]) / 2]
    case 'hack':
    case 'interact':
    case 'disable':
      return s.layout.interactables.find((i) => i.id === o.interactId)?.position ?? null
    case 'collect':
      return s.pickups.find((p) => p.id === o.itemId && !p.taken)?.position ?? null
    default:
      return null
  }
}

/** World position of the current primary objective. */
export function objectiveTarget(s: TargetSource & { objectives: ObjectiveManager }): Vector3Tuple | null {
  const o = s.objectives.current
  return o ? objectivePosition(o, s) : null
}
