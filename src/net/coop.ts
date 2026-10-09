import Peer, { type DataConnection, type MediaConnection } from 'peerjs'
import { Quaternion, Vector3 } from 'three'
import { audio } from '../audio/AudioSystem'
import { damageGuard, GUARD_DAMAGE, placeGuard } from '../enemies/guards'
import type { AIState as GuardState } from '../ai/guardBrain'
import type { GameSession } from '../game/GameSession'
import type { MissionEvent } from '../missions/types'
import type { Character } from '../physics/Physics'
import { useGameStore } from '../state/gameStore'
import { wrapAngle } from '../utils/math'
import { AR_K7, LOADOUT } from '../weapons/definitions'

/**
 * Two-player co-op over WebRTC (PeerJS; its public broker only pairs the browsers, game traffic is peer to peer).
 * The host is authoritative for guards: it runs their AI against both players and streams their state; the friend
 * renders those guards and sends its damage on them back. Each side applies damage to its own player only, so
 * health, death and cheats stay local to whoever owns that player.
 */
type Msg =
  | { t: 'state'; p: number[] } // feet xyz, yaw, pitch, stance 0/1/2, speed, alive, aim, vehicle index (-1 on foot), then if driving: xyz, quat xyzw, speed
  | { t: 'pshot'; w: number; m: number[]; d: number[] }
  | { t: 'noise'; n: [string, number, number, number, number][] }
  | { t: 'guards'; g: (number | string)[][]; alert: number }
  | { t: 'gshot'; i: number; m: number[]; d: number[] }
  | { t: 'dmg'; i: number; a: number; d: number[]; torso: boolean }
  | { t: 'obj'; e: MissionEvent }
  | { t: 'full' }
  | { t: 'chat'; text: string }
  | { t: 'hangup' }

export type CoopStatus = 'off' | 'hosting' | 'joining' | 'connected'
/** Voice call: `calling` = we rang and wait for the friend to pick up, `ringing` = the friend is ringing us. */
export type VoiceState = 'off' | 'calling' | 'ringing' | 'on'
export interface ChatLine {
  id: number
  mine: boolean
  text: string
  at: number
}
let chatId = 0
const PREFIX = 'ironveil-'
const STATE_RATE = 1 / 20
const GUARD_RATE = 1 / 15
const r2 = (v: number) => Math.round(v * 100) / 100

const v = new Vector3()
const d = new Vector3()

/** What we know about the other player. */
export interface PeerState {
  feet: Vector3
  /** Smoothed render position. */
  shown: Vector3
  yaw: number
  pitch: number
  stance: number
  speed: number
  alive: boolean
  aim: number
  sinceShot: number
  sinceDeath: number
  seen: boolean
  /** Vehicle they're driving (-1 = on foot) and its streamed transform. */
  vehicle: number
  drive: { position: Vector3; quaternion: Quaternion; speed: number }
}

class Coop {
  role: 'host' | 'client' | null = null
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private s: GameSession | null = null
  private proxy: Character | null = null
  private sendTimer = 0
  private guardTimer = 0
  private shots = 0
  private lastPos = -1
  private originalHandle: ((e: MissionEvent) => void) | null = null
  /** Client: latest guard positions from the host, eased towards each frame. */
  private guardTargets: (Vector3 | null)[] = []
  readonly other: PeerState = {
    feet: new Vector3(), shown: new Vector3(), yaw: 0, pitch: 0, stance: 0, speed: 0, alive: true, aim: 0, sinceShot: 99, sinceDeath: 0, seen: false,
    vehicle: -1, drive: { position: new Vector3(), quaternion: new Quaternion(), speed: 0 },
  }

  get connected() {
    return !!this.conn?.open
  }
  get isClient() {
    return this.role === 'client' && this.connected
  }

  private status(coopStatus: CoopStatus, coopError = '') {
    useGameStore.setState({ coopStatus, coopError })
  }

  /** Opens a room; resolves with the code the friend types in. */
  host(): Promise<string> {
    this.leave()
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    this.role = 'host'
    this.status('hosting')
    useGameStore.setState({ coopCode: code })
    return new Promise((resolve, reject) => {
      const peer = (this.peer = new Peer(PREFIX + code))
      peer.on('open', () => resolve(code))
      peer.on('call', (c) => this.incoming(c))
      peer.on('connection', (c) => {
        // two players per room: anyone after the first (even mid-handshake) is told so and dropped
        if (this.conn) {
          c.on('open', () => {
            c.send({ t: 'full' } satisfies Msg)
            setTimeout(() => c.close(), 500)
          })
          return
        }
        this.wire(c)
      })
      peer.on('error', (e) => {
        this.status('off', e.message)
        reject(e)
      })
    })
  }

