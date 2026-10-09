import { AnimationClip, AnimationMixer, Box3, BoxGeometry, Color, LoopOnce, CylinderGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3, type Material, type AnimationAction, type Bone, type Object3D } from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { wrapAngle } from '../utils/math'
import type { AnimState, CharacterRig } from './types'

/** Rigged, skinned soldier (Mixamo) from the three.js examples, pinned to a release on the jsDelivr CDN. */
const URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Soldier.glb'
let pending: Promise<GLTF> | null = null
export const loadSoldier = () => (pending ??= new GLTFLoader().loadAsync(URL))

/**
 * Enemy body: the Mixamo soldier in public/models/enemy.fbx (camo uniform, its own "Dying" clip), moved by the stock
 * soldier's Idle / Walk / Run — both are Mixamo skeletons, so the clips drive it by bone name (root-position tracks are
 * dropped; the game moves the body). Falls back to the stock soldier if the file is missing.
 */
const ENEMY_FBX = '/models/enemy.fbx'

/**
 * Re-expresses a clip made for one Mixamo skeleton on another whose rest pose / up-axis differs (the stock soldier is
 * Z-up under a rotated root; the FBX is Y-up). Per bone, the rotation away from the source rest pose is applied to the
 * target rest pose, measured in each skeleton's parent frame. Position tracks are dropped (the game moves the body).
 */
function retarget(clip: AnimationClip, from: Object3D, to: Object3D): AnimationClip {
  from.updateMatrixWorld(true)
  to.updateMatrixWorld(true)
  const qA = new Quaternion(), q = new Quaternion()
  const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion')).flatMap((t) => {
    const name = t.name.slice(0, -'.quaternion'.length)
    const src = from.getObjectByName(name), dst = to.getObjectByName(name)
    if (!src || !dst) return []
    const pg = src.parent!.getWorldQuaternion(new Quaternion()), pf = dst.parent!.getWorldQuaternion(new Quaternion())
    // world-space delta from the source rest, re-applied on the target rest:  dst = Pf⁻¹·Pg·q·rg⁻¹·Pg⁻¹·Pf·rf
    const pre = pf.clone().invert().multiply(pg)
    const post = src.quaternion.clone().invert().multiply(pg.clone().invert()).multiply(pf).multiply(dst.quaternion)
    const v = Float32Array.from(t.values)
    for (let i = 0; i < v.length; i += 4) {
      q.fromArray(v, i)
      qA.copy(pre).multiply(q).multiply(post).toArray(v, i)
    }
    const out = t.clone()
    out.values = v
    return [out]
  })
  return new AnimationClip(clip.name, clip.duration, tracks)
}
let enemyPending: Promise<GLTF> | null = null
export const loadEnemySoldier = () => (enemyPending ??= Promise.all([loadSoldier(), new FBXLoader().loadAsync(ENEMY_FBX)])
  .then(([base, fbx]) => {
    const height = (o: Object3D) => {
      const b = new Box3().setFromObject(o)
      return b.max.y - b.min.y
    }
    fbx.scale.multiplyScalar(height(base.scene) / height(fbx))
    // the FBX faces the other way to the stock soldier: turn it inside a wrapper (the rig animates the wrapper)
    const body = new Group()
    body.add(fbx)
    fbx.rotation.y = Math.PI
    body.userData.ownGear = true // helmet and kit are part of the model
    const dying = fbx.animations[0]
    if (dying) dying.name = 'Dying'
    const moves = base.animations.map((c) => retarget(c, base.scene, body))
    return { ...base, scene: body, animations: dying ? [...moves, dying] : moves } as GLTF
  })
  .catch((e) => {
    console.warn('Enemy model not loaded, using the stock soldier', e)
    return loadSoldier()
  }))

/** Uniform colours: the stock suit is sand-coloured sci-fi armour, tinted per side so friend and foe read apart. */
export const TINT = { friend: '#8a9468', enemy: '#45474c' }
const tinted = new Map<string, Material>()

/** How a soldier is dressed: uniform colour, headgear, armour vest, armband (leaders), overall bulk. */
export interface SoldierLook {
  tint: string
  head?: 'helmet' | 'cap' | 'beret' | 'boonie' | 'beanie'
  vest?: boolean
  armband?: string
  bulk?: number
}

