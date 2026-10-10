import { Vector3 } from 'three'
import { audio } from '../audio/AudioSystem'
import { say } from '../audio/speech'
import { GROQ_API_KEY } from '../config/keys'
import type { GuardEntity } from '../enemies/guards'
import type { Vehicle } from '../vehicles/VehicleSystem'
import type { GameSession } from '../game/GameSession'
import type { PeerState } from '../net/coop'
import type { Character } from '../physics/Physics'
import { AR_K7 } from '../weapons/definitions'
import { hostile } from './guardBrain'

/** The AI squadmate's call sign (introduced by EVA in the briefing). */
export const BUDDY_NAME = 'Kestrel'

export type BuddyOrder = 'auto' | 'follow' | 'hold' | 'move' | 'attack' | 'stealth'
export const ORDER_LABEL: Record<BuddyOrder, string> = {
  auto: 'AUTO · OWN JUDGEMENT',
  follow: 'FOLLOWING', hold: 'HOLDING', move: 'MOVING', attack: 'ATTACKING', stealth: 'STEALTH · HOLD FIRE',
}
const ORDERS = Object.keys(ORDER_LABEL) as BuddyOrder[]

const DAMAGE = 24
const REACTION = 0.5
/** Seconds down before reinforcing back in. */
const RESPAWN = 15
const KEY = GROQ_API_KEY
const MODEL = 'llama-3.3-70b-versatile'

const eye = new Vector3(), chest = new Vector3(), dir = new Vector3(), fwd = new Vector3()

/**
 * Player 2 when no friend has joined: an AI squadmate that drives the co-op "other player" slot, so guards see, hear
 * and shoot it exactly like a friend. Until ordered it uses its own judgement ("auto"); orders typed in chat (read by
 * an LLM, with a keyword fallback) then take priority — follow, hold, move, attack, stealth — until the next order.
 * It always shoots guards fighting the player first.
 */
export class Buddy {
  health = 100
  order: BuddyOrder = 'auto'
  private retreating = false
  /** Mission-start greeting: walk up to the player, shake hands, say hi. */
  private greet: 'start' | 'walk' | 'shake' | 'done' = 'done'
  private greetTime = 0
  /** Called with Kestrel's spoken lines (shown in chat). */
  onSay?: (text: string) => void
  private goal = new Vector3()
  private path: Vector3[] = []
  private pathTimer = 0
  private scanTimer = 0
  private target: GuardEntity | null = null
  private seenFor = 0
  private fireTimer = 0
  private burst = 0
  private sinceHurt = 99
  private downFor = 0
  /** The player's vehicle it is riding in. */
  private riding: Vehicle | null = null

  reset(s: GameSession, o: PeerState) {
    this.health = 100
    this.order = 'auto'
    this.greet = 'start'
    this.target = null
    this.path = []
    o.feet.copy(beside(s, 3, 2))
    o.shown.copy(o.feet)
    Object.assign(o, { seen: true, alive: true, sinceDeath: 0, sinceShot: 99, vehicle: -1, speed: 0, aim: 0, stance: 0, yaw: s.player.yaw })
  }

  get status() {
    return this.health > 0 ? `${ORDER_LABEL[this.order]} · ${Math.ceil(this.health)} HP` : `DOWN · BACK IN ${Math.ceil(RESPAWN - this.downFor)} s`
  }

  /** Back in the fight: full health, a few metres behind the player (out of the line of fire), keeping the last order. */
  private respawn(s: GameSession, o: PeerState) {
    this.health = 100
    this.sinceHurt = 99
    this.path = []
    o.feet.copy(beside(s, -5, -2))
    o.shown.copy(o.feet)
    Object.assign(o, { alive: true, sinceDeath: 0, sinceShot: 99, speed: 0, aim: 0, handshake: 0 })
    s.notify(`${BUDDY_NAME} is back in`, 'good')
    this.onSay?.('Back in the fight. On you.')
  }

  damage(s: GameSession, o: PeerState, amount: number) {
    if (!o.alive) return
    this.health -= amount
    this.sinceHurt = 0
    if (this.health > 0) return
    o.alive = false
    o.sinceDeath = 0
    this.downFor = 0
    this.target = null
    s.notify(`${BUDDY_NAME} is down — back in ${RESPAWN} s`, 'warn')
  }

