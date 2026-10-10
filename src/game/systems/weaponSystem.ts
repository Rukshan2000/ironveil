import { Vector3 } from 'three'
import { audio } from '../../audio/AudioSystem'
import { randomInCone } from '../../effects/EffectsSystem'
import { settings } from '../../state/settings'
import { input } from '../input'
import type { GameSession } from '../GameSession'
import { KNIFE, stab } from '../../weapons/knife'

const eye = new Vector3()
const fwd = new Vector3()
const dir = new Vector3()
const right = new Vector3()
const up = new Vector3()
const muzzle = new Vector3()
const shellPos = new Vector3()
const shellVel = new Vector3()
const end = new Vector3()

/** Camera basis from the player's look angles (including recoil). */
function basis(s: GameSession) {
  const p = s.player
  p.forward(fwd)
  right.set(Math.cos(p.yaw + p.recoilYaw), 0, -Math.sin(p.yaw + p.recoilYaw))
  up.crossVectors(right, fwd)
}

/** WeaponSystem: player input → weapon controllers, ballistics, recoil, effects, audio and noise. */
export function updateWeapons(s: GameSession, dt: number) {
  const { player } = s
  if (!player.active || !player.alive) return
  const adsSpeed = settings().adsSpeed
  // binoculars up: weapon lowered, no switching/firing (the recon system owns the wheel and RMB)
  if (s.recon.active) {
    player.speedFactor = 0.6
    s.holdingBreath = false
    s.weapon.tick(dt, false, player.sprinting, adsSpeed)
    return
  }

  // knife (slot 5): put the gun (or grenade) away and draw the blade
  if (input.pressed('weapon5') && !s.knife.equipped && !s.grenades.priming) {
    if (!s.grenades.equipped) s.weapon.lower()
    s.knife.equipped = true
    s.grenades.equipped = false
    s.pendingWeapon = null
    audio.cloth(0.6)
  }
  // grenade (slot 4) or knife (slot 5) in hand: the gun stays put away until a weapon key or the wheel picks one
  if (s.grenades.equipped || s.knife.equipped) {
    const slots = ['weapon1', 'weapon2', 'weapon3'] as const
    const wheel = input.consumeWheel()
    let pick = s.weapons.findIndex((w) => input.pressed(slots[w.def.slot - 1]))
    if (pick < 0 && wheel) pick = s.weaponIndex
    if (pick < 0) {
      player.speedFactor = 1
      s.holdingBreath = false
      s.weapon.tick(dt, false, false, adsSpeed)
      if (s.knife.equipped && s.weapon.lowered && input.pressed('fire') && !player.sprinting && s.time - s.knife.swingAt > KNIFE.cooldown) stab(s)
      return
    }
    s.grenades.equipped = false
    s.knife.equipped = false
    s.weaponIndex = pick
    s.weapon.equip()
    audio.mech('equip')
  }

  // switching: number keys or wheel. The current weapon is lowered first, then the new one is drawn.
  const wheel = input.consumeWheel()
  if (wheel && s.weapon.aim > 0.5 && s.weapon.def.optics && s.weapon.def.optics.length > 1) {
    // wheel while aimed through an optic steps the magnification (wheel up = zoom in)
    if (s.weapon.stepZoom(-wheel)) audio.mech('switch')
  } else {
    let wanted = s.pendingWeapon ?? s.weaponIndex
    const slots = ['weapon1', 'weapon2', 'weapon3'] as const
    for (let i = 0; i < s.weapons.length; i++) if (input.pressed(slots[s.weapons[i].def.slot - 1])) wanted = i
    if (wheel) wanted = (wanted + wheel + s.weapons.length) % s.weapons.length
    if (wanted !== (s.pendingWeapon ?? s.weaponIndex)) {
      if (wanted === s.weaponIndex) {
        // changed their mind mid-switch: bring the same gun back up instead of leaving it out of view
        s.pendingWeapon = null
        if (s.weapon.holsterTimer > 0) s.weapon.equip()
      } else {
        if (s.pendingWeapon === null) {
          s.weapon.lower()
          audio.cloth(0.5)
        }
        s.pendingWeapon = wanted
      }
    }
  }
  if (s.pendingWeapon !== null && s.weapon.lowered) {
    s.weaponIndex = s.pendingWeapon
    s.pendingWeapon = null
    s.weapon.equip()
    audio.mech('equip')
  }

  const weapon = s.weapon
  const def = weapon.def
  const busy = s.grenades.handsBusy > 0 || s.pendingWeapon !== null || !!player.vault || s.terminal.blend > 0.05
  player.speedFactor = def.speedFactor
  const aiming = input.down('aim') && !player.sprinting && !busy
  const wasAim = weapon.aim > 0.5
  for (const e of weapon.tick(dt, aiming, player.sprinting || busy, adsSpeed)) {
    if (e === 'magOut' || e === 'magIn' || e === 'bolt') audio.mech(e)
  }
  if (wasAim !== weapon.aim > 0.5) audio.mech(wasAim ? 'aimOut' : 'aimIn')

  // hold breath on scoped weapons: Shift while aimed steadies the reticle and costs stamina
  s.holdingBreath = def.holdBreath && weapon.aim > 0.9 && input.down('sprint') && player.stamina > 5
  if (s.holdingBreath) player.stamina = Math.max(0, player.stamina - 14 * dt)
  // aim sway: breathing figure-eight that grows with exertion and suppression; holding breath / bracing steadies it
  s.swayTime += dt
  const brace = player.prone ? 0.4 : player.crouching ? 0.7 : 1
  const amp = (def.sway.idle + (def.sway.ads - def.sway.idle) * weapon.aim) * (1 + player.exertion * 2.5 + s.suppression * 2) * (s.holdingBreath ? 0.12 : 1) * brace * (1 + (weapon.zoom - 1) * 0.15)
  player.swayYaw = Math.sin(s.swayTime * 0.9) * amp
  player.swayPitch = Math.sin(s.swayTime * 1.8) * amp * 0.6

  if (input.pressed('reload') && !busy && weapon.startReload()) audio.cloth(0.6)
  if (input.pressed('inspect') && !busy) {
    weapon.inspect()
    if (weapon.inspectTimer > 0) audio.mech('inspect')
  }

  const result = weapon.trigger(input.down('fire') && !player.sprinting && !busy)
  if (result === 'empty') {
    audio.mech('dry')
    if (weapon.startReload()) audio.cloth(0.6)
  }
  if (result !== 'fired') return
  fire(s)
}