  join(code: string) {
    this.leave()
    this.role = 'client'
    this.status('joining')
    const peer = (this.peer = new Peer())
    peer.on('call', (c) => this.incoming(c))
    peer.on('open', () => this.wire(peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true })))
    peer.on('error', (e) => this.status('off', e.type === 'peer-unavailable' ? 'No room with that code' : e.message))
  }

  leave() {
    this.hangup(false)
    this.conn?.close()
    this.peer?.destroy()
    this.conn = this.peer = null
    this.role = null
    this.other.seen = false
    this.status('off')
  }

  private wire(c: DataConnection) {
    this.conn = c
    c.on('open', () => {
      this.status('connected')
      this.s?.notify('Friend connected', 'good')
    })
    c.on('data', (m) => this.receive(m as Msg))
    c.on('close', () => {
      if (this.conn !== c) return // we left on purpose (or were turned away)
      this.hangup(false)
      this.s?.vehicles.vehicles[this.other.vehicle]?.setRemote(null)
      this.other.vehicle = -1
      this.conn = null
      this.other.seen = false
      this.proxy?.collider.setEnabled(false)
      this.s?.notify('Friend disconnected', 'warn')
      this.status(this.role === 'host' && this.peer ? 'hosting' : 'off')
    })
  }

  private send(m: Msg) {
    if (this.conn?.open) this.conn.send(m)
  }

  /** Called once per new session: proxy collider for the friend, objective mirroring, spawn offset. */
  attach(s: GameSession) {
    this.s = s
    this.other.seen = false
    this.guardTargets = []
    this.shots = 0
    this.proxy = s.physics.createCapsule(new Vector3(0, -50, 0), 0.5, 0.35, { kind: 'peer' })
    this.proxy.collider.setEnabled(false)
    const handle = s.objectives.handle.bind(s.objectives)
    this.originalHandle = handle
    s.objectives.handle = (e) => {
      handle(e)
      if (e.type === 'position') {
        if (s.time - this.lastPos < 0.5) return
        this.lastPos = s.time
      }
      this.send({ t: 'obj', e })
    }
    // the friend starts a couple of metres beside the host
    if (this.role === 'client') s.player.teleport(v.copy(s.player.feet).add(d.set(2, 0.05, 1.5)))
  }

  /** Runs at the end of every session update. */
  update(dt: number) {
    const s = this.s
    if (!s || !this.connected) return
    const p = s.player
    const o = this.other
    o.sinceShot += dt
    if (!o.alive) o.sinceDeath += dt
    if (o.seen) {
      o.shown.lerp(o.feet, o.shown.distanceTo(o.feet) > 4 ? 1 : 1 - Math.exp(-15 * dt))
      this.proxy!.collider.setEnabled(o.alive)
      this.proxy!.body.setNextKinematicTranslation({ x: o.shown.x, y: o.shown.y + 0.85, z: o.shown.z })
    }

    if ((this.sendTimer -= dt) <= 0) {
      this.sendTimer = STATE_RATE
      const f = p.feet
      const veh = s.vehicles.driving
      const drive = veh ? [s.vehicles.vehicles.indexOf(veh), r2(veh.position.x), r2(veh.position.y), r2(veh.position.z), ...veh.quaternion.toArray().map((q) => Math.round(q * 1e4) / 1e4), r2(veh.speed)] : [-1]
      this.send({ t: 'state', p: [r2(f.x), r2(f.y), r2(f.z), r2(p.yaw), r2(p.pitch), p.prone ? 2 : p.crouching ? 1 : 0, r2(p.speed), p.alive ? 1 : 0, r2(s.weapon.aim), ...drive] })
    }
    if (s.stats.shots !== this.shots) {
      this.shots = s.stats.shots
      p.eye(v)
      p.forward(d)
      v.addScaledVector(d, 0.75)
      this.send({ t: 'pshot', w: s.weaponIndex, m: [r2(v.x), r2(v.y), r2(v.z)], d: [r2(d.x), r2(d.y), r2(d.z)] })
    }

    if (this.role === 'client') {
      // the host's guards need to hear us
      if (s.noises.length) this.send({ t: 'noise', n: s.noises.map((n) => [n.kind, r2(n.position.x), r2(n.position.y), r2(n.position.z), n.radius]) })
      this.easeGuards(dt)
    } else if ((this.guardTimer -= dt) <= 0) {
      this.guardTimer = GUARD_RATE
      this.send({
        t: 'guards',
        alert: s.alert.level,
        g: s.guards.map((g) => {
          const a = g.anim, gd = g.data
          return [g.active ? 1 : 0, r2(gd.position.x), r2(gd.position.y), r2(gd.position.z), r2(gd.yaw), gd.state, r2(gd.health), g.crouched ? 1 : 0,
            r2(a.speed), r2(a.crouch), r2(a.aim), r2(a.reload), a.radio ? 1 : 0, r2(a.turnRate), r2(a.lookYaw), r2(a.deathDir.x), r2(a.deathDir.z)]
        }),
      })
    }
  }

  /** Host: a guard fired — the friend replays the bullet so it can hit (and only hurt) the friend's own player. */
  guardShot(index: number, muzzle: Vector3, dir: Vector3) {
    if (this.role === 'host') this.send({ t: 'gshot', i: index, m: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], d: [dir.x, dir.y, dir.z] })
  }

  /** Client: our hit on a guard goes to the host, which owns guard health. */
  guardDamage(index: number, amount: number, dir: Vector3, torso: boolean) {
    this.send({ t: 'dmg', i: index, a: amount, d: [dir.x, dir.y, dir.z], torso })
  }

  private easeGuards(dt: number) {
    const s = this.s!
    const k = 1 - Math.exp(-15 * dt)
    s.guards.forEach((g, i) => {
      g.anim.sinceShot += dt
      g.anim.sinceHit += dt
      if (g.anim.dead) g.anim.sinceDeath += dt
      const t = this.guardTargets[i]
      if (!t || !g.active) return
      g.data.position.lerp(t, g.data.position.distanceTo(t) > 4 ? 1 : k)
      placeGuard(g)
    })
  }

  // ---- chat & voice ------------------------------------------------------------------------------------

  sendChat(text: string) {
    text = text.trim().slice(0, 200)
    if (!text || !this.connected) return
    this.send({ t: 'chat', text })
    this.addChat(true, text)
  }

  private addChat(mine: boolean, text: string) {
    useGameStore.setState((st) => ({ chat: [...st.chat.slice(-30), { id: ++chatId, mine, text, at: performance.now() }] }))
    if (!mine) audio.cue('objective')
  }

  private call: MediaConnection | null = null
  private mic: MediaStream | null = null
  private speaker: HTMLAudioElement | null = null

  private voice(voice: VoiceState) {
    useGameStore.setState({ voice })
  }

  /** T: ring the friend, pick up when they ring, or hang up. Must run from a key/click (mic prompt + audio playback). */
  async toggleVoice() {
    if (!this.connected || !this.peer) return
    const state = useGameStore.getState().voice
    if (state === 'calling' || state === 'on') return this.hangup(true)
    try {
      this.mic ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      this.s?.notify('Microphone blocked — allow it in the browser to talk', 'warn')
      return
    }
    if (state === 'ringing' && this.call) {
      this.call.answer(this.mic)
      this.voice('on')
    } else {
      this.listen(this.peer.call(this.conn!.peer, this.mic))
      this.voice('calling')
    }
  }

  private incoming(c: MediaConnection) {
    // both pressed T at once: just pick up
    if (useGameStore.getState().voice === 'calling' && this.mic) {
      this.call?.close()
      this.listen(c)
      c.answer(this.mic)
      return this.voice('on')
    }
    this.listen(c)
    this.voice('ringing')
    this.s?.notify('Friend is calling — press T to answer', 'good')
    audio.cue('objective')
  }

  private listen(c: MediaConnection) {
    this.call = c
    c.on('stream', (remote) => {
      this.speaker ??= new Audio()
      this.speaker.srcObject = remote
      this.speaker.play().catch(() => {})
      this.voice('on')
    })
    c.on('close', () => this.call === c && this.hangup(false))
  }

  hangup(tell: boolean) {
    if (tell) this.send({ t: 'hangup' })
    const c = this.call
    this.call = null
    c?.close()
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
    if (this.speaker) this.speaker.srcObject = null
    this.voice('off')
  }

  private receive(m: Msg) {
    if (m.t === 'full') {
      this.leave()
      return this.status('off', 'Room is full — 2 players max')
    }
    if (m.t === 'chat') return this.addChat(false, m.text)
    if (m.t === 'hangup') return this.hangup(false)
    const s = this.s
    if (!s) return
    const o = this.other
    switch (m.t) {
      case 'state': {
        const [x, y, z, yaw, pitch, stance, speed, alive, aim, vehicle] = m.p
        o.feet.set(x, y, z)
        // driving: hand that vehicle to their stream; release the previous one when they get out or switch
        const prev = s.vehicles.vehicles[o.vehicle]
        const veh = s.vehicles.vehicles[vehicle]
        if (prev && prev !== veh) prev.setRemote(null)
        if (veh && veh !== s.vehicles.driving) {
          o.drive.position.fromArray(m.p, 10)
          o.drive.quaternion.fromArray(m.p, 13)
          o.drive.speed = m.p[17]
          veh.setRemote(o.drive)
        }
        o.vehicle = veh ? vehicle : -1
        if (!o.seen) o.shown.copy(o.feet)
        o.seen = true
        Object.assign(o, { yaw, pitch, stance, speed, aim })
        if (o.alive && !alive) o.sinceDeath = 0
        o.alive = !!alive
        break
      }
      case 'pshot': {
        v.fromArray(m.m)
        d.fromArray(m.d)
        const def = LOADOUT[m.w]
        audio.gunshot(def.sound, v)
        s.effects.muzzle(v, d, 1)
        // replay the bullet so its tracer and impacts show where it really went (no damage: theirs to apply)
        s.ballistics.fire(v, d, def.ballistics, 0, { head: 1, limb: 1 }, { kind: 'peer' }, this.proxy?.collider, true)
        o.sinceShot = 0
        break
      }
      case 'noise':
        for (const [kind, x, y, z, radius] of m.n) s.noises.push({ kind: kind as never, position: new Vector3(x, y, z), radius })
        break
      case 'guards': {
        m.g.forEach((row, i) => {
          const g = s.guards[i]
          if (!g) return
          const [active, x, y, z, yaw, state, health, crouched, speed, crouch, aim, reload, radio, turnRate, lookYaw, dx, dz] = row as number[]
          if (active && !g.active) g.character.collider.setEnabled(true)
          g.active = !!active
          ;(this.guardTargets[i] ??= new Vector3()).set(x, y, z)
          if (!g.active) return
          const a = g.anim
          g.data.yaw += wrapAngle(yaw - g.data.yaw) * 0.6
          a.yaw = g.data.yaw
          if (health < g.data.health) a.sinceHit = 0
          g.data.health = health
          g.crouched = !!crouched
          Object.assign(a, { speed, crouch, aim, reload, radio: !!radio, turnRate, lookYaw })
          if ((state as unknown as GuardState) === 'DEAD' && !a.dead) {
            a.dead = true
            a.sinceDeath = 0
            a.deathDir.set(dx, 0, dz)
            g.character.collider.setEnabled(false)
          }
          g.data.state = state as unknown as GuardState
        })
        const prev = s.alert.tracker.level
        if (m.alert !== prev) {
          s.alert.tracker.level = m.alert as typeof prev
          s.alert.onChange?.(s.alert.tracker.level, prev)
        }
        break
      }
      case 'gshot': {
        const g = s.guards[m.i]
        if (!g) return
        v.fromArray(m.m)
        d.fromArray(m.d)
        s.ballistics.fire(v, d, AR_K7.ballistics, GUARD_DAMAGE, { head: 1.5, limb: 0.75 }, { kind: 'guard', id: g.data.id }, g.character.collider, true)
        audio.gunshot(AR_K7.sound, v)
        s.effects.muzzle(v, d, 0.6)
        g.muzzleTime = s.time
        g.anim.sinceShot = 0
        break
      }
      case 'dmg': {
        const g = s.guards[m.i]
        if (g && this.role === 'host') damageGuard(s, g, m.a, d.fromArray(m.d), true, m.torso, o.feet)
        break
      }
      case 'obj':
        this.originalHandle?.(m.e)
        if (m.e.type === 'collected') {
          // a keycard picked up by either player opens doors for both
          s.inventory.add(m.e.itemId)
          for (const p of s.pickups) if (p.id === m.e.itemId) p.taken = true
        }
        break
    }
  }
}

export const coop = new Coop()
