import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3, type BufferGeometry, type Material, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { litMaterial } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { AnimState, CharacterRig } from './types'

// ---- shared assets ---------------------------------------------------------------------------------

let assets: ReturnType<typeof makeAssets> | null = null
function makeAssets() {
  const camo = getTextures('camo')
  const helmet = getTextures('paintedMetal')
  const fabric = getTextures('canvas')
  return {
    uniform: litMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.95 }),
    vest: litMaterial({ color: '#4a4e3a', map: fabric.map, normalMap: fabric.normalMap, roughness: 0.9 }),
    helmet: litMaterial({ color: '#4c5238', map: helmet.map, roughnessMap: helmet.roughnessMap, roughness: 0.75 }),
    skin: litMaterial({ color: '#9c7a60', roughness: 0.7 }),
    black: litMaterial({ color: '#1e1f1c', roughness: 0.85 }),
    gun: litMaterial({ color: '#25272a', roughness: 0.45, metalness: 0.6 }),
    gunFurniture: litMaterial({ color: '#33352c', roughness: 0.8 }),
    geo: {
      limbUpper: new CapsuleGeometry(0.068, 0.3, 4, 8).translate(0, -0.2, 0),
      limbLower: new CapsuleGeometry(0.058, 0.3, 4, 8).translate(0, -0.2, 0),
      thigh: new CapsuleGeometry(0.085, 0.32, 4, 8).translate(0, -0.22, 0),
      shin: new CapsuleGeometry(0.07, 0.34, 4, 8).translate(0, -0.22, 0),
      boot: new BoxGeometry(0.13, 0.1, 0.27).translate(0, -0.05, -0.05),
      hand: new BoxGeometry(0.08, 0.1, 0.06).translate(0, -0.05, 0),
      pelvis: new BoxGeometry(0.34, 0.2, 0.22),
      torso: new BoxGeometry(0.38, 0.46, 0.24).translate(0, 0.23, 0),
      vest: new BoxGeometry(0.42, 0.36, 0.3).translate(0, 0.24, 0),
      pouch: new BoxGeometry(0.09, 0.12, 0.06),
      head: new SphereGeometry(0.105, 12, 10),
      helmet: new SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      brim: new CylinderGeometry(0.14, 0.145, 0.03, 12),
      neck: new CylinderGeometry(0.05, 0.055, 0.1, 8),
      pack: new BoxGeometry(0.3, 0.32, 0.14),
      radio: new BoxGeometry(0.07, 0.16, 0.05),
      antenna: new CylinderGeometry(0.004, 0.004, 0.35, 4),
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

  constructor() {
    const a = (assets ??= makeAssets())
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

    part(G.pelvis, a.uniform, this.hips)
    part(G.torso, a.uniform, chest)
    part(G.vest, a.vest, chest)
    for (const x of [-0.12, 0, 0.12]) part(G.pouch, a.vest, chest, [x, 0.16, -0.17], true)
    part(G.pack, a.vest, chest, [0, 0.26, 0.2], true)
    part(G.radio, a.black, chest, [-0.14, 0.42, 0.16], true)
    part(G.antenna, a.black, chest, [-0.15, 0.66, 0.17], true)
    part(G.neck, a.skin, neck, [0, -0.02, 0])
    part(G.head, a.skin, head, [0, 0.1, 0])
    part(G.helmet, a.helmet, head, [0, 0.13, 0])
    part(G.brim, a.helmet, head, [0, 0.13, 0])
    for (const [s, k] of [[shoulderL, elbowL], [shoulderR, elbowR]] as const) {
      part(G.limbUpper, a.uniform, s)
      part(G.limbLower, a.uniform, k)
      part(G.hand, a.black, k, [0, -0.38, 0])
    }
    for (const [h, k] of [[hipL, kneeL], [hipR, kneeR]] as const) {
      part(G.thigh, a.uniform, h)
      part(G.shin, a.uniform, k)
      part(G.boot, a.black, k, [0, -0.42, 0])
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
