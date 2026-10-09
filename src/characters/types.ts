import type { Object3D, Vector3 } from 'three'

/**
 * What the AI tells the animation layer each frame. This is the only contract between gameplay and character
 * visuals: a GLB character with an AnimationMixer can replace the procedural soldier by implementing CharacterRig
 * against the same state, without touching AI code.
 */
export interface AnimState {
  /** Horizontal speed, m/s. */
  speed: number
  /** 0 = standing, 1 = crouched. */
  crouch: number
  /** 0 = weapon lowered, 1 = shouldered. */
  aim: number
  /** Seconds since the last shot. */
  sinceShot: number
  /** -1 when not reloading, else reload progress 0..1. */
  reload: number
  /** Talking on the radio / hitting an alarm panel. */
  radio: boolean
  /** Body yaw rate (rad/s), drives turn-in-place stepping. */
  turnRate: number
  /** Head yaw relative to the body (rad). */
  lookYaw: number
  /** Seconds since last hit (flinch). */
  sinceHit: number
  dead: boolean
  /** Seconds since death. */
  sinceDeath: number
  /** Direction of the killing shot (world), for which way the body falls. Ragdoll-ready impulse. */
  deathDir: Vector3
  /** Body yaw (world), so rigs can convert deathDir into local space. */
  yaw: number
}

export interface CharacterRig {
  readonly root: Object3D
  /** World-space muzzle position for flashes/bullets (written by update). */
  readonly muzzle: Vector3
  update(dt: number, s: AnimState): void
  /** 0 = full detail, 1 = reduced (far away). */
  setDetail(level: 0 | 1): void
  dispose(): void
}
