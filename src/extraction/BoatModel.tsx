import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute, TubeGeometry, Vector3, type MeshStandardMaterial } from 'three'

/**
 * River boats, bow towards -Z. The group origin is deck height (like `heliPos`); the waterline is 0.35 below it.
 * Ours is a rigid-hulled inflatable: deep-V hull, grey sponson tubes round the gunwale, centre console, twin
 * outboards and a stern gun. The Varn patrol boat is a longer steel hull with a wheelhouse, a shielded bow gun,
 * a mast and the Directorate's red stripe.
 */

const WATERLINE = -0.35

/**
 * Deep-V planing hull from cross-sections: keel, chines and gunwales, fine at the bow and full aft, the keel
 * sweeping up into the stem and the sheer rising towards the bow. Includes the transom and the deck.
 */
export function hullGeometry(length: number, beam: number, depth: number, freeboard: number) {
  const N = 16
  const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
  const sections: { z: number; w: number; keel: number; chine: number; gun: number }[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N // 0 bow … 1 stern
    const z = -length / 2 + t * length
    const w = (beam / 2) * Math.sqrt(Math.sin(Math.min(1, t * 1.7 + 0.02) * Math.PI / 2))
    const keel = WATERLINE - depth + depth * 0.85 * (1 - smooth(t / 0.4))
    const gun = freeboard + 0.28 * (1 - t) ** 2
    sections.push({ z, w, keel, chine: keel + (WATERLINE + 0.05 - keel) * 0.75, gun })
  }
  // each section: gunwale L, chine L, keel, chine R, gunwale R
  const ring = (s: (typeof sections)[0]) => [[-s.w, s.gun], [-s.w * 0.86, s.chine], [0, s.keel], [s.w * 0.86, s.chine], [s.w, s.gun]]
  const pos: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c)
  for (let i = 0; i < N; i++) {
    const a = ring(sections[i]), b = ring(sections[i + 1])
    const za = sections[i].z, zb = sections[i + 1].z
    for (let k = 0; k < 4; k++) {
      const p0 = [a[k][0], a[k][1], za], p1 = [a[k + 1][0], a[k + 1][1], za]
      const q0 = [b[k][0], b[k][1], zb], q1 = [b[k + 1][0], b[k + 1][1], zb]
      tri(p0, q0, p1)
      tri(p1, q0, q1)
    }
    // deck, a little below the gunwale
    const dy = (s: (typeof sections)[0]) => s.gun - 0.22
    const s0 = sections[i], s1 = sections[i + 1]
    tri([-s0.w * 0.94, dy(s0), za], [s0.w * 0.94, dy(s0), za], [-s1.w * 0.94, dy(s1), zb])
    tri([s0.w * 0.94, dy(s0), za], [s1.w * 0.94, dy(s1), zb], [-s1.w * 0.94, dy(s1), zb])
  }
  // transom
  const t = ring(sections[N]), zt = sections[N].z
  for (let k = 0; k < 4; k++) tri([0, (t[0][1] + t[2][1]) / 2, zt], [t[k][0], t[k][1], zt], [t[k + 1][0], t[k + 1][1], zt])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return { geometry: g, gunwale: sections.map((s) => [s.w, s.gun, s.z] as const) }
}

/** Sponson tube following the gunwale from the stern on one side, round the bow, back to the stern on the other. */
export function sponsonGeometry(gunwale: readonly (readonly [number, number, number])[], radius: number) {
  const left = gunwale.map(([w, y, z]) => new Vector3(-w - radius * 0.4, y + 0.02, z))
  const right = gunwale.map(([w, y, z]) => new Vector3(w + radius * 0.4, y + 0.02, z))
  const pts = [...left.reverse().filter((_, i) => i % 2 === 0), ...right.filter((_, i) => i % 2 === 0)]
  pts.push(right[right.length - 1].clone().setZ(right[right.length - 1].z + 0.35))
  pts.unshift(left[0].clone().setZ(left[0].z + 0.35))
  return new TubeGeometry(new CatmullRomCurve3(pts, false, 'centripetal'), 64, radius, 12, false)
}

