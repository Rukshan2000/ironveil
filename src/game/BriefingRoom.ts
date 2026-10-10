import {
  Box3, BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  PointLight, Quaternion, Scene, SpotLight, SRGBColorSpace, Vector3, type Bone, type Material, type Object3D, type PerspectiveCamera,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { hush, say } from '../audio/speech'
import { pointBone } from '../characters/GltfSoldier'
import { BUDDY_NAME } from '../ai/BuddyBot'
import { NIGHTFALL } from '../missions/nightfall'
import { useGameStore } from '../state/gameStore'
import type { LevelLayout } from '../world/types'

/**
 * Pre-mission briefing room: EVA, the operations officer, stands by a wall screen and talks WREN through the
 * mission — why it matters, then each task with the screen showing where. Its own scene with its own lights; the
 * render pipeline swaps it in while `active`. EVA is the "Michelle" Mixamo character from the three.js examples,
 * posed procedurally (the file only ships a dance clip). Her lines are spoken with the browser's speech synthesis.
 */
const EVA_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/Michelle.glb'
/**
 * Preferred EVA: a local model dropped at public/models/eva.glb (e.g. "Female Military Officer" by ItsKrish7, CC BY,
 * sketchfab.com/3d-models/female-military-officer-433886475f6542d6a5cc04f5058121c7). Falls back to the stock character.
 */
const LOCAL_EVA_URL = '/models/eva.glb'
export const EVA_CREDIT = '"Female Military Officer" by ItsKrish7 (CC BY 4.0)'

/** Skeleton naming varies (Mixamo, Unreal/Unity, Blender rigs): canonical bone → accepted names (lower case). */
const BONE_ALIASES: Record<string, string[]> = {
  Hips: ['hips', 'pelvis'],
  Spine: ['spine', 'spine_01', 'spine01'],
  Spine1: ['spine1', 'spine_02', 'spine02'],
  Spine2: ['spine2', 'spine_03', 'spine03', 'chest', 'upperchest'],
  Head: ['head'],
  LeftArm: ['leftarm', 'upperarm_l', 'upperarm.l', 'upper_arm.l', 'l_upperarm', 'leftupperarm', 'lupperarm'],
  LeftForeArm: ['leftforearm', 'lowerarm_l', 'forearm_l', 'forearm.l', 'l_forearm', 'leftlowerarm', 'lforearm'],
  LeftHand: ['lefthand', 'hand_l', 'hand.l', 'l_hand', 'lhand'],
  RightArm: ['rightarm', 'upperarm_r', 'upperarm.r', 'upper_arm.r', 'r_upperarm', 'rightupperarm', 'rupperarm'],
  RightForeArm: ['rightforearm', 'lowerarm_r', 'forearm_r', 'forearm.r', 'r_forearm', 'rightlowerarm', 'rforearm'],
  RightHand: ['righthand', 'hand_r', 'hand.r', 'r_hand', 'rhand'],
}
const canonical = (name: string) => {
  const n = name.toLowerCase().replace(/^(mixamorig:?|bip0?0?1[ _]?|def-|armature_?|cc_base_)/, '').replace(/[\s:]/g, '')
  return Object.keys(BONE_ALIASES).find((k) => BONE_ALIASES[k].includes(n))
}
export const OFFICE_LENGTH = 56

type Topic = 'logo' | 'overview' | 'dawn' | 'entry' | 'compound' | 'uplink' | 'security' | 'support' | 'extract'
type Shot = 'wide' | 'close' | 'screen'
export const EVA_LINES: { from: number; to: number; text: string; topic: Topic; shot: Shot; gesture?: boolean }[] = [
  { from: 1.5, to: 6.6, topic: 'logo', shot: 'wide', text: "Wren. I'm Eva, operations. Take a seat — we don't have long." },
  { from: 7, to: 13.2, topic: 'overview', shot: 'screen', gesture: true, text: 'This is Halvard Ridge, a signals station on the border. For six weeks it has relayed coded orders we cannot read.' },
  { from: 13.6, to: 19.2, topic: 'dawn', shot: 'close', text: 'We believe those orders are for an attack on the valley, at dawn. We need to know where, and when.' },
  { from: 19.6, to: 25.2, topic: 'entry', shot: 'screen', gesture: true, text: 'First, get inside the wire. The west ditch and the east tunnel are quiet. The main gate is not.' },
  { from: 25.6, to: 31.4, topic: 'compound', shot: 'screen', gesture: true, text: 'The orders are on the comms terminal in the walled compound. An officer in the warehouse carries the gate keycard.' },
  { from: 31.8, to: 37, topic: 'uplink', shot: 'wide', gesture: true, text: 'Copy the logs, then cut the uplink at the power station — so nobody can report that we have them.' },
  { from: 37.4, to: 43.4, topic: 'security', shot: 'screen', gesture: true, text: 'Careful. Each time their security level rises, more troops arrive: two, then three, then four, then five.' },
  {
    from: 43.8, to: 50.2, topic: 'support', shot: 'close',
    // solo: introduce the AI squadmate; co-op: the friend is the partner
    get text() {
      return useGameStore.getState().buddyActive
        ? `You won't go in alone. ${BUDDY_NAME}, our best rifleman, goes with you. Give orders by radio, or let ${BUDDY_NAME} decide.`
        : "You won't go in alone. Your partner goes in with you. Stay together and watch each other's backs."
    },
  },
  { from: 50.6, to: 55.6, topic: 'extract', shot: 'close', text: 'Then get to the north-west pad. A helicopter will be waiting. Stay low, stay dark. Good luck.' },
]

const TOPIC: Record<Topic, { title: string; lines: string[]; at: [number, number][] }> = {
  logo: { title: 'OPERATION NIGHTFALL', lines: ['Mission briefing — eyes only', 'Operative: WREN · Handler: CANOPY'], at: [] },
  overview: { title: 'HALVARD RIDGE SIGNALS STATION', lines: ['9th Signals Detachment', '19 guards · cameras · two towers', 'Relays coded orders across the border'], at: [[0, -10]] },
  dawn: { title: 'THREAT: ATTACK AT DAWN', lines: ['Coded orders point to a move on the valley', 'Target and timing unknown', 'We need those orders tonight'], at: [[44, -50]] },
  entry: { title: '1 · GET INSIDE THE WIRE', lines: ['A — West ditch (quiet)', 'B — East utility tunnel (quiet)', 'C — Main gate (fast, watched)'], at: [[-62, -8], [66, -16], [0, 44]] },
  compound: { title: '2 · STEAL THE ORDERS', lines: ['Comms terminal — walled compound, NE', 'Keycard — officer, warehouse office', 'Hold to copy the logs (10 s)'], at: [[44, -50], [46, -6]] },
  uplink: { title: '3 · CUT THE UPLINK', lines: ['Transformer — power station, east fence', 'Station goes deaf', 'They cannot report the theft'], at: [[62, -46]] },
  security: { title: 'IF THEY SPOT YOU', lines: ['Level 1 suspicious: +2 troops', 'Level 2 local alert: +3', 'Level 3 alarm: +4 by truck', 'Level 4 lockdown: +5', '19 on site · 33 at most'], at: [[37, 30], [-36, 25], [0, 60], [30, -42]] },
  support: {
    get title() { return useGameStore.getState().buddyActive ? `SUPPORT · ${BUDDY_NAME.toUpperCase()}` : 'SUPPORT · YOUR PARTNER' },
    get lines() {
      return useGameStore.getState().buddyActive
        ? ['AI operator · red uniform', 'Enter: give orders', '"your call": own judgement', 'Protects you first']
        : ['Second operative · red uniform', 'Enter: chat · T: voice', 'Stay together']
    },
    at: [],
  },
  extract: { title: '4 · EXTRACT', lines: ['Helicopter — north-west landing pad', 'Hold the LZ until it lands', 'Stay low · stay dark'], at: [[-48, -54]] },
}

// room layout (metres): EVA by the screen on the back wall, the camera sits at the table
const EVA_AT = new Vector3(-1.45, 0, -1.85)
const SCREEN_AT = new Vector3(0.75, 1.62, -2.94)
const SHOTS: Record<Shot, { from: Vector3; to: Vector3; drift: Vector3; fov: number }> = {
  wide: { from: new Vector3(0.15, 1.28, 2.9), to: new Vector3(-0.35, 1.38, -2), drift: new Vector3(-0.25, 0.02, -0.3), fov: 42 },
  close: { from: new Vector3(-0.75, 1.52, 0.2), to: new Vector3(-1.45, 1.5, -1.85), drift: new Vector3(0.08, 0, -0.18), fov: 34 },
  screen: { from: new Vector3(0.45, 1.42, 0.85), to: new Vector3(0.35, 1.55, -2.9), drift: new Vector3(0.2, 0, -0.15), fov: 46 },
}

const box = (parent: Object3D, size: [number, number, number], pos: [number, number, number], mat: Material, shadow = true) => {
  const m = new Mesh(new BoxGeometry(...size), mat)
  m.position.set(...pos)
  m.castShadow = shadow
  m.receiveShadow = true
  parent.add(m)
  return m
}
const mat = (color: string, roughness = 0.8, metalness = 0.05) => new MeshStandardMaterial({ color, roughness, metalness })

function buildRoom(scene: Scene) {
  const room = new Group()
  const wall = mat('#3b4047', 0.9), trim = mat('#2a2e33', 0.7), carpet = mat('#25282c', 1), wood = mat('#3a2c22', 0.55)
  box(room, [9, 0.1, 7], [0, -0.05, 0], carpet, false)
  box(room, [9, 0.1, 7], [0, 3.05, 0], mat('#2c3036', 0.95), false)
  box(room, [9, 3.1, 0.1], [0, 1.5, -3.05], wall, false)
  box(room, [0.1, 3.1, 7], [-4.5, 1.5, 0], wall, false)
  box(room, [0.1, 3.1, 7], [4.5, 1.5, 0], wall, false)
  box(room, [9, 3.1, 0.1], [0, 1.5, 3.55], wall, false)
  box(room, [9, 0.12, 0.04], [0, 0.06, -2.99], trim, false) // skirting
  // ceiling light panels
  const panel = new MeshBasicMaterial({ color: '#f4efe2' })
  for (const [x, z] of [[-1.6, -1], [1.6, -1], [-1.6, 1.6], [1.6, 1.6]]) box(room, [1.2, 0.03, 0.6], [x, 2.99, z], panel, false)
  // conference table and chairs
  box(room, [3.2, 0.06, 1.3], [0, 0.75, 1.6], wood)
  for (const x of [-1.3, 1.3]) box(room, [0.12, 0.72, 0.9], [x, 0.37, 1.6], trim)
  const chair = mat('#1d1f22', 0.7)
  for (const x of [-1.1, 1.1]) {
    box(room, [0.5, 0.08, 0.5], [x, 0.47, 2.55], chair)
    box(room, [0.5, 0.6, 0.06], [x, 0.8, 2.79], chair)
  }
  // folders and a mug on the table
  box(room, [0.3, 0.02, 0.22], [-0.5, 0.79, 1.4], mat('#7a2a22'))
  box(room, [0.3, 0.02, 0.22], [0.4, 0.79, 1.55], mat('#2c4a6a'))
  const mug = new Mesh(new CylinderGeometry(0.04, 0.035, 0.1, 12), mat('#d8d2c4', 0.5))
  mug.position.set(0.9, 0.83, 1.3)
  room.add(mug)
  // wall screen bezel (the screen itself is added by the briefing), side monitors, shelves, window
  box(room, [3.4, 2, 0.06], [SCREEN_AT.x, SCREEN_AT.y, -3.0], mat('#101114', 0.4, 0.3), false)
  for (const x of [3.1, 3.9]) box(room, [0.6, 0.38, 0.04], [x, 1.7, -2.98], mat('#0e1a14', 0.4), false)
  const shelf = mat('#2f2a24', 0.7)
  for (const y of [0.6, 1.2, 1.8]) box(room, [1.6, 0.04, 0.35], [-3.5, y, -2.8], shelf)
  const binders = ['#6a2a24', '#284a68', '#3a5a34', '#7a6a3a', '#4a3a5a']
  for (let i = 0; i < 12; i++) box(room, [0.07, 0.3, 0.26], [-4.15 + i * 0.11, 0.78 + Math.floor(i / 6) * 0.6, -2.8], mat(binders[i % binders.length]))
  const glass = new MeshBasicMaterial({ color: '#0d1830' })
  box(room, [0.04, 1.3, 2.4], [-4.44, 1.7, 0.8], glass, false)
  for (const z of [0, 0.8, 1.6]) box(room, [0.06, 1.3, 0.05], [-4.42, 1.7, z], trim, false)
  // plant in the corner
  box(room, [0.35, 0.4, 0.35], [3.9, 0.2, -2.5], mat('#5a4a3a'))
  const leaves = new Mesh(new CylinderGeometry(0.05, 0.4, 0.9, 7), mat('#2f4a2a', 0.9))
  leaves.position.set(3.9, 0.85, -2.5)
  room.add(leaves)
  scene.add(room)

  // lighting: soft ceiling fill, a key light on EVA, cool spill from the screen
  scene.add(new HemisphereLight('#c8d0dc', '#2a2622', 0.55))
  for (const x of [-1.6, 1.6]) {
    const p = new PointLight('#ffe9cc', 6, 9, 1.6)
    p.position.set(x, 2.8, 0)
    scene.add(p)
  }
  const key = new SpotLight('#fff1dc', 28, 10, 0.55, 0.6, 1.4)
  key.position.set(0.6, 2.9, 0.6)
  key.target.position.copy(EVA_AT).setY(1.2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key, key.target)
  const spill = new PointLight('#7fc6ff', 3, 4, 2)
  spill.position.set(SCREEN_AT.x, SCREEN_AT.y, -2.4)
  scene.add(spill)
}

/** Stylised station map plus a text panel for the current topic. */
function drawScreen(ctx: CanvasRenderingContext2D, layout: LevelLayout, topic: Topic, t: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height
  ctx.fillStyle = '#06101a'
  ctx.fillRect(0, 0, W, H)
  const info = TOPIC[topic]
  // map: north (−z) up
  const mx = (x: number) => 40 + ((x + 75) / 150) * 560
  const my = (z: number) => 40 + ((z + 75) / 140) * 500
  ctx.fillStyle = '#0b1d2c'
  ctx.fillRect(30, 30, 580, 520)
  ctx.fillStyle = '#1d3346'
  for (const [x1, z1, x2, z2] of layout.roads) ctx.fillRect(mx(x1), my(Math.min(z1, 70)), mx(x2) - mx(x1), my(Math.min(z2, 70)) - my(Math.min(z1, 70)))
  ctx.fillStyle = '#3d6680'
  for (const b of layout.boxes) {
    if (b.collide === false || b.s[1] < 2.2 || Math.abs(b.p[0]) > 80 || b.p[2] < -80 || b.p[2] > 70) continue
    ctx.fillRect(mx(b.p[0] - b.s[0] / 2), my(b.p[2] - b.s[2] / 2), Math.max(1, (b.s[0] / 150) * 560), Math.max(1, (b.s[2] / 140) * 500))
  }
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = '#7fb6d6'
  ctx.lineWidth = 1.5
  ctx.strokeRect(mx(-62), my(-66), mx(66) - mx(-62), my(44) - my(-66))
  if (topic === 'entry') {
    ctx.strokeStyle = '#ffd36b'
    for (const a of NIGHTFALL.approaches ?? []) {
      if (!a.name.match(/^[ABC]/)) continue
      ctx.beginPath()
      a.path?.forEach(([x, z], i) => (i ? ctx.lineTo(mx(x), my(Math.min(z, 70))) : ctx.moveTo(mx(x), my(Math.min(z, 70)))))
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  // pulsing target rings
  const pulse = (t * 1.2) % 1
  info.at.forEach(([x, z], i) => {
    ctx.strokeStyle = i === 0 ? '#ff5a3c' : '#ffd36b'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(mx(x), my(z), 10 + pulse * 22, 0, Math.PI * 2)
    ctx.globalAlpha = 1 - pulse
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = ctx.strokeStyle
    ctx.beginPath()
    ctx.arc(mx(x), my(z), 6, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.fillStyle = '#7fb6d6'
  ctx.font = '14px monospace'
  ctx.fillText('N ▲', 570, 56)
  // text panel
  ctx.fillStyle = '#0e2436'
  ctx.fillRect(640, 30, W - 670, 520)
  ctx.fillStyle = '#ffd36b'
  ctx.font = 'bold 26px monospace'
  const words = info.title.split(' ')
  let line = '', y = 84
  for (const w of words) {
    if ((line + w).length > 20) {
      ctx.fillText(line, 662, y)
      line = ''
      y += 32
    }
    line += w + ' '
  }
  ctx.fillText(line, 662, y)
  ctx.fillStyle = '#cfe6f5'
  ctx.font = '19px monospace'
  info.lines.forEach((l, i) => {
    const parts = l.match(/.{1,30}(\s|$)/g) ?? [l]
    parts.forEach((p, j) => ctx.fillText(p.trim(), 662, y + 56 + i * 64 + j * 24))
  })
  ctx.fillStyle = '#4f7a94'
  ctx.font = '14px monospace'
  ctx.fillText('OPERATION NIGHTFALL · EYES ONLY', 662, 530)
}

/**
 * Re-dresses the stock character as an officer by repainting her texture: trousers and top to olive drab,
 * trainers to black boots, headphones/glasses to a dark comms headset and tactical glasses. Skin and hair stay.
 */
function uniform(m: MeshStandardMaterial) {
  const img = m.map?.image as (HTMLImageElement | ImageBitmap) | undefined
  if (!img) return
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const d = data.data
  const paint = (i: number, r: number, g: number, b: number, shade: number) => {
    d[i] = r * shade
    d[i + 1] = g * shade
    d[i + 2] = b * shade
  }
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max ? (max - min) / max : 0
    let hue = 0
    if (max !== min) hue = max === r ? ((g - b) / (max - min)) * 60 : max === g ? ((b - r) / (max - min) + 2) * 60 : ((r - g) / (max - min) + 4) * 60
    if (hue < 0) hue += 360
    if (hue > 40 && hue < 70 && sat > 0.45 && max > 0.45) paint(i, 92, 98, 66, 0.55 + max * 0.5) // yellow trousers → olive drab
    else if (sat < 0.14 && max > 0.4 && max < 0.86) paint(i, 104, 110, 78, 0.45 + max * 0.6) // grey top → olive shirt
    else if (sat < 0.12 && max >= 0.86) paint(i, 40, 40, 38, 1) // white trainers → black boots
    else if ((hue < 14 || hue > 335) && sat > 0.55 && max > 0.45) paint(i, 46, 48, 50, 0.6 + max * 0.4) // red headphones/lenses → dark headset
    else if (hue > 165 && hue < 205 && sat > 0.3) paint(i, 54, 58, 44, 1) // teal trims → olive
  }
  ctx.putImageData(data, 0, 0)
  const tex = new CanvasTexture(c)
  tex.flipY = m.map!.flipY
  tex.colorSpace = SRGBColorSpace
  m.map = tex
  m.metalness = 0
  m.roughness = 0.85
  m.metalnessMap = null
  m.needsUpdate = true
}

/**
 * Life for a static (unrigged) mesh: the vertex shader bends it by height — the head turns and nods above the neck,
 * the upper body sways and turns from the hips, the chest breathes. Heights are fractions of the mesh's own bounds.
 */
type Statue = { yaw: { value: number }; nod: { value: number }; sway: { value: number }; turn: { value: number }; breath: { value: number } }
function animateStatic(mesh: Mesh): Statue {
  mesh.geometry.computeBoundingBox()
  const bb = mesh.geometry.boundingBox!
  const y = (f: number) => bb.min.y + (bb.max.y - bb.min.y) * f
  const u: Statue = { yaw: { value: 0 }, nod: { value: 0 }, sway: { value: 0 }, turn: { value: 0 }, breath: { value: 0 } }
  const m = mesh.material as MeshStandardMaterial
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uYaw: u.yaw, uNod: u.nod, uSway: u.sway, uTurn: u.turn, uBreath: u.breath })
    const head = `
      uniform float uYaw, uNod, uSway, uTurn, uBreath;
      const float NECK = ${y(0.855).toFixed(4)}, HIP = ${y(0.53).toFixed(4)}, CHEST = ${y(0.72).toFixed(4)}, H = ${(bb.max.y - bb.min.y).toFixed(4)};
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
      mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
      // bends a point (w = 1) or a direction (w = 0) by its rest height y
      vec3 bend(vec3 v, float y, float w) {
        float body = smoothstep(HIP, NECK, y);
        float headW = smoothstep(NECK - 0.02 * H, NECK + 0.035 * H, y);
        float chest = exp(-pow((y - CHEST) / (0.07 * H), 2.));
        vec3 hip = vec3(0., HIP, 0.) * w, neck = vec3(0., NECK, 0.) * w;
        v = mix(v, v * vec3(1. + uBreath * 0.02, 1., 1. + uBreath * 0.035), chest * w);
        v = rotY(uTurn * body) * rotZ(uSway * body) * (v - hip) + hip;
        vec3 n = rotY(uTurn) * rotZ(uSway) * (neck - hip) + hip;
        v = mix(v, rotY(uYaw) * rotX(uNod) * (v - n * w) + n * w, headW);
        return v;
      }
    `
    shader.vertexShader = head + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(bend(objectNormal, position.y, 0.));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = bend(transformed, position.y, 1.);')
  }
  m.needsUpdate = true
  return u
}

const bindPose = new Map<Bone, Quaternion>()
const wq = new Quaternion(), pq = new Quaternion(), rq = new Quaternion()
const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), axis = new Vector3()

/** Rotates a bone about a world-space axis (works under rotated parents). */
function turnWorld(bone: Bone | undefined, worldAxis: Vector3, angle: number) {
  if (!bone) return
  bone.getWorldQuaternion(wq)
  rq.setFromAxisAngle(worldAxis, angle).multiply(wq)
  bone.parent!.getWorldQuaternion(pq).invert()
  bone.quaternion.copy(pq.multiply(rq))
  bone.updateMatrixWorld(true)
}

class BriefingRoom {
  readonly scene = new Scene()
  /** Set by the intro while the briefing is on screen; the render pipeline then draws this scene. */
  active = false
  private eva: Group | null = null
  private bones: Record<string, Bone> = {}
  private screen: { ctx: CanvasRenderingContext2D; tex: CanvasTexture } | null = null
  private layout: LevelLayout | null = null
  private spoken = new Set<number>()
  private redraw = 0
  private gesture = 0

  constructor() {
    this.scene.background = new Color('#0b0d10')
    buildRoom(this.scene)
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 576
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    const s = new Mesh(new PlaneGeometry(3.2, 1.8), new MeshBasicMaterial({ map: tex, toneMapped: false }))
    s.position.copy(SCREEN_AT).setZ(-2.965)
    this.scene.add(s)
    this.screen = { ctx: canvas.getContext('2d')!, tex }
  }

  /** Loads EVA once (cached by the browser after the first time). */
  /** True once the local military-officer model is in use (shows its CC BY credit). */
  custom = false
  /** Shader-driven motion when the model has no skeleton. */
  private statue: Statue | null = null

  load() {
    if (this.eva) return
    this.eva = new Group()
    this.scene.add(this.eva)
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder) // eva.glb is meshopt-compressed (models-src/ has the original)
    loader.loadAsync(LOCAL_EVA_URL)
      .then((gltf) => this.place(gltf.scene, true))
      .catch(() => loader.loadAsync(EVA_URL).then((gltf) => this.place(gltf.scene, false)))
      .catch(() => console.warn('Briefing: EVA model could not be loaded'))
  }

  private place(model: Object3D, custom: boolean) {
    this.custom = custom
    model.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true
        o.frustumCulled = false
        if (!custom) uniform((o as Mesh).material as MeshStandardMaterial) // stock character: repaint as a uniform
      }
      if ((o as Bone).isBone) {
        const key = canonical(o.name)
        if (key && !this.bones[key]) this.bones[key] = o as Bone
        bindPose.set(o as Bone, o.quaternion.clone())
      }
    })
    if (!this.bones.Head) {
      let mesh: Mesh | null = null
      model.traverse((o) => { if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh })
      if (mesh) this.statue = animateStatic(mesh)
    }
    // normalise to a 1.7 m woman standing on the floor
    model.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(model)
    const h = bounds.max.y - bounds.min.y
    if (h > 0) {
      model.scale.multiplyScalar(1.7 / h)
      model.updateMatrixWorld(true)
      model.position.y -= new Box3().setFromObject(model).min.y
    }
    this.eva!.add(model)
    this.eva!.position.copy(EVA_AT)
    this.eva!.rotation.y = 0.35
  }

  start(layout: LevelLayout) {
    this.layout = layout
    this.spoken.clear()
    this.load()
  }

  stop() {
    this.active = false
    hush()
  }

  /** Advances the briefing to `t` seconds: camera shot, screen, EVA's pose and her lines. */
  update(t: number, camera: PerspectiveCamera) {
    this.active = true
    const i = Math.max(0, EVA_LINES.findIndex((l) => t < l.to))
    const line = EVA_LINES[i]
    // speak each line once when it starts
    if (t >= line.from && !this.spoken.has(i)) {
      this.spoken.add(i)
      say(line.text, 'eva', { interrupt: true })
    }

    // camera: the line's shot with a slow push-in
    const shot = SHOTS[line.shot]
    const k = Math.min(1, Math.max(0, (t - line.from + 0.4) / (line.to - line.from + 0.4)))
    camera.position.copy(shot.from).addScaledVector(shot.drift, k)
    camera.lookAt(shot.to)
    camera.fov = shot.fov
    camera.updateProjectionMatrix()

    if (this.screen && this.layout && (this.redraw -= 1) <= 0) {
      this.redraw = 3
      drawScreen(this.screen.ctx, this.layout, t < line.from ? EVA_LINES[Math.max(0, i - 1)].topic : line.topic, t)
      this.screen.tex.needsUpdate = true
    }
    this.pose(t, t >= line.from && t <= line.to, !!line.gesture && t > line.from + 0.6 && t < line.to - 0.8, camera.position)
  }

  /** Story film: EVA at her screen decoding the intercept — talking and gesturing, no lines; the caller places the camera. */
  showcase(t: number, camera: PerspectiveCamera) {
    this.active = true
    if (this.screen && this.layout && (this.redraw -= 1) <= 0) {
      this.redraw = 3
      drawScreen(this.screen.ctx, this.layout, 'dawn', t)
      this.screen.tex.needsUpdate = true
    }
    this.pose(t, true, t % 5 > 2, camera.position)
  }

  /** Procedural pose from the bind (T) pose: arms relaxed, a point at the screen, head on the listener, talking nods. */
  private pose(t: number, talking: boolean, gesturing: boolean, listener: Vector3) {
    const b = this.bones
    if (!this.eva) return
    this.gesture += ((gesturing ? 1 : 0) - this.gesture) * 0.06
    const g = this.gesture * this.gesture * (3 - 2 * this.gesture)
    if (this.statue) {
      // no skeleton: look at the listener (or glance at the screen), nod while talking, sway and breathe
      const st = this.statue
      const root = this.eva
      const target = v2.copy(listener).lerp(SCREEN_AT, g * 0.7)
      const want = Math.atan2(target.x - root.position.x, target.z - root.position.z) - root.rotation.y
      st.turn.value = g * 0.22
      st.yaw.value += (Math.max(-0.6, Math.min(0.6, want - st.turn.value)) * 0.85 - st.yaw.value) * 0.08
      st.nod.value = 0.05 + (talking ? Math.sin(t * 6.3) * 0.045 + Math.sin(t * 2.1) * 0.035 : Math.sin(t * 0.9) * 0.01)
      st.sway.value = Math.sin(t * 0.7) * 0.018
      st.breath.value = Math.sin(t * 1.6)
      return
    }
    if (!b.Head) return
    for (const [bone, q] of bindPose) bone.quaternion.copy(q)
    const root = this.eva
    root.updateMatrixWorld(true)
    const up = v3.set(0, 1, 0)
    // weight shift and breathing
    turnWorld(b.Hips, axis.set(0, 0, 1).applyQuaternion(root.quaternion), Math.sin(t * 0.7) * 0.02)
    turnWorld(b.Spine1, axis.set(1, 0, 0).applyQuaternion(root.quaternion), Math.sin(t * 1.6) * 0.012)
    // turn the shoulders a little towards the screen when pointing at it
    turnWorld(b.Spine2, up, g * 0.25)
    const local = (x: number, y: number, z: number) => v2.set(x, y, z).applyQuaternion(root.quaternion)
    for (const side of [1, -1] as const) {
      const arm = side === 1 ? b.LeftArm : b.RightArm
      const fore = side === 1 ? b.LeftForeArm : b.RightForeArm
      const hand = side === 1 ? b.LeftHand : b.RightHand
      if (!arm || !fore) continue
      arm.getWorldPosition(v1)
      const rest = v1.clone().add(local(side * 0.16, -1, 0.1))
      // her left hand points at the map on the screen behind her
      const point = side === 1 && g > 0.01
      const aim = SCREEN_AT.clone().add(v2.set(-0.6 + Math.sin(t * 0.8) * 0.3, -0.1, 0))
      pointBone(arm, point ? rest.lerp(v1.clone().lerp(aim, 0.4).add(v2.set(0, -0.15, 0)), g) : rest, 1)
      fore.getWorldPosition(v1)
      const relaxed = v1.clone().add(local(-side * 0.12, -0.5, 0.55))
      pointBone(fore, point ? relaxed.lerp(aim, g) : relaxed.add(local(0, Math.sin(t * 3.1 + side) * (talking ? 0.08 : 0), 0)), 1)
      if (hand) turnWorld(hand, axis.set(1, 0, 0).applyQuaternion(root.quaternion), 0.2)
    }
    // head: towards the listener (or the screen while pointing), small nods while she talks
    if (b.Head) {
      b.Head.getWorldPosition(v1)
      const target = v2.copy(listener).lerp(SCREEN_AT, g * 0.6)
      const want = Math.atan2(target.x - v1.x, target.z - v1.z) - root.rotation.y
      turnWorld(b.Head, up, Math.max(-0.7, Math.min(0.7, want)) * 0.8)
      const right = axis.set(1, 0, 0).applyQuaternion(root.quaternion)
      turnWorld(b.Head, right, -0.06 + (talking ? Math.sin(t * 6.3) * 0.045 + Math.sin(t * 2.1) * 0.03 : 0))
    }
  }
}

export const briefingRoom = new BriefingRoom()
