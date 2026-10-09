import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight, Mesh, PerspectiveCamera, PointLight, Vector3,
} from 'three'
import { buildViewModel } from '../assets/weaponModels'
import type { GameSession } from '../game/GameSession'
import type { ViewModelTarget } from '../game/RenderPipeline'
import { damp } from '../utils/math'
import type { WeaponController } from './WeaponController'

/** Critically-damped-ish spring for view-model recoil. */
class Spring {
  value = 0
  velocity = 0
  constructor(private readonly stiffness: number, private readonly damping: number) {}
  update(dt: number) {
    this.velocity += (-this.stiffness * this.value - this.damping * this.velocity) * dt
    this.value += this.velocity * dt
    return this.value
  }
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
/** 0→1 over [a,b], 1→0 over [c,d]. */
const window4 = (x: number, a: number, b: number, c: number, d: number) => smooth((x - a) / (b - a)) * (1 - smooth((x - c) / (d - c)))

function flashTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,250,220,1)')
  grad.addColorStop(0.25, 'rgba(255,200,110,0.9)')
  grad.addColorStop(1, 'rgba(255,120,30,0)')
  g.fillStyle = grad
  g.translate(64, 64)
  for (let i = 0; i < 5; i++) {
    g.rotate((Math.PI * 2) / 5)
    g.beginPath()
    g.moveTo(-6, 0)
    g.lineTo(0, -64)
    g.lineTo(6, 0)
    g.fill()
  }
  g.beginPath()
  g.arc(0, 0, 26, 0, Math.PI * 2)
  g.fill()
  return new CanvasTexture(c)
}

const sunLocal = new Vector3()
const tmpColor = new Color()

/**
 * First-person weapon presentation. Renders into its own scene (see RenderPipeline's view-model pass) so it never
 * clips into walls. Everything here is procedural animation driven by the weapon state machine and player motion.
 */
