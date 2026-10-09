// First-person weapon + arms models built from primitives. Each builder is a drop-in slot: replace its body with a
// GLTF scene (keeping the named parts) and the view-model animation code stays untouched.
// Convention: origin on the sight line, barrel towards -Z, metres.
import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3,
  type BufferGeometry, type Material, type Object3D,
} from 'three'
import type { ViewModelKind } from '../weapons/types'
import { getTextures } from './textures'

export interface ViewModel {
  root: Group
  /** Moves back on firing / locks back on empty (rifle bolt, pistol slide, bolt-action handle). */
  bolt: Group
  mag: Group
  leftArm: Group
  rightArm: Group
  /** Muzzle in model space. */
  muzzle: Vector3
  /** Bolt travel (m) for the firing animation. */
  boltTravel: number
}

let mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  const metal = getTextures('metal')
  const camo = getTextures('camo')
  const wood = getTextures('wood')
  return {
    steel: new MeshStandardMaterial({ color: '#1c1d1f', roughness: 0.42, metalness: 0.8, roughnessMap: metal.roughnessMap, normalMap: metal.normalMap }),
    parkerized: new MeshStandardMaterial({ color: '#25261f', roughness: 0.68, metalness: 0.45, roughnessMap: metal.roughnessMap }),
    polymer: new MeshStandardMaterial({ color: '#1f201c', roughness: 0.85, metalness: 0.05 }),
    tan: new MeshStandardMaterial({ color: '#6a6048', roughness: 0.85, metalness: 0.05 }),
    wood: new MeshStandardMaterial({ color: '#6a4a30', map: wood.map, roughness: 0.6 }),
    glass: new MeshStandardMaterial({ color: '#0d1418', roughness: 0.05, metalness: 0.9 }),
    lens: new MeshStandardMaterial({ color: '#203040', roughness: 0.1, metalness: 0.4, emissive: '#081018', emissiveIntensity: 0.5 }),
    dot: new MeshStandardMaterial({ color: '#ff2a1a', emissive: '#ff3020', emissiveIntensity: 6 }),
    sleeve: new MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.95 }),
    glove: new MeshStandardMaterial({ color: '#25261f', roughness: 0.9 }),
    brass: new MeshStandardMaterial({ color: '#b08a3c', roughness: 0.35, metalness: 0.9 }),
  }
}

function add(parent: Object3D, geo: BufferGeometry, mat: Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new Mesh(geo, mat)
  m.position.set(...pos)
  m.rotation.set(...rot)
  parent.add(m)
  return m
}
const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d)
const cylZ = (r: number, len: number, seg = 12) => new CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2)

function group(parent: Object3D, pos: [number, number, number] = [0, 0, 0]) {
  const g = new Group()
  g.position.set(...pos)
  parent.add(g)
  return g
}

/** Gloved hand + sleeved forearm reaching back towards the camera from a grip point. */
function arm(parent: Object3D, at: [number, number, number], forearmDir: [number, number, number], m: ReturnType<typeof makeMats>) {
  const g = group(parent, at)
  add(g, box(0.055, 0.075, 0.1), m.glove, [0, -0.01, 0])
  add(g, box(0.05, 0.02, 0.06), m.glove, [0.02, 0.025, -0.04], [0, 0, -0.3]) // thumb/fingers over the gun
  const fore = new Group()
  fore.lookAt(new Vector3(...forearmDir))
  g.add(fore)
  add(fore, new CapsuleGeometry(0.038, 0.26, 4, 10).rotateX(Math.PI / 2), m.sleeve, [0, 0, 0.19])
  add(fore, new CylinderGeometry(0.044, 0.044, 0.05, 10).rotateX(Math.PI / 2), m.glove, [0, 0, 0.06]) // cuff
  return g
}

