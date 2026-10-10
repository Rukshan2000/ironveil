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
 * ReinforcementManager: pooled reaction squads (created inactive at load, so nothing is allocated mid-fight), one per
 * security level. Each is sent once, a muster delay after its level is first reached, from a believable place —
 * barracks, vehicle area, by truck up the south road, or the security building. Levels 1–2 search, 3+ assault.
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

  update(dt: number) {
    const level = this.s.alert.level
    const next = this.squads.find((q) => !q.deployed && q.def.minLevel <= level)
    if (!next) {
      this.cooldown = MUSTER_TIME
      return
    }
    if ((this.cooldown -= dt) > 0) return
    this.cooldown = MUSTER_TIME
    this.dispatch(next, level >= 3 ? 'assault' : 'search')
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
        s.notify(`Security level ${q.def.minLevel}: +${q.members.length} enemy reinforcements by truck`, 'warn')
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
    s.notify(`Security level ${q.def.minLevel}: +${q.members.length} enemy reinforcements from ${source.label}`, 'warn')
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
