import RAPIER from '@dimforge/rapier3d-compat'
import { Euler, Quaternion, Vector3, type Camera } from 'three'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import { damageGuard } from '../enemies/guards'
import { input } from '../game/input'
import type { GameSession } from '../game/GameSession'
import { clamp, damp } from '../utils/math'
import type { VehicleSpawn } from '../world/types'
import { VehicleAI } from './VehicleAI'
import { VEHICLES, type VehicleDef } from './definitions'

const e = new Euler()
const v = new Vector3()
const fwd = new Vector3()
const camTarget = new Vector3()
const camPos = new Vector3()

/** One drivable vehicle: dynamic chassis + Rapier raycast-vehicle controller (suspension, steering, wheel spin). */
export class Vehicle {
  readonly body: RAPIER.RigidBody
  readonly controller: RAPIER.DynamicRayCastVehicleController
  readonly position = new Vector3()
  readonly quaternion = new Quaternion()
  steer = 0
  throttle = 0
  rpm = 0
  speed = 0
  /** Set by a VehicleAI: replaces player input. */
  autopilot: { throttle: number; steer: number; brake: number } | null = null
  /** The co-op friend is driving this one: it follows their streamed transform instead of simulating. */
  remote: { position: Vector3; quaternion: Quaternion; speed: number } | null = null
  private engine: LoopHandle | null = null
  private noiseTimer = 0

