import { Vector3 } from 'three'
import { calmState } from '../ai/guardBrain'
import { audio } from '../audio/AudioSystem'
import { damageGuard } from '../enemies/guards'
import type { GameSession } from '../game/GameSession'
import { useGameStore } from '../state/gameStore'

/** Combat knife (slot 5): a short stab. From behind or on an unaware guard it is a silent one-hit kill. */
export const KNIFE = { reach: 1.9, cooldown: 0.55, damage: 55, swing: 0.35 }

const eye = new Vector3()
const fwd = new Vector3()
const to = new Vector3()

/** Returns true when the stab connected. */
export function stab(s: GameSession): boolean {
  const p = s.player
  s.knife.swingAt = s.time
  audio.cloth(1)
  p.eye(eye)
  p.forward(fwd)
  // nearest guard in a narrow cone in front of us, within arm's reach, with nothing in between
  let best: (typeof s.guards)[number] | null = null
  let bestDist = Infinity
  for (const g of s.guards) {
    if (!g.active || g.data.state === 'DEAD') continue
    to.copy(g.data.position).setY(g.data.position.y + (g.crouched ? 0.8 : 1.2)).sub(eye)
    const d = to.length()
    if (d > KNIFE.reach || d >= bestDist || to.dot(fwd) / d < 0.75) continue
    const hit = s.physics.raycast(eye, to.divideScalar(d), d + 0.3, p.character.collider)
    if (hit?.tag?.kind !== 'guard' || hit.tag.id !== g.data.id) continue
    best = g
    bestDist = d
  }
  if (!best) return false
  const d = best.data
  // guard's facing is (-sin yaw, -cos yaw); we're behind him when we're on the other side of that
  const bx = p.feet.x - d.position.x, bz = p.feet.z - d.position.z
  const behind = (-Math.sin(d.yaw) * bx - Math.cos(d.yaw) * bz) / Math.max(0.01, Math.hypot(bx, bz)) < -0.2
  const takedown = behind || calmState(d.state) || d.state === 'SUSPICIOUS'
  to.copy(d.position).sub(p.feet).setY(0).normalize()
  const killed = damageGuard(s, best, takedown ? 999 : KNIFE.damage, to.clone(), true)
  eye.set(d.position.x, d.position.y + 1.2, d.position.z)
  s.effects.impact('flesh', eye, to.clone().negate(), to)
  audio.impact('flesh', eye)
  audio.cue(killed ? 'kill' : 'hit')
  useGameStore.setState({ lastHitMarker: performance.now(), lastHitKill: killed })
  return true
}
