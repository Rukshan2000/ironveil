import { Vector3 } from 'three'
import type { EffectsSystem } from '../effects/EffectsSystem'

const fwd = new Vector3(), side = new Vector3(), at = new Vector3(), dir = new Vector3()

/**
 * Water a boat throws up under way: foam churned out behind the transom, and spray peeling off both sides of the
 * bow once it is moving fast. `pos` is the boat at deck height (waterline 0.35 below), `speed` in m/s.
 */
export function boatWake(fx: EffectsSystem, pos: Vector3, yaw: number, speed: number, length = 7) {
  if (speed < 0.6) return
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw))
  side.set(Math.cos(yaw), 0, -Math.sin(yaw))
  const water = pos.y - 0.3
  // foam: a trail out of the props, plus a little off each quarter
  at.copy(pos).addScaledVector(fwd, -length * 0.5).setY(water)
  fx.emit('foam', at, dir.copy(fwd).negate().setY(0.05), speed > 4 ? 2 : 1, 0.6)
  if (Math.random() < Math.min(1, speed / 8)) {
    for (const k of [-1, 1]) fx.emit('foam', at.copy(pos).addScaledVector(side, k * 1.1).addScaledVector(fwd, -length * 0.2).setY(water), dir.copy(side).multiplyScalar(k), 1, 0.5)
  }
  // bow spray: only when planing
  if (speed < 3 || Math.random() > speed / 10) return
  for (const k of [-1, 1]) {
    at.copy(pos).addScaledVector(fwd, length * 0.3).addScaledVector(side, k * 0.8).setY(water + 0.15)
    fx.emit('spray', at, dir.copy(side).multiplyScalar(k).addScaledVector(fwd, -0.3).setY(0.9).normalize(), 2, Math.min(1.4, speed / 7))
  }
}