  constructor(readonly id: string, readonly def: VehicleDef, private readonly s: GameSession, spawn: VehicleSpawn) {
    const world = s.physics.world
    const [x, y, z] = spawn.position
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, s.terrain.height(x, z) + y, z)
        .setRotation({ x: 0, y: Math.sin(spawn.yaw / 2), z: 0, w: Math.cos(spawn.yaw / 2) })
        .setLinearDamping(0.15).setAngularDamping(0.8).setCanSleep(true),
    )
    const col = world.createCollider(RAPIER.ColliderDesc.cuboid(...def.chassis).setTranslation(0, def.chassisOffsetY, 0).setDensity(def.density).setFriction(0.6), this.body)
    s.physics.tags.set(col.handle, { kind: 'vehicle', id })
    this.controller = world.createVehicleController(this.body)
    this.controller.indexUpAxis = 1
    this.controller.setIndexForwardAxis = 2
    const susp = def.suspension
    def.wheels.forEach((w, i) => {
      this.controller.addWheel({ x: w.at[0], y: w.at[1], z: w.at[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, susp.rest, def.wheelRadius)
      this.controller.setWheelSuspensionStiffness(i, susp.stiffness)
      this.controller.setWheelSuspensionCompression(i, susp.compression)
      this.controller.setWheelSuspensionRelaxation(i, susp.relaxation)
      this.controller.setWheelMaxSuspensionForce(i, susp.maxForce)
      this.controller.setWheelMaxSuspensionTravel(i, susp.travel)
      this.controller.setWheelFrictionSlip(i, def.frictionSlip)
      this.controller.setWheelSideFrictionStiffness(i, def.sideFriction)
    })
    this.sync()
  }

  private sync() {
    const t = this.body.translation(), r = this.body.rotation()
    this.position.set(t.x, t.y, t.z)
    this.quaternion.set(r.x, r.y, r.z, r.w)
  }

  /** Forward direction (local -Z) in world space. */
  forward(out: Vector3) {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion)
  }

  /** Co-op: hand the vehicle to the friend's stream (or back to physics with null). */
  setRemote(r: { position: Vector3; quaternion: Quaternion; speed: number } | null) {
    if (!r === !this.remote) return
    this.remote = r
    this.body.setBodyType(r ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true)
    if (!r) this.speed = 0
  }

  private followRemote(dt: number) {
    const r = this.remote!
    const k = this.position.distanceTo(r.position) > 6 ? 1 : 1 - Math.exp(-12 * dt)
    this.position.lerp(r.position, k)
    this.quaternion.slerp(r.quaternion, k)
    this.body.setNextKinematicTranslation(this.position)
    this.body.setNextKinematicRotation(this.quaternion)
    this.speed = r.speed
    this.rpm = damp(this.rpm, clamp(Math.abs(this.speed) / this.def.maxSpeed, 0, 1) * 0.8 + 0.15, 3, dt)
    this.engine ??= audio.loop('truck', this.position)
    this.engine?.set('rate', this.rpm)
    this.engine?.move(this.position)
  }

  update(dt: number, driven: boolean) {
    if (this.remote) return this.followRemote(dt)
    const def = this.def
    let throttle = 0, brake = 0, steerIn = 0, handbrake = false
    if (this.autopilot) {
      throttle = this.autopilot.throttle
      steerIn = this.autopilot.steer
      brake = this.autopilot.brake
    } else if (driven) {
      const f = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0)
      steerIn = (input.down('left') ? 1 : 0) - (input.down('right') ? 1 : 0)
      handbrake = input.down('jump')
      const forwardSpeed = this.speed
      // S brakes while rolling forward, then reverses
      if (f < 0 && forwardSpeed > 1) brake = 1
      else if (f > 0 && forwardSpeed < -1) brake = 1
      else throttle = f
    } else brake = 0.3
    this.throttle = damp(this.throttle, throttle, 6, dt)
    // steering gets slower and tighter at speed
    const steerLimit = def.maxSteer * (1 - clamp(Math.abs(this.speed) / def.maxSpeed, 0, 1) * 0.55)
    this.steer = damp(this.steer, steerIn * steerLimit, 5, dt)
    const fade = 1 - clamp(Math.abs(this.speed) / def.maxSpeed, 0, 1) ** 2
    def.wheels.forEach((w, i) => {
      this.controller.setWheelSteering(i, w.steer ? this.steer : 0)
      // the controller's forward axis is +Z; our vehicles face -Z
      this.controller.setWheelEngineForce(i, w.drive ? -this.throttle * def.engineForce * fade : 0)
      this.controller.setWheelBrake(i, brake * def.brakeForce + (handbrake && !w.steer ? def.brakeForce * 1.5 : 0))
    })
    if (driven || this.body.isMoving()) this.body.wakeUp()
    this.controller.updateVehicle(dt)
    this.sync()
    const before = this.speed
    this.speed = -this.controller.currentVehicleSpeed()
    // hitting something hard hurts the driver
    const jolt = Math.abs(before - this.speed)
    if (driven && jolt > 7 && dt > 0) {
      this.s.damagePlayer((jolt - 7) * 9, fwd.set(0, 0, 0), 'Vehicle accident')
      audio.impact('metal', this.position)
      this.s.shake = Math.min(1, jolt / 15)
    }

    // engine audio + noise
    const target = clamp(Math.abs(this.speed) / def.maxSpeed, 0, 1) * 0.8 + Math.abs(this.throttle) * 0.25
    const running = driven || !!this.autopilot
    this.rpm = damp(this.rpm, running ? target : 0, 3, dt)
    if (running && !this.engine) this.engine = audio.loop('truck', this.position)
    if (!running && this.engine && Math.abs(this.speed) < 0.5) {
      this.engine.stop()
      this.engine = null
    }
    if (this.engine) {
      this.engine.set('rate', this.rpm)
      this.engine.move(this.position)
    }
    if (driven && (this.noiseTimer -= dt) <= 0) {
      this.noiseTimer = 0.5
      this.s.noises.push({ position: this.position.clone(), kind: 'vehicle', radius: 22 + Math.abs(this.speed) * 1.5 })
    }
    // only the player runs people over; AI drivers are assumed to steer round their own side
    if (driven && Math.abs(this.speed) > 5) this.runOver()
  }

  private runOver() {
    this.forward(fwd)
    for (const g of this.s.guards) {
      if (!g.active || g.data.state === 'DEAD') continue
      v.subVectors(g.data.position, this.position).setY(0)
      if (v.length() < 2.4 && v.normalize().dot(fwd) * Math.sign(this.speed) > 0.5) {
        damageGuard(this.s, g, Math.abs(this.speed) * 12, fwd.clone().multiplyScalar(Math.sign(this.speed)), true)
        audio.impact('flesh', g.data.position)
      }
    }
  }

  dispose() {
    this.engine?.stop()
  }
}

/** VehicleSystem: spawns vehicles, handles enter/exit, driving input and the chase camera. */
export class VehicleSystem {
  readonly vehicles: Vehicle[]
  driving: Vehicle | null = null
  readonly drivers: VehicleAI[] = []
  private orbitYaw = 0
  private orbitPitch = -0.18

  constructor(private readonly s: GameSession) {
    this.vehicles = s.layout.vehicles.map((spawn, i) => new Vehicle(spawn.id ?? `${spawn.def}-${i}`, VEHICLES[spawn.def], s, spawn))
  }

  /** Vehicle within reach of the player's position, if any (not ones an AI is driving). */
  near(p: Vector3): Vehicle | null {
    return this.vehicles.find((veh) => !veh.autopilot && !veh.remote && veh.position.distanceTo(p) < 3.2 + (veh.def.model === 'truck' ? 1.5 : 0)) ?? null
  }

