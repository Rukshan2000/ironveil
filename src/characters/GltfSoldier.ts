import { AnimationMixer, BoxGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Material, type AnimationAction, type Bone, type Object3D } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { wrapAngle } from '../utils/math'
import type { AnimState, CharacterRig } from './types'

/** Rigged, skinned soldier (Mixamo) from the three.js examples, pinned to a release on the jsDelivr CDN. */
const URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Soldier.glb'
let pending: Promise<GLTF> | null = null
export const loadSoldier = () => (pending ??= new GLTFLoader().loadAsync(URL))

/** Uniform colours: the stock suit is sand-coloured sci-fi armour, tinted per side so friend and foe read apart. */
export const TINT = { friend: '#8a9468', enemy: '#45474c' }
const tinted = new Map<string, Material>()

/** Plain carbine, barrel along -Z, receiver at the origin. */
const gunMat = new MeshStandardMaterial({ color: '#25272a', roughness: 0.5, metalness: 0.6 })
function rifle() {
  const g = new Group()
  for (const [w, h, d, x, y, z] of [[0.05, 0.08, 0.42, 0, 0, 0], [0.03, 0.03, 0.35, 0, 0.01, -0.38], [0.045, 0.1, 0.22, 0, -0.02, 0.3], [0.035, 0.16, 0.06, 0, -0.11, -0.06], [0.035, 0.1, 0.045, 0, -0.08, 0.1]]) {
    const m = new Mesh(new BoxGeometry(w, h, d), gunMat)
    m.position.set(x, y, z)
    m.castShadow = true
    g.add(m)
  }
  return g
}

const qa = new Quaternion(), qb = new Quaternion(), qc = new Quaternion()
const pa = new Vector3(), pb = new Vector3(), pc = new Vector3()

/** Turns `bone` (blended by `w`) so the segment to its child bone points at `target` (world). */
function pointBone(bone: Bone, target: Vector3, w: number) {
  const child = bone.children.find((c) => (c as Bone).isBone)
  if (!child || w <= 0) return
  bone.getWorldPosition(pa)
  child.getWorldPosition(pb)
  const now = pb.sub(pa).normalize()
  const want = pc.copy(target).sub(pa).normalize()
  bone.getWorldQuaternion(qa)
  qb.setFromUnitVectors(now, want).multiply(qa) // desired world rotation
  bone.parent!.getWorldQuaternion(qc).invert()
  bone.quaternion.slerp(qc.multiply(qb), w) // desired local rotation, blended from the animated one
  bone.updateMatrixWorld(true)
}

/** CharacterRig over the GLB: idle / walk / run blended by speed, plus a procedural fall on death. */
export class GltfSoldier implements CharacterRig {
  readonly root = new Group()
  readonly muzzle = new Vector3()
  private readonly model: Object3D
  private readonly mixer: AnimationMixer
  private readonly idle: AnimationAction
  private readonly walk: AnimationAction
  private readonly run: AnimationAction
  /** Rifle carried at the side (in the hand) vs. shouldered (pivots at the shoulder with the friend's pitch). */
  private readonly sideRifle: Group
  private readonly shoulder = new Group()
  private readonly bones: Record<'armR' | 'foreR' | 'armL' | 'foreL' | 'thighL' | 'shinL' | 'thighR' | 'shinR', Bone>
  private posed = false
  private crouch = 0
  private raise = 0
  /** Lower-body turn towards the direction of travel (rad, relative to facing). */
  private turn = 0

