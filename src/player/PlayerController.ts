import { Vector3 } from 'three'
import { input } from '../game/input'
import type { Character, Physics, RayHit } from '../physics/Physics'
import { settings } from '../state/settings'
import { clamp, damp } from '../utils/math'

export type Stance = 'stand' | 'crouch' | 'prone'
export type DeathCause = 'Eliminated' | 'Explosion' | 'Fall' | 'Vehicle accident' | 'Out of bounds'

/** Movement tuning. Speeds in m/s, accelerations in m/s². */
export const PLAYER = {
  radius: 0.35,
  /** Capsule half-heights (total height = 2 * (half + radius)) and eye heights per stance. */
  half: { stand: 0.5, crouch: 0.2, prone: 0.01 } as Record<Stance, number>,
  eye: { stand: 1.62, crouch: 1.02, prone: 0.38 } as Record<Stance, number>,
  walkSpeed: 3.6,
  slowWalkSpeed: 1.6,
  sprintSpeed: 6.1,
  crouchSpeed: 1.7,
  proneSpeed: 0.75,
  adsSpeedFactor: 0.55,
  /** Ground acceleration when speeding up / slowing down / reversing — a loaded soldier can't stop on a dime. */
  accel: 11,
  decel: 10,
  reverseAccel: 8,
  sprintAccel: 5,
  airAccel: 1.2,
  jumpVelocity: 4.7,
  gravity: 18,
  /** Seconds to settle into a stance (prone takes longer — you have to get down). */
  stanceTime: { stand: 0.28, crouch: 0.28, prone: 0.7 } as Record<Stance, number>,
  /** Radians per mouse count at sensitivity 1. */
  sensitivity: 0.0022,
  staminaMax: 100,
  sprintDrain: 18,
  staminaRegen: 14,
  staminaRegenDelay: 1.0,
  jumpCost: 14,
  vaultCost: 10,
  maxHealth: 100,
  maxArmor: 50,
  /** Landing faster than this (m/s) hurts. */
  fallDamageSpeed: 14.5,
  /** Distance per footstep (m) by gait. */
  stride: { prone: 0.9, crouch: 0.75, slow: 1.1, walk: 1.45, sprint: 2.0 },
  /** Sideways head offset at full lean (m) and camera roll (rad). */
  leanDistance: 0.38,
  leanRoll: 0.13,
  /** Obstacles between these heights (m above the feet) can be vaulted or mantled. */
  vaultMin: 0.42,
  vaultMax: 1.3,
}

export interface StepEvent {
  /** Noise radius in metres (0 = silent). */
  radius: number
  gait: 'prone' | 'crouch' | 'slow' | 'walk' | 'sprint' | 'land' | 'vault'
  /** 0..1 loudness for the audio layer. */
  intensity: number
}

/** What the weapon side tells the body this frame. */
export interface WeaponInfo {
  aim: number
  recoilRecovery: number
  /** Current view FOV / base FOV — look speed scales with it so zoomed aim feels the same. */
  fovRatio: number
  scoped: boolean
}

interface Vault {
  t: number
  duration: number
  from: Vector3
  to: Vector3
  peak: number
}

/**
 * First-person body: look, weighted movement, three stances with real capsule changes, leaning, vaulting, stamina,
 * health/armor, recoil offsets and the procedural camera rig (bob, roll, landing spring, breathing sway).
 */
export class PlayerController {
  readonly feet: Vector3
  readonly velocity = new Vector3()
  readonly character: Character
  yaw: number
  pitch = 0
  recoilPitch = 0
  recoilYaw = 0
  /** Weapon sway that moves the real point of aim (scoped rifles), set by the weapon system. */
  swayPitch = 0
  swayYaw = 0
  stance: Stance = 'stand'
  sprinting = false
  slowWalking = false
  grounded = false
  eyeHeight = PLAYER.eye.stand
  /** Smoothed 0 = standing, 1 = crouched or lower (weapon pose, bob). */
  lowness = 0
  /** Smoothed 0..1 prone blend (weapon pose). */
  proneAmount = 0
  /** -1 (left) .. 1 (right), smoothed. */
  lean = 0
  /** Actual sideways head offset after collision limits (m). */
  leanOffset = 0
  stamina = PLAYER.staminaMax
  health = PLAYER.maxHealth
  armor = PLAYER.maxArmor
  deathCause: DeathCause | null = null
  /** Horizontal speed, m/s. */
  speed = 0
  flashlight = false
  /** Weapon/carry weight multiplier on top speed (set by the weapon system). */
  speedFactor = 1
  /** Extra look-sensitivity multiplier (binocular zoom). */
  lookScale = 1
  /** Disabled while driving. */
  active = true
  /** 0..1 how out of breath (drives breathing audio and sway). */
  exertion = 0
  /** Smoothed mouse motion this frame (rad), read by weapon sway. */
  lookVelocity = { x: 0, y: 0 }
  /** An interaction prompt is showing: a key shared with lean (E) interacts instead of leaning. */
  interactAvailable = false
  /** Last position where the capsule stood free on solid ground (recovery target). */
  readonly lastSafe: Vector3
  vault: Vault | null = null
  private wantCrouch = false

