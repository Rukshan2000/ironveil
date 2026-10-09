import { AnimationMixer, BoxGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3, type AnimationAction, type Object3D } from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { AnimState, CharacterRig } from './types'

/** Rigged, skinned soldier (Mixamo) from the three.js examples, pinned to a release on the jsDelivr CDN. */
const URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Soldier.glb'
let pending: Promise<GLTF> | null = null
export const loadSoldier = () => (pending ??= new GLTFLoader().loadAsync(URL))

/** Plain carbine in the right hand, carried at the side (bone space is in centimetres, hence the scale). */
const gunMat = new MeshStandardMaterial({ color: '#25272a', roughness: 0.5, metalness: 0.6 })
function rifle() {
  const g = new Group()
  for (const [w, h, d, x, y, z] of [[0.05, 0.08, 0.42, 0, 0, 0], [0.03, 0.03, 0.35, 0, 0.01, -0.38], [0.045, 0.1, 0.22, 0, -0.02, 0.3], [0.035, 0.16, 0.06, 0, -0.11, -0.06], [0.035, 0.1, 0.045, 0, -0.08, 0.1]]) {
    const m = new Mesh(new BoxGeometry(w, h, d), gunMat)
    m.position.set(x, y, z)
    m.castShadow = true
    g.add(m)
  }
  g.scale.setScalar(100)
  g.rotation.x = Math.PI
  g.position.set(0, 2, -10)
  return g
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

  constructor(gltf: GLTF) {
    this.model = clone(gltf.scene)
    this.model.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.castShadow = true
      // the stock suit is sand-coloured sci-fi armour: tint it olive to sit with the rest of the force
      if (o.material.name === 'VanguardBodyMat') o.material.color.set('#8a9468')
    })
    this.model.getObjectByName('mixamorigRightHand')?.add(rifle())
    this.root.add(this.model)
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

  setDetail() {}

  update(dt: number, s: AnimState) {
    if (s.dead) {
      // topple backwards over ~0.6 s, then lie still
      const k = Math.min(1, s.sinceDeath / 0.6)
      this.model.rotation.x = (Math.PI / 2) * k * k
      this.model.position.y = 0.1 * k
      return
    }
    this.model.rotation.x = 0
    this.model.position.y = 0
    const run = MathUtils.clamp((s.speed - 2.5) / 2, 0, 1)
    const walk = MathUtils.clamp(s.speed / 1.4, 0, 1) * (1 - run)
    this.run.setEffectiveWeight(run)
    this.walk.setEffectiveWeight(walk)
    this.idle.setEffectiveWeight(1 - run - walk)
    this.walk.setEffectiveTimeScale(MathUtils.clamp(s.speed / 1.4, 0.6, 1.6))
    this.run.setEffectiveTimeScale(MathUtils.clamp(s.speed / 5, 0.7, 1.3))
    this.mixer.update(dt)
    this.root.localToWorld(this.muzzle.set(0.15, 1.4, -0.6))
  }

  dispose() {
    this.mixer.stopAllAction()
  }
}
