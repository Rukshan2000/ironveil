import RAPIER from '@dimforge/rapier3d-compat'
import { Euler, Quaternion, type Vector3 } from 'three'
import { MATERIALS } from '../assets/materials'
import type { Terrain } from '../world/terrain'
import type { BoxDef, Surface } from '../world/types'

export type ColliderTag =
  | { kind: 'player' }
  /** The co-op friend's body (see net/coop). */
  | { kind: 'peer' }
  | { kind: 'guard'; id: string }
  | { kind: 'terrain' }
  /** `vision`/`bullets`: whether the collider blocks sight lines / bullets. */
  | { kind: 'static'; surface: Surface; vision: boolean; bullets: boolean }
  | { kind: 'door'; id: string; surface: Surface }
  | { kind: 'camera'; id: string }
  | { kind: 'vehicle'; id: string }

/** 'bullet' ignores fences and foliage, 'vision' ignores fences and glass but is blocked by foliage. */
export type RayMode = 'bullet' | 'vision' | 'move'

export interface RayHit {
  distance: number
  point: { x: number; y: number; z: number }
  normal: { x: number; y: number; z: number }
  tag: ColliderTag | undefined
  collider: RAPIER.Collider
}

let ready: Promise<void> | null = null
export const initPhysics = () => (ready ??= RAPIER.init())

export interface Character {
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
}

const e = new Euler()
const q = new Quaternion()
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 }

