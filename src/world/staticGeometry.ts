import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Euler, Matrix4, Quaternion, TubeGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MATERIALS, tint } from '../assets/materials'
import type { BoxDef, CableDef, MaterialKey } from './types'

/** Chunk size for merged static meshes — small enough that frustum culling drops most of the level. */
const CHUNK = 48

export interface StaticChunk {
  mat: MaterialKey
  geometry: BufferGeometry
  castShadow: boolean
}

const m = new Matrix4()
const q = new Quaternion()
const e = new Euler()
const v = new Vector3()
const ONE = new Vector3(1, 1, 1)

/** Deterministic per-box hash so tints/UV offsets don't change between reloads. */
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/** Box geometry with UVs in world metres (divided by the material's tile scale) so textures never stretch. */
function boxGeometry(b: BoxDef, scale: number) {
  const [w, h, d] = b.s
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv as BufferAttribute
  const off = hash(b.p[0], b.p[1], b.p[2]) * 7
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale + off, (uv.getY(i) * dims[f][1]) / scale + off * 0.37)
    }
  }
  return g
}

function cylGeometry(b: BoxDef, scale: number) {
  const r = b.s[0] / 2
  const g = new CylinderGeometry(r, r, b.s[1], Math.max(10, Math.min(24, Math.round(r * 40))))
  const uv = g.attributes.uv as BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / scale, (uv.getY(i) * b.s[1]) / scale)
  return g
}

function colorize(g: BufferGeometry, c: Color) {
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(arr, 3))
  return g
}

export function boxMatrix(b: BoxDef, out = m) {
  return out.compose(v.set(...b.p), q.setFromEuler(e.set(b.rx ?? 0, b.yaw ?? 0, b.rz ?? 0, 'YXZ')), ONE)
}

/** Catenary-ish sagging cable as a thin tube. */
function cableGeometry(c: CableDef) {
  const a = new Vector3(...c.from), b = new Vector3(...c.to)
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    return a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * c.sag)
  })
  return new TubeGeometry(new CatmullRomCurve3(pts), 12, 0.012, 4, false)
}

/** Merges level boxes (and cables) into a handful of chunked meshes per material. */
export function buildStaticChunks(boxes: BoxDef[], cables: CableDef[]): StaticChunk[] {
  const groups = new Map<string, { mat: MaterialKey; shadow: boolean; parts: BufferGeometry[] }>()
  const add = (mat: MaterialKey, shadow: boolean, x: number, z: number, g: BufferGeometry) => {
    const key = `${mat}|${shadow}|${Math.floor(x / CHUNK)}|${Math.floor(z / CHUNK)}`
    let grp = groups.get(key)
    if (!grp) groups.set(key, (grp = { mat, shadow, parts: [] }))
    grp.parts.push(g)
  }

  for (const b of boxes) {
    if (b.mat === 'invisible' || b.hidden) continue
    const spec = MATERIALS[b.mat]
    const g = b.shape === 'cyl' ? cylGeometry(b, spec.scale) : boxGeometry(b, spec.scale)
    g.applyMatrix4(boxMatrix(b))
    const jitter = b.mat === 'crate' || b.mat === 'rock' || b.mat === 'sandbag' ? 0.1 : 0.04
    colorize(g, tint(b.color ?? spec.color, jitter, hash(b.p[2], b.p[0], b.p[1])))
    const shadow = b.castShadow ?? !(b.mat === 'asphalt' || b.mat === 'glass')
    add(b.mat, shadow, b.p[0], b.p[2], g.index ? g.toNonIndexed() : g)
  }
  for (const c of cables) {
    const g = colorize(cableGeometry(c), new Color(0x161616))
    add('rubber', false, c.from[0], c.from[2], g.toNonIndexed())
  }

  const chunks: StaticChunk[] = []
  for (const grp of groups.values()) {
    const merged = mergeGeometries(grp.parts.map(stripTo3), false)
    grp.parts.forEach((p) => p.dispose())
    if (!merged) continue
    merged.computeBoundingSphere()
    chunks.push({ mat: grp.mat, geometry: merged, castShadow: grp.shadow })
  }
  return chunks
}

/** mergeGeometries needs identical attribute sets. */
function stripTo3(g: BufferGeometry) {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name)
  return g
}