  /** Has an AI drive vehicle `id` along a named layout route. Returns false if it can't (missing, or player has it). */
  drive(id: string, routeId: string, onArrive: (at: Vector3) => void, cruise?: number): boolean {
    const veh = this.vehicles.find((v) => v.id === id)
    const route = this.s.layout.vehicleRoutes[routeId]
    if (!veh || !route || veh === this.driving || veh.autopilot) return false
    this.drivers.push(new VehicleAI(veh, route.map((p) => new Vector3(...p)), onArrive, cruise))
    return true
  }

  enter(veh: Vehicle) {
    const p = this.s.player
    this.driving = veh
    p.active = false
    p.character.collider.setEnabled(false)
    this.orbitYaw = 0
    audio.mech('switch')
  }

  /**
   * Leaves the vehicle on the first side with room to stand (driver door, passenger side, behind, front, roof as a
   * last resort) so the player can never be trapped in or under it. Returns false when there is nowhere to go yet.
   */
  exit(): boolean {
    const veh = this.driving
    if (!veh) return false
    const p = this.s.player
    const [ex, ey, ez] = veh.def.exit
    const half = veh.def.chassis
    const candidates: [number, number, number][] = [[ex, ey, ez], [-ex, ey, ez], [0, ey, half[2] + 1.2], [0, ey, -half[2] - 1.2], [ex * 1.6, ey, 0], [0, half[1] * 2 + 1, 0]]
    let out: Vector3 | null = null
    for (const c of candidates) {
      const at = new Vector3(...c).applyQuaternion(veh.quaternion).add(veh.position)
      const floor = this.s.floorAt(at.x, at.z, at.y + 1)
      at.y = Math.max(floor, this.s.terrain.height(at.x, at.z)) + 0.05
      if (this.s.physics.capsuleFits(at, 0.5, 0.33)) {
        out = at
        break
      }
    }
    if (!out) {
      this.s.notify('No room to get out here', 'warn')
      return false
    }
    p.teleport(out)
    p.character.collider.setEnabled(true)
    p.active = true
    p.yaw = Math.atan2(-veh.forward(fwd).x, -fwd.z)
    p.pitch = 0
    this.driving = null
    audio.mech('switch')
    return true
  }

  update(dt: number) {
    for (const ai of this.drivers) ai.update(dt)
    for (const veh of this.vehicles) veh.update(dt, veh === this.driving)
    if (this.driving) {
      const { dx, dy } = input.consumeMouse()
      this.orbitYaw = this.orbitYaw - dx * 0.003
      this.orbitPitch = clamp(this.orbitPitch - dy * 0.003, -0.8, 0.3)
      // drift the orbit back behind the vehicle when not looking around
      if (Math.abs(dx) < 1) this.orbitYaw = damp(this.orbitYaw, 0, 1.2, dt)
      // keep the player's body with the vehicle for perception/minimap
      this.s.player.feet.copy(this.driving.position)
      if (input.pressed('interact')) this.exit()
      // a wrecked/flipped vehicle throws you out
      if (this.driving && new Vector3(0, 1, 0).applyQuaternion(this.driving.quaternion).y < 0.2 && Math.abs(this.driving.speed) < 1) this.exit()
    }
  }

  /** Chase camera with wall avoidance. Returns false when not driving. */
  applyCamera(camera: Camera): boolean {
    const veh = this.driving
    if (!veh) return false
    const yaw = Math.atan2(-veh.forward(fwd).x, -fwd.z) + this.orbitYaw
    const c = veh.def.camera
    camTarget.copy(veh.position).setY(veh.position.y + 1.4)
    v.set(Math.sin(yaw) * Math.cos(this.orbitPitch), -Math.sin(this.orbitPitch), Math.cos(yaw) * Math.cos(this.orbitPitch))
    const hit = this.s.physics.raycast(camTarget, v, c.distance, undefined, 'move')
    const dist = hit && hit.tag?.kind !== 'vehicle' ? Math.max(1.5, hit.distance - 0.3) : c.distance
    camPos.copy(camTarget).addScaledVector(v, dist)
    camPos.y = Math.max(camPos.y, this.s.terrain.height(camPos.x, camPos.z) + 0.6, camTarget.y - 0.5 + c.height * 0.3)
    camera.position.lerp(camPos, 0.25)
    camera.quaternion.setFromEuler(e.set(this.orbitPitch - 0.08, yaw, 0, 'YXZ'))
    return true
  }

  dispose() {
    this.vehicles.forEach((veh) => veh.dispose())
  }
}
