import { Vector3 } from 'three'
import { audio } from '../audio/AudioSystem'
import { damageGuard } from '../enemies/guards'
import type { GameSession } from '../game/GameSession'
import type { RayHit } from '../physics/Physics'
import { useGameStore } from '../state/gameStore'
import type { Surface } from '../world/types'
import type { Bullet, HitHandler } from './ballistics'
import { SURFACES } from './surfaces'

const pos = new Vector3()

export type HitZone = 'head' | 'chest' | 'stomach' | 'arms' | 'legs'

/** Damage multipliers per hit zone (head and limbs come from the weapon). */
export function zoneMultiplier(zone: HitZone, head: number, limb: number) {
  return zone === 'head' ? head : zone === 'chest' ? 1 : zone === 'stomach' ? 0.9 : limb
}

/**
 * Hit zone on an upright body from the hit point: height above the feet (scaled for stance) picks head / chest /
 * stomach / legs; at torso height, hits well off the body's centre line are arms.
 */
export function hitZone(point: { x: number; y: number; z: number }, feet: Vector3, scale: number, yaw: number): HitZone {
  const h = (point.y - feet.y) / scale
  if (h > 1.47) return 'head'
  if (h < 0.86) return 'legs'
  // lateral offset from the centre line, measured along the body's right vector
  const side = Math.abs((point.x - feet.x) * Math.cos(yaw) - (point.z - feet.z) * Math.sin(yaw))
  if (side > 0.24) return 'arms'
  return h > 1.12 ? 'chest' : 'stomach'
}

/** CombatSystem glue: what a bullet does to whatever it hits. */
export function createHitHandler(s: GameSession): HitHandler {
  const surfaceHit = (surface: Surface, hit: RayHit, dir: Vector3) => {
    s.effects.impact(surface, hit.point, hit.normal, dir)
    const def = SURFACES[surface]
    audio.impact(def.sound, hit.point)
    // shallow angles on hard surfaces ricochet
    const grazing = Math.abs(dir.x * hit.normal.x + dir.y * hit.normal.y + dir.z * hit.normal.z) < 0.35
    if (grazing && Math.random() < def.ricochet * 2) audio.ricochet(hit.point)
    // impacts are audible: guards investigate bullets hitting near them (distraction shots work)
    s.noises.push({ position: pos.set(hit.point.x, hit.point.y, hit.point.z).clone(), kind: 'impact', radius: 7 })
    return def.penetrationCost
  }

  return {
    onHit(b: Bullet, hit: RayHit, dir: Vector3, damage: number) {
      const tag = hit.tag
      if (!tag) return Infinity
      switch (tag.kind) {
        case 'guard': {
          const g = s.guards.find((x) => x.data.id === tag.id)
          if (!g || g.data.state === 'DEAD') return 0
          if (b.owner.kind === 'peer') {
            s.effects.impact('flesh', hit.point, hit.normal, dir)
            return SURFACES.flesh.penetrationCost
          }
          const zone = hitZone(hit.point, g.data.position, g.crouched ? 0.7 : 1, g.data.yaw)
          const torso = zone === 'chest' || zone === 'stomach'
          const buddy = b.owner.kind === 'buddy' // the AI Player 2: its kills count, guards learn where it shot from
          const killed = damageGuard(s, g, damage * zoneMultiplier(zone, b.headMult, b.limbMult), dir, b.owner.kind === 'player' || buddy, torso, buddy ? s.coop.other.feet : undefined)
          s.effects.impact('flesh', hit.point, hit.normal, dir)
          audio.impact('flesh', hit.point)
          if (b.owner.kind === 'player') {
            s.stats.hits++
            if (zone === 'head') s.stats.headshots++
            audio.cue(killed ? 'kill' : 'hit')
            useGameStore.setState({ lastHitMarker: performance.now(), lastHitKill: killed })
          }
          return SURFACES.flesh.penetrationCost
        }
        case 'player': {
          if (b.owner.kind !== 'guard') return 0 // no friendly fire
          const p = s.player
          const zone = hitZone(hit.point, p.feet, p.prone ? 0.45 : p.crouching ? 0.65 : 1, p.yaw)
          s.damagePlayer(damage * zoneMultiplier(zone, 1.6, 0.75), dir, 'Eliminated', zone === 'chest' || zone === 'stomach')
          return Infinity
        }
        case 'peer':
          // the friend's own game decides what this does to them; the AI Player 2 lives here
          if (b.owner.kind === 'guard' && s.coop.botOn) s.coop.bot.damage(s, s.coop.other, damage)
          s.effects.impact('flesh', hit.point, hit.normal, dir)
          return b.owner.kind === 'player' ? 0 : Infinity
        case 'camera':
          s.security.damageCamera(tag.id)
          s.effects.impact('metal', hit.point, hit.normal, dir)
          audio.impact('glass', hit.point)
          return Infinity
        case 'vehicle':
          return surfaceHit('vehicle', hit, dir)
        case 'door':
          return surfaceHit(tag.surface, hit, dir)
        case 'static':
          return surfaceHit(tag.surface, hit, dir)
        case 'terrain':
          return surfaceHit(s.terrain.wildness(hit.point.x, hit.point.z) > 0.5 ? 'grass' : 'dirt', hit, dir)
      }
    },
    onWhizz(_b, at) {
      audio.whizz(at)
      s.suppression = Math.min(1, s.suppression + 0.35)
    },
  }
}
