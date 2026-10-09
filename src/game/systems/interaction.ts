import { Vector3 } from 'three'
import { audio } from '../../audio/AudioSystem'
import type { ColliderTag } from '../../physics/Physics'
import { doorCenter } from '../../security/SecuritySystem'
import { damp, wrapAngle, yawTo } from '../../utils/math'
import { screenCenter } from '../../world/computers'
import { bindingLabel } from '../../state/settings'
import { input } from '../input'
import type { GameSession } from '../GameSession'

const REACH = 2.1
const eye = new Vector3()
const fwd = new Vector3()
const to = new Vector3()

interface Candidate {
  dist: number
  text: string
  /** Seconds to hold E; 0 = press. */
  hold: number
  progress: () => number | null
  use: (dt: number) => void
}

const cap = (t: string) => t.replace(/\b\w/g, (c) => c.toUpperCase())

/** Hands on the keyboard (or the machine): gun lowered, view turned to `at` and leaned in; keys clack while typing. */
function workOn(s: GameSession, at: Vector3, typing: boolean, dt: number) {
  const t = s.terminal
  const p = s.player
  t.using = true
  t.typing = typing
  t.at.copy(at)
  p.eye(eye)
  const dx = at.x - eye.x, dy = at.y - eye.y, dz = at.z - eye.z
  p.yaw += wrapAngle(yawTo(dx, dz) - p.yaw) * Math.min(1, dt * 6)
  p.pitch = damp(p.pitch, Math.atan2(dy, Math.hypot(dx, dz)), 6, dt)
  if (typing && s.time >= t.nextKey) {
    // bursts of typing with the odd pause and a mouse click
    const r = Math.random()
    t.nextKey = s.time + (r < 0.08 ? 0.5 + Math.random() * 0.4 : 0.07 + Math.random() * 0.1)
    audio.keyTap(r > 0.9)
  }
}

/**
 * Gathers everything the player could use (objective terminals, pickups, doors, alarm panels, bodies, vehicles), picks
 * the closest one in view and not behind a wall, shows its prompt and handles press / hold-to-use.
 */
