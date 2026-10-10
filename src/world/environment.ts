import { Color, Vector3 } from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { cheats } from '../game/input'
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
    label: 'NIGHT 01:10', sunElevation: 28, sunAzimuth: 210, sunColor: '#a8bce6', sunIntensity: 0.4,
    hemiSky: '#34466b', hemiGround: '#1c1c16', hemiIntensity: 0.62, envIntensity: 0.3,
    fogColor: '#18202c', fogDensity: 0.008, exposure: 1.2,
    sky: { turbidity: 1, rayleigh: 0.08, mie: 0.002, mieG: 0.7 },
    ambientVisibility: 0.12, sunVisibility: 0.1, lampsOn: true, lampIntensity: 70, interiorAmbient: 0.4,
    ambience: { wind: 0.4, insects: 1, birds: 0 },
  },
}

// ---- day / night cycle and weather -----------------------------------------------------------------------

/** Game minutes per real second: a full day in 24 real minutes, so a mission sees the light change. */
export const TIME_SCALE = 60
export const START_HOUR: Record<TimeOfDay, number> = { dawn: 5 + 40 / 60, dusk: 19 + 20 / 60, night: 1 + 10 / 60 }

const day = (o: Partial<EnvPreset>): EnvPreset => ({ ...PRESETS.dusk, ...o, sky: { ...PRESETS.dusk.sky, ...o.sky }, ambience: { ...PRESETS.dusk.ambience, ...o.ambience } })
const TWILIGHT = day({
  sunColor: '#c08a70', sunIntensity: 0.03, hemiSky: '#56658a', hemiGround: '#24211b', hemiIntensity: 0.42, envIntensity: 0.35,
  fogColor: '#4e5260', fogDensity: 0.0075, exposure: 0.95, sky: { turbidity: 4, rayleigh: 1.6, mie: 0.005, mieG: 0.8 },
  ambientVisibility: 0.22, sunVisibility: 0.1, lampIntensity: 60, interiorAmbient: 0.3, ambience: { wind: 0.5, insects: 0.8, birds: 0.1 },
})
const MORNING = day({
  sunColor: '#ffe2c0', sunIntensity: 3.1, hemiSky: '#a8bcd8', hemiGround: '#55503e', hemiIntensity: 0.7, envIntensity: 0.7,
  fogColor: '#c4c8cc', fogDensity: 0.004, exposure: 0.78, sky: { turbidity: 4, rayleigh: 1.5, mie: 0.005, mieG: 0.82 },
  ambientVisibility: 0.55, sunVisibility: 0.45, lampIntensity: 0, interiorAmbient: 0.2, ambience: { wind: 0.5, insects: 0.2, birds: 1 },
})
const NOON = day({
  sunColor: '#fff4e6', sunIntensity: 3.6, hemiSky: '#a9c2e6', hemiGround: '#5a5440', hemiIntensity: 0.78, envIntensity: 0.8,
  fogColor: '#c9d2dc', fogDensity: 0.0032, exposure: 0.72, sky: { turbidity: 3, rayleigh: 1, mie: 0.004, mieG: 0.8 },
  ambientVisibility: 0.62, sunVisibility: 0.4, lampIntensity: 0, interiorAmbient: 0.2, ambience: { wind: 0.6, insects: 0.4, birds: 0.6 },
})
const EVENING = day({
  sunColor: '#ffcf96', sunIntensity: 3, hemiSky: '#9aaccc', hemiGround: '#4c4434', hemiIntensity: 0.64, envIntensity: 0.65,
  fogColor: '#c4b8a8', fogDensity: 0.0045, exposure: 0.78, sky: { turbidity: 6, rayleigh: 2, mie: 0.006, mieG: 0.85 },
  ambientVisibility: 0.5, sunVisibility: 0.45, lampIntensity: 0, interiorAmbient: 0.22, ambience: { wind: 0.6, insects: 0.4, birds: 0.5 },
})
/** Keyframes by hour; the cycle blends between neighbours (wrapping at midnight). */
const CYCLE: [number, EnvPreset][] = [
  [1.2, PRESETS.night], [4.6, PRESETS.night], [5.3, TWILIGHT], [5.75, PRESETS.dawn], [7.5, MORNING], [13, NOON],
  [17.6, EVENING], [19.3, PRESETS.dusk], [19.75, TWILIGHT], [20.7, PRESETS.night],
]
const SUNRISE = 5.3, DAYLENGTH = 14.45

