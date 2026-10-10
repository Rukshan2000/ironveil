import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3, type BufferGeometry, type Material, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { litMaterial } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { AnimState, CharacterRig } from './types'

// ---- shared assets ---------------------------------------------------------------------------------

let assets: ReturnType<typeof makeAssets> | null = null
const dyes = new Map<string, { uniform: ReturnType<typeof litMaterial>; vest: ReturnType<typeof litMaterial> }>()
function dyed(a: ReturnType<typeof makeAssets>, tint: string) {
  if (!dyes.has(tint)) {
    const uniform = a.uniform.clone()
    uniform.color.set(tint)
    const vest = a.vest.clone()
    vest.color.set(tint).multiplyScalar(0.6)
    dyes.set(tint, { uniform, vest })
  }
  return dyes.get(tint)!
}
function makeAssets() {
  const camo = getTextures('camo')
  const helmet = getTextures('paintedMetal')
  const fabric = getTextures('canvas')
  const skinTones = ['#e0b896', '#c69474', '#9c7a60', '#6e4f3a', '#4a3426']
  return {
    uniform: litMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.95 }),
    vest: litMaterial({ color: '#4a4e3a', map: fabric.map, normalMap: fabric.normalMap, roughness: 0.9 }),
    helmet: litMaterial({ color: '#4c5238', map: helmet.map, roughnessMap: helmet.roughnessMap, roughness: 0.75 }),
    skins: skinTones.map((color) => litMaterial({ color, roughness: 0.62 })),
    hair: litMaterial({ color: '#2a2018', roughness: 0.9 }),
    eye: litMaterial({ color: '#141210', roughness: 0.25 }),
    black: litMaterial({ color: '#1e1f1c', roughness: 0.85 }),
    gun: litMaterial({ color: '#25272a', roughness: 0.45, metalness: 0.6 }),
    gunFurniture: litMaterial({ color: '#33352c', roughness: 0.8 }),
    geo: {
      // head (face looks down -Z)
      cranium: new SphereGeometry(0.1, 20, 16).scale(0.9, 1.08, 1),
      jaw: new SphereGeometry(0.08, 16, 12).scale(0.92, 0.78, 1),
      nose: new SphereGeometry(0.018, 8, 6).scale(0.85, 1.5, 1.15),
      ear: new SphereGeometry(0.025, 8, 6).scale(0.4, 1, 0.7),
      eye: new SphereGeometry(0.012, 8, 6),
      brow: new BoxGeometry(0.034, 0.008, 0.012),
      neck: new CylinderGeometry(0.05, 0.058, 0.12, 12),
      helmet: new SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.95, 1.08),
      helmetBand: new CylinderGeometry(0.133, 0.133, 0.025, 20, 1, true).scale(1, 1, 1.08),
      goggles: new BoxGeometry(0.15, 0.04, 0.04),
      // torso
      torso: new CapsuleGeometry(0.15, 0.2, 6, 16).scale(1.25, 1, 0.75).translate(0, 0.25, 0),
      abdomen: new CapsuleGeometry(0.14, 0.1, 4, 12).scale(1.12, 1, 0.75),
      pelvis: new CapsuleGeometry(0.13, 0.13, 4, 12).rotateZ(Math.PI / 2).scale(1, 1, 0.78),
      belt: new CylinderGeometry(0.165, 0.165, 0.05, 16).scale(1.05, 1, 0.78),
      vest: new BoxGeometry(0.4, 0.34, 0.29).translate(0, 0.25, 0),
      strap: new BoxGeometry(0.06, 0.03, 0.27),
      pouch: new BoxGeometry(0.09, 0.12, 0.06),
      pack: new BoxGeometry(0.3, 0.32, 0.14),
      radio: new BoxGeometry(0.07, 0.16, 0.05),
      antenna: new CylinderGeometry(0.004, 0.004, 0.35, 4),
      // arms
      deltoid: new SphereGeometry(0.075, 12, 10).scale(1, 1.1, 1),
      upperArm: new CylinderGeometry(0.065, 0.052, 0.34, 12).translate(0, -0.18, 0),
      elbow: new SphereGeometry(0.052, 10, 8),
      forearm: new CylinderGeometry(0.056, 0.04, 0.32, 12).translate(0, -0.18, 0),
      cuff: new CylinderGeometry(0.047, 0.047, 0.04, 10),
      palm: new BoxGeometry(0.075, 0.085, 0.035).translate(0, -0.045, 0),
      fingers: new BoxGeometry(0.07, 0.065, 0.03).translate(0, -0.03, 0),
      thumb: new BoxGeometry(0.025, 0.05, 0.025),
      // legs
      thigh: new CylinderGeometry(0.095, 0.068, 0.44, 12).translate(0, -0.22, 0),
      knee: new SphereGeometry(0.066, 10, 8),
      kneePad: new BoxGeometry(0.1, 0.11, 0.04),
      shin: new CylinderGeometry(0.068, 0.05, 0.38, 12).translate(0, -0.19, 0),
      calf: new SphereGeometry(0.06, 10, 8).scale(1, 2, 0.95),
      bootShaft: new CylinderGeometry(0.06, 0.064, 0.14, 12),
      foot: new BoxGeometry(0.11, 0.08, 0.24).translate(0, 0, -0.04),
      toe: new SphereGeometry(0.056, 10, 8).scale(1, 0.7, 1.1),
      sole: new BoxGeometry(0.12, 0.025, 0.29).translate(0, 0, -0.05),
      // rifle
      receiver: new BoxGeometry(0.05, 0.08, 0.42),
      barrel: new CylinderGeometry(0.012, 0.012, 0.32, 6).rotateX(Math.PI / 2),
      stock: new BoxGeometry(0.045, 0.1, 0.22),
      mag: new BoxGeometry(0.035, 0.16, 0.06),
      grip: new BoxGeometry(0.035, 0.1, 0.045),
    },
  }
}

