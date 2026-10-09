export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Frame-rate independent exponential smoothing towards a target. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))

/** Wraps an angle into [-PI, PI]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Rotates `current` towards `target` by at most `maxStep` radians. */
export function turnTowards(current: number, target: number, maxStep: number) {
  const diff = wrapAngle(target - current)
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep
}

/** Yaw (around +Y) that points -Z forward towards (dx, dz), matching three.js camera convention. */
export const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz)