  // camera rig outputs
  readonly camOffset = new Vector3()
  camRoll = 0
  camPitch = 0
  fovKick = 0

  bobPhase = 0
  private landSpring = 0
  private landVel = 0
  private exhausted = false
  private staminaDelay = 0
  private stepDistance = 0
  private time = 0
  private safeTimer = 0
  private flinchRoll = 0
  private readonly tmp = new Vector3()
  private readonly wish = new Vector3()

  constructor(private readonly physics: Physics, start: Vector3, yaw: number) {
    this.feet = start.clone()
    this.lastSafe = start.clone()
    this.yaw = yaw
    this.character = physics.createCapsule(start.clone().setY(start.y + this.centerOffset('stand')), PLAYER.half.stand, PLAYER.radius, { kind: 'player' })
  }

  get alive() {
    return this.health > 0
  }

  get moving() {
    return this.speed > 0.5
  }

  /** Low profile (crouched or prone) — for stealth, recoil and sway. */
  get crouching() {
    return this.stance !== 'stand'
  }

  get prone() {
    return this.stance === 'prone'
  }

  /** Landing compression for the weapon view (m). */
  get landingDip() {
    return Math.max(0, this.landSpring)
  }

  private centerOffset(s: Stance) {
    return PLAYER.half[s] + PLAYER.radius
  }