  update(s: GameSession, o: PeerState, proxy: Character, dt: number) {
    if (!o.alive) {
      if ((this.downFor += dt) >= RESPAWN) this.respawn(s, o)
      return
    }
    if ((this.sinceHurt += dt) > 6) this.health = Math.min(100, this.health + 4 * dt)
    const p = s.vehicles.driving?.position ?? s.player.feet
    // left far behind (checkpoint restore, vehicle, respawn): catch up at once
    if (o.feet.distanceTo(p) > 50 && (this.order === 'auto' || this.order === 'follow' || this.order === 'stealth')) {
      o.feet.copy(beside(s, 3, 2))
      o.shown.copy(o.feet)
      this.path = []
    }
    if (this.greet !== 'done' && this.greeting(s, o, dt)) return
    if (this.ride(s, o)) {
      // in the vehicle: no walking, just pick targets and shoot from the seat / truck bed
      eye.copy(o.feet).setY(o.feet.y + 1.5)
      if ((this.scanTimer -= dt) <= 0) {
        this.scanTimer = 0.25
        this.pickTarget(s, o, proxy)
      }
      if (this.target && (this.target.data.state === 'DEAD' || !this.target.active)) this.target = null
      o.speed = 0
      if (this.target) {
        const tp = this.target.data.position
        o.yaw = Math.atan2(-(tp.x - o.feet.x), -(tp.z - o.feet.z))
        o.aim = 1
        this.seenFor += dt
        if (this.seenFor > REACTION) this.shoot(s, o, proxy, dt)
      } else {
        o.aim = Math.max(0, o.aim - dt * 2)
        o.yaw = Math.atan2(-fwd.set(0, 0, -1).applyQuaternion(this.riding!.quaternion).x, -fwd.z)
      }
      return
    }
    eye.copy(o.feet).setY(o.feet.y + 1.5)
    if ((this.scanTimer -= dt) <= 0) {
      this.scanTimer = 0.25
      this.pickTarget(s, o, proxy)
    }
    const t = this.target
    if (t && (t.data.state === 'DEAD' || !t.active)) this.target = null
    const danger = s.alert.level >= 2 || s.guards.some((g) => g.active && hostile(g.data.state))

    // where to be: an order is followed to the letter; with no order, its own judgement
    if (this.order === 'follow' || this.order === 'stealth') this.goal.copy(s.vehicles.driving ? p : beside(s, 3, 2))
    else if (this.order === 'auto') this.think(s, p, danger)
    o.stance = this.order === 'stealth' || (this.order === 'auto' && !danger) ? 1 : 0

    // ordered moves keep moving and shoot on the way; it only plants its feet to fight when holding, attacking or on its own
    const plant = this.target && (this.order === 'hold' || this.order === 'attack' || (this.order === 'auto' && !this.retreating))
    if (plant) o.speed = 0
    else this.walk(s, o, dt, p)

    if (this.target) {
      const tp = this.target.data.position
      o.yaw = Math.atan2(-(tp.x - o.feet.x), -(tp.z - o.feet.z))
      o.aim = 1
      this.seenFor += dt
      if (this.seenFor > REACTION) this.shoot(s, o, proxy, dt)
    } else {
      o.aim = Math.max(0, o.aim - dt * 2)
    }
  }

  /**
   * Walks in from a few metres off, stops facing the player, holds out a hand and shakes while saying hi.
   * Returns false once done — or at once if a fight starts or the player gives an order.
   */
  private greeting(s: GameSession, o: PeerState, dt: number): boolean {
    const p = s.player.feet
    if (s.alert.level >= 2 || this.order !== 'auto' || s.vehicles.driving) {
      this.greet = 'done'
      o.handshake = 0
      return false
    }
    if (this.greet === 'start') {
      o.feet.copy(beside(s, 7, 4))
      o.shown.copy(o.feet)
      this.path = []
      this.greet = 'walk'
    }
    o.stance = 0
    o.aim = 0
    if (this.greet === 'walk') {
      // stop at arm's length, right in front of the player
      this.goal.copy(beside(s, 1.3, 0))
      if (o.feet.distanceTo(this.goal) > 0.5) {
        this.walk(s, o, dt, p, 0.45)
        return true
      }
      this.greet = 'shake'
      this.greetTime = 0
      const line = `Hi Wren, I'm ${BUDDY_NAME}. I've got your back. Press Enter to give me orders.`
      this.onSay?.(line)
      say(line, 'kestrel')
    }
    // shaking hands: face the player, hand out, then step aside into auto mode
    o.speed = 0
    o.yaw = Math.atan2(-(p.x - o.feet.x), -(p.z - o.feet.z))
    this.greetTime += dt
    o.handshake = this.greetTime < 3 ? Math.min(1, this.greetTime * 3) : Math.max(0, 1 - (this.greetTime - 3) * 3)
    if (this.greetTime > 3.4) {
      this.greet = 'done'
      o.handshake = 0
    }
    return true
  }