  constructor(gltf: GLTF, tint = TINT.friend) {
    this.model = clone(gltf.scene)
    this.model.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.castShadow = true
      // one material per tint, shared by every soldier wearing it
      if (o.material.name === 'VanguardBodyMat') {
        if (!tinted.has(tint)) {
          const m = o.material.clone()
          m.color.set(tint)
          tinted.set(tint, m)
        }
        o.material = tinted.get(tint)!
      }
    })
    // bone space is in centimetres, hence the scale
    this.sideRifle = rifle()
    this.sideRifle.scale.setScalar(100)
    this.sideRifle.rotation.x = Math.PI
    this.sideRifle.position.set(0, 2, -10)
    this.model.getObjectByName('mixamorigRightHand')?.add(this.sideRifle)
    const shouldered = rifle()
    shouldered.position.set(0, -0.02, -0.32)
    this.shoulder.add(shouldered)
    this.shoulder.position.set(0.1, 1.42, -0.12)
    this.root.add(this.model, this.shoulder)
    const bone = (n: string) => this.model.getObjectByName(`mixamorig${n}`) as Bone
    this.bones = {
      armR: bone('RightArm'), foreR: bone('RightForeArm'), armL: bone('LeftArm'), foreL: bone('LeftForeArm'),
      thighL: bone('LeftUpLeg'), shinL: bone('LeftLeg'), thighR: bone('RightUpLeg'), shinR: bone('RightLeg'),
    }
    this.mixer = new AnimationMixer(this.model)
    const action = (name: string) => {
      const a = this.mixer.clipAction(gltf.animations.find((c) => c.name === name)!)
      a.play()
      return a
    }
    this.idle = action('Idle')
    this.walk = action('Walk')
    this.run = action('Run')
  }

  /** Far away: no shadow casting (skinned shadows are the expensive part). */
  setDetail(level: 0 | 1) {
    this.model.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = level === 0
    })
  }

  update(dt: number, s: AnimState) {
    if (s.dead) {
      if (!this.posed) this.mixer.update(0) // never animated (e.g. a body restored from a checkpoint): not a T-pose
      this.posed = true
      this.shoulder.visible = false
      this.sideRifle.visible = true
      // topple the way the killing shot pushed (shot from behind → forward onto the face), then lie still
      const lz = s.deathDir.x * Math.sin(s.yaw) + s.deathDir.z * Math.cos(s.yaw) // shot direction in body space
      const way = lz < 0 ? -1 : 1
      const k = Math.min(1, s.sinceDeath / 0.6)
      this.model.rotation.x = way * (Math.PI / 2) * k * k
      this.model.position.y = 0.1 * k
      return
    }
    this.posed = true
    this.model.rotation.x = 0
    this.crouch = MathUtils.damp(this.crouch, s.crouch > 0.5 ? 1 : 0, 8, dt)
    this.model.position.y = -0.4 * this.crouch
    this.shoulder.position.y = 1.42 - 0.4 * this.crouch
    // travel direction vs. facing: relaxed, the body turns into the direction of travel; aiming, it keeps facing the
    // aim and the legs strafe (twisted up to ~35°) or play the cycle in reverse when backing off
    const aiming = this.raise > 0.5
    const rel = s.moveYaw === undefined || s.speed < 0.3 ? 0 : wrapAngle(s.moveYaw - s.yaw)
    const back = aiming && Math.abs(rel) > Math.PI / 2
    const legs = !aiming ? rel : back ? wrapAngle(rel + Math.PI) : rel
    this.turn += wrapAngle(MathUtils.clamp(legs, aiming ? -0.6 : -Math.PI, aiming ? 0.6 : Math.PI) - this.turn) * Math.min(1, dt * 8)
    this.model.rotation.y = this.turn
    const dir = back ? -1 : 1

    // stride matched to ground speed so feet don't skate (clip speeds: walk ~1.5 m/s, run ~4 m/s)
    const run = MathUtils.clamp((s.speed - 2.2) / 1.4, 0, 1)
    const walk = MathUtils.clamp(s.speed / 1.2, 0, 1) * (1 - run)
    this.run.setEffectiveWeight(run)
    this.walk.setEffectiveWeight(walk)
    this.idle.setEffectiveWeight(1 - run - walk)
    this.walk.setEffectiveTimeScale(dir * MathUtils.clamp(s.speed / 1.5, 0.5, 1.8))
    this.run.setEffectiveTimeScale(dir * MathUtils.clamp(s.speed / 4, 0.7, 1.6))
    this.mixer.update(dt)

    // aiming or just fired: shoulder the rifle and reach for it (blended, cheap two-bone aim)
    const want = Math.max(s.aim, s.sinceShot < 1.5 ? 1 : 0)
    this.raise = MathUtils.damp(this.raise, want, 10, dt)
    const w = this.raise
    this.sideRifle.visible = w < 0.5
    this.shoulder.visible = w >= 0.5
    this.shoulder.rotation.x = s.pitch ?? 0
    if (w > 0.01) {
      this.root.updateWorldMatrix(true, true)
      const b = this.bones
      const grip = this.shoulder.localToWorld(new Vector3(0, -0.1, -0.22))
      const guard = this.shoulder.localToWorld(new Vector3(0, -0.05, -0.62))
      const elbowR = this.root.localToWorld(new Vector3(0.24, 1.18, -0.12))
      const elbowL = this.root.localToWorld(new Vector3(-0.08, 1.2, -0.38))
      pointBone(b.armR, elbowR, w)
      pointBone(b.foreR, grip, w)
      pointBone(b.armL, elbowL, w)
      pointBone(b.foreL, guard, w)
    }
    // crouched: thighs forward, shins down to the feet (same cheap bone aim as the arms)
    if (this.crouch > 0.01) {
      this.root.updateWorldMatrix(true, true)
      const b = this.bones
      for (const [thigh, shin, x] of [[b.thighL, b.shinL, -0.12], [b.thighR, b.shinR, 0.12]] as const) {
        pointBone(thigh, this.root.localToWorld(new Vector3(x, 0.5, x < 0 ? -0.42 : -0.3)), this.crouch)
        pointBone(shin, this.root.localToWorld(new Vector3(x, 0.08, x < 0 ? -0.12 : 0.05)), this.crouch)
      }
    }
    this.shoulder.localToWorld(this.muzzle.set(0, 0.01, -0.86))
  }

  dispose() {
    this.mixer.stopAllAction()
  }
}
