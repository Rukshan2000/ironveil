import { Vector3 } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from '../physics/Physics'
import type { Terrain } from './terrain'
import type { LevelLayout, Surface } from './types'

export type TimeOfDay = 'dawn' | 'dusk' | 'night'

/** Look + stealth tuning for a time of day. Pure data. */
export interface EnvPreset {
  label: string
  sunElevation: number
  sunAzimuth: number
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  envIntensity: number
  fogColor: string
  fogDensity: number
  exposure: number
  sky: { turbidity: number; rayleigh: number; mie: number; mieG: number }
  /** Stealth light level of open shade (0..1). */
  ambientVisibility: number
  /** Extra light level when the sun reaches the player. */
  sunVisibility: number
  lampsOn: boolean
  lampIntensity: number
  /** Indirect-light multiplier inside buildings. */
  interiorAmbient: number
  ambience: { wind: number; insects: number; birds: number }
}

export const PRESETS: Record<TimeOfDay, EnvPreset> = {
  dawn: {
    label: 'DAWN 05:40', sunElevation: 7, sunAzimuth: 75, sunColor: '#ffc9a0', sunIntensity: 2.4,
    hemiSky: '#9fb2cc', hemiGround: '#4a4234', hemiIntensity: 0.55, envIntensity: 0.55,
    fogColor: '#b9b4ad', fogDensity: 0.0065, exposure: 0.85,
    sky: { turbidity: 6, rayleigh: 2.2, mie: 0.006, mieG: 0.86 },
    ambientVisibility: 0.42, sunVisibility: 0.45, lampsOn: true, lampIntensity: 35, interiorAmbient: 0.25,
    ambience: { wind: 0.5, insects: 0.15, birds: 0.8 },
  },
  dusk: {
    label: 'DUSK 19:20', sunElevation: 6, sunAzimuth: 255, sunColor: '#ffa868', sunIntensity: 2.6,
    hemiSky: '#8496b8', hemiGround: '#3e362a', hemiIntensity: 0.5, envIntensity: 0.5,
    fogColor: '#a99a8e', fogDensity: 0.006, exposure: 0.8,
    sky: { turbidity: 8, rayleigh: 2.6, mie: 0.007, mieG: 0.88 },
    ambientVisibility: 0.38, sunVisibility: 0.5, lampsOn: true, lampIntensity: 45, interiorAmbient: 0.25,
    ambience: { wind: 0.6, insects: 0.7, birds: 0.15 },
  },
  night: {
    label: 'NIGHT 01:10', sunElevation: 28, sunAzimuth: 210, sunColor: '#9fb4e0', sunIntensity: 0.22,
    hemiSky: '#2a3a5c', hemiGround: '#14140f', hemiIntensity: 0.4, envIntensity: 0.25,
    fogColor: '#121822', fogDensity: 0.009, exposure: 1.0,
    sky: { turbidity: 1, rayleigh: 0.08, mie: 0.002, mieG: 0.7 },
    ambientVisibility: 0.12, sunVisibility: 0.1, lampsOn: true, lampIntensity: 70, interiorAmbient: 0.4,
    ambience: { wind: 0.4, insects: 1, birds: 0 },
  },
}

const UP = new Vector3(0, 1, 0)
const tmp = new Vector3()

/** Gameplay side of the environment: sun direction, light level at a point, indoor checks and footstep surfaces. */
export class Environment {
  readonly sunDir = new Vector3()
  /** Light level at the player (0..1), refreshed each frame. */
  playerLight = 0.5
  playerIndoors = false
  /** Direct sun reaches the player (view-model lighting). */
  playerSunlit = false
  /** Collider to ignore in light rays (the player's own capsule). */
  ignore?: RAPIER.Collider
  private lastSunlit = false

  constructor(readonly preset: EnvPreset, private readonly layout: LevelLayout, private readonly terrain: Terrain, private readonly physics: Physics) {
    const el = (preset.sunElevation * Math.PI) / 180, az = (preset.sunAzimuth * Math.PI) / 180
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
  }

  isIndoors(p: Vector3) {
    return this.layout.interiors.some((v) => p.x > v.min[0] && p.x < v.max[0] && p.z > v.min[2] && p.z < v.max[2] && p.y < v.max[1])
  }

  /** Lamp contribution (0..1) at a point. */
  lampLight(p: Vector3) {
    if (!this.preset.lampsOn) return 0
    let best = 0
    for (const l of this.layout.lamps) {
      const dy = l.position[1] - p.y
      if (dy < -1 || dy > 10) continue
      const d = Math.hypot(p.x - l.position[0], p.z - l.position[2])
      if (d < l.radius) best = Math.max(best, 1 - (d / l.radius) ** 2)
    }
    return best
  }

  /**
   * How lit a point is for the stealth system (0 = pitch black, 1 = floodlit).
   * `sample` is a point at chest height; one ray towards the sun decides whether it stands in shadow.
   */
  lightLevel(sample: Vector3, indoors = this.isIndoors(sample)) {
    const p = this.preset
    let light = p.ambientVisibility * (indoors ? p.interiorAmbient * 1.6 : 1)
    const sunlit = !this.physics.raycast(sample, this.sunDir, 200, this.ignore, 'vision')
    if (sunlit) light += p.sunVisibility
    this.lastSunlit = sunlit
    light += this.lampLight(sample) * 0.75
    return Math.min(1, light)
  }

  update(playerChest: Vector3) {
    this.playerIndoors = this.isIndoors(playerChest)
    this.playerLight = this.lightLevel(playerChest, this.playerIndoors)
    this.playerSunlit = this.lastSunlit
  }

  groundHeight(x: number, z: number) {
    return this.terrain.height(x, z)
  }

  /** Surface under a point for footsteps: floors/props via a short down-ray, then roads, then terrain splat. */
  surfaceAt(feet: Vector3): Surface {
    const hit = this.physics.raycast(tmp.copy(feet).setY(feet.y + 0.3), DOWN, 0.6, this.ignore, 'move')
    if (hit?.tag?.kind === 'static') return hit.tag.surface
    if (hit?.tag?.kind === 'vehicle') return 'metal'
    for (const r of this.layout.roads) if (feet.x > r[0] && feet.x < r[2] && feet.z > r[1] && feet.z < r[3]) return 'asphalt'
    return this.terrain.wildness(feet.x, feet.z) > 0.5 ? 'grass' : 'dirt'
  }
}

const DOWN = UP.clone().negate()