  /**
   * Boards the player's vehicle when it has a rider spot and it isn't on a hold/move/attack order: runs to it, gets in
   * within 5 m, and from then on rides at the spot. Gets out beside it when the player leaves the vehicle.
   * Returns true while riding.
   */
  private ride(s: GameSession, o: PeerState): boolean {
    const veh = s.vehicles.driving
    const wants = veh?.def.ride && (this.order === 'auto' || this.order === 'follow' || this.order === 'stealth')
    if (this.riding && this.riding !== veh) {
      // the player got out (or switched vehicle): hop off on the passenger side
      const off = fwd.set(2.2, 0, 0.5).applyQuaternion(this.riding.quaternion).add(this.riding.position)
      o.feet.set(off.x, s.floorAt(off.x, off.z, off.y + 1), off.z)
      o.shown.copy(o.feet)
      this.riding = null
      o.riding = false
      this.path = []
    }
    if (!veh || !wants) return false
    if (!this.riding) {
      if (o.feet.distanceTo(veh.position) > 5) return false // still running over (follow/auto goal is the vehicle)
      this.riding = veh
      o.riding = true
      this.onSay?.(veh.def.ride!.seated ? 'In. Go.' : 'In the back. Drive, I\'ll cover.')
    }
    o.feet.set(...veh.def.ride!.passenger).applyQuaternion(veh.quaternion).add(veh.position)
    o.shown.copy(o.feet)
    o.stance = veh.def.ride!.seated ? 1 : 0
    return true
  }

  /** No order yet: shadow the player crouched, move up to help in a fight, fall back behind them when hurt. */
  private think(s: GameSession, p: Vector3, danger: boolean) {
    this.retreating = false
    if (s.vehicles.driving) return void this.goal.copy(p)
    if (danger && this.health < 35) {
      this.retreating = true
      return void this.goal.copy(beside(s, -4, -1.5))
    }
    if (danger && !this.target) {
      // nothing in sight but a fight on: push towards the closest hostile, staying within reach of the player
      let near: GuardEntity | null = null, nd = Infinity
      for (const g of s.guards) {
        const d = g.data.position.distanceTo(p)
        if (g.active && hostile(g.data.state) && d < nd) [near, nd] = [g, d]
      }
      if (near) {
        dir.subVectors(near.data.position, p).setY(0).normalize()
        return void this.goal.copy(p).addScaledVector(dir, Math.min(10, nd * 0.5))
      }
    }
    this.goal.copy(beside(s, 1.5, 2.5))
  }

  /**
   * Closest visible guard worth shooting under the current order, with guards fighting the player first (protect the
   * player). On its own and undetected it only fires on a guard that is about to spot the player.
   */
  private pickTarget(s: GameSession, o: PeerState, proxy: Character) {
    let best: GuardEntity | null = null, bestScore = Infinity
    for (const g of s.guards) {
      const d = g.data
      if (!g.active || d.state === 'DEAD') continue
      const dist = d.position.distanceTo(o.feet)
      const angry = hostile(d.state)
      const wanted = this.order === 'stealth' ? angry && dist < 40
        : this.order === 'attack' ? dist < 70
        : this.order === 'auto' ? (angry ? dist < 60 : d.suspicion > 0.55 && d.position.distanceTo(s.player.feet) < 25)
        : angry ? dist < 60 : dist < 22
      const score = dist * (angry && g.target === 'local' ? 0.4 : 1)
      if (!wanted || score >= bestScore) continue
      chest.copy(d.position).setY(d.position.y + (g.crouched ? 0.9 : 1.3))
      if (!s.physics.canSee(eye, chest, proxy.collider)) continue
      best = g
      bestScore = score
    }
    if (best !== this.target) this.seenFor = 0
    this.target = best
  }