const gearMats = new Map<string, MeshStandardMaterial>()
const gearMat = (color: string, roughness = 0.85) => {
  const key = color + roughness
  if (!gearMats.has(key)) gearMats.set(key, new MeshStandardMaterial({ color, roughness, metalness: 0.05 }))
  return gearMats.get(key)!
}
function part(parent: Object3D, geo: BoxGeometry | CylinderGeometry | SphereGeometry | TorusGeometry, mat: Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const m = new Mesh(geo, mat)
  m.position.set(...pos)
  m.rotation.set(...rot)
  m.scale.set(...scale)
  m.castShadow = true
  parent.add(m)
}

/** Headgear, vest and armband, built in metres and attached to the skeleton (bone space is centimetres). */
function dress(model: Object3D, look: SoldierLook) {
  model.updateMatrixWorld(true)
  const at = (bone: string) => {
    const g = new Group()
    const b = model.getObjectByName(`mixamorig${bone}`)
    // gear is built in metres; bone space can be centimetres (or anything), so undo the bone's world scale
    g.scale.setScalar(b ? 1 / b.getWorldScale(new Vector3()).x : 1)
    b?.add(g)
    return g
  }
  if (look.head && !model.userData.ownGear) {
    const h = at('Head')
    const dome = (r: number, color: string, y: number, sy = 1) => part(h, new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), gearMat(color), [0, y, 0.005], [0, 0, 0], [1, sy, 1.08])
    switch (look.head) {
      case 'helmet':
        dome(0.125, '#3a3d34', 0.09, 0.95)
        part(h, new CylinderGeometry(0.128, 0.13, 0.015, 16), gearMat('#33362e'), [0, 0.09, 0.005], [0, 0, 0], [1, 1, 1.08])
        break
      case 'cap': // officer's peaked cap
        part(h, new CylinderGeometry(0.115, 0.1, 0.07, 16), gearMat('#2c2f38'), [0, 0.15, 0])
        part(h, new CylinderGeometry(0.1, 0.1, 0.012, 16), gearMat('#15161a', 0.4), [0, 0.12, 0.06], [0.25, 0, 0], [1, 1, 0.7])
        part(h, new BoxGeometry(0.2, 0.012, 0.012), gearMat('#b8963c', 0.4), [0, 0.13, 0.11])
        break
      case 'beret':
        part(h, new SphereGeometry(0.115, 14, 8), gearMat('#7a1d1d'), [0.02, 0.15, 0], [0, 0, -0.25], [1.05, 0.35, 1.05])
        break
      case 'boonie': // sniper's wide-brim hat
        dome(0.11, '#5d5a3c', 0.1)
        part(h, new CylinderGeometry(0.19, 0.19, 0.008, 18), gearMat('#58553a'), [0, 0.1, 0.005])
        break
      case 'beanie':
        dome(0.112, '#1d1f24', 0.08, 1.15)
        break
    }
  }
  if (look.vest) {
    const c = at('Spine2')
    part(c, new BoxGeometry(0.4, 0.34, 0.3), gearMat('#2f3328'), [0, 0.04, 0.01])
    for (const x of [-0.1, 0, 0.1]) part(c, new BoxGeometry(0.08, 0.1, 0.05), gearMat('#3a3f31'), [x, -0.02, 0.17]) // magazine pouches
  }
  if (look.armband) part(at('LeftArm'), new TorusGeometry(0.058, 0.018, 6, 14), gearMat(look.armband), [0, 0.12, 0], [Math.PI / 2, 0, 0])
}

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
const smooth = (x: number) => x * x * (3 - 2 * x)
/** Shot direction in body space: lz > 0 pushes backwards, lx sideways. */
const local = (s: AnimState) => ({
  lx: s.deathDir.x * Math.cos(s.yaw) - s.deathDir.z * Math.sin(s.yaw),
  lz: s.deathDir.x * Math.sin(s.yaw) + s.deathDir.z * Math.cos(s.yaw),
})