function Outboard({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.35, 0.25]} castShadow><boxGeometry args={[0.5, 0.65, 0.6]} /><meshStandardMaterial color={color} roughness={0.35} metalness={0.3} /></mesh>
      <mesh position={[0, 0.7, 0.25]}><boxGeometry args={[0.46, 0.08, 0.56]} /><meshStandardMaterial color="#111" roughness={0.6} /></mesh>
      <mesh position={[0, -0.25, 0.3]}><boxGeometry args={[0.16, 0.7, 0.3]} /><meshStandardMaterial color="#222" roughness={0.5} metalness={0.4} /></mesh>
      <mesh position={[0, -0.55, 0.3]}><boxGeometry args={[0.3, 0.06, 0.38]} /><meshStandardMaterial color="#222" /></mesh>
    </group>
  )
}

const Light = ({ p, c }: { p: [number, number, number]; c: string }) => (
  <mesh position={p}><sphereGeometry args={[0.05, 8, 6]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={3} /></mesh>
)

export function BoatModel({ enemy = false, hit }: { enemy?: boolean; hit?: () => boolean }) {
  const hullMat = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (hullMat.current) hullMat.current.emissiveIntensity = hit?.() ? 0.8 : 0
  })
  return enemy ? <PatrolBoat hullMat={hullMat} /> : <Rhib hullMat={hullMat} />
}

type HullRef = React.RefObject<MeshStandardMaterial | null>

/** Our boat: 7 m rigid-hulled inflatable. */
function Rhib({ hullMat }: { hullMat: HullRef }) {
  const { hull, tube } = useMemo(() => {
    const h = hullGeometry(7, 2.3, 0.55, 0.05)
    return { hull: h.geometry, tube: sponsonGeometry(h.gunwale, 0.26) }
  }, [])
  const dark = <meshStandardMaterial color="#1c1e1d" roughness={0.75} />
  return (
    <group>
      <mesh geometry={hull} castShadow receiveShadow>
        <meshStandardMaterial ref={hullMat} color="#2c3530" roughness={0.45} metalness={0.15} side={DoubleSide} emissive="#ff7a40" emissiveIntensity={0} />
      </mesh>
      <mesh geometry={tube} castShadow><meshStandardMaterial color="#3d423f" roughness={0.85} /></mesh>
      {/* rubbing strake and lifelines on the tubes */}
      {[-1, 1].map((k) => <mesh key={k} position={[k * 1.32, 0.22, 0.6]}><boxGeometry args={[0.02, 0.02, 4.2]} />{dark}</mesh>)}
      {/* centre console: body, windscreen, grab rail, wheel, throttle */}
      <mesh position={[0, 0.25, -0.2]} castShadow><boxGeometry args={[0.85, 0.75, 0.9]} /><meshStandardMaterial color="#323a35" roughness={0.6} /></mesh>
      <mesh position={[0, 0.82, -0.62]} rotation-x={-0.5}><boxGeometry args={[0.9, 0.42, 0.02]} /><meshStandardMaterial color="#1b2a33" roughness={0.05} metalness={0.6} transparent opacity={0.7} /></mesh>
      <mesh position={[0, 0.98, -0.2]}><torusGeometry args={[0.45, 0.02, 6, 16, Math.PI]} /><meshStandardMaterial color="#888" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[-0.15, 0.68, 0.2]} rotation-x={-0.7}><torusGeometry args={[0.16, 0.02, 6, 18]} />{dark}</mesh>
      {/* jockey seat behind the console */}
      <mesh position={[0, 0.28, 0.75]} castShadow><boxGeometry args={[0.55, 0.55, 0.6]} />{dark}</mesh>
      <mesh position={[0, 0.62, 0.75]}><boxGeometry args={[0.6, 0.14, 0.65]} /><meshStandardMaterial color="#2a2a26" roughness={0.9} /></mesh>
      {/* A-frame arch with antenna and the white stern light */}
      {[-1, 1].map((k) => <mesh key={k} position={[k * 0.75, 0.75, 2.0]} rotation-z={k * 0.12}><cylinderGeometry args={[0.035, 0.035, 1.5, 8]} /><meshStandardMaterial color="#777" metalness={0.8} roughness={0.3} /></mesh>)}
      <mesh position={[0, 1.48, 2.0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.035, 0.035, 1.6, 8]} /><meshStandardMaterial color="#777" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[0.6, 2.1, 2.0]}><cylinderGeometry args={[0.012, 0.012, 1.3, 4]} />{dark}</mesh>
      <Light p={[0, 1.56, 2.0]} c="#ffffff" />
      <Light p={[-0.95, 0.35, -2.9]} c="#ff2a1a" />
      <Light p={[0.95, 0.35, -2.9]} c="#20ff60" />
      {/* stern gun on a pintle, facing aft */}
      <group position={[0, 0.35, 2.55]}>
        <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.05, 0.07, 0.8, 8]} />{dark}</mesh>
        <mesh position={[0, 0.85, 0.05]}><boxGeometry args={[0.18, 0.2, 0.55]} />{dark}</mesh>
        <mesh position={[0, 0.88, 0.75]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.03, 0.035, 0.95, 8]} />{dark}</mesh>
        <mesh position={[0, 0.78, 0.15]}><boxGeometry args={[0.1, 0.18, 0.12]} /><meshStandardMaterial color="#3a3d30" /></mesh>
      </group>
      {/* twin outboards on the transom */}
      <Outboard x={-0.45} z={3.45} color="#2b2d2c" />
      <Outboard x={0.45} z={3.45} color="#2b2d2c" />
      {/* jerry cans and a dry bag forward */}
      <mesh position={[-0.5, 0.05, -1.5]}><boxGeometry args={[0.35, 0.3, 0.2]} /><meshStandardMaterial color="#4a5a2e" /></mesh>
      <mesh position={[0.45, 0.05, -1.4]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.16, 0.16, 0.5, 10]} /><meshStandardMaterial color="#5a4a2a" roughness={0.9} /></mesh>
    </group>
  )
}