export type Weather = 'clear' | 'cloudy' | 'fog' | 'rain'
const WEATHER: Record<Weather, { cloud: number; fog: number; rain: number }> = {
  clear: { cloud: 0, fog: 0, rain: 0 }, cloudy: { cloud: 0.8, fog: 0.1, rain: 0 }, fog: { cloud: 0.5, fog: 1, rain: 0 }, rain: { cloud: 1, fog: 0.35, rain: 1 },
}
/** Real seconds each weather spell lasts before the next one rolls in (transitions take about a minute). */
const WEATHER_SPELL = 240
/** Deterministic forecast, so co-op players share the same weather. Starts clear. */
export function weatherAt(seconds: number): Weather {
  const n = Math.floor(seconds / WEATHER_SPELL)
  if (n === 0) return 'clear'
  const r = Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1
  return r < 0.4 ? 'clear' : r < 0.65 ? 'cloudy' : r < 0.8 ? 'fog' : 'rain'
}

const ca = new Color(), cb = new Color()
const mixColor = (a: string, b: string, k: number) => `#${ca.set(a).lerp(cb.set(b), k).getHexString()}`
/** Blends every number and colour of two presets into `out`. */
function mixPreset(a: EnvPreset, b: EnvPreset, k: number, out: EnvPreset) {
  for (const key of Object.keys(a) as (keyof EnvPreset)[]) {
    const va = a[key], vb = b[key]
    if (typeof va === 'number') (out[key] as number) = va + ((vb as number) - va) * k
    else if (typeof va === 'string' && va.startsWith('#')) (out[key] as string) = mixColor(va, vb as string, k)
  }
  for (const key of Object.keys(a.sky) as (keyof EnvPreset['sky'])[]) out.sky[key] = a.sky[key] + (b.sky[key] - a.sky[key]) * k
  for (const key of Object.keys(a.ambience) as (keyof EnvPreset['ambience'])[]) out.ambience[key] = a.ambience[key] + (b.ambience[key] - a.ambience[key]) * k
}

const UP = new Vector3(0, 1, 0)
const tmp = new Vector3()

/** Gameplay side of the environment: sun direction, light level at a point, indoor checks and footstep surfaces. */
export class Environment {
  /** Direction to the key light: the sun by day, the moon at night (shadows, stealth, view-model lighting). */
  readonly sunDir = new Vector3()
  /** Direction to the actual sun (sky shader); below the horizon at night. */
  readonly skySun = new Vector3()
  /** Live look of the current moment: the day cycle blended with the weather. Mutated in place every frame. */
  readonly preset: EnvPreset
  /** Hour of day, 0..24. */
  hour: number
  /** Seconds since the mission started (drives the forecast). */
  elapsed = 0
  weather: Weather = 'clear'
  /** Current weather blend (eases towards the forecast). */
  readonly mix = { cloud: 0, fog: 0, rain: 0 }
  /** Guards' sight range multiplier: fog and rain cut how far they see. */
  sightFactor = 1
  /** 0..1 how strongly the base lights are on. */
  lamps = 1
  /** Light level at the player (0..1), refreshed each frame. */
  playerLight = 0.5
  playerIndoors = false
  /** Direct sun reaches the player (view-model lighting). */
  playerSunlit = false
  /** Collider to ignore in light rays (the player's own capsule). */
  ignore?: RAPIER.Collider
  private lastSunlit = false

  constructor(start: TimeOfDay, private readonly layout: LevelLayout, private readonly terrain: Terrain, private readonly physics: Physics) {
    this.hour = START_HOUR[start]
    this.preset = structuredClone(PRESETS[start])
    this.tick(0)
  }