/** Turns `bone` (blended by `w`) so the segment to its child bone points at `target` (world). */
export function pointBone(bone: Bone, target: Vector3, w: number) {
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
  /** The model's own death animation, when it has one (else a procedural fall). */
  private readonly dying: AnimationAction | null
  private dyingStarted = false
  /** The rifle, always in both hands: low ready (muzzle down across the body) blending to shouldered (with pitch). */
  private readonly shoulder = new Group()
  private readonly bones: Record<'armR' | 'foreR' | 'armL' | 'foreL' | 'thighL' | 'shinL' | 'thighR' | 'shinR' | 'spine' | 'chest' | 'head', Bone>
  private crouch = 0
  private raise = 0
  /** Lower-body turn towards the direction of travel (rad, relative to facing). */
  private turn = 0

  constructor(gltf: GLTF, look: SoldierLook = { tint: TINT.friend }) {
    const tint = look.tint
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
      } else if (tint !== TINT.enemy && tint !== TINT.friend) {
        // textured uniforms (enemy model): a light wash of the type's colour so heavies / snipers / rushers read apart
        const mats: MeshStandardMaterial[] = Array.isArray(o.material) ? o.material : [o.material]
        const washed = mats.map((m) => {
          const key = `${m.uuid}${tint}`
          if (!tinted.has(key)) {
            const c = m.clone()
            c.color.set('#ffffff').lerp(new Color(tint), 0.4).multiplyScalar(1.25)
            tinted.set(key, c)
          }
          return tinted.get(key)!
        })
        o.material = Array.isArray(o.material) ? washed : washed[0]
      }
    })
    const shouldered = rifle()
    shouldered.position.set(0, -0.02, -0.32)
    this.shoulder.add(shouldered)
    this.shoulder.position.set(0.1, 1.42, -0.12)
    dress(this.model, look)
    this.model.scale.setScalar(this.model.scale.x * (look.bulk ?? 1))
    this.root.add(this.model, this.shoulder)
    const bone = (n: string) => this.model.getObjectByName(`mixamorig${n}`) as Bone
    this.bones = {
      armR: bone('RightArm'), foreR: bone('RightForeArm'), armL: bone('LeftArm'), foreL: bone('LeftForeArm'),
      thighL: bone('LeftUpLeg'), shinL: bone('LeftLeg'), thighR: bone('RightUpLeg'), shinR: bone('RightLeg'),
      spine: bone('Spine'), chest: bone('Spine2'), head: bone('Head'),
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
    const death = gltf.animations.find((c) => c.name === 'Dying')
    this.dying = death ? this.mixer.clipAction(death) : null
    if (this.dying) {
      this.dying.setLoop(LoopOnce, 1)
      this.dying.clampWhenFinished = true
    }
  }

  /** Far away: no shadow casting (skinned shadows are the expensive part). */
  setDetail(level: 0 | 1) {
    this.model.traverse((o) => {
      if (o instanceof Mesh) o.castShadow = level === 0
    })
  }

  update(dt: number, s: AnimState) {
    if (s.dead) return this.die(s, dt)
    this.model.rotation.x = 0
    this.crouch = MathUtils.damp(this.crouch, s.crouch > 0.5 ? 1 : 0, 8, dt)
    this.model.position.y = -0.4 * this.crouch
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
    // the rifle never leaves his hands: it swings from low ready up into the shoulder, and both arms reach for it
    // (grip and handguard), so the hold works on any Mixamo skeleton whatever its hand bones look like
    const L = MathUtils.lerp
    const sh = this.shoulder
    sh.visible = true
    sh.position.set(L(0.07, 0.1, w), L(1.1, 1.42, w) - 0.4 * this.crouch, L(-0.2, -0.12, w))
    sh.rotation.set(L(-0.7, s.pitch ?? 0, w), L(0.6, 0, w), L(0.2, 0, w), 'YXZ')
    this.root.updateWorldMatrix(true, true)
    {
      const b = this.bones
      const grip = sh.localToWorld(new Vector3(0, -0.1, -0.22))
      const guard = sh.localToWorld(new Vector3(0, -0.05, -0.62))
      const elbowR = this.root.localToWorld(new Vector3(L(0.22, 0.24, w), L(0.98, 1.18, w) - 0.4 * this.crouch, L(-0.02, -0.12, w)))
      const elbowL = this.root.localToWorld(new Vector3(L(-0.16, -0.08, w), L(1.0, 1.2, w) - 0.4 * this.crouch, L(-0.2, -0.38, w)))
      pointBone(b.armR, elbowR, 1)
      pointBone(b.foreR, grip, 1)
      pointBone(b.armL, elbowL, 1)
      pointBone(b.foreL, guard, 1)
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
    // hit: the torso and head snap away from the round, then recover
    const flinch = Math.exp(-s.sinceHit * 9) * (s.sinceHit < 0.6 ? 1 : 0)
    if (flinch > 0.01) {
      const { lx, lz } = local(s)
      const b = this.bones
      b.spine.rotation.x += -lz * 0.35 * flinch
      b.chest.rotation.z += lx * 0.3 * flinch
      b.chest.rotation.y += lx * 0.25 * flinch
      b.head.rotation.x += -lz * 0.4 * flinch
    }
    this.shoulder.localToWorld(this.muzzle.set(0, 0.01, -0.86))
  }

  /**
   * Procedural death: legs give out and the hips drop, the body tips over (accelerating like it's falling, pushed by
   * the round), lands with a small bounce, then the head and arms flop to the ground. Fully re-posed every frame from
   * the frozen last animation pose, so it can stop updating once settled.
   */
  private die(s: AnimState, dt = 0) {
    // the rifle falls from his hands and lies on the ground beside him
    this.shoulder.visible = true
    this.shoulder.position.set(0.35, 0.04, -0.55)
    this.shoulder.rotation.set(0, 1.1, Math.PI / 2)
    if (this.dying) {
      // the model's own death animation: blend out of whatever he was doing and play it once
      if (!this.dyingStarted) {
        this.dyingStarted = true
        this.model.rotation.set(0, this.turn, 0)
        this.model.position.y = 0
        for (const a of [this.idle, this.walk, this.run]) a.fadeOut(0.15)
        this.dying.reset().setEffectiveWeight(1).fadeIn(0.15).play()
        if (s.sinceDeath > 3) this.dying.time = this.dying.getClip().duration // restored corpse: already down
      }
      this.mixer.update(dt)
      return
    }
    this.mixer.update(0) // re-apply the last animation pose (frozen mid-step) as the base
    const t = s.sinceDeath
    const { lx, lz } = local(s)
    // variety per guard: which way the head rolls, how much the body twists
    const v = Math.sin(s.deathDir.x * 91.7 + s.deathDir.z * 37.3)
    const way = lz < 0 ? -1 : 1 // shot from behind → onto the face
    const buckle = smooth(Math.min(1, t / 0.35))
    const fall = Math.min(1, Math.max(0, (t - 0.12) / 0.6))
    const f = fall * fall // gravity: slow start, fast finish
    const land = Math.max(0, t - 0.72)
    const bounce = land < 0.35 ? Math.sin((land / 0.35) * Math.PI) * 0.12 * (1 - land / 0.35) : 0
    this.model.rotation.set(way * (Math.PI / 2) * f - way * bounce, this.turn + v * 0.5 * f, MathUtils.clamp(lx, -1, 1) * 0.35 * f)
    this.model.position.y = -0.45 * buckle * (1 - f) + 0.12 * f
    const b = this.bones
    // slump: chest folds, head lolls
    b.spine.rotation.x += 0.35 * buckle * (1 - f * 0.6)
    b.chest.rotation.x += 0.25 * buckle
    b.head.rotation.x += (0.4 + 0.3 * f) * buckle * -way
    b.head.rotation.z += v * 0.6 * f
    this.root.updateWorldMatrix(true, true)
    // knees fold as he drops, legs straighten out once he's down
    const knees = buckle * (1 - f * 0.7)
    for (const [thigh, shin, x] of [[b.thighL, b.shinL, -0.12], [b.thighR, b.shinR, 0.12]] as const) {
      pointBone(thigh, this.root.localToWorld(new Vector3(x, 0.5, x < 0 ? -0.45 : -0.32)), knees)
      pointBone(shin, this.root.localToWorld(new Vector3(x, 0.05, x < 0 ? -0.1 : 0.08)), knees)
    }
    // limp arms hang towards the ground
    const limp = Math.min(1, buckle * 0.6 + f * 0.4)
    for (const [arm, fore, side] of [[b.armL, b.foreL, -1], [b.armR, b.foreR, 1]] as const) {
      arm.getWorldPosition(pa)
      pointBone(arm, pb.copy(pa).add(pc.set(side * 0.25, -1, 0.1 * side * v)), limp)
      fore.getWorldPosition(pa)
      pointBone(fore, pb.copy(pa).add(pc.set(side * 0.15, -1, 0.2)), limp)
    }
  }

  dispose() {
    this.mixer.stopAllAction()
  }
}