/** Varn patrol boat: 9 m steel hull, wheelhouse, shielded bow gun, mast and searchlight. */
function PatrolBoat({ hullMat }: { hullMat: HullRef }) {
  const hull = useMemo(() => hullGeometry(9, 2.7, 0.75, 0.35).geometry, [])
  const grey = <meshStandardMaterial color="#4a5054" roughness={0.55} metalness={0.35} />
  const dark = <meshStandardMaterial color="#1c1e20" roughness={0.6} />
  const red = <meshStandardMaterial color="#a8322a" roughness={0.6} />
  return (
    <group>
      <mesh geometry={hull} castShadow receiveShadow>
        <meshStandardMaterial ref={hullMat} color="#3a3f43" roughness={0.5} metalness={0.4} side={DoubleSide} emissive="#ff7a40" emissiveIntensity={0} />
      </mesh>
      {/* boot-top stripe at the waterline and the Directorate red band */}
      {[-1, 1].map((k) => (
        <group key={k}>
          <mesh position={[k * 1.3, -0.25, 0.6]}><boxGeometry args={[0.02, 0.1, 6.2]} /><meshStandardMaterial color="#18191a" /></mesh>
          <mesh position={[k * 1.33, 0.32, -0.4]}><boxGeometry args={[0.02, 0.16, 3.4]} />{red}</mesh>
        </group>
      ))}
      {/* wheelhouse: cabin, roof, windows all round */}
      <mesh position={[0, 0.85, 0.6]} castShadow><boxGeometry args={[1.8, 1.4, 2.4]} />{grey}</mesh>
      <mesh position={[0, 1.6, 0.55]} castShadow><boxGeometry args={[2.0, 0.1, 2.7]} />{grey}</mesh>
      <mesh position={[0, 1.15, -0.62]}><boxGeometry args={[1.6, 0.45, 0.02]} /><meshStandardMaterial color="#14202a" roughness={0.05} metalness={0.7} /></mesh>
      {[-1, 1].map((k) => <mesh key={k} position={[k * 0.91, 1.15, 0.6]}><boxGeometry args={[0.02, 0.4, 1.8]} /><meshStandardMaterial color="#14202a" roughness={0.05} metalness={0.7} /></mesh>)}
      {/* mast, radar bar, searchlight, flag */}
      <mesh position={[0, 2.5, 1.0]}><cylinderGeometry args={[0.05, 0.06, 1.8, 8]} />{dark}</mesh>
      <mesh position={[0, 2.9, 1.0]}><boxGeometry args={[1.0, 0.08, 0.12]} />{dark}</mesh>
      <mesh position={[0, 1.8, -0.3]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.16, 0.12, 0.28, 12]} /><meshStandardMaterial color="#d8d4c0" emissive="#fff3c0" emissiveIntensity={1.5} /></mesh>
      <mesh position={[0.25, 3.15, 1.0]}><planeGeometry args={[0.5, 0.32]} /><meshStandardMaterial color="#a8322a" side={DoubleSide} /></mesh>
      <Light p={[-1.1, 0.75, -0.8]} c="#ff2a1a" />
      <Light p={[1.1, 0.75, -0.8]} c="#20ff60" />
      {/* bow gun with a shield */}
      <group position={[0, 0.25, -2.4]}>
        <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.18, 0.24, 0.6, 12]} />{dark}</mesh>
        <mesh position={[0, 0.75, -0.25]}><boxGeometry args={[0.9, 0.6, 0.05]} />{grey}</mesh>
        <mesh position={[0, 0.72, -0.75]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.04, 0.045, 1.1, 8]} />{dark}</mesh>
        <mesh position={[0, 0.72, -0.1]}><boxGeometry args={[0.22, 0.24, 0.5]} />{dark}</mesh>
      </group>
      {/* stern: rails, liferings, twin outboards */}
      {[-1, 1].map((k) => <mesh key={k} position={[k * 1.25, 0.6, 3.0]}><cylinderGeometry args={[0.025, 0.025, 2.2, 6]} /><meshStandardMaterial color="#888" metalness={0.8} /></mesh>)}
      {[-1, 1].map((k) => <mesh key={k} position={[k * 0.95, 1.0, 1.8]} rotation-y={Math.PI / 2}><torusGeometry args={[0.22, 0.06, 8, 16]} /><meshStandardMaterial color="#d8662a" /></mesh>)}
      <Outboard x={-0.55} z={4.55} color="#262829" />
      <Outboard x={0.55} z={4.55} color="#262829" />
    </group>
  )
}

