import type { ParticleKind } from '../combat/surfaces'

export interface ParticlePreset {
  /** Additive (sparks, flashes) vs alpha-blended (dust, smoke). */
  additive: boolean
  speed: [number, number]
  /** Cone half-angle around the emit direction (radians). */
  spread: number
  life: [number, number]
  /** Size in metres at birth and death. */
  size: [number, number]
  colors: number[]
  alpha: number
  gravity: number
  /** Velocity damping per second. */
  drag: number
  /** Extra upward velocity (smoke/dust rise). */
  lift: number
}

/** Data table of particle looks. */
export const PARTICLES: Record<ParticleKind, ParticlePreset> = {
  spark: { additive: true, speed: [4, 14], spread: 0.9, life: [0.08, 0.3], size: [0.035, 0.01], colors: [0xffd27a, 0xffb050, 0xfff0c0], alpha: 1, gravity: 9.8, drag: 1.5, lift: 0 },
  flash: { additive: true, speed: [0, 0.3], spread: 3, life: [0.04, 0.06], size: [0.5, 0.7], colors: [0xffc070], alpha: 0.7, gravity: 0, drag: 0, lift: 0 },
  fire: { additive: true, speed: [0.2, 0.6], spread: 0.4, life: [0.4, 0.8], size: [0.35, 0.1], colors: [0xff8a30, 0xffb050], alpha: 0.7, gravity: -1.5, drag: 1, lift: 0.8 },
  dust: { additive: false, speed: [0.6, 2.2], spread: 0.8, life: [0.6, 1.4], size: [0.12, 0.7], colors: [0x9a9284, 0x8a8478], alpha: 0.45, gravity: 0.3, drag: 2.5, lift: 0.25 },
  dirt: { additive: false, speed: [1.5, 4.5], spread: 0.5, life: [0.4, 1.0], size: [0.08, 0.45], colors: [0x5a4a36, 0x6a5a44], alpha: 0.65, gravity: 6, drag: 2, lift: 0 },
  chip: { additive: false, speed: [3, 7], spread: 0.7, life: [0.3, 0.6], size: [0.025, 0.02], colors: [0x8c8a80, 0x6a6862], alpha: 1, gravity: 9.8, drag: 0.5, lift: 0 },
  splinter: { additive: false, speed: [2.5, 6], spread: 0.7, life: [0.4, 0.8], size: [0.03, 0.025], colors: [0x8a6a44, 0xa88a60], alpha: 1, gravity: 9.8, drag: 0.6, lift: 0 },
  glass: { additive: false, speed: [2, 5], spread: 0.8, life: [0.4, 0.9], size: [0.025, 0.02], colors: [0xcfe0e8, 0xa8c0c8], alpha: 0.9, gravity: 9.8, drag: 0.3, lift: 0 },
  blood: { additive: false, speed: [0.8, 2.6], spread: 0.6, life: [0.25, 0.6], size: [0.06, 0.32], colors: [0x5a0e0a, 0x3e0806], alpha: 0.7, gravity: 3, drag: 3, lift: 0 },
  leaf: { additive: false, speed: [1, 3], spread: 1, life: [0.8, 1.6], size: [0.04, 0.04], colors: [0x3a4a26, 0x5a5a32], alpha: 1, gravity: 2, drag: 2.5, lift: 0 },
  smoke: { additive: false, speed: [0.2, 0.5], spread: 0.3, life: [3, 5], size: [0.4, 2.4], colors: [0x4a4744, 0x5a5652], alpha: 0.28, gravity: -0.4, drag: 0.4, lift: 0.6 },
  muzzleSmoke: { additive: false, speed: [0.3, 1.2], spread: 0.35, life: [0.5, 1.1], size: [0.05, 0.5], colors: [0xb0aca4], alpha: 0.22, gravity: -0.3, drag: 3, lift: 0.15 },
  explosion: { additive: true, speed: [2, 9], spread: 1.6, life: [0.12, 0.4], size: [1.4, 3.2], colors: [0xffb060, 0xff8a30, 0xffe0a0], alpha: 0.9, gravity: -1, drag: 4, lift: 1 },
  smokeScreen: { additive: false, speed: [0.6, 2.2], spread: 1.5, life: [6, 9], size: [1.8, 5.5], colors: [0x8a8884, 0x9a9792, 0x7c7a76], alpha: 0.6, gravity: -0.05, drag: 0.7, lift: 0.3 },
  mote: { additive: false, speed: [0.02, 0.08], spread: 3, life: [4, 7], size: [0.012, 0.012], colors: [0xd8d0b8], alpha: 0.5, gravity: -0.01, drag: 0.1, lift: 0 },
}
