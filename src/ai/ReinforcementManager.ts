import { Vector3 } from 'three'
import type { GuardEntity } from '../enemies/guards'
import type { GameSession } from '../game/GameSession'
import type { ReinforcementSource, ReinforcementSquadDef } from '../world/types'
import { alertGuard, orderSearch } from './guardBrain'

/** Never bring troops out of a source the player is standing next to. */
const MIN_PLAYER_DIST = 30
/** First wave leaves this long after the facility goes to alert (they have to grab their kit). */
const MUSTER_TIME = 8
/** Intel older than this sends teams searching instead of charging. */
const STALE_INTEL = 25

interface PooledSquad {
  def: ReinforcementSquadDef
  members: GuardEntity[]
  deployed: boolean
}

/**
 * ReinforcementManager: pooled reaction squads (created inactive at load, so nothing is allocated mid-fight) that are
 * dispatched from believable places — barracks, vehicle area, security building, or by truck up the south road — as
 * the alert level rises, within an active-enemy cap and a cooldown between waves.
 */
export class ReinforcementManager {
  readonly sources: ReinforcementSource[]
  readonly squads: PooledSquad[]
  private cooldown = MUSTER_TIME
  waves = 0

  constructor(private readonly s: GameSession) {
    const R = s.layout.reinforcements
    this.sources = R.sources
    this.squads = R.squads.map((def) => ({
      def, deployed: false,
      members: def.guards.map((g) => s.guards.find((x) => x.data.id === g.id)!),
    }))
  }

  get activeEnemies() {
    return this.s.guards.filter((g) => g.active && g.data.state !== 'DEAD').length
  }

  get available() {
    return this.squads.filter((q) => !q.deployed).length
  }

  update(dt: number) {
    const level = this.s.alert.level
    if (level < 3) {
      this.cooldown = Math.max(this.cooldown, MUSTER_TIME)
      return
    }
    if ((this.cooldown -= dt) > 0) return
    const next = this.squads.find((q) => !q.deployed && q.def.minLevel <= level)
    if (!next) return
    if (this.activeEnemies + next.members.length > this.s.layout.reinforcements.maxActive) {
      this.cooldown = 5
      return
    }
    this.cooldown = this.s.layout.reinforcements.cooldown
    this.dispatch(next, 'assault')
  }

  /** Sends a squad out without the alarm (scripted: e.g. a search team after sabotage). Returns false if none left. */
  dispatchSearch(squadId: string, at: Vector3): boolean {
    const q = this.squads.find((x) => x.def.id === squadId && !x.deployed)
    if (!q) return false
    this.dispatch(q, 'search', at)
    return true
  }

  private dispatch(q: PooledSquad, mode: 'assault' | 'search', at?: Vector3) {
    const s = this.s
    q.deployed = true
    this.waves++
    const source = this.pickSource(q.def.source)
    const target = at ?? s.alert.lastKnown.clone()
    const stale = s.time - s.alert.lastKnownTime > STALE_INTEL
    const go = (g: GuardEntity) => {
      if (mode === 'search' || stale) orderSearch(g.data, target, s.aiWorld!)
      else alertGuard(g.data, target)
    }

    if (source.convoy) {
      const unload = (where: Vector3) => {
        q.members.filter((g) => g.data.state !== 'DEAD').forEach((g, i) => {
          this.activate(g, where, i)
          go(g)
        })
        s.radio.say('enemy', 'Convoy', `Convoy at ${s.areaName(where)}, dismounting!`)
      }
      if (s.vehicles.drive(source.convoy.vehicle, source.convoy.route, unload)) {
        s.radio.say('enemy', 'Control', 'Convoy, get your people up the south road. Intruder on site.')
        return
      }
    }
    const at0 = new Vector3(...source.position)
    q.members.filter((g) => g.data.state !== 'DEAD').forEach((g, i) => {
      this.activate(g, at0, i)
      go(g)
    })
    s.radio.say('enemy', 'Control', mode === 'search'
      ? `Reaction team, move out from ${source.label} and sweep ${s.areaName(target)}.`
      : `Reaction team moving from ${source.label}. All units, hold them there.`)
    s.notify(`Enemy reinforcements from ${source.label}`, 'warn')
  }

  /** The squad's own source, unless the player is right there — then the furthest foot source. */
  private pickSource(id: string): ReinforcementSource {
    const p = this.s.player.feet
    const dist = (src: ReinforcementSource) => Math.hypot(src.position[0] - p.x, src.position[2] - p.z)
    const own = this.sources.find((x) => x.id === id) ?? this.sources[0]
    if (own.convoy || dist(own) >= MIN_PLAYER_DIST) return own
    return [...this.sources].filter((x) => !x.convoy).sort((a, b) => dist(b) - dist(a))[0] ?? own
  }

  private activate(g: GuardEntity, at: Vector3, i: number) {
    const ang = i * 2.1
    const p = new Vector3(at.x + Math.cos(ang) * 1.6, at.y, at.z + Math.sin(ang) * 1.6)
    p.y = this.s.floorAt(p.x, p.z)
    g.data.position.copy(p)
    g.character.body.setTranslation({ x: p.x, y: p.y + 0.9, z: p.z }, true)
    g.character.collider.setEnabled(true)
    g.active = true
    g.data.patrol = [p.clone()]
    g.data.patrolIndex = 0
  }
}