export function WeaponView({ session, vm }: { session: GameSession; vm: ViewModelTarget }) {
  const { size } = useThree()
  const vmCamera = vm.camera as PerspectiveCamera
  const models = useMemo(() => new Map(session.weapons.map((w) => [w, buildViewModel(w.def.viewmodel.kind)])), [session])
  const holder = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const nade = useRef<Mesh>(null)
  const worldLight = useRef<PointLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const flashMap = useMemo(flashTexture, [])
  const state = useMemo(() => ({
    kickZ: new Spring(160, 16), kickRise: new Spring(140, 14), kickRoll: new Spring(120, 12), kickX: new Spring(150, 15),
    impulses: session.recoilImpulses, swayX: 0, swayY: 0, sprint: 0, crouch: 0, lastWeapon: null as WeaponController | null,
  }), [session])

  useEffect(() => {
    vm.scene.environment = null
  }, [vm])

  useFrame(({ camera, scene }, delta) => {
    const dt = Math.min(delta, 0.05)
    const { player, effects } = session
    const weapon = session.weapon
    const def = weapon.def
    const model = models.get(weapon)!
    const g = holder.current!
    vm.scene.environment = scene.environment

    // swap models on weapon change
    if (state.lastWeapon !== weapon) {
      g.clear()
      g.add(model.root)
      model.root.add(flash.current!)
      flash.current!.position.copy(model.muzzle)
      state.lastWeapon = weapon
    }
    const show = player.active && !session.recon.active && !(def.scope && weapon.aim > 0.85)
    g.visible = show

    // ---- inputs
    const aim = smooth(weapon.aim)
    state.sprint = damp(state.sprint, weapon.sprint, 8, dt)
    state.crouch = damp(state.crouch, player.lowness, 6, dt)
    const prone = player.proneAmount
    const sprint = smooth(state.sprint)
    if (session.recoilImpulses !== state.impulses) {
      state.impulses = session.recoilImpulses
      const r = def.recoil
      const k = 1 - aim * 0.4
      state.kickZ.velocity += r.kickBack * 30 * k
      state.kickRise.velocity += r.kickRise * 30 * k
      state.kickRoll.velocity += (Math.random() * 2 - 1) * r.kickRoll * 30
      state.kickX.velocity += (Math.random() * 2 - 1) * r.kickBack * 8
    }
    const kz = state.kickZ.update(dt), kr = state.kickRise.update(dt), kroll = state.kickRoll.update(dt), kx = state.kickX.update(dt)

    // mouse-lag sway: the weapon trails the view, heavier guns trail more
    const inertia = def.sway.inertia * (1 - aim * 0.7)
    state.swayX = damp(state.swayX, -player.lookVelocity.x * 4 * inertia, 9, dt)
    state.swayY = damp(state.swayY, -player.lookVelocity.y * 4 * inertia, 9, dt)

    // step-synced bob (figure eight), scaled down when aiming
    const moveAmt = player.grounded ? Math.min(1.4, player.speed / 3.6) : 0
    const bobAmt = moveAmt * (1 - aim * 0.85) * (1 + sprint * 0.8)
    const bx = Math.sin(player.bobPhase) * 0.012 * bobAmt
    const by = -Math.abs(Math.cos(player.bobPhase)) * 0.01 * bobAmt
    const breath = Math.sin(session.time * 1.4) * 0.002 * (1 + player.exertion * 3) * (1 - aim)

    const hip = def.viewmodel.hip, ads = def.viewmodel.ads
    const px = hip[0] + (ads[0] - hip[0]) * aim
    const py = hip[1] + (ads[1] - hip[1]) * aim
    const pz = hip[2] + (ads[2] - hip[2]) * aim
    let ox = bx + state.swayX * 0.04 + kx * 0.4 + sprint * 0.03 - state.crouch * 0.01 * (1 - aim)
    let oy = by + breath + state.swayY * 0.04 - sprint * 0.06 - player.landingDip * 0.25 - state.crouch * 0.008 * (1 - aim)
    let oz = kz + sprint * 0.04
    let rx = kr + state.swayY * 0.6 - sprint * 0.25 + by * 2
    let ry = state.swayX * 0.6 + sprint * 0.75 + bx * 1.5
    let rz = kroll + state.swayX * 0.4 + sprint * 0.2 + state.crouch * 0.06 * (1 - aim) + player.camRoll * 2

    // prone: weapon rests low and canted on the forearm; lean cants it with the body
    ox += prone * 0.02 * (1 - aim)
    oy -= prone * 0.02 * (1 - aim)
    rz += prone * 0.14 * (1 - aim) - player.lean * 0.05

    // equip: comes up from below; holster: goes back down before the switch
    if (weapon.equipTimer > 0) {
      const e = smooth(weapon.equipTimer / def.equipTime)
      oy -= e * 0.25
      rx -= e * 0.7
    }
    if (weapon.holsterTimer > 0) {
      const e = 1 - smooth(weapon.holsterTimer / weapon.holsterTime)
      oy -= e * 0.25
      rx -= e * 0.7
    }
    // equipment in the other hand: weapon dips out of the way, grenade comes up and is thrown forward
    const busy = smooth(session.grenades.handsBusy)
    oy -= busy * 0.2
    rx -= busy * 0.45
    ox += busy * 0.05
    const sinceThrow = session.time - session.grenades.thrownAt
    const ng = nade.current!
    ng.visible = player.active && (session.grenades.priming || sinceThrow < 0.18)
    if (ng.visible) {
      const t = session.grenades.priming ? 0 : sinceThrow / 0.18
      ng.position.set(-0.14 + t * 0.06, -0.15 + t * 0.14 + Math.sin(session.time * 2) * 0.003, -0.42 - t * 0.6)
      ng.rotation.set(0.3 + t * 3, 0.4, 0)
    }

    // reload choreography (tactical vs empty share the timeline; empty adds the bolt release)
    const r = def.reload
    let magDrop = 0, leftReach = 0
    if (weapon.reloading) {
      const p = weapon.reloadProgress
      const tilt = window4(p, 0, 0.12, 0.86, 1)
      rz += tilt * 0.5
      rx += tilt * 0.22
      oy -= tilt * 0.035
      ox -= tilt * 0.02
      // old mag drops out, new one rises in
      if (p >= r.magOut && p < r.magIn - 0.12) magDrop = smooth((p - r.magOut) / 0.08) * 0.35
      else if (p >= r.magIn - 0.12 && p < r.magIn) magDrop = (1 - smooth((p - (r.magIn - 0.12)) / 0.12)) * 0.2
      leftReach = window4(p, r.magOut - 0.1, r.magOut, r.magIn, r.magIn + 0.12)
      // seat the magazine with a slap
      const seat = Math.exp(-Math.max(0, p - r.magIn) * 40) * (p > r.magIn ? 1 : 0)
      oy += seat * 0.012
      rx -= seat * 0.06
      if (weapon.reloadKind === 'empty') {
        const rel = Math.exp(-Math.max(0, p - r.bolt) * 30) * (p > r.bolt ? 1 : 0)
        ox += rel * 0.01
        rz -= rel * 0.08
      }
    }
    model.mag.position.y = model.mag.userData.y0 ??= model.mag.position.y
    model.mag.position.y -= magDrop
    model.mag.visible = magDrop < 0.3
    model.leftArm.position.copy(model.leftArm.userData.p0 ??= model.leftArm.position.clone())
    model.leftArm.position.y -= leftReach * 0.11
    model.leftArm.position.z += leftReach * (model.mag.position.z - model.leftArm.position.z) * 0.8

    // bolt / slide: cycles on each shot, locks back on empty (pistol), worked during empty reloads
    const sinceShot = weapon.sinceShot
    let boltBack = def.action === 'bolt' ? 0 : Math.max(0, 1 - sinceShot / (60 / def.fireRate)) * (sinceShot < 0.06 ? 1 : 0)
    if (def.viewmodel.kind === 'pistol' && weapon.ammo === 0 && !weapon.reloading) boltBack = 1
    if (weapon.reloading && weapon.reloadKind === 'empty') boltBack = weapon.reloadProgress < r.bolt ? (def.viewmodel.kind === 'pistol' ? 1 : window4(weapon.reloadProgress, r.bolt - 0.12, r.bolt - 0.06, r.bolt - 0.02, r.bolt)) : 0
    model.bolt.position.z = (model.bolt.userData.z0 ??= model.bolt.position.z) + boltBack * model.boltTravel

    // bolt-action cycle: handle up, back, forward, down — weapon rolls out to work it
    if (def.action === 'bolt') {
      const c = weapon.cycleTimer > 0 ? 1 - weapon.cycleTimer / def.boltCycle : weapon.reloading && weapon.reloadKind === 'empty' ? Math.max(0, (weapon.reloadProgress - r.bolt + 0.15) / 0.15) : 1
      const up = window4(c, 0.05, 0.2, 0.75, 0.9)
      const back = window4(c, 0.25, 0.42, 0.55, 0.72)
      model.bolt.rotation.z = up * 1.2
      model.bolt.position.z = model.bolt.userData.z0 + back * 0.09
      const work = window4(c, 0, 0.15, 0.85, 1) * (c < 1 ? 1 : 0)
      rz += work * 0.25
      oy -= work * 0.02
      rx += work * 0.06
    }

    // inspect: turn it over, look at the ejection port, return
    if (weapon.inspectTimer > 0) {
      const p = 1 - weapon.inspectTimer / def.inspectTime
      const a = window4(p, 0, 0.18, 0.45, 0.6), b = window4(p, 0.45, 0.6, 0.85, 1)
      ry += a * 0.9 - b * 0.4
      rz += a * 0.4 + b * -0.6
      rx += b * 0.25
      ox -= a * 0.06
      oy += a * 0.03
      oz += a * 0.05
    }

    g.position.set(px + ox, py + oy, pz + oz)
    g.rotation.set(rx, ry, rz)

    // ---- muzzle flash (vm) + one world light that toggles intensity (no shader recompiles)
    const firing = session.time - effects.playerMuzzleTime < 0.045
    const f = flash.current!
    f.visible = firing && show
    f.rotation.z = Math.random() * Math.PI
    f.scale.setScalar((0.8 + Math.random() * 0.6) * (def.class === 'sniper' ? 1.6 : def.class === 'pistol' ? 0.7 : 1))
    const blast = session.time - effects.blastTime
    if (blast < 0.15) {
      worldLight.current!.intensity = 900 * (1 - blast / 0.15)
      worldLight.current!.distance = 35
      worldLight.current!.position.copy(effects.blastAt)
    } else {
      worldLight.current!.intensity = firing ? 30 : 0
      worldLight.current!.distance = 12
      worldLight.current!.position.copy(camera.position)
    }

    // ---- view-model lighting follows the world: sun direction in view space, dimmer indoors/in shade
    const env = session.environment
    sunLocal.copy(env.sunDir).applyQuaternion(camera.quaternion.clone().invert())
    sun.current!.position.copy(sunLocal).multiplyScalar(5)
    sun.current!.intensity = env.preset.sunIntensity * (env.playerSunlit ? 1.1 : 0.25)
    sun.current!.color.set(env.preset.sunColor)
    const amb = (env.playerIndoors ? 0.45 : 1) * (0.7 + env.preset.hemiIntensity * 2.2) + env.lampLight(player.feet) * 0.8
    hemi.current!.intensity = amb + (player.flashlight ? 0.4 : 0) + (firing ? 1.5 : 0)
    hemi.current!.color.copy(tmpColor.set(env.preset.hemiSky))
    vm.scene.environmentIntensity = env.preset.envIntensity * (env.playerIndoors ? 0.15 : 0.4)

    vmCamera.aspect = size.width / size.height
    vmCamera.fov = 52 - aim * 8
    vmCamera.updateProjectionMatrix()
  })

  return (
    <>
      <pointLight ref={worldLight} color="#ffb870" distance={12} decay={2} intensity={0} />
      {createPortal(
        <>
          <hemisphereLight ref={hemi} args={['#b0b8d0', '#3a3428', 0.6]} />
          <directionalLight ref={sun} position={[1, 2, 1]} intensity={1} />
          <group ref={holder} />
          <mesh ref={nade} visible={false}>
            <cylinderGeometry args={[0.022, 0.022, 0.07, 12]} />
            <meshStandardMaterial color="#4d5640" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh ref={flash} visible={false}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshBasicMaterial map={flashMap} color="#ffd8a0" blending={AdditiveBlending} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </>,
        vm.scene,
      )}
    </>
  )
}

