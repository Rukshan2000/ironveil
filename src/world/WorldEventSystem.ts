import type { GameSession } from '../game/GameSession'

export interface WorldEventDef {
  id: string
  /** Condition polled a few times a second. */
  when: (s: GameSession) => boolean
  run: (s: GameSession) => void
  /** Re-arm after this many seconds (default: fire once). */
  repeat?: number
}

const POLL = 0.25

/**
 * WorldEventSystem: data-driven scripted beats (vehicles arriving, shift changes, radio announcements, door lockdowns).
 * Missions supply the list; this only evaluates conditions and fires each event once (or on its repeat interval).
 */
export class WorldEventSystem {
  readonly fired = new Set<string>()
  private rearm = new Map<string, number>()
  private timer = 0

  constructor(private readonly s: GameSession, private readonly events: WorldEventDef[]) {}

  update(dt: number) {
    if ((this.timer -= dt) > 0) return
    this.timer = POLL
    const s = this.s
    for (const e of this.events) {
      const at = this.rearm.get(e.id)
      if (this.fired.has(e.id) && (at === undefined || s.time < at)) continue
      if (!e.when(s)) continue
      this.fired.add(e.id)
      if (e.repeat) this.rearm.set(e.id, s.time + e.repeat)
      e.run(s)
    }
  }
}
