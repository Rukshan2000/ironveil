import { Vector3 } from 'three'
import type { GuardEntity } from '../enemies/guards'
import type { GameSession } from '../game/GameSession'
import { alertGuard, calmState, hostile, orderFlank, orderInvestigate } from './guardBrain'

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six']
/** Radio names for squads; anything else is title-cased from its id. */
const NAMES: Record<string, string> = {
  gate: 'Gate', motor: 'Motor', barracks: 'Barracks', warehouse: 'Stores', command: 'Admin', compound: 'Compound', power: 'Utility',
  'qrf-1': 'Reaction One', 'qrf-2': 'Reaction Two', 'qrf-3': 'Reaction Three', convoy: 'Convoy',
}
const THINK = 0.5
/** Without the uplink, squad members only hear each other this close. */
const LOCAL_RADIO = 25
const FLANK_COOLDOWN = 14
const DISPATCH_COOLDOWN = 20

export class Squad {
  readonly members: GuardEntity[] = []
  leader: GuardEntity | null = null
  broken = false
  flankCooldown = 4
  dispatchCooldown = 0
  /** Members that were already suspicious last tick (to spot new reports). */
  private wary = new Set<string>()

  constructor(readonly id: string, readonly name: string) {}

  get alive() {
    return this.members.filter((m) => m.active && m.data.state !== 'DEAD')
  }

  /** "Gate two". */
  callsign(g: GuardEntity) {
    return `${this.name} ${NUMBERS[this.members.indexOf(g)] ?? this.members.indexOf(g) + 1}`
  }

  newlyWary(g: GuardEntity, wary: boolean) {
    const was = this.wary.has(g.data.id)
    if (wary) this.wary.add(g.data.id)
    else this.wary.delete(g.data.id)
    return wary && !was
  }
}

/**
 * SquadSystem: guards belong to squads with a leader. The leader (or whoever is left) coordinates: dispatches a unit to
 * check a colleague's report, pulls the squad onto a confirmed contact, sends a fighter round the flank, and calls the
 * fall-back when the squad has taken heavy losses. Runs at 2 Hz — orders, not reflexes.
 */
export class SquadSystem {
  readonly squads: Squad[] = []
  private timer = 0
  private readonly tmp = new Vector3()

  constructor(private readonly s: GameSession) {
    const byId = new Map<string, Squad>()
    for (const g of s.guards) {
      const id = g.squad ?? `solo-${g.data.id}`
      let sq = byId.get(id)
      if (!sq) {
        sq = new Squad(id, NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1))
        byId.set(id, sq)
        this.squads.push(sq)
      }
      sq.members.push(g)
      if (g.leader) sq.leader = g
    }
    for (const sq of this.squads) sq.leader ??= sq.members[0]
  }

  squadOf(g: GuardEntity) {
    return this.squads.find((sq) => sq.members.includes(g)) ?? null
  }

  callsign(g: GuardEntity) {
    return this.squadOf(g)?.callsign(g) ?? 'Unit'
  }

  update(dt: number) {
    if ((this.timer -= dt) > 0) return
    this.timer = THINK
    for (const sq of this.squads) this.think(sq)
  }

  private think(sq: Squad) {
    const s = this.s
    const alive = sq.alive
    sq.flankCooldown -= THINK
    sq.dispatchCooldown -= THINK
    if (!alive.length) return

    // ---- chain of command
    if (!sq.leader || !alive.includes(sq.leader)) {
      const fallen = sq.leader
      sq.leader = alive.find((m) => !m.data.stationary) ?? alive[0]
      if (fallen?.active) s.radio.say('enemy', sq.callsign(sq.leader), `${sq.name} lead is down! I have command.`)
    }
    const leader = sq.leader!

    // ---- morale: a squad that has lost two thirds of its people falls back
    const deployed = sq.members.filter((m) => m.active).length
    if (!sq.broken && deployed >= 3 && alive.length <= Math.floor(deployed / 3)) {
      sq.broken = true
      for (const m of alive) m.data.broken = true
      s.radio.say('enemy', sq.callsign(leader), `${sq.name} is taking heavy losses — falling back!`)
    }

    const inRange = (a: GuardEntity, b: GuardEntity) => !s.alert.commsDown || a.data.position.distanceTo(b.data.position) < LOCAL_RADIO

    // ---- confirmed contact: converge, then flank
    const fighters = alive.filter((m) => hostile(m.data.state))
    if (fighters.length) {
      const spotter = fighters.find((m) => m.data.lastKnown) ?? fighters[0]
      const contact = spotter.data.lastKnown
      if (!contact) return
      let pulled = false
      for (const m of alive) {
        if (!hostile(m.data.state) && inRange(m, spotter) && alertGuard(m.data, contact)) pulled = true
      }
      if (pulled) s.radio.say('enemy', sq.callsign(spotter), `${sq.name}, contact near ${s.areaName(contact)}! On me!`)
      const combatants = alive.filter((m) => m.data.state === 'COMBAT' && !m.data.stationary)
      if (sq.flankCooldown <= 0 && combatants.length >= 2) {
        const flanker = combatants.find((m) => m !== leader) ?? combatants[0]
        const side = Math.random() < 0.5 ? -1 : 1
        const point = this.flankPoint(flanker, contact, side)
        if (point && orderFlank(flanker.data, point)) {
          sq.flankCooldown = FLANK_COOLDOWN
          s.radio.say('enemy', sq.callsign(leader), `${sq.callsign(flanker)}, flank ${side < 0 ? 'left' : 'right'}!`)
        }
      }
      return
    }

    // ---- a member reports something odd: the leader sends someone else to check it out
    for (const m of alive) {
      const st = m.data.state
      const wary = st === 'SUSPICIOUS' || st === 'INVESTIGATE'
      if (!sq.newlyWary(m, wary) || !m.data.lastKnown || sq.dispatchCooldown > 0) continue
      const point = m.data.lastKnown
      const helper = alive
        .filter((x) => x !== m && calmState(x.data.state) && !x.data.stationary && inRange(x, m))
        .sort((a, b) => a.data.position.distanceTo(point) - b.data.position.distanceTo(point))[0]
      sq.dispatchCooldown = DISPATCH_COOLDOWN
      if (helper && helper.data.position.distanceTo(point) < 60 && orderInvestigate(helper.data, point)) {
        s.radio.say('enemy', sq.callsign(leader === helper ? m : leader), `${sq.callsign(helper)}, investigate ${s.areaName(point)}.`)
      } else {
        s.radio.say('enemy', sq.callsign(m), `Possible movement near ${s.areaName(point)}. Checking it.`)
      }
    }
  }

  /** A reachable spot roughly perpendicular to the line between the flanker and the threat. */
  private flankPoint(g: GuardEntity, threat: Vector3, side: number): Vector3 | null {
    const d = this.tmp.subVectors(g.data.position, threat).setY(0)
    const dist = Math.max(6, Math.min(16, d.length()))
    d.normalize()
    const target = threat.clone().addScaledVector(d, dist * 0.6).add(new Vector3(-d.z, 0, d.x).multiplyScalar(side * dist * 0.9))
    return this.s.nav.randomPoint(target, 3)
  }
}
