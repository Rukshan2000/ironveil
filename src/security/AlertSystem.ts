import { Vector3 } from 'three'
import { hostile } from '../ai/guardBrain'
import type { GameSession } from '../game/GameSession'

export type AlertLevel = 0 | 1 | 2 | 3 | 4

export const ALERT_LABELS: Record<AlertLevel, string> = {
  0: 'NORMAL',
  1: 'SUSPICIOUS ACTIVITY',
  2: 'LOCAL ALERT',
  3: 'FACILITY ALERT',
  4: 'FULL LOCKDOWN',
}

/** How long an observation keeps its level up after it stops (s). */
const HOLD: Record<number, number> = { 1: 18, 2: 45 }
/** Facility alert escalates to lockdown after this long with fighting still going on. */
const LOCKDOWN_AFTER = 70

/**
 * Pure level bookkeeping: levels 1–2 come from what guards/cameras observe and decay after a hold time;
 * 3 follows the base alarm; 4 is latched by an escalation and released with the alarm.
 */
export class AlertTracker {
  level: AlertLevel = 0
  maxLevel: AlertLevel = 0
  private seen: Record<number, number> = { 1: -1e9, 2: -1e9 }
  alarm = false
  lockdown = false

  observe(level: 1 | 2, time: number) {
    this.seen[level] = time
    if (level === 2) this.seen[1] = time
  }

  update(time: number): AlertLevel {
    let l: AlertLevel = 0
    if (time - this.seen[1] < HOLD[1]) l = 1
    if (time - this.seen[2] < HOLD[2]) l = 2
    if (this.alarm) l = 3
    if (this.alarm && this.lockdown) l = 4
    if (!this.alarm) this.lockdown = false
    this.level = l
    if (l > this.maxLevel) this.maxLevel = l
    return l
  }
}

/** Worst thing the facility ever learned about the player (mission results). */
export type DetectionRecord = 'none' | 'suspicious' | 'detected'

/**
 * AlertSystem: turns what guards, cameras and the alarm know into a facility security level (0–4) and makes the whole
 * base react to it — radio traffic, guard alertness, searchlight behaviour, door lockdown and reinforcement dispatch
 * (ReinforcementManager reads `level`).
 */
export class AlertSystem {
  readonly tracker = new AlertTracker()
  /** Facility's best information on the intruder's position, and when it was confirmed. */
  readonly lastKnown = new Vector3()
  lastKnownTime = -1e9
  /** The uplink is down: squads only have short-range radio. */
  commsDown = false
  detection: DetectionRecord = 'none'
  private timer = 0
  private alarmTime = 0
  private fightTime = 0
  onChange?: (level: AlertLevel, prev: AlertLevel) => void

  constructor(private readonly s: GameSession) {}

  get level() {
    return this.tracker.level
  }

  /** Someone confirmed the intruder at `at`. */
  report(at: Vector3) {
    this.lastKnown.copy(at)
    this.lastKnownTime = this.s.time
  }

  /** Escalate to lockdown now (scripted, e.g. sabotage during an alarm). */
  lockdown() {
    if (this.tracker.alarm) this.tracker.lockdown = true
  }

  update(dt: number) {
    if ((this.timer -= dt) > 0) return
    const step = 0.25 - this.timer
    this.timer = 0.25
    const s = this.s
    const t = s.time

    let fighting = false
    for (const g of s.guards) {
      if (!g.active) continue
      const st = g.data.state
      if (st === 'DEAD') continue
      if (hostile(st)) {
        fighting = true
        this.tracker.observe(2, t)
        if (g.data.lastKnown && g.data.memoryAge < 2) this.report(g.data.lastKnown)
      } else if (st === 'SEARCH') this.tracker.observe(2, t)
      else if (st === 'SUSPICIOUS' || st === 'INVESTIGATE') this.tracker.observe(1, t)
    }
    if (s.security.cameraDetection > 0.35) this.tracker.observe(1, t)

    // detection record for the debrief
    if (fighting || s.security.alarmActive) this.detection = 'detected'
    else if (this.detection === 'none' && (this.tracker.level >= 1 || s.security.cameraDetection > 0.35)) this.detection = 'suspicious'

    this.tracker.alarm = s.security.alarmActive
    if (this.tracker.alarm) {
      this.alarmTime += step
      this.fightTime = fighting ? this.fightTime + step : this.fightTime
      if (this.fightTime > LOCKDOWN_AFTER) this.tracker.lockdown = true
    } else {
      this.alarmTime = 0
      this.fightTime = 0
    }

    const prev = this.tracker.level
    const level = this.tracker.update(t)
    if (level !== prev) {
      if (level >= 2) for (const g of s.guards) if (g.active) g.data.alertness = Math.max(g.data.alertness, 0.5)
      this.onChange?.(level, prev)
    }
  }
}
