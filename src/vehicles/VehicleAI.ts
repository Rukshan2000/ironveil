import { Vector3 } from 'three'
import { clamp, wrapAngle, yawTo } from '../utils/math'
import type { Vehicle } from './VehicleSystem'

const ARRIVE = 4
const STUCK_AFTER = 5

const fwd = new Vector3()

/**
 * VehicleAI: drives a vehicle along a waypoint route through the same controls a player uses (throttle, steer, brake),
 * so physics stay honest. Slows for turns and the last waypoint; if it gets stuck it gives up and "arrives" where it is.
 * Extension point for convoy formations, traffic rules and pathfinding on the nav grid.
 */
export class VehicleAI {
  private index = 0
  private stuck = 0
  done = false

  constructor(
    readonly vehicle: Vehicle,
    private readonly route: Vector3[],
    private readonly onArrive: (at: Vector3) => void,
    private readonly cruise = 8,
  ) {}

  update(dt: number) {
    if (this.done) return
    const v = this.vehicle
    const wp = this.route[this.index]
    const dx = wp.x - v.position.x, dz = wp.z - v.position.z
    const dist = Math.hypot(dx, dz)
    const last = this.index === this.route.length - 1
    if (dist < (last ? 2.5 : ARRIVE)) {
      if (!last) {
        this.index++
        return
      }
      return this.finish()
    }
    const heading = yawTo(v.forward(fwd).x, fwd.z)
    const err = wrapAngle(yawTo(dx, dz) - heading)
    const target = this.cruise * (1 - Math.min(0.65, Math.abs(err))) * (last ? clamp(dist / 12, 0.25, 1) : 1)
    v.autopilot = {
      steer: clamp(err * 2.2, -1, 1),
      throttle: v.speed < target ? 1 : 0,
      brake: v.speed > target + 1.5 ? 0.6 : 0,
    }
    this.stuck = v.speed < 0.6 ? this.stuck + dt : 0
    if (this.stuck > STUCK_AFTER) this.finish()
  }

  private finish() {
    this.done = true
    this.vehicle.autopilot = { steer: 0, throttle: 0, brake: 1 }
    this.onArrive(this.vehicle.position.clone())
    // hand back to physics as a parked vehicle
    setTimeout(() => (this.vehicle.autopilot = null), 1500)
  }
}