  /** Advances the clock and the weather and rebuilds `preset`, the sun/moon direction and the derived factors. */
  tick(dt: number) {
    this.elapsed += dt
    // DAYLIGHT cheat: the clock stands at noon
    this.hour = cheats.day ? 12 : (this.hour + (dt * TIME_SCALE) / 3600) % 24
    const h = this.hour
    // day cycle: blend the two keyframes around this hour (wrapping through midnight)
    let i = CYCLE.findIndex(([at]) => at > h) - 1
    if (i === -2) i = CYCLE.length - 1
    const [ha, a] = CYCLE[(i + CYCLE.length) % CYCLE.length], [hb, b] = CYCLE[(i + 1) % CYCLE.length]
    const span = (hb - ha + 24) % 24 || 24
    mixPreset(a, b, (((h - ha + 24) % 24) / span), this.preset)
    const p = this.preset

    // sun along its arc (rises east, highest at ~12:30, sets west); the moon takes over as key light at night
    const sunEl = 62 * Math.sin((Math.PI * (h - SUNRISE)) / DAYLENGTH)
    const sunAz = 75 + ((h - SUNRISE) / DAYLENGTH) * 180
    const dir = (out: Vector3, el: number, az: number) => {
      const e = (el * Math.PI) / 180, z = (az * Math.PI) / 180
      return out.set(Math.sin(z) * Math.cos(e), Math.sin(e), -Math.cos(z) * Math.cos(e)).normalize()
    }
    dir(this.skySun, sunEl, sunAz)
    if (sunEl > 1) dir(this.sunDir, sunEl, sunAz)
    else dir(this.sunDir, 28, 210 + h * 2)
    p.sunElevation = sunEl
    p.sunAzimuth = sunAz

    // weather eases towards the forecast over about a minute
    this.weather = weatherAt(this.elapsed)
    const w = WEATHER[this.weather]
    const k = 1 - Math.exp(-dt / 25)
    for (const key of ['cloud', 'fog', 'rain'] as const) this.mix[key] += (w[key] - this.mix[key]) * k
    const { cloud, fog, rain } = this.mix
    const bright = Math.min(1, p.hemiIntensity * 1.4)
    p.sunIntensity *= 1 - 0.75 * cloud
    p.sunVisibility *= 1 - 0.8 * cloud
    p.hemiIntensity *= 1 - 0.12 * cloud
    p.envIntensity *= 1 - 0.3 * cloud
    p.hemiSky = mixColor(p.hemiSky, `#${ca.setScalar(0.55 * bright).getHexString()}`, cloud * 0.5)
    p.fogColor = mixColor(p.fogColor, `#${ca.setScalar(0.62 * bright + 0.04).getHexString()}`, Math.min(1, cloud * 0.4 + fog * 0.8))
    p.fogDensity *= 1 + cloud * 0.4 + fog * 3.2 + rain * 1.3
    p.sky.turbidity += cloud * 8
    p.sky.rayleigh *= 1 - 0.5 * cloud
    p.ambientVisibility *= 1 - 0.2 * fog - 0.15 * rain
    p.ambience.wind += rain * 0.3
    this.sightFactor = 1 - 0.45 * fog - 0.2 * rain

    // base lights: on from early evening until after sunrise (and in bad weather), fading in and out
    const dark = Math.min(1, Math.max(0, (8 - sunEl) / 8))
    this.lamps = Math.max(dark, Math.min(1, cloud * 0.5 + fog * 0.6) * (sunEl < 25 ? 1 : 0))
    p.lampsOn = this.lamps > 0.15
    p.lampIntensity = 90 * this.lamps
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60)
    p.label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${this.weather.toUpperCase()}`
  }

  /** Sun below the horizon: night sky instead of the daylight shader. */
  get night() {
    return this.preset.sunElevation < -6
  }

  isIndoors(p: Vector3) {
    return this.layout.interiors.some((v) => p.x > v.min[0] && p.x < v.max[0] && p.z > v.min[2] && p.z < v.max[2] && p.y < v.max[1])
  }

  /** Lamp contribution (0..1) at a point. */
  lampLight(p: Vector3) {
    if (!this.preset.lampsOn) return 0
    const on = this.lamps
    let best = 0
    for (const l of this.layout.lamps) {
      const dy = l.position[1] - p.y
      if (dy < -1 || dy > 10) continue
      const d = Math.hypot(p.x - l.position[0], p.z - l.position[2])
      if (d < l.radius) best = Math.max(best, 1 - (d / l.radius) ** 2)
    }
    return best * on
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
