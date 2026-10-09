import { Vector3 } from 'three'
import { audio } from '../audio/AudioSystem'
import { input } from '../game/input'
import type { GameSession } from '../game/GameSession'

const ZOOMS = [4, 8]
/** Seconds the crosshair must rest on a guard to tag him. */
const TAG_TIME = 0.6
/** Security kit within this distance and in line of sight is noted without binoculars. */
const NOTICE_RANGE = 14

const STATE_WORDS: Record<string, string> = {
  IDLE: 'POSTED', PATROL: 'PATROLLING', SUSPICIOUS: 'SUSPICIOUS', INVESTIGATE: 'INVESTIGATING', SEARCH: 'SEARCHING',
  ALERT: 'ALERTED', COMBAT: 'ENGAGED', FLANK: 'FLANKING', RETREAT: 'FALLING BACK', CALL_REINFORCEMENTS: 'CALLING IN', DEAD: 'DOWN',
}

export interface ReconTarget {
  key: string
  label: string
  detail: string
  distance: number
}

const eye = new Vector3()
const fwd = new Vector3()
const to = new Vector3()
const p = new Vector3()

/**
 * ReconSystem: binoculars (B). Zoomed view, laser range, identification of whatever is under the reticle, and
 * tagging — tagged guards stay on the minimap/tactical map. Cameras, searchlights and alarm panels only appear on the
 * maps once they've been spotted (through the binoculars or up close). Information depends on reconnaissance.
 */
export class ReconSystem {
  active = false
  zoomIndex = 0
  range: number | null = null
  target: ReconTarget | null = null
  tagProgress = 0
  readonly tagged = new Set<string>()
  /** Security device ids the player knows about. */
  readonly discovered = new Set<string>()
  private noticeTimer = 0
  private zoomHeld = false

  constructor(private readonly s: GameSession) {}

  get zoom() {
    return ZOOMS[this.zoomIndex]
  }

  update(dt: number) {
    const s = this.s
    const pl = s.player
    if (input.pressed('binoculars') && pl.active && !s.grenades.priming) {
      this.active = !this.active
      audio.cloth(0.5)
      if (this.active) s.weapon.holster()
      else s.weapon.equip()
    }
    if (!pl.active || !pl.alive) this.active = false
    if ((this.noticeTimer -= dt) <= 0) {
      this.noticeTimer = 0.5
      this.noticeNearby()
    }
    pl.lookScale = this.active ? 1.4 / this.zoom : 1
    if (!this.active) {
      this.target = null
      this.tagProgress = 0
      return
    }
    // RMB or wheel steps the zoom
    if (input.consumeWheel() !== 0 || (input.down('aim') && !this.zoomHeld)) this.zoomIndex = (this.zoomIndex + 1) % ZOOMS.length
    this.zoomHeld = input.down('aim')

    pl.eye(eye)
    pl.forward(fwd)
    const hit = s.physics.raycast(eye, fwd, 400, pl.character.collider, 'vision')
    this.range = hit ? hit.distance : null

    // identify: smallest angle from the reticle among things in clear view
    const tolerance = 0.03 / this.zoom + 0.006
    let best: { key: string; label: string; detail: string; distance: number; angle: number; guard?: string } | null = null
    const consider = (key: string, pos: Vector3, label: string, detail: string, guard?: string) => {
      to.subVectors(pos, eye)
      const d = to.length()
      if (d > 320) return
      const angle = Math.acos(Math.min(1, to.divideScalar(d).dot(fwd)))
      if (angle > tolerance * Math.max(1, 6 / d) || (best && angle >= best.angle)) return
      if (!s.physics.canSee(eye, pos, pl.character.collider)) return
      best = { key, label, detail, distance: d, angle, guard }
    }
    for (const g of s.guards) {
      if (!g.active) continue
      const d = g.data
      const squad = s.squads.squadOf(g)
      consider(`g:${d.id}`, p.copy(d.position).setY(d.position.y + (g.crouched ? 0.9 : 1.3)),
        d.state === 'DEAD' ? 'HOSTILE — DOWN' : 'HOSTILE',
        d.state === 'DEAD' ? '' : `${STATE_WORDS[d.state]}${squad ? ` · ${squad.name.toUpperCase()} SQUAD` : ''}${d.stationary ? ' · OVERWATCH' : ''}`, d.id)
    }
    for (const c of s.security.cameras) consider(`c:${c.def.id}`, p.set(...c.def.position), 'SECURITY CAMERA', c.dead ? 'DISABLED' : c.seeing ? 'TRACKING YOU' : 'SWEEPING')
    for (const l of s.security.searchlights) consider(`l:${l.def.id}`, p.set(...l.def.position), 'SEARCHLIGHT', l.on ? 'ACTIVE' : 'OFF')
    for (const a of s.security.panels) consider(`a:${a.def.id}`, p.set(...a.def.position), 'ALARM PANEL', a.disabled ? 'SABOTAGED' : 'ARMED')
    for (const v of s.vehicles.vehicles) consider(`v:${v.id}`, p.copy(v.position).setY(v.position.y + 1), v.def.name.toUpperCase(), v.autopilot ? 'MOVING' : 'PARKED')
    for (const i of s.layout.interactables) consider(`i:${i.id}`, p.set(...i.position), 'OBJECTIVE', i.label.toUpperCase())

    const found = best as { key: string; label: string; detail: string; distance: number; guard?: string } | null
    if (found && found.key !== this.target?.key) this.tagProgress = 0
    this.target = found ? { key: found.key, label: found.label, detail: found.detail, distance: found.distance } : null
    if (!found) return
    if (found.key[0] !== 'g' && found.key[0] !== 'v' && found.key[0] !== 'i') this.discover(found.key.slice(2))
    if (found.guard && !this.tagged.has(found.guard)) {
      this.tagProgress += dt / TAG_TIME
      if (this.tagProgress >= 1) {
        this.tagged.add(found.guard)
        this.tagProgress = 0
        audio.cue('beep')
      }
    }
  }

  discover(id: string) {
    if (this.discovered.has(id)) return
    this.discovered.add(id)
  }

  /** Security devices you walk close to (and can see) are noted. */
  private noticeNearby() {
    const s = this.s
    s.player.eye(eye)
    const check = (id: string, pos: [number, number, number]) => {
      if (this.discovered.has(id)) return
      p.set(...pos)
      if (p.distanceTo(eye) < NOTICE_RANGE && s.physics.canSee(eye, p, s.player.character.collider)) this.discover(id)
    }
    for (const c of s.security.cameras) check(c.def.id, c.def.position)
    for (const a of s.security.panels) check(a.def.id, a.def.position)
    for (const l of s.security.searchlights) check(l.def.id, l.def.position)
  }
}