export function boxRotation(b: { yaw?: number; rx?: number; rz?: number }) {
  q.setFromEuler(e.set(b.rx ?? 0, b.yaw ?? 0, b.rz ?? 0, 'YXZ'))
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

/** Thin wrapper over a Rapier world: static level colliders, terrain, capsules, a shared character controller and tagged raycasts. */
export class Physics {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  readonly tags = new Map<number, ColliderTag>()
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })

  constructor(boxes: BoxDef[], terrain: Terrain) {
    const n = terrain.segments
    const ground = this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(n, n, terrain.heightfield(), { x: terrain.size, y: 1, z: terrain.size }),
    )
    this.tags.set(ground.handle, { kind: 'terrain' })

    for (const b of boxes) {
      if (b.collide === false) continue
      const desc = b.shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(b.s[1] / 2, b.s[0] / 2) : RAPIER.ColliderDesc.cuboid(b.s[0] / 2, b.s[1] / 2, b.s[2] / 2)
      desc.setTranslation(...b.p).setRotation(boxRotation(b))
      const spec = MATERIALS[b.mat]
      if (b.mat === 'foliage') desc.setSensor(true)
      const c = this.world.createCollider(desc)
      this.tags.set(c.handle, {
        kind: 'static',
        surface: spec.surface,
        vision: b.mat !== 'fence' && b.mat !== 'glass' && b.mat !== 'invisible',
        bullets: b.mat !== 'fence' && b.mat !== 'foliage' && b.mat !== 'invisible',
      })
    }

    this.controller = this.world.createCharacterController(0.02)
    this.controller.enableAutostep(0.45, 0.2, false)
    this.controller.enableSnapToGround(0.4)
    this.controller.setMaxSlopeClimbAngle((48 * Math.PI) / 180)
    this.controller.setMinSlopeSlideAngle((40 * Math.PI) / 180)
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.controller.setCharacterMass(85)
  }

  get colliderCount() {
    return this.world.colliders.len()
  }

  createCapsule(center: Vector3, halfHeight: number, radius: number, tag: ColliderTag): Character {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z))
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body)
    this.tags.set(collider.handle, tag)
    return { body, collider }
  }

  /** Kinematic body with one cuboid collider offset from its origin (doors, camera heads). */
  createKinematicBox(origin: { x: number; y: number; z: number }, half: [number, number, number], offset: [number, number, number], tag: ColliderTag) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(origin.x, origin.y, origin.z))
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(...half).setTranslation(...offset), body)
    this.tags.set(collider.handle, tag)
    return { body, collider }
  }

  /** Slides a character by `delta`, resolving collisions. Mutates `delta` to the allowed movement; returns grounded. */
  moveCharacter(c: Character, delta: Vector3): boolean {
    this.controller.computeColliderMovement(c.collider, delta, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
    const m = this.controller.computedMovement()
    delta.set(m.x, m.y, m.z)
    const t = c.body.translation()
    c.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z })
    return this.controller.computedGrounded()
  }

  /** Raycast with mode-specific filtering and optionally one excluded collider. `dir` must be normalized. */
  raycast(origin: Vector3 | { x: number; y: number; z: number }, dir: Vector3 | { x: number; y: number; z: number }, maxDist: number, exclude?: RAPIER.Collider, mode: RayMode = 'bullet'): RayHit | null {
    this.ray.origin = origin
    this.ray.dir = dir
    const flags = mode === 'vision' ? undefined : RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    const hit = this.world.castRayAndGetNormal(this.ray, maxDist, true, flags, undefined, exclude, undefined, (c) => {
      const tag = this.tags.get(c.handle)
      if (tag?.kind !== 'static') return true
      return mode === 'vision' ? tag.vision : mode === 'bullet' ? tag.bullets : true
    })
    if (!hit) return null
    const d = hit.timeOfImpact
    return {
      distance: d,
      point: { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d },
      normal: hit.normal,
      tag: this.tags.get(hit.collider.handle),
      collider: hit.collider,
    }
  }

  /** True when nothing blocks the straight line between a and b (vision rules). */
  clearLine(a: Vector3, b: Vector3, exclude?: RAPIER.Collider) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const d = Math.hypot(dx, dy, dz)
    if (d < 1e-3) return true
    return !this.raycast(a, { x: dx / d, y: dy / d, z: dz / d }, d - 0.05, exclude, 'vision')
  }

  /** Line of sight to a target that has its own collider: the first blocker may be the target itself (within `slack` m of b). */
  canSee(a: Vector3, b: Vector3, exclude?: RAPIER.Collider, slack = 0.6) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const d = Math.hypot(dx, dy, dz)
    if (d < 1e-3) return true
    const hit = this.raycast(a, { x: dx / d, y: dy / d, z: dz / d }, d, exclude, 'vision')
    return !hit || hit.distance > d - slack
  }

  /** True when solid world geometry (not sensors or characters) overlaps the shape. */
  private overlapping(center: { x: number; y: number; z: number }, shape: RAPIER.Shape, rot: { x: number; y: number; z: number; w: number }, exclude?: RAPIER.Collider) {
    let hit = false
    this.world.intersectionsWithShape(center, rot, shape, () => {
      hit = true
      return false
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, exclude, undefined, (c) => {
      const k = this.tags.get(c.handle)?.kind
      return k !== 'player' && k !== 'guard' && k !== 'camera'
    })
    return hit
  }

  /** Would an upright capsule (feet at `feet`) fit here without touching world geometry? */
  capsuleFits(feet: { x: number; y: number; z: number }, halfHeight: number, radius: number, exclude?: RAPIER.Collider) {
    const c = { x: feet.x, y: feet.y + halfHeight + radius + 0.12, z: feet.z }
    return !this.overlapping(c, new RAPIER.Capsule(halfHeight, radius), IDENTITY, exclude)
  }

  /** Room to lie down: a horizontal capsule along `yaw` just above the floor. */
  proneFits(feet: { x: number; y: number; z: number }, yaw: number, exclude?: RAPIER.Collider) {
    q.setFromEuler(e.set(Math.PI / 2, yaw, 0, 'YXZ'))
    return !this.overlapping({ x: feet.x, y: feet.y + 0.32, z: feet.z }, new RAPIER.Capsule(0.55, 0.26), { x: q.x, y: q.y, z: q.z, w: q.w }, exclude)
  }

  /**
   * Pushes a character out of anything it is embedded in (a door that swung into it, a vehicle parked on it).
   * Returns the correction applied (zero when free).
   */
  depenetrate(c: Character, out: Vector3): Vector3 {
    out.set(0, 0, 0)
    const t = c.body.translation()
    this.world.intersectionsWithShape(t, c.body.rotation(), c.collider.shape, (other) => {
      const contact = c.collider.contactCollider(other, 0)
      if (contact && contact.distance < -0.03) {
        // normal1 points out of the character towards the other collider: move the other way
        const d = contact.distance - 0.01
        out.x += contact.normal1.x * d
        out.y += Math.max(0, contact.normal1.y * d)
        out.z += contact.normal1.z * d
      }
      return true
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, c.collider, undefined, (o) => {
      const k = this.tags.get(o.handle)?.kind
      return k !== 'player' && k !== 'guard' && k !== 'camera' && k !== 'terrain'
    })
    if (out.lengthSq() > 0) c.body.setTranslation({ x: t.x + out.x, y: t.y + out.y, z: t.z + out.z }, true)
    return out
  }

  step(dt: number) {
    this.world.timestep = dt
    this.world.step()
  }

  dispose() {
    this.world.free()
  }
}
