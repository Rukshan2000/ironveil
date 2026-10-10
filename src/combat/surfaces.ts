import type { Surface } from '../world/types'

export type DecalKind = 'concrete' | 'metal' | 'wood' | 'glass' | 'dirt'
export type ParticleKind =
  | 'spark' | 'dust' | 'dirt' | 'chip' | 'splinter' | 'glass' | 'blood' | 'leaf'
  | 'smoke' | 'muzzleSmoke' | 'flash' | 'fire' | 'mote' | 'explosion' | 'smokeScreen' | 'spray' | 'foam'

export interface SurfaceDef {
  /** Particle bursts on impact: [kind, count]. */
  particles: [ParticleKind, number][]
  decal: DecalKind | null
  /** Penetration budget a bullet spends to pass through ~one wall/prop thickness. */
  penetrationCost: number
  /** Chance a shallow hit ricochets (whine + sparks). */
  ricochet: number
  /** Footstep/impact sound family. */
  sound: 'concrete' | 'metal' | 'wood' | 'dirt' | 'grass' | 'glass' | 'flesh' | 'fabric'
}

/** Data table for how every surface responds to bullets and feet. */
export const SURFACES: Record<Surface, SurfaceDef> = {
  concrete: { particles: [['dust', 7], ['chip', 5]], decal: 'concrete', penetrationCost: 30, ricochet: 0.1, sound: 'concrete' },
  asphalt: { particles: [['dust', 5], ['chip', 3]], decal: 'concrete', penetrationCost: 40, ricochet: 0.15, sound: 'concrete' },
  metal: { particles: [['spark', 10], ['dust', 2]], decal: 'metal', penetrationCost: 16, ricochet: 0.3, sound: 'metal' },
  vehicle: { particles: [['spark', 8], ['dust', 2]], decal: 'metal', penetrationCost: 14, ricochet: 0.2, sound: 'metal' },
  wood: { particles: [['splinter', 8], ['dust', 4]], decal: 'wood', penetrationCost: 8, ricochet: 0, sound: 'wood' },
  dirt: { particles: [['dirt', 10]], decal: 'dirt', penetrationCost: 999, ricochet: 0.05, sound: 'dirt' },
  grass: { particles: [['dirt', 7], ['leaf', 3]], decal: null, penetrationCost: 999, ricochet: 0, sound: 'grass' },
  glass: { particles: [['glass', 12]], decal: 'glass', penetrationCost: 1, ricochet: 0, sound: 'glass' },
  fabric: { particles: [['dirt', 8]], decal: null, penetrationCost: 60, ricochet: 0, sound: 'fabric' },
  foliage: { particles: [['leaf', 6]], decal: null, penetrationCost: 0, ricochet: 0, sound: 'grass' },
  flesh: { particles: [['blood', 9]], decal: null, penetrationCost: 25, ricochet: 0, sound: 'flesh' },
}
