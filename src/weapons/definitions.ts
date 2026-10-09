import type { WeaponDefinition } from './types'

/** Service carbine: automatic, controllable, the all-rounder. */
export const AR_K7: WeaponDefinition = {
  id: 'ar-k7', name: 'K7 Carbine', class: 'rifle', slot: 1, action: 'auto',
  damage: 30, headshotMultiplier: 3.5, limbMultiplier: 0.75,
  fireRate: 700, magazineSize: 30, reserveAmmo: 150, chamber: true,
  reload: { tactical: 2.2, empty: 2.9, magOut: 0.22, magIn: 0.55, bolt: 0.82 },
  boltCycle: 0, equipTime: 0.55, inspectTime: 3.2, pellets: 1,
  ballistics: { mode: 'projectile', muzzleVelocity: 880, drag: 0.12, gravityScale: 1, range: 600, falloff: { start: 60, end: 220, minScale: 0.6 }, penetration: 22 },
  recoil: { vertical: 0.0105, horizontal: 0.0045, drift: 0.0012, recovery: 6, firstShot: 1.5, kickBack: 0.035, kickRise: 0.05, kickRoll: 0.025 },
  spread: { hip: 0.028, ads: 0.0025, moving: 0.028, perShot: 0.005, maxBloom: 0.035, recovery: 0.11 },
  sway: { idle: 0.004, ads: 0.0012, inertia: 1 },
  adsFov: 52, optics: [1, 2], adsTime: 0.22, scope: false, holdBreath: false, speedFactor: 0.95, noiseRadius: 55,
  sound: { body: 120, crack: 3200, gain: 1, tail: 1.6, mech: 1 },
  viewmodel: { kind: 'rifle', hip: [0.1, -0.125, -0.21], ads: [0, 0, -0.2], scale: 1 },
  shell: 1,
}

/** Sidearm: fast to draw, quiet-ish, hitscan at the short ranges it is used for. */
export const P_11: WeaponDefinition = {
  id: 'p-11', name: 'P-11 Sidearm', class: 'pistol', slot: 2, action: 'semi',
  damage: 34, headshotMultiplier: 3, limbMultiplier: 0.8,
  fireRate: 420, magazineSize: 15, reserveAmmo: 60, chamber: true,
  reload: { tactical: 1.5, empty: 1.9, magOut: 0.2, magIn: 0.55, bolt: 0.85 },
  boltCycle: 0, equipTime: 0.35, inspectTime: 2.4, pellets: 1,
  ballistics: { mode: 'hitscan', muzzleVelocity: 360, drag: 0.4, gravityScale: 1, range: 120, falloff: { start: 18, end: 55, minScale: 0.45 }, penetration: 8 },
  recoil: { vertical: 0.022, horizontal: 0.008, drift: 0, recovery: 9, firstShot: 1, kickBack: 0.03, kickRise: 0.12, kickRoll: 0.04 },
  spread: { hip: 0.022, ads: 0.004, moving: 0.02, perShot: 0.01, maxBloom: 0.03, recovery: 0.2 },
  sway: { idle: 0.005, ads: 0.0018, inertia: 0.6 },
  adsFov: 60, adsTime: 0.15, scope: false, holdBreath: false, speedFactor: 1.04, noiseRadius: 32,
  sound: { body: 170, crack: 2600, gain: 0.7, tail: 1.1, mech: 0.7 },
  viewmodel: { kind: 'pistol', hip: [0.085, -0.072, -0.26], ads: [0, 0.006, -0.3], scale: 1 },
  shell: 0.6,
}

/** Bolt-action marksman rifle: one deliberate shot, visible bullet drop at range. */
export const VK_8: WeaponDefinition = {
  id: 'vk-8', name: 'VK-8 Marksman', class: 'sniper', slot: 3, action: 'bolt',
  damage: 110, headshotMultiplier: 3, limbMultiplier: 0.8,
  fireRate: 60, magazineSize: 5, reserveAmmo: 25, chamber: true,
  reload: { tactical: 2.8, empty: 3.4, magOut: 0.2, magIn: 0.5, bolt: 0.82 },
  boltCycle: 1.05, equipTime: 0.8, inspectTime: 3.4, pellets: 1,
  ballistics: { mode: 'projectile', muzzleVelocity: 790, drag: 0.05, gravityScale: 1, range: 1200, falloff: { start: 300, end: 900, minScale: 0.75 }, penetration: 45 },
  recoil: { vertical: 0.045, horizontal: 0.01, drift: 0, recovery: 3.5, firstShot: 1, kickBack: 0.07, kickRise: 0.09, kickRoll: 0.05 },
  spread: { hip: 0.06, ads: 0.0003, moving: 0.05, perShot: 0.02, maxBloom: 0.03, recovery: 0.1 },
  sway: { idle: 0.003, ads: 0.0042, inertia: 1.4 },
  adsFov: 18, optics: [4, 8], adsTime: 0.32, scope: true, holdBreath: true, speedFactor: 0.88, noiseRadius: 90,
  sound: { body: 85, crack: 3800, gain: 1.35, tail: 2.6, mech: 1.3 },
  viewmodel: { kind: 'sniper', hip: [0.115, -0.12, -0.22], ads: [0, 0, -0.1], scale: 1 },
  shell: 1.4,
}

/** Starting loadout in slot order. Add weapons here as data. */
export const LOADOUT: WeaponDefinition[] = [AR_K7, P_11, VK_8]