function part(geo: BufferGeometry, mat: Material, parent: Object3D, pos: [number, number, number] = [0, 0, 0], detail = false) {
  const m = new Mesh(geo, mat)
  m.position.set(...pos)
  m.castShadow = true
  m.userData.detail = detail
  parent.add(m)
  return m
}

/** Merges a joint's direct child meshes that share a material (and detail flag) into one mesh — fewer draw calls. */
const mergedCache = new Map<string, BufferGeometry>()
function mergeChildren(g: Group) {
  const groups = new Map<string, Mesh[]>()
  for (const c of g.children) {
    if (!(c instanceof Mesh)) continue
    const key = `${(c.material as Material).uuid}|${c.userData.detail}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  for (const [key, meshes] of groups) {
    if (meshes.length < 2) continue
    // geometry is identical for every soldier, so cache merged results by joint layout
    const sig = key + meshes.map((m) => `${m.geometry.uuid}@${m.position.toArray()}${m.rotation.toArray()}`).join()
    let geo = mergedCache.get(sig)
    if (!geo) {
      geo = mergeGeometries(meshes.map((m) => {
        m.updateMatrix()
        const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        for (const name of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(name)) gg.deleteAttribute(name)
        return gg.applyMatrix4(m.matrix)
      }))!
      mergedCache.set(sig, geo)
    }
    const merged = new Mesh(geo, meshes[0].material)
    merged.castShadow = true
    merged.userData.detail = meshes[0].userData.detail
    meshes.forEach((m) => g.remove(m))
    g.add(merged)
  }
}

function joint(parent: Object3D, pos: [number, number, number]) {
  const g = new Group()
  g.position.set(...pos)
  parent.add(g)
  return g
}

// ---- joints & poses ----------------------------------------------------------------------------------

const J = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'rifle'] as const
type JointName = (typeof J)[number]
type Pose = Record<JointName, [number, number, number]>
const zero = (): Pose => Object.fromEntries(J.map((j) => [j, [0, 0, 0]])) as unknown as Pose

const smooth = (x: number) => x * x * (3 - 2 * x)
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const v = new Vector3()

/**
 * Procedural soldier: a jointed mesh hierarchy driven by layered, blended procedural motion — idle breathing,
 * walk/run cycles, crouch, low-ready vs shouldered aim, firing kick, reload, radio, hit flinch, turn-in-place
 * stepping and a directional death fall. All joint angles are damped towards their targets, so state changes
 * blend instead of snapping.
 */
export class SoldierRig implements CharacterRig {
  readonly root = new Group()
  readonly muzzle = new Vector3()
  private readonly body: Group
  private readonly hips: Group
  private readonly j: Record<JointName, Group>
  private readonly current = zero()
  private readonly muzzleObj: Object3D
  private phase = Math.random() * 6
  private time = Math.random() * 10
  private hipsY = 0.95
  private fall = 0
  private readonly fallSide = Math.random() < 0.5 ? -1 : 1

  /** `tint` dyes the uniform and vest (Player 2 wears red so it never reads as a guard). */
  constructor(tint?: string) {
    const base = (assets ??= makeAssets())
    const a = tint ? { ...base, ...dyed(base, tint) } : base
    const G = a.geo
    this.body = joint(this.root, [0, 0, 0])
    this.hips = joint(this.body, [0, 0.95, 0])
    const spine = joint(this.hips, [0, 0.08, 0])
    const chest = joint(spine, [0, 0.14, 0])
    const neck = joint(chest, [0, 0.47, 0])
    const head = joint(neck, [0, 0.08, 0])
    const shoulderL = joint(chest, [-0.24, 0.42, 0])
    const elbowL = joint(shoulderL, [0, -0.36, 0])
    const shoulderR = joint(chest, [0.24, 0.42, 0])
    const elbowR = joint(shoulderR, [0, -0.36, 0])
    const hipL = joint(this.hips, [-0.1, -0.06, 0])
    const kneeL = joint(hipL, [0, -0.44, 0])
    const hipR = joint(this.hips, [0.1, -0.06, 0])
    const kneeR = joint(hipR, [0, -0.44, 0])
    const rifle = joint(chest, [0.1, 0.3, -0.28])
    this.j = { hips: this.hips, spine, chest, neck, head, shoulderL, elbowL, shoulderR, elbowR, hipL, kneeL, hipR, kneeR, rifle }

    const skin = a.skins[Math.floor(Math.random() * a.skins.length)]
    part(G.pelvis, a.uniform, this.hips)
    part(G.belt, a.black, this.hips, [0, 0.08, 0])
    part(G.abdomen, a.uniform, spine, [0, 0.08, 0])
    part(G.torso, a.uniform, chest)
    part(G.vest, a.vest, chest)
    for (const x of [-0.11, 0.11]) part(G.strap, a.vest, chest, [x, 0.44, 0])
    for (const x of [-0.12, 0, 0.12]) part(G.pouch, a.vest, chest, [x, 0.16, -0.17], true)
    part(G.pack, a.vest, chest, [0, 0.26, 0.2], true)
    part(G.radio, a.black, chest, [-0.14, 0.42, 0.16], true)
    part(G.antenna, a.black, chest, [-0.15, 0.66, 0.17], true)

    part(G.neck, skin, neck, [0, 0, 0])
    part(G.cranium, skin, head, [0, 0.11, 0.005])
    part(G.jaw, skin, head, [0, 0.05, -0.02])
    part(G.nose, skin, head, [0, 0.09, -0.1], true)
    for (const x of [-1, 1]) {
      part(G.ear, skin, head, [x * 0.09, 0.1, 0.01], true)
      part(G.eye, a.eye, head, [x * 0.034, 0.115, -0.086], true)
      part(G.brow, a.hair, head, [x * 0.034, 0.134, -0.092], true)
    }
    part(G.helmet, a.helmet, head, [0, 0.13, 0.005])
    part(G.helmetBand, a.black, head, [0, 0.16, 0.005])
    part(G.goggles, a.black, head, [0, 0.19, -0.115], true)

    for (const [s, k, side] of [[shoulderL, elbowL, -1], [shoulderR, elbowR, 1]] as const) {
      part(G.deltoid, a.uniform, s, [0, -0.02, 0])
      part(G.upperArm, a.uniform, s)
      part(G.elbow, a.uniform, k)
      part(G.forearm, a.uniform, k)
      part(G.cuff, a.black, k, [0, -0.35, 0])
      part(G.palm, a.black, k, [0, -0.36, 0])
      part(G.fingers, a.black, k, [0, -0.44, -0.005]).rotation.x = 0.6
      part(G.thumb, a.black, k, [-side * 0.035, -0.4, -0.025]).rotation.z = side * 0.4
    }
    for (const [h, k] of [[hipL, kneeL], [hipR, kneeR]] as const) {
      part(G.thigh, a.uniform, h)
      part(G.knee, a.uniform, k)
      part(G.kneePad, a.black, k, [0, -0.01, -0.06], true)
      part(G.shin, a.uniform, k)
      part(G.calf, a.uniform, k, [0, -0.13, 0.012])
      part(G.bootShaft, a.black, k, [0, -0.36, 0])
      part(G.foot, a.black, k, [0, -0.44, 0])
      part(G.toe, a.black, k, [0, -0.45, -0.15])
      part(G.sole, a.black, k, [0, -0.495, 0])
    }
    part(G.receiver, a.gun, rifle, [0, 0, 0])
    part(G.barrel, a.gun, rifle, [0, 0.01, -0.36])
    part(G.stock, a.gunFurniture, rifle, [0, -0.02, 0.3])
    part(G.mag, a.gun, rifle, [0, -0.11, -0.06]).rotation.x = 0.25
    part(G.grip, a.gunFurniture, rifle, [0, -0.08, 0.1]).rotation.x = -0.3
    this.muzzleObj = joint(rifle, [0, 0.01, -0.54])
    for (const g of Object.values(this.j)) mergeChildren(g)
  }

  setDetail(level: 0 | 1) {
    this.root.traverse((o) => {
      if (!(o instanceof Mesh)) return
      if (o.userData.detail) o.visible = level === 0
      o.castShadow = level === 0
    })
  }

  update(dt: number, s: AnimState) {
    this.time += dt
    const t = this.time
    const p = zero()
    const crouch = smooth(Math.min(1, s.crouch))
    const aim = smooth(Math.min(1, s.aim))
    const walk = Math.min(1, s.speed / 1.4) * (1 - crouch * 0.3)
    const run = Math.min(1, Math.max(0, (s.speed - 2.4) / 1.4))

    // locomotion phase: stride length grows with speed; turning in place also steps
    const stepping = s.speed < 0.3 && Math.abs(s.turnRate) > 0.6 ? 0.6 : 0
    const stride = mix(1.3, 2.1, run)
    this.phase += ((s.speed + stepping * 1.2) / stride) * Math.PI * 2 * dt
    const ph = this.phase
    const gait = Math.max(walk, stepping)
    const swing = gait * mix(0.42, 0.75, run)
    p.hipL[0] = Math.sin(ph) * swing
    p.hipR[0] = -Math.sin(ph) * swing
    p.kneeL[0] = -Math.max(0, Math.sin(ph + 1.9)) * gait * mix(0.8, 1.4, run)
    p.kneeR[0] = -Math.max(0, Math.sin(ph + 1.9 + Math.PI)) * gait * mix(0.8, 1.4, run)
    let hipsY = 0.95 - Math.abs(Math.cos(ph)) * 0.035 * gait - run * 0.04
    p.hips[1] = Math.sin(ph) * 0.08 * gait
    p.hips[2] = Math.cos(ph) * 0.035 * gait
    p.spine[0] = -0.08 * walk - 0.2 * run
    p.spine[1] = -Math.sin(ph) * 0.1 * gait * (1 - aim * 0.7)

    // crouch: knees forward, hips down, torso leans in
    if (crouch > 0) {
      hipsY = mix(hipsY, 0.6, crouch)
      p.hipL[0] = mix(p.hipL[0], 1.25 + p.hipL[0] * 0.4, crouch)
      p.hipR[0] = mix(p.hipR[0], 0.5 + p.hipR[0] * 0.4, crouch)
      p.kneeL[0] = mix(p.kneeL[0], -1.9, crouch)
      p.kneeR[0] = mix(p.kneeR[0], -1.55, crouch)
      p.hipL[2] = -0.12 * crouch
      p.hipR[2] = 0.18 * crouch
      p.spine[0] += -0.25 * crouch
    }

    // breathing + idle sway
    const breath = Math.sin(t * 1.6) * 0.015
    p.chest[0] += breath
    p.spine[2] = Math.sin(t * 0.5) * 0.02 * (1 - gait)

    // arms + rifle: low ready → shouldered
    p.rifle[0] = mix(-0.75, 0, aim) - run * 0.3
    p.rifle[1] = mix(0.5, 0.05, aim)
    // (+z swings an arm towards +X: the right arm comes inwards with -z, the left with +z)
    p.shoulderR[0] = mix(0.45, 1.05, aim)
    p.shoulderR[2] = mix(-0.12, -0.3, aim)
    p.elbowR[0] = mix(1.2, 1.5, aim)
    p.shoulderL[0] = mix(0.85, 1.3, aim)
    p.shoulderL[2] = mix(0.55, 0.75, aim)
    p.elbowL[0] = mix(0.95, 0.6, aim)
    p.chest[1] = mix(0.35, 0.15, aim)
    p.neck[1] = -p.chest[1] * 0.8

    // firing: chest + rifle kick
    const kick = Math.exp(-s.sinceShot * 22)
    p.chest[0] -= kick * 0.07
    p.rifle[0] += kick * 0.12
    p.shoulderR[0] += kick * 0.08

    // reload: rifle canted, support hand goes to the magazine and back
    if (s.reload >= 0) {
      const r = Math.sin(Math.min(1, s.reload) * Math.PI)
      p.rifle[2] = 0.6 * r
      p.rifle[0] += -0.35 * r
      p.shoulderL[0] = mix(p.shoulderL[0], 0.35, r)
      p.elbowL[0] = mix(p.elbowL[0], 1.5 + Math.sin(s.reload * 18) * 0.15, r)
      p.head[0] = 0.35 * r
    }

    // radio: hand to the shoulder mic, head tilted
    if (s.radio) {
      p.shoulderL[0] = 0.5
      p.shoulderL[2] = 0.5
      p.elbowL[0] = 2.4
      p.head[2] = -0.2
    }

    // head looks where the guard is looking
    p.head[1] = s.lookYaw
    p.head[0] += crouch * 0.25 - aim * 0.05

    // hit flinch
    const flinch = Math.exp(-s.sinceHit * 9)
    p.spine[0] += flinch * 0.25
    p.spine[2] += flinch * 0.2 * this.fallSide

    // death: knees buckle, then the body topples in the direction of the shot; limbs go slack
    if (s.dead) {
      const local = v.copy(s.deathDir).applyAxisAngle(UP, -s.yaw)
      const forward = local.z < 0 ? 1 : -1 // shot travelling towards -Z (local forward) knocks him forward
      const k = Math.min(1, s.sinceDeath / 0.75)
      this.fall = k * k
      hipsY = mix(hipsY, 0.6, Math.min(1, s.sinceDeath / 0.3))
      // early: knees give; late: body straightens out on the ground
      const buckle = Math.max(0, 1 - Math.abs(s.sinceDeath - 0.25) / 0.35)
      p.kneeL[0] = -1.1 * buckle - 0.15
      p.kneeR[0] = -0.7 * buckle - 0.3
      p.hipL[0] = 0.6 * buckle + 0.1
      p.hipR[0] = 0.3 * buckle - 0.15
      p.hipR[2] = 0.15 * this.fallSide
      p.shoulderL[0] = forward > 0 ? 2.4 : -0.4
      p.shoulderL[2] = 0.35
      p.shoulderR[0] = forward > 0 ? 2.0 : -0.6
      p.shoulderR[2] = -0.5
      p.elbowL[0] = 0.4
      p.elbowR[0] = 0.25
      p.rifle[0] = -1.4
      p.head[0] = 0.4 * forward
      this.body.rotation.set(forward * (Math.PI / 2) * this.fall, 0, this.fallSide * 0.25 * this.fall)
      this.body.position.y = 0.12 * this.fall
      // dead bodies settle hard instead of easing
      for (const name of J) for (let i = 0; i < 3; i++) this.current[name][i] = mix(this.current[name][i], p[name][i], Math.min(1, dt * 10))
    } else {
      // standing (or back up after a respawn)
      this.fall = 0
      this.body.rotation.set(0, 0, 0)
      this.body.position.y = 0
      const rate = 1 - Math.exp(-14 * dt)
      for (const name of J) for (let i = 0; i < 3; i++) this.current[name][i] += (p[name][i] - this.current[name][i]) * rate
    }
    this.hipsY += (hipsY - this.hipsY) * (1 - Math.exp(-12 * dt))

    for (const name of J) {
      const c = this.current[name]
      this.j[name].rotation.set(c[0], c[1], c[2])
    }
    this.hips.position.y = this.hipsY
    this.muzzleObj.getWorldPosition(this.muzzle)
  }

  dispose() {
    // geometries/materials are shared across rigs
  }
}

const UP = new Vector3(0, 1, 0)
