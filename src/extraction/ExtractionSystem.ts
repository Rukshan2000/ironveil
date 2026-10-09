import { Vector3 } from 'three'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import type { GameSession } from '../game/GameSession'

/** Helicopter flight: approach from off-map, hover over the LZ, settle as the hold timer runs. */
const APPROACH_FROM = new Vector3(-170, 70, -170)
const APPROACH_TIME = 22
const HOVER_HEIGHT = 24

/**
 * ExtractionSystem: becomes available once every other primary is done. The player has to reach the LZ and hold it
 * while the helicopter comes in; leaving the zone bleeds the timer. When it completes the objective is verified and
 * the mission state machine freezes into SUCCESS.
 */
export class ExtractionSystem {
  available = false
  inZone = false
  /** Seconds held in the zone. */
  progress = 0
  readonly heliPos = APPROACH_FROM.clone()
  heliYaw = 0
  /** Seconds since extraction was called (drives the approach). */
  private since = 0
  private rotor: LoopHandle | null = null
  private done = false

  constructor(private readonly s: GameSession) {}

  get total() {
    return this.s.def.extractionTime ?? 10
  }

  get zone() {
    const o = this.s.objectives.current
    return o?.kind === 'extract' ? o : null
  }

  update(dt: number) {
    const s = this.s
    const z = this.zone
    const was = this.available
    this.available = !!z
    if (!z || this.done) return
    if (!was) {
      s.notify('EXTRACTION AVAILABLE — reach the landing zone', 'good')
      s.radio.say('handler', 'CANOPY', 'Uplink confirmed down. Bird is inbound to the north-west pad — get there and hold the LZ.')
    }
    this.since += dt
    const lz = new Vector3(z.position[0], 0, z.position[2])
    const p = s.player.feet
    this.inZone = s.player.active && Math.hypot(p.x - lz.x, p.z - lz.z) <= z.radius
    this.progress = this.inZone ? Math.min(this.total, this.progress + dt) : Math.max(0, this.progress - dt * 0.5)

    // helicopter: approach, then descend with the hold timer
    const k = Math.min(1, this.since / APPROACH_TIME)
    const ease = k * k * (3 - 2 * k)
    const hover = lz.clone().setY(HOVER_HEIGHT - (HOVER_HEIGHT - 3.2) * (this.progress / this.total))
    this.heliPos.lerpVectors(APPROACH_FROM, hover, ease)
    this.heliYaw = Math.atan2(APPROACH_FROM.x - lz.x, APPROACH_FROM.z - lz.z)
    this.rotor ??= audio.loop('rotor', this.heliPos, 1.4)
    this.rotor?.set('rate', 0.95)
    this.rotor?.move(this.heliPos)

    if (this.progress >= this.total && this.verify()) {
      this.done = true
      s.objectives.handle({ type: 'extracted' })
      s.radio.say('handler', 'CANOPY', 'WREN is aboard. Good work. Taking you home.')
    }
  }

  /** Every primary other than extraction must be complete. */
  private verify() {
    const o = this.s.objectives
    return o.primaries.every((x) => x.kind === 'extract' || o.status[x.id] === 'done')
  }

  dispose() {
    this.rotor?.stop()
  }
}