function fire(s: GameSession) {
  const { player, weapon, effects, ballistics } = s
  const def = weapon.def
  s.stats.shots++
  s.recoilImpulses++
  effects.playerMuzzleTime = s.time
  player.eye(eye)
  basis(s)

  // muzzle sits right/below the eye at the hip and on the sight line when aimed
  const hip = 1 - weapon.aim
  muzzle.copy(eye).addScaledVector(fwd, 0.75).addScaledVector(right, 0.12 * hip).addScaledVector(up, -0.08 * hip - 0.03)
  audio.gunshot(def.sound, null)
  effects.muzzle(muzzle, fwd, def.class === 'sniper' ? 2 : 1)
  if (def.action === 'bolt' && weapon.ammo > 0) s.schedule(0.28, () => audio.mech('boltCycle'))

  const spread = weapon.spread(player.moving) * (s.holdingBreath ? 0.2 : 1) * (player.prone ? 0.6 : 1)
  for (let i = 0; i < def.pellets; i++) {
    randomInCone(fwd, spread, dir)
    // bullets leave from the eye (sight line) so what you aim at is what you hit; the visual tracer starts later
    const b = ballistics.fire(eye, dir, def.ballistics, def.damage, { head: def.headshotMultiplier, limb: def.limbMultiplier }, { kind: 'player' }, player.character.collider, def.class !== 'pistol' && s.stats.shots % 3 === 0)
    end.copy(eye).addScaledVector(dir, 60)
    const ray = effects.shotRays.claim()
    ray.from.copy(eye)
    ray.to.copy(b.active ? end : b.pos)
    ray.time = s.time
  }

  if (def.shell > 0) {
    // brass flies out to the right, slightly up and back, inheriting the player's motion
    shellPos.copy(eye).addScaledVector(fwd, 0.32).addScaledVector(right, 0.1 * hip + 0.04).addScaledVector(up, -0.06 * hip - 0.02)
    shellVel.copy(right).multiplyScalar(2.2 + Math.random() * 1.2).addScaledVector(up, 1.4 + Math.random()).addScaledVector(fwd, -0.4).add(player.velocity)
    const delay = def.action === 'bolt' ? 0.45 : 0
    if (delay) {
      const at = shellPos.clone(), vel = shellVel.clone()
      s.schedule(delay, () => effects.ejectShell(at, vel, def.shell))
    }
    else effects.ejectShell(shellPos, shellVel, def.shell)
  }

  const r = def.recoil
  const kick = (1 - weapon.aim * 0.35) * (player.prone ? 0.5 : player.crouching ? 0.75 : 1) * (weapon.burst === 1 ? r.firstShot : 1)
  player.addRecoil(r.vertical * kick, (r.drift + (Math.random() * 2 - 1) * r.horizontal) * kick)
  s.noises.push({ position: player.feet.clone(), kind: 'gunshot', radius: def.noiseRadius })
}