  private walk(s: GameSession, o: PeerState, dt: number, player: Vector3, stop = this.order === 'move' || this.order === 'attack' || this.order === 'hold' ? 0.8 : 1.5) {
    const far = o.feet.distanceTo(this.goal)
    if (far < stop) {
      o.speed = 0
      if (this.order === 'move' || this.order === 'attack') this.order = 'hold'
      return
    }
    if ((this.pathTimer -= dt) <= 0 || !this.path.length) {
      this.pathTimer = 1
      this.path = s.nav.findPath(o.feet, this.goal) ?? [this.goal.clone()]
    }
    const next = this.path[0]
    dir.set(next.x - o.feet.x, 0, next.z - o.feet.z)
    const len = dir.length()
    if (len < 0.4) {
      this.path.shift()
      return
    }
    // catch up at a run, otherwise walk (crouch-walk when sneaking)
    const speed = o.stance ? 1.8 : far > 12 || o.feet.distanceTo(player) > 20 ? 5.2 : 3.2
    const step = Math.min(len, (o.stance && far > 8 ? 4 : speed) * dt)
    o.feet.addScaledVector(dir.divideScalar(len), step)
    // step up stairs and kerbs (≤ 0.5 m), never onto crates or vehicles; drops are fine
    const floor = s.floorAt(o.feet.x, o.feet.z, o.feet.y + 0.5)
    if (floor - o.feet.y < 0.5) o.feet.y = floor
    o.yaw = Math.atan2(-dir.x, -dir.z)
    o.speed = speed
  }

  private shoot(s: GameSession, o: PeerState, proxy: Character, dt: number) {
    if ((this.fireTimer -= dt) > 0) return
    if (this.burst <= 0) {
      this.burst = 3 + Math.floor(Math.random() * 3)
      this.fireTimer = 0.6 + Math.random() * 0.5
      return
    }
    this.burst--
    this.fireTimer = 0.11
    const g = this.target!.data
    chest.copy(g.position).setY(g.position.y + (this.target!.crouched ? 0.9 : 1.3))
    fwd.set(-Math.sin(o.yaw), 0, -Math.cos(o.yaw))
    eye.copy(o.shown).setY(o.shown.y + (o.stance ? 1.0 : 1.45)).addScaledVector(fwd, 0.6)
    const dist = eye.distanceTo(chest)
    dir.subVectors(chest, eye).normalize()
    dir.x += (Math.random() - 0.5) * (0.03 + dist * 0.0009)
    dir.y += (Math.random() - 0.5) * (0.03 + dist * 0.0009)
    dir.normalize()
    s.ballistics.fire(eye, dir, AR_K7.ballistics, DAMAGE, { head: 3.5, limb: 0.75 }, { kind: 'buddy' }, proxy.collider, true)
    s.effects.muzzle(eye, dir, 1)
    audio.gunshot(AR_K7.sound, eye)
    s.noises.push({ kind: 'gunshot', position: o.feet.clone(), radius: AR_K7.noiseRadius })
    o.sinceShot = 0
  }

  // ---- orders ------------------------------------------------------------------------------------------

  /** Reads a chat message as an order, carries it out and returns Player 2's radio reply. */
  async command(s: GameSession, o: PeerState, text: string): Promise<string> {
    if (!o.alive) return '...'
    let order: BuddyOrder | null = null, target: string | null = null, reply = ''
    try {
      if (!KEY) throw new Error('no key')
      ;({ order, target, reply } = await this.ask(s, o, text))
    } catch {
      ;({ order, target, reply } = keywords(text))
      // a named place in the message is where to go (or hold)
      const lower = text.toLowerCase()
      target ??= s.layout.areas.find((a) => lower.includes(a.label.replace(/^the /, '').toLowerCase()))?.label ?? null
    }
    if (order) {
      this.order = order
      this.path = []
      this.pathTimer = 0
      if (order === 'hold') this.goal.copy(target ? this.resolve(s, target) : o.feet)
      else if (order === 'move' || order === 'attack') this.goal.copy(this.resolve(s, target ?? 'aim'))
    }
    return reply || (order ? `Copy, ${ORDER_LABEL[order].toLowerCase()}.` : 'Say again?')
  }