/**
 * How a boat sits on the water: bow lifting as it gets onto the plane, leaning into turns, and riding the chop.
 * Call every frame with the boat's yaw; returns [pitch, roll] for rotation.set(pitch, yaw, roll, 'YXZ').
 */
export function useBoatMotion() {
  const st = useRef({ yaw: 0, pos: new Vector3(), speed: 0, turn: 0, t: Math.random() * 10, init: false })
  return (pos: Vector3, yaw: number, dt: number, sinking = false) => {
    const s = st.current
    if (!s.init) Object.assign(s, { yaw, init: true }), s.pos.copy(pos)
    const step = Math.max(dt, 1e-3)
    const d = ((yaw - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    s.turn += (d / step - s.turn) * Math.min(1, dt * 3)
    s.speed += (s.pos.distanceTo(pos) / step - s.speed) * Math.min(1, dt * 2)
    s.yaw = yaw
    s.pos.copy(pos)
    s.t += dt
    if (sinking) return [-0.25, 0.4] as const
    const pitch = Math.min(0.11, s.speed * 0.012) + Math.sin(s.t * 1.7) * 0.018 + Math.sin(s.t * 3.1) * 0.006 * Math.min(1, s.speed / 4)
    const roll = Math.max(-0.16, Math.min(0.16, s.turn * 0.35)) + Math.sin(s.t * 1.3) * 0.022
    return [pitch, roll] as const
  }
}
