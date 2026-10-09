import type { Vector3Tuple } from 'three'

export type WeaponAction = 'semi' | 'auto' | 'bolt'
export type WeaponClass = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun'
export type ViewModelKind = 'rifle' | 'pistol' | 'sniper'

export interface BallisticsDef {
  /** 'hitscan' resolves instantly (short-range weapons); 'projectile' simulates travel time, drop and drag. */
  mode: 'hitscan' | 'projectile'
  /** m/s */
  muzzleVelocity: number
  /** Velocity loss per second as a fraction of current speed. */
  drag: number
  /** Multiplier on world gravity for bullet drop. */
  gravityScale: number
  /** Max simulated distance (m). */
  range: number
  /** Damage falloff: full damage up to `start` m, scaled down to `minScale` at `end` m. */
  falloff: { start: number; end: number; minScale: number }
  /** Penetration budget (see combat/surfaces penetration costs). */
  penetration: number
}

export interface WeaponDefinition {
  id: string
  name: string
  class: WeaponClass
  /** Number key that selects it. */
  slot: number
  action: WeaponAction
  /** Damage per bullet/pellet. */
  damage: number
  headshotMultiplier: number
  limbMultiplier: number
  /** Rounds per minute (for bolt guns: the trigger-to-trigger floor before cycling). */
  fireRate: number
  magazineSize: number
  reserveAmmo: number
  /** Closed-bolt weapons keep a round chambered on a tactical reload (+1). */
  chamber: boolean
  reload: {
    /** Seconds with rounds left. */
    tactical: number
    /** Seconds from empty (includes working the bolt/slide). */
    empty: number
    /** Fractions of the reload at which the magazine leaves, seats and the action is worked. */
    magOut: number
    magIn: number
    bolt: number
  }
  /** Bolt action: seconds to work the bolt after each shot. */
  boltCycle: number
  equipTime: number
  inspectTime: number
  pellets: number
  ballistics: BallisticsDef
  recoil: {
    /** Upward camera kick per shot, radians. */
    vertical: number
    /** Max random sideways kick per shot, radians. */
    horizontal: number
    /** Consistent sideways drift per shot (pattern bias), radians. */
    drift: number
    /** How fast the camera returns, per second. */
    recovery: number
    /** Extra kick on the first shot of a string. */
    firstShot: number
    /** View-model impulses: push back (m), muzzle rise (rad), roll (rad). */
    kickBack: number
    kickRise: number
    kickRoll: number
  }
  /** Spread cone half-angles in radians. */
  spread: { hip: number; ads: number; moving: number; perShot: number; maxBloom: number; recovery: number }
  /** View-model sway: idle breathing amplitude and mouse-lag inertia. */
  sway: { idle: number; ads: number; inertia: number }
  /** FOV when aimed at the first optic level (scaled with the player's base FOV setting). */
  adsFov: number
  /** Optic magnification steps (mouse wheel while aimed). Omit for iron sights / no zoom. */
  optics?: number[]
  /** Seconds to go fully in/out of ADS. */
  adsTime: number
  /** Full-screen scope overlay when aimed. */
  scope: boolean
  /** Sprint key while aimed steadies the scope (drains stamina). */
  holdBreath: boolean
  /** Movement speed multiplier while carried. */
  speedFactor: number
  /** Radius in metres at which guards hear the shot. */
  noiseRadius: number
  /** Synth parameters for the layered shot sound. */
  sound: { body: number; crack: number; gain: number; tail: number; mech: number }
  viewmodel: { kind: ViewModelKind; hip: Vector3Tuple; ads: Vector3Tuple; scale: number }
  /** Brass size multiplier; 0 = no ejection. */
  shell: number
}