  private async ask(s: GameSession, o: PeerState, text: string) {
    const areas = s.layout.areas.map((a) => a.label.replace(/^the /, ''))
    const visible = s.guards.filter((g) => g.active && g.data.state !== 'DEAD' && g.data.position.distanceTo(o.feet) < 50).length
    const system = `You are "${BUDDY_NAME}", call sign of an AI special-forces squadmate in a stealth shooter. The human player gives you orders by text chat.
Answer ONLY with JSON: {"order": one of ${JSON.stringify([...ORDERS, 'none'])}, "target": an area name from the list, "me" (player's position), "aim" (where the player is looking) or null, "reply": short radio reply, max 12 words, in the player's language}.
Orders: auto = use your own judgement (shadow the player, protect them, fight when a fight starts); follow = stay with the player even under fire; hold = stay at target (or where you are); move = go to target; attack = go to target and kill every enemy you see; stealth = follow quietly and only fire if enemies are already hostile; none = just answer (status, questions). A player's order always overrides your own judgement until they say otherwise.
Areas: ${areas.join(', ')}.
Your status: order ${this.order}, health ${Math.ceil(this.health)}, ${Math.round(o.feet.distanceTo(s.player.feet))} m from the player, ${visible} enemies within 50 m, facility security level ${s.alert.level} of 4.`
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.3, max_tokens: 120, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
      }),
    })
    if (!res.ok) throw new Error(`Groq ${res.status}`)
    const json = JSON.parse((await res.json()).choices[0].message.content) as { order?: string; target?: string | null; reply?: string }
    return {
      order: ORDERS.includes(json.order as BuddyOrder) ? (json.order as BuddyOrder) : null,
      target: typeof json.target === 'string' ? json.target : null,
      reply: String(json.reply ?? '').slice(0, 120),
    }
  }

  /** "me", "aim" or an area name → a point on the ground. */
  private resolve(s: GameSession, target: string): Vector3 {
    const t = target.toLowerCase()
    if (t === 'me') return s.player.feet.clone()
    const area = s.layout.areas.find((a) => a.label.toLowerCase().includes(t) || t.includes(a.label.replace(/^the /, '').toLowerCase()))
    if (area) return new Vector3((area.rect[0] + area.rect[2]) / 2, 0, (area.rect[1] + area.rect[3]) / 2)
    // where the player is looking (up to 120 m), else the player
    s.player.eye(eye)
    s.player.forward(fwd)
    const hit = s.physics.raycast(eye, fwd, 120, s.player.character.collider, 'bullet')
    return hit ? new Vector3(hit.point.x, 0, hit.point.z) : s.player.feet.clone()
  }
}

const side = new Vector3()
/** A point `ahead` metres in front of the player and `right` metres to their right, on the floor. */
function beside(s: GameSession, ahead: number, right: number) {
  const y = s.player.yaw
  side.copy(s.player.feet).add({ x: -Math.sin(y) * ahead + Math.cos(y) * right, y: 0, z: -Math.cos(y) * ahead - Math.sin(y) * right })
  side.y = s.floorAt(side.x, side.z, s.player.feet.y + 1)
  return side
}

/** Offline fallback: plain keywords. */
export function keywords(text: string): { order: BuddyOrder | null; target: string | null; reply: string } {
  const t = text.toLowerCase()
  const order: BuddyOrder | null = /your call|auto|on your own|free|do your thing/.test(t) ? 'auto'
    : /stealth|quiet|hold fire|don'?t shoot/.test(t) ? 'stealth'
    : /attack|kill|engage|clear|assault/.test(t) ? 'attack'
    : /hold|stay|wait|stop/.test(t) ? 'hold'
    : /follow|on me|regroup|come/.test(t) ? 'follow'
    : /go|move|there/.test(t) ? 'move'
    : null
  const target = /\b(me|here)\b/.test(t) && order !== 'hold' ? 'me' : null
  return { order, target, reply: '' }
}
