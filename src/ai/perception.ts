import { clamp } from '../utils/math'

/** Everything a guard's eyes need to judge how visible the player is. */
export interface VisionInput {
  distance: number
  /** Guard's vision range in metres. */
  range: number
  /** Angle between the guard's facing and the player (rad). */
  angle: number
  /** Full field of view (rad). */
  fov: number
  hasLineOfSight: boolean
  /** Player horizontal speed, m/s. */
  speed: number
  crouching: boolean
  /** Lying flat: a much smaller silhouette than crouching. */
  prone?: boolean
  /** Light level at the player 0..1 (EnvironmentSystem). */
  light: number
  /** Player's flashlight is on and pointed roughly at this guard. */
  flashlightAtGuard: boolean
  /** Guard alertness 0..1: alert guards see further and react faster. */
  alertness: number
}

/** Radius inside which a guard senses the player regardless of facing. */
export const CLOSE_SENSE_RADIUS = 2.2
/** Exposure below this is treated as unseen. */
export const EXPOSURE_FLOOR = 0.06

/**
 * How visible the player is to one guard, 0..1 — drives the guard's suspicion rate. Needs line of sight.
 * Central vision is sharp; peripheral vision mostly catches movement. Darkness, crouching, stillness and distance
 * all help; a flashlight pointed at the guard gives you away from far off.
 */
export function computeExposure(i: VisionInput): number {
  if (!i.hasLineOfSight) return 0
  if (i.distance <= CLOSE_SENSE_RADIUS) return (i.crouching || i.prone) && i.speed < 0.5 ? (i.prone ? 0.35 : 0.5) : 1

  const range = i.range * (1 + i.alertness * 0.3) * (i.flashlightAtGuard ? 1.8 : 1)
  if (i.distance > range || i.angle > i.fov / 2) return 0

  const central = i.angle < i.fov * 0.22
  const movement = i.speed < 0.3 ? 0.55 : i.speed > 5 ? 1.5 : i.speed > 2.5 ? 1.15 : 0.9
  const peripheral = central ? 1 : 0.35 * movement
  const distFactor = 1 - i.distance / range
  const stance = i.prone ? 0.3 : i.crouching ? 0.55 : 1
  const light = i.flashlightAtGuard ? 1.3 : 0.2 + clamp(i.light, 0, 1) * 0.8
  const e = clamp(distFactor * 1.8 * movement * stance * light * peripheral, 0, 1)
  return e < EXPOSURE_FLOOR ? 0 : e
}

/** Effective loudness 0..1 of a noise at the listener; walls between halve the audible radius. */
export function hearing(distance: number, radius: number, occluded: boolean) {
  const r = occluded ? radius * 0.5 : radius
  return distance >= r ? 0 : 1 - distance / r
}

export type DetectionLevel = 'hidden' | 'suspicious' | 'searching' | 'detected'
