export type MissionState =
  | 'BRIEFING' | 'INSERTION' | 'ACTIVE' | 'OBJECTIVE_COMPLETE' | 'ALERT' | 'LOCKDOWN' | 'EXTRACTION' | 'SUCCESS' | 'FAILED'

/** What the state machine needs to know each tick. */
export interface MissionContext {
  playerAlive: boolean
  alertLevel: number
  /** All primaries but extraction are done. */
  extractionAvailable: boolean
}

const INSERTION_TIME = 10
const OBJECTIVE_BANNER = 3.5

/**
 * MissionSystem: the mission's state machine. Lives in the session (plain TS), independent of React; the UI only reads
 * `state`. BRIEFING → INSERTION → ACTIVE ⇄ OBJECTIVE_COMPLETE / ALERT / LOCKDOWN → EXTRACTION → SUCCESS, or FAILED.
 */
export class MissionSystem {
  state: MissionState = 'BRIEFING'
  stateTime = 0
  readonly history: { state: MissionState; time: number }[] = [{ state: 'BRIEFING', time: 0 }]
  onEnter?: (state: MissionState, prev: MissionState) => void
  private time = 0

  get over() {
    return this.state === 'SUCCESS' || this.state === 'FAILED'
  }

  deploy() {
    if (this.state === 'BRIEFING') this.set('INSERTION')
  }

  /** A primary objective just completed (shows the banner state briefly). */
  objectiveCompleted() {
    if (!this.over && this.state !== 'BRIEFING') this.set('OBJECTIVE_COMPLETE')
  }

  succeed() {
    if (!this.over) this.set('SUCCESS')
  }

  update(dt: number, ctx: MissionContext) {
    this.time += dt
    this.stateTime += dt
    if (this.over || this.state === 'BRIEFING') return
    if (!ctx.playerAlive) return this.set('FAILED')
    if (this.state === 'INSERTION' && this.stateTime < INSERTION_TIME && ctx.alertLevel < 2) return
    if (this.state === 'OBJECTIVE_COMPLETE' && this.stateTime < OBJECTIVE_BANNER) return
    const next: MissionState = ctx.extractionAvailable ? 'EXTRACTION' : ctx.alertLevel >= 4 ? 'LOCKDOWN' : ctx.alertLevel >= 3 ? 'ALERT' : 'ACTIVE'
    if (next !== this.state) this.set(next)
  }

  /** Checkpoint restore: skip the briefing/insertion beats. */
  resume() {
    this.set('ACTIVE')
  }

  private set(state: MissionState) {
    const prev = this.state
    this.state = state
    this.stateTime = 0
    this.history.push({ state, time: this.time })
    this.onEnter?.(state, prev)
  }
}