function rifle(m: ReturnType<typeof makeMats>): ViewModel {
  const root = new Group()
  const bore = -0.068
  add(root, box(0.052, 0.062, 0.32), m.parkerized, [0, bore + 0.004, 0.02]) // upper
  add(root, box(0.046, 0.05, 0.21), m.parkerized, [0, bore - 0.05, 0.03]) // lower
  add(root, box(0.026, 0.012, 0.56), m.steel, [0, bore + 0.041, -0.1]) // top rail
  for (let i = 0; i < 9; i++) add(root, box(0.03, 0.006, 0.012), m.steel, [0, bore + 0.049, -0.34 + i * 0.03])
  add(root, box(0.062, 0.066, 0.3), m.polymer, [0, bore - 0.002, -0.29]) // handguard
  for (let i = 0; i < 5; i++) add(root, box(0.064, 0.012, 0.03), m.steel, [0, bore - 0.01, -0.4 + i * 0.05]) // vent ribs
  add(root, cylZ(0.0105, 0.22), m.steel, [0, bore, -0.55])
  add(root, cylZ(0.016, 0.07, 8), m.steel, [0, bore, -0.68]) // muzzle brake
  add(root, box(0.008, 0.035, 0.012), m.steel, [0, bore + 0.03, -0.44]) // gas block / front post
  // red dot optic on the sight line
  // housing sits below the sight line (rail mount + window frame), so the view through the glass is clear
  add(root, box(0.036, 0.008, 0.08), m.polymer, [0, -0.023, 0.0])
  for (const x of [-0.017, 0.017]) add(root, box(0.004, 0.03, 0.012), m.polymer, [x, -0.006, -0.04]) // window posts
  add(root, new TorusGeometry(0.017, 0.004, 6, 16), m.polymer, [0, 0, -0.04])
  add(root, new TorusGeometry(0.017, 0.004, 6, 16), m.polymer, [0, 0, 0.035])
  add(root, new CylinderGeometry(0.015, 0.015, 0.002, 16).rotateX(Math.PI / 2), m.glass, [0, 0, -0.04]).material = new MeshStandardMaterial({ color: '#4a6070', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.5 })
  add(root, new SphereGeometry(0.0012, 6, 6), m.dot, [0, 0, -0.035])
  // stock
  add(root, box(0.04, 0.03, 0.2), m.polymer, [0, bore + 0.005, 0.26])
  add(root, box(0.045, 0.085, 0.09), m.polymer, [0, bore - 0.035, 0.33])
  add(root, box(0.046, 0.095, 0.02), m.tan, [0, bore - 0.035, 0.38])
  add(root, box(0.036, 0.1, 0.045), m.polymer, [0, bore - 0.1, 0.09], [-0.3, 0, 0]) // grip
  add(root, box(0.012, 0.04, 0.04), m.steel, [0, bore - 0.07, 0.03]) // trigger guard
  // magazine (animated)
  const mag = group(root, [0, bore - 0.06, -0.06])
  add(mag, box(0.03, 0.09, 0.07), m.parkerized, [0, -0.04, 0], [0.12, 0, 0])
  add(mag, box(0.03, 0.08, 0.068), m.parkerized, [0, -0.115, -0.018], [0.32, 0, 0])
  add(mag, box(0.012, 0.01, 0.06), m.brass, [0, 0.008, 0]) // top round
  // charging handle / bolt carrier (animated)
  const bolt = group(root, [0, bore + 0.01, 0.03])
  add(bolt, box(0.008, 0.02, 0.07), m.steel, [0.028, 0, 0])
  add(bolt, box(0.04, 0.012, 0.02), m.steel, [0, 0.02, 0.15])
  const leftArm = arm(root, [0, bore - 0.06, -0.32], [-0.35, -0.35, 1], m)
  const rightArm = arm(root, [0.005, bore - 0.11, 0.1], [0.45, -0.4, 1], m)
  return { root, bolt, mag, leftArm, rightArm, muzzle: new Vector3(0, bore, -0.72), boltTravel: 0.06 }
}

function pistol(m: ReturnType<typeof makeMats>): ViewModel {
  const root = new Group()
  const bore = -0.035
  const bolt = group(root, [0, 0, 0]) // slide
  add(bolt, box(0.03, 0.032, 0.19), m.parkerized, [0, bore + 0.005, -0.06])
  for (let i = 0; i < 6; i++) add(bolt, box(0.031, 0.026, 0.004), m.steel, [0, bore + 0.006, 0.01 + i * 0.008]) // serrations
  add(bolt, box(0.012, 0.008, 0.008), m.steel, [0, bore + 0.025, 0.02]) // rear sight
  add(bolt, box(0.004, 0.009, 0.006), m.steel, [0, bore + 0.025, -0.145]) // front sight
  add(root, cylZ(0.008, 0.02, 8), m.steel, [0, bore, -0.16])
  add(root, box(0.028, 0.028, 0.16), m.polymer, [0, bore - 0.026, -0.06]) // frame
  add(root, box(0.03, 0.11, 0.048), m.polymer, [0, bore - 0.09, 0.0], [-0.22, 0, 0]) // grip
  add(root, box(0.01, 0.022, 0.03), m.polymer, [0, bore - 0.05, -0.04])
  const mag = group(root, [0, bore - 0.1, 0.005])
  add(mag, box(0.024, 0.1, 0.038), m.steel, [0, -0.0, 0], [-0.22, 0, 0])
  add(mag, box(0.026, 0.01, 0.045), m.polymer, [0, -0.05, 0.01], [-0.22, 0, 0])
  const rightArm = arm(root, [0.002, bore - 0.085, 0.01], [0.3, -0.45, 1], m)
  const leftArm = arm(root, [-0.03, bore - 0.095, 0.0], [-0.45, -0.45, 1], m)
  leftArm.rotation.z = 0.5
  return { root, bolt, mag, leftArm, rightArm, muzzle: new Vector3(0, bore, -0.17), boltTravel: 0.035 }
}