  /** Right vector of the body (horizontal). */
  private right(out: Vector3) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
  }

  /** Camera position: stance height, lean offset and landing dip (rig bob is applied in view space by the game loop). */
  eye(out: Vector3): Vector3 {
    const r = this.leanOffset
    return out.set(
      this.feet.x + Math.cos(this.yaw) * r,
      this.feet.y + this.eyeHeight - this.landSpring - Math.abs(r) * 0.12,
      this.feet.z - Math.sin(this.yaw) * r,
    )
  }

  /** Centre of the torso (for light sampling and enemy aim). Leaning exposes the head more than the body. */
  chest(out: Vector3): Vector3 {
    const r = this.leanOffset * 0.35
    const h = this.stance === 'prone' ? 0.3 : this.stance === 'crouch' ? 0.7 : 1.2
    return out.set(this.feet.x + Math.cos(this.yaw) * r, this.feet.y + h, this.feet.z - Math.sin(this.yaw) * r)
  }

  /** Look direction exactly as the camera shows it (recoil, sway, breathing/landing pitch) — what you see is what you hit. */
  forward(out: Vector3): Vector3 {
    const p = this.pitch + this.recoilPitch + this.swayPitch + this.camPitch
    const y = this.yaw + this.recoilYaw + this.swayYaw
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))
  }

  addRecoil(vertical: number, horizontal: number) {
    this.recoilPitch += vertical
    this.recoilYaw += horizontal
  }

  /** Damage after armor. Torso hits are partly soaked by the plate carrier until it is spent. */
  damage(amount: number, cause: DeathCause = 'Eliminated', torso = false) {
    if (!this.alive) return
    if (torso && this.armor > 0) {
      const soak = Math.min(this.armor, amount * 0.45)
      this.armor -= soak
      amount -= soak
    }
    this.health = Math.max(0, this.health - amount)
    if (this.health === 0) this.deathCause = cause
  }

  /** Being hit jolts the view a little towards/away from the shooter. */
  flinch(strength: number) {
    this.recoilPitch += 0.012 * strength
    this.recoilYaw += (Math.random() - 0.5) * 0.02 * strength
    this.flinchRoll += (Math.random() < 0.5 ? -1 : 1) * 0.03 * strength
  }

  teleport(p: Vector3) {
    this.feet.copy(p)
    this.velocity.set(0, 0, 0)
    this.vault = null
    this.character.body.setTranslation({ x: p.x, y: p.y + this.centerOffset(this.stance), z: p.z }, true)
  }

  /** Changes stance if the capsule fits. Returns false when blocked (no headroom / no room to lie down). */
  setStance(next: Stance): boolean {
    if (next === this.stance) return true
    const fits = next === 'prone'
      ? this.physics.proneFits(this.feet, this.yaw, this.character.collider) || !this.grounded
      : this.physics.capsuleFits(this.feet, PLAYER.half[next], PLAYER.radius - 0.02, this.character.collider)
    if (!fits) return false
    this.stance = next
    this.character.collider.setHalfHeight(PLAYER.half[next])
    this.character.body.setTranslation({ x: this.feet.x, y: this.feet.y + this.centerOffset(next), z: this.feet.z }, true)
    return true
  }

  /** Remember this spot as safe when standing on something solid with room around us. Called at a low rate. */
  private recordSafe(dt: number) {
    if ((this.safeTimer -= dt) > 0) return
    this.safeTimer = 0.5
    if (!this.grounded || this.vault || Math.abs(this.velocity.y) > 1) return
    if (this.physics.capsuleFits(this.feet, PLAYER.half[this.stance], PLAYER.radius - 0.05, this.character.collider)) this.lastSafe.copy(this.feet)
  }

  /** Returns a footstep/landing event when one happens this frame. */
  update(dt: number, w: WeaponInfo): StepEvent | null {
    this.time += dt
    const cfg = settings()
    // look: sensitivity scales with zoom so aiming through an optic feels like the same mouse
    const { dx, dy } = input.consumeMouse()
    const aimMult = 1 + ((w.scoped ? cfg.scopeSensitivity : cfg.adsSensitivity) * w.fovRatio - 1) * w.aim
    const sens = PLAYER.sensitivity * cfg.sensitivity * aimMult * this.lookScale
    this.yaw -= dx * sens
    this.pitch = clamp(this.pitch - dy * sens * (cfg.invertY ? -1 : 1), -1.48, this.prone ? 0.6 : 1.48)
    this.lookVelocity.x = damp(this.lookVelocity.x, -dx * sens, 18, dt)
    this.lookVelocity.y = damp(this.lookVelocity.y, -dy * sens, 18, dt)
    // recoil: most of the kick is recovered (the player's muscle memory), the rest stays as aim drift
    this.recoilPitch = damp(this.recoilPitch, 0, w.recoilRecovery, dt)
    this.recoilYaw = damp(this.recoilYaw, 0, w.recoilRecovery, dt)

    if (input.pressed('flashlight')) this.flashlight = !this.flashlight

    if (this.vault) return this.updateVault(dt)

    const fwd = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0)
    const strafe = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0)
    const wantsSprint = input.down('sprint') && fwd > 0 && w.aim < 0.3
    let event: StepEvent | null = this.updateStanceInput(wantsSprint, fwd)
    const st = this.stance
    this.lowness = damp(this.lowness, st === 'stand' ? 0 : 1, 3 / PLAYER.stanceTime[st], dt)
    this.proneAmount = damp(this.proneAmount, st === 'prone' ? 1 : 0, 3 / PLAYER.stanceTime.prone, dt)
    this.eyeHeight = damp(this.eyeHeight, PLAYER.eye[st], 3 / PLAYER.stanceTime[st], dt)

    // intent
    const wish = this.wish.set(strafe, 0, -fwd)
    if (wish.lengthSq() > 0) wish.normalize().applyAxisAngle(UP, this.yaw)
    this.sprinting = wantsSprint && st === 'stand' && !this.exhausted && this.stamina > 0 && wish.lengthSq() > 0 && this.grounded
    this.slowWalking = !this.sprinting && input.down('walk')
    let maxSpeed = st === 'prone' ? PLAYER.proneSpeed : st === 'crouch' ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprintSpeed : this.slowWalking ? PLAYER.slowWalkSpeed : PLAYER.walkSpeed
    if (fwd < 0) maxSpeed *= 0.75 // backpedalling is slower
    if (st !== 'prone') maxSpeed *= 1 - w.aim * (1 - PLAYER.adsSpeedFactor)
    maxSpeed *= this.speedFactor * (this.health < 35 ? 0.85 : 1) * (Math.abs(this.lean) > 0.3 ? 0.7 : 1)

    // weighted acceleration: speeding up, braking and reversing all have different rates
    const tx = wish.x * maxSpeed, tz = wish.z * maxSpeed
    let rate = PLAYER.airAccel
    if (this.grounded) {
      const along = this.velocity.x * tx + this.velocity.z * tz
      rate = tx === 0 && tz === 0 ? PLAYER.decel : along < 0 ? PLAYER.reverseAccel : this.sprinting ? PLAYER.sprintAccel : PLAYER.accel
    }
    const hx = tx - this.velocity.x, hz = tz - this.velocity.z
    const hl = Math.hypot(hx, hz)
    if (hl > 0) {
      const stepLen = Math.min(hl, rate * dt)
      this.velocity.x += (hx / hl) * stepLen
      this.velocity.z += (hz / hl) * stepLen
    }

    // stamina
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - PLAYER.sprintDrain * dt)
      this.staminaDelay = PLAYER.staminaRegenDelay
      if (this.stamina === 0) this.exhausted = true
    } else if ((this.staminaDelay -= dt) <= 0) {
      this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt * (this.moving ? 0.6 : 1) * (st === 'stand' ? 1 : 1.25))
    }
    if (this.exhausted && this.stamina > 35) this.exhausted = false
    this.exertion = damp(this.exertion, clamp(1 - this.stamina / 70, 0, 1), 1.5, dt)

    // jump / vault (jump from crouch or prone stands up instead)
    if (input.pressed('jump') && this.grounded) {
      if (st === 'prone') this.setStance('crouch')
      else if (st === 'crouch') this.wantCrouch = false
      else if (this.stamina >= PLAYER.vaultCost && this.tryVault()) return { radius: 6, gait: 'vault', intensity: 0.7 }
      else if (this.stamina >= PLAYER.jumpCost) {
        this.velocity.y = PLAYER.jumpVelocity
        this.stamina -= PLAYER.jumpCost
        this.staminaDelay = PLAYER.staminaRegenDelay
      }
    }
    this.velocity.y -= PLAYER.gravity * dt

    // collide & move
    const fallSpeed = -this.velocity.y
    const wasGrounded = this.grounded
    const delta = this.tmp.copy(this.velocity).multiplyScalar(dt)
    this.grounded = this.physics.moveCharacter(this.character, delta)
    this.feet.add(delta)
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0
    if (this.velocity.y > 0 && delta.y < this.velocity.y * dt * 0.5) this.velocity.y = 0 // bonked head
    // walls absorb momentum instead of letting it build up against them
    const moved = Math.hypot(delta.x, delta.z) / dt
    if (moved < Math.hypot(this.velocity.x, this.velocity.z) * 0.5) this.velocity.multiplyScalar(0.5).setY(this.velocity.y)
    this.speed = moved

    if (this.grounded && !wasGrounded && fallSpeed > 3) {
      this.landVel += Math.min(1.6, fallSpeed * 0.09)
      if (fallSpeed > PLAYER.fallDamageSpeed) this.damage((fallSpeed - PLAYER.fallDamageSpeed) * 9, 'Fall')
      event = { radius: Math.min(14, fallSpeed * 1.2), gait: 'land', intensity: Math.min(1, fallSpeed / 9) }
    }
    this.updateLean(dt)
    this.updateRig(dt, w.aim)
    this.recordSafe(dt)

    // footsteps from distance travelled, so cadence matches speed and stride
    if (this.grounded && this.speed > 0.3) {
      const gait = st === 'prone' ? 'prone' : st === 'crouch' ? 'crouch' : this.sprinting ? 'sprint' : this.slowWalking ? 'slow' : 'walk'
      this.stepDistance += this.speed * dt
      if (this.stepDistance >= PLAYER.stride[gait]) {
        this.stepDistance = 0
        const radius = { prone: 0.5, crouch: 0.8, slow: 1.4, walk: this.speed < 2.2 ? 2.2 : 4.5, sprint: 11 }[gait]
        event ??= { radius, gait, intensity: { prone: 0.12, crouch: 0.25, slow: 0.3, walk: 0.6, sprint: 1 }[gait] }
      }
    }
    return event
  }

  /** Crouch (hold or toggle) and prone toggle. Stances that don't fit (no headroom) are retried every frame. */
  private updateStanceInput(wantsSprint: boolean, fwd: number): StepEvent | null {
    if (settings().toggleCrouch) {
      if (input.pressed('crouch')) this.wantCrouch = this.stance === 'prone' ? true : !this.wantCrouch
    } else this.wantCrouch = input.down('crouch')
    if (wantsSprint && fwd > 0) this.wantCrouch = false
    if (input.pressed('prone')) {
      const next = this.stance === 'prone' ? (this.wantCrouch ? 'crouch' : 'stand') : 'prone'
      if (this.setStance(next) || (next === 'stand' && this.setStance('crouch'))) return { radius: 1.5, gait: 'prone', intensity: 0.35 }
    }
    if (input.pressed('crouch') && this.stance === 'prone') this.setStance('crouch')
    if (wantsSprint && fwd > 0 && this.stance === 'prone' && !this.setStance('stand')) this.setStance('crouch')
    if (this.stance === 'prone') return null
    const want: Stance = this.wantCrouch ? 'crouch' : 'stand'
    if (want !== this.stance) this.setStance(want)
    return null
  }

  /** Q/E lean with the head offset limited by walls so the camera never pokes through them. */
  private updateLean(dt: number) {
    const shared = this.interactAvailable && input.shares('leanRight', 'interact')
    const canLean = this.grounded && !this.sprinting && this.stance !== 'prone'
    const target = canLean ? (input.down('leanRight') && !shared ? 1 : 0) - (input.down('leanLeft') ? 1 : 0) : 0
    this.lean = damp(this.lean, target, 9, dt)
    let limit = PLAYER.leanDistance * (this.stance === 'crouch' ? 0.85 : 1)
    if (Math.abs(this.lean) > 0.01) {
      const side = this.right(this.tmp).multiplyScalar(Math.sign(this.lean))
      const head = HEAD.set(this.feet.x, this.feet.y + this.eyeHeight, this.feet.z)
      const hit = this.physics.raycast(head, side, limit + 0.25, this.character.collider, 'move')
      if (hit && hit.tag?.kind !== 'guard') limit = Math.max(0, hit.distance - 0.25)
    }
    const want = this.lean * limit
    // pull in instantly when a wall appears, ease out otherwise
    this.leanOffset = Math.abs(want) < Math.abs(this.leanOffset) && Math.sign(want) === Math.sign(this.leanOffset) ? want : damp(this.leanOffset, want, 10, dt)
  }

  /**
   * Vault over low walls/fences/crates, or mantle onto them when there is no drop behind. Obstacles taller than
   * PLAYER.vaultMax can't be climbed. Returns true when a vault started.
   */
  private tryVault(): boolean {
    const f = this.feet
    const fwd = FWD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const ex = this.character.collider
    const knee = this.physics.raycast(HEAD.set(f.x, f.y + PLAYER.vaultMin + 0.08, f.z), fwd, 1.05, ex, 'move')
    if (!solid(knee) || knee!.normal.x * fwd.x + knee!.normal.z * fwd.z > -0.5) return false
    const face = knee!.point
    // top of the obstacle just past its face
    const probe = HEAD.set(face.x + fwd.x * 0.2, f.y + PLAYER.vaultMax + 0.6, face.z + fwd.z * 0.2)
    const top = this.physics.raycast(probe, DOWN, PLAYER.vaultMax + 0.6, ex, 'move')
    if (!solid(top)) return false
    const h = top!.point.y - f.y
    if (h < PLAYER.vaultMin || h > PLAYER.vaultMax) return false
    // nothing in the way at the height we pass over it
    if (this.physics.raycast(HEAD.set(f.x, top!.point.y + 0.45, f.z), fwd, knee!.distance + 0.9, ex, 'move')) return false

    // far side: first point past the face where the floor drops away
    const to = new Vector3()
    let found = false
    for (let d = 0.45; d <= 1.65 && !found; d += 0.3) {
      const p = HEAD.set(face.x + fwd.x * d, top!.point.y + 0.3, face.z + fwd.z * d)
      const below = this.physics.raycast(p, DOWN, 4, ex, 'move')
      if (below && below.point.y < top!.point.y - 0.3 && below.point.y > f.y - 1.2) {
        to.set(p.x + fwd.x * 0.3, below.point.y, p.z + fwd.z * 0.3)
        found = this.physics.capsuleFits(to, PLAYER.half.crouch, PLAYER.radius - 0.05, ex)
      }
    }
    if (!found) {
      // mantle: climb up and stay on top
      to.set(face.x + fwd.x * 0.45, top!.point.y, face.z + fwd.z * 0.45)
      if (!this.physics.capsuleFits(to, PLAYER.half.crouch, PLAYER.radius - 0.05, ex)) return false
    }
    this.vault = { t: 0, duration: found ? 0.48 : 0.62, from: f.clone(), to, peak: top!.point.y + 0.15 }
    this.stamina -= PLAYER.vaultCost
    this.staminaDelay = PLAYER.staminaRegenDelay
    this.setStance('stand')
    this.lean = this.leanOffset = 0
    return true
  }

  private updateVault(dt: number): StepEvent | null {
    const v = this.vault!
    v.t += dt
    const k = Math.min(1, v.t / v.duration)
    const flat = k * k * (3 - 2 * k)
    // rise first, then travel over and drop
    const up = Math.min(1, k / 0.45)
    const y = k < 0.45 ? v.from.y + (v.peak - v.from.y) * Math.sin((up * Math.PI) / 2) : v.peak + (v.to.y - v.peak) * ((k - 0.45) / 0.55) ** 2
    this.feet.set(v.from.x + (v.to.x - v.from.x) * flat, Math.max(y, Math.min(v.from.y, v.to.y)), v.from.z + (v.to.z - v.from.z) * flat)
    this.character.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + this.centerOffset(this.stance), z: this.feet.z })
    this.speed = 2
    this.camRoll = damp(this.camRoll, -0.06, 10, dt)
    this.camPitch = damp(this.camPitch, -0.05 * Math.sin(k * Math.PI), 10, dt)
    if (k < 1) return null
    this.vault = null
    this.velocity.set(-Math.sin(this.yaw) * 2.5, 0, -Math.cos(this.yaw) * 2.5)
    // under a low ceiling after mantling: stay crouched
    if (!this.physics.capsuleFits(this.feet, PLAYER.half.stand, PLAYER.radius - 0.02, this.character.collider)) this.setStance('crouch')
    this.landVel += 0.5
    return { radius: 5, gait: 'land', intensity: 0.5 }
  }

  /** Procedural camera: step-synced bob, strafe roll, lean, landing spring, breathing — subtle by design. */
  private updateRig(dt: number, aim: number) {
    const st = this.stance
    const gaitScale = this.sprinting ? 1.6 : st === 'prone' ? 0.4 : st === 'crouch' ? 0.55 : this.slowWalking ? 0.6 : 1
    const moveAmt = this.grounded ? Math.min(1, this.speed / PLAYER.walkSpeed) : 0
    const stride = st === 'prone' ? PLAYER.stride.prone : st === 'crouch' ? PLAYER.stride.crouch : this.sprinting ? PLAYER.stride.sprint : PLAYER.stride.walk
    this.bobPhase += (this.speed * dt * Math.PI) / stride
    const amp = moveAmt * gaitScale * (1 - aim * 0.75)
    const bobY = (Math.abs(Math.sin(this.bobPhase)) - 0.5) * 0.045 * amp
    const bobX = Math.sin(this.bobPhase) * (st === 'prone' ? 0.05 : 0.025) * amp

    // landing: critically-damped spring pulls the head down and back up
    const k = 140, c = 2 * Math.sqrt(k)
    this.landVel += (-k * this.landSpring - c * this.landVel) * dt
    this.landSpring += this.landVel * dt

    // strafe roll from lateral velocity, a hint of roll into turns, lean and hit flinch
    const right = this.right(this.tmp)
    const lateral = this.velocity.x * right.x + this.velocity.z * right.z
    this.flinchRoll = damp(this.flinchRoll, 0, 6, dt)
    const rollTarget = -lateral * 0.006 - this.lookVelocity.x * 0.6 + Math.sin(this.bobPhase) * 0.004 * amp - this.lean * PLAYER.leanRoll + this.flinchRoll
    this.camRoll = damp(this.camRoll, rollTarget, 8, dt)

    // breathing: slow pitch drift, stronger when winded
    const breath = Math.sin(this.time * (1.3 + this.exertion * 2.4)) * (0.0018 + this.exertion * 0.006) * (1 - aim * 0.6)
    this.camPitch = damp(this.camPitch, breath - this.landSpring * 0.12 + Math.cos(this.bobPhase * 2) * 0.003 * amp, 10, dt)

    this.camOffset.set(bobX, bobY, 0)
    this.fovKick = damp(this.fovKick, this.sprinting ? 5 : 0, 4, dt)
  }
}

const solid = (h: RayHit | null) => !!h && h.tag?.kind !== 'terrain' && h.tag?.kind !== 'guard' && h.tag?.kind !== 'player'

const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const HEAD = new Vector3()
const FWD = new Vector3()