export function updateInteraction(s: GameSession, dt: number) {
  const { player, objectives, security } = s
  const term = s.terminal
  term.blend = damp(term.blend, term.using ? 1 : 0, term.using ? 5 : 8, dt)
  term.using = false
  objectives.handle({ type: 'position', x: player.feet.x, z: player.feet.z })
  s.prompt = null
  player.interactAvailable = false
  if (!player.active || s.recon.active || player.vault || s.grenades.priming) return

  const K = bindingLabel('interact')
  const press = (t: string) => `[ ${K} ] ${t}`
  const hold = (t: string) => `Hold [ ${K} ] ${t}`
  player.eye(eye)
  player.forward(fwd)
  const candidates: Candidate[] = []
  /** `owns` says whether a ray hit belongs to the thing itself (a door leaf, a vehicle body). */
  const consider = (pos: Vector3, c: Omit<Candidate, 'dist'>, reach = REACH, owns?: (tag: ColliderTag | undefined) => boolean) => {
    to.subVectors(pos, eye)
    const d = to.length()
    if (d > reach) return
    to.divideScalar(d)
    // must be roughly in front of us (or right next to us)
    if (d > 0.8 && to.dot(fwd) < 0.55) return
    // and not through a wall
    const hit = s.physics.raycast(eye, to, d, player.character.collider, 'move')
    if (hit && hit.distance < d - 0.35 && !owns?.(hit.tag)) return
    candidates.push({ ...c, dist: d })
  }

  // objective terminals / systems (current primary + every open secondary)
  for (const o of objectives.active()) {
    if (o.kind !== 'hack' && o.kind !== 'interact' && o.kind !== 'disable') continue
    const target = s.layout.interactables.find((i) => i.id === o.interactId)
    if (!target) continue
    const pos = new Vector3(...target.position)
    const computer = s.layout.computers?.find((c) => c.kind === 'workstation' && c.id === target.id)
    if (o.kind === 'interact') {
      consider(pos, { text: press(cap(target.label)), hold: 0, progress: () => null, use: () => objectives.handle({ type: 'interacted', interactId: o.interactId }) })
      continue
    }
    consider(pos, {
      text: hold(cap(target.label)), hold: o.duration, progress: () => objectives.progress[o.id],
      use: (step) => {
        workOn(s, computer ? screenCenter(computer) : pos, !!computer, step)
        const before = objectives.progress[o.id]
        const now = (objectives.progress[o.id] = Math.min(1, before + step / o.duration))
        if (Math.floor(before * 10) !== Math.floor(now * 10)) audio.cue('beep')
        // sabotage makes some noise; downloads are silent
        if (o.kind === 'disable' && Math.floor(before * 4) !== Math.floor(now * 4)) {
          audio.impact('metal', pos)
          s.noises.push({ position: pos.clone(), kind: 'impact', radius: 8 })
        }
        if (now >= 1) {
          if (o.kind === 'disable') s.effects.emit('spark', pos, new Vector3(0, 1, 0), 30)
          objectives.handle({ type: 'interacted', interactId: o.interactId })
        }
      },
    })
  }

  for (const p of s.pickups) {
    if (p.taken) continue
    consider(new Vector3(...p.position), {
      text: press(`Take ${cap(p.label)}`), hold: 0, progress: () => null,
      use: () => {
        p.taken = true
        s.inventory.add(p.id)
        audio.cue('pickup')
        s.notify(`Acquired: ${p.label}`, 'good')
        objectives.handle({ type: 'collected', itemId: p.id })
      },
    }, REACH + 0.4)
  }

  for (const d of security.doors) {
    const at = doorCenter(d.def).setY(Math.max(player.feet.y + 1.1, d.def.hinge[1] + 1))
    const name = d.def.label ?? 'Door'
    const owns = (t: ColliderTag | undefined) => t?.kind === 'door' && t.id === d.def.id
    const status = security.doorStatus(d)
    if (status === 'LOCKED' || status === 'LOCKED_BY_ALERT') {
      const time = d.def.hackTime ?? d.def.forceTime
      const why = status === 'LOCKED_BY_ALERT' ? ' (LOCKDOWN)' : d.def.lockedBy && d.def.lockedBy !== 'never' ? ' (keycard)' : ''
      if (time) {
        consider(at, {
          text: hold(`${d.def.hackTime ? 'Bypass Lock' : 'Force Open'} — ${name}${why}`),
          hold: time, progress: () => d.progress, use: (step) => {
            workOn(s, at, !!d.def.hackTime, step) // keypad hack: typing; forcing: hands on the door
            security.bypassDoor(d, step)
          },
        }, REACH + 0.3, owns)
      } else {
        consider(at, { text: `${name} — LOCKED${why}`, hold: 0, progress: () => null, use: () => security.toggleDoor(d) }, REACH + 0.3, owns)
      }
      continue
    }
    const closing = status === 'OPEN' || status === 'OPENING'
    consider(at, {
      text: press(`${closing ? 'Close' : 'Open'} ${name === 'Door' ? 'Door' : `— ${name}`}`), hold: 0, progress: () => null,
      use: () => {
        const msg = security.toggleDoor(d)
        if (msg) s.notify(msg, 'warn')
      },
    }, REACH + 0.3, owns)
  }

  for (const p of security.panels) {
    if (p.disabled) continue
    consider(new Vector3(...p.def.position), {
      text: hold('Sabotage Alarm Panel'), hold: 2.2, progress: () => p.sabotage,
      use: (step) => {
        workOn(s, new Vector3(...p.def.position), false, step)
        security.sabotagePanel(p, step)
      },
    })
  }

  // dead guards carry spare magazines
  for (const g of s.guards) {
    if (g.data.state !== 'DEAD' || s.looted.has(g.data.id) || g.anim.sinceDeath < 1) continue
    if (g.data.position.distanceToSquared(player.feet) > 9) continue
    consider(g.data.position.clone().setY(g.data.position.y + 0.3), {
      text: press('Search Body — ammo'), hold: 0, progress: () => null,
      use: () => s.lootBody(g.data.id),
    }, REACH + 0.6, (t) => t?.kind === 'guard')
  }

  const veh = s.vehicles.near(player.feet)
  if (veh) {
    consider(veh.position.clone().setY(veh.position.y + 1), { text: press(`Enter Vehicle — ${veh.def.name}`), hold: 0, progress: () => null, use: () => s.vehicles.enter(veh) }, 3.6, (t) => t?.kind === 'vehicle')
  }

  if (!candidates.length) return
  candidates.sort((a, b) => a.dist - b.dist)
  const c = candidates[0]
  s.prompt = { text: c.text, progress: c.progress() }
  player.interactAvailable = true
  if (c.hold > 0 ? input.down('interact') : input.pressed('interact')) c.use(dt)
}