function sniper(m: ReturnType<typeof makeMats>): ViewModel {
  const root = new Group()
  const bore = -0.055
  add(root, box(0.05, 0.05, 0.3), m.parkerized, [0, bore, 0.04]) // receiver
  add(root, cylZ(0.013, 0.6), m.steel, [0, bore, -0.42]) // heavy barrel
  add(root, cylZ(0.02, 0.08, 8), m.steel, [0, bore, -0.74]) // brake
  add(root, box(0.06, 0.06, 0.42), m.wood, [0, bore - 0.03, -0.18]) // fore-end
  add(root, box(0.05, 0.1, 0.3), m.wood, [0, bore - 0.04, 0.3]) // stock
  add(root, box(0.04, 0.03, 0.14), m.wood, [0, bore + 0.03, 0.3]) // cheek rest
  add(root, box(0.04, 0.11, 0.05), m.wood, [0, bore - 0.09, 0.13], [-0.35, 0, 0]) // grip
  add(root, box(0.052, 0.12, 0.022), m.polymer, [0, bore - 0.04, 0.46]) // butt pad
  // scope on the sight line
  add(root, cylZ(0.018, 0.3), m.parkerized, [0, 0, -0.02])
  add(root, new CylinderGeometry(0.026, 0.019, 0.07, 14).rotateX(Math.PI / 2), m.parkerized, [0, 0, -0.2])
  add(root, new CylinderGeometry(0.021, 0.018, 0.05, 14).rotateX(Math.PI / 2), m.parkerized, [0, 0, 0.14])
  add(root, new CylinderGeometry(0.024, 0.024, 0.002, 14).rotateX(Math.PI / 2), m.lens, [0, 0, -0.236])
  add(root, new CylinderGeometry(0.017, 0.017, 0.002, 14).rotateX(Math.PI / 2), m.lens, [0, 0, 0.166])
  add(root, box(0.012, 0.03, 0.016), m.parkerized, [0, 0.022, -0.02]) // turret
  add(root, cylZ(0.012, 0.016, 10).rotateY(Math.PI / 2), m.parkerized, [0.024, 0, -0.02])
  for (const z of [-0.08, 0.06]) add(root, box(0.03, 0.04, 0.02), m.steel, [0, -0.03, z]) // rings
  const mag = group(root, [0, bore - 0.05, -0.02])
  add(mag, box(0.03, 0.06, 0.08), m.steel, [0, -0.02, 0])
  // bolt handle on the right side (rotates up and slides back)
  const bolt = group(root, [0.028, bore + 0.01, 0.14])
  add(bolt, cylZ(0.011, 0.1, 8), m.steel, [-0.02, 0, -0.04])
  const handle = add(bolt, new CylinderGeometry(0.005, 0.005, 0.06, 6).rotateZ(Math.PI / 2), m.steel, [0.03, 0, 0])
  add(handle, new SphereGeometry(0.011, 8, 8), m.steel, [0, -0.03, 0])
  // folded bipod
  add(root, box(0.008, 0.008, 0.16), m.steel, [-0.015, bore - 0.06, -0.38])
  add(root, box(0.008, 0.008, 0.16), m.steel, [0.015, bore - 0.06, -0.38])
  const leftArm = arm(root, [0, bore - 0.07, -0.3], [-0.35, -0.3, 1], m)
  const rightArm = arm(root, [0.005, bore - 0.11, 0.15], [0.45, -0.4, 1], m)
  return { root, bolt, mag, leftArm, rightArm, muzzle: new Vector3(0, bore, -0.78), boltTravel: 0 }
}

export function buildViewModel(kind: ViewModelKind): ViewModel {
  const m = (mats ??= makeMats())
  const vm = kind === 'pistol' ? pistol(m) : kind === 'sniper' ? sniper(m) : rifle(m)
  vm.root.traverse((o) => {
    if (o instanceof Mesh) o.frustumCulled = false
  })
  return vm
}
