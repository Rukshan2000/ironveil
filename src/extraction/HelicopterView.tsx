import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, DoubleSide, Group, MeshBasicMaterial, Quaternion, Vector3, type Material, type Vector3Tuple } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { litMaterial } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { GameSession } from '../game/GameSession'
import { BoatModel } from './BoatModel'

/** Extraction helicopter (or boat) driven by the ExtractionSystem's flight path and then the escape. */
export function HelicopterView({ session }: { session: GameSession }) {
  const root = useRef<Group>(null)
  useFrame(() => {
    const x = session.extraction
    const g = root.current!
    g.visible = x.available || session.mission.state === 'SUCCESS'
    if (!g.visible) return
    g.position.copy(x.heliPos)
    g.rotation.set(0, x.heliYaw, 0)
  })
  return <group ref={root} visible={false}>{session.def.ride === 'boat' ? <BoatModel /> : <HeliModel />}</group>
}

const UP = new Vector3(0, 1, 0)
/** A cylinder strut from a to b (skid legs, cross tubes). */
function Tube({ a, b, r, material }: { a: Vector3Tuple; b: Vector3Tuple; r: number; material: Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new Vector3(...a), vb = new Vector3(...b)
    const dir = vb.clone().sub(va)
    return { pos: va.add(vb).multiplyScalar(0.5), quat: new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), len: dir.length() }
  }, [a, b])
  return <mesh material={material} position={pos} quaternion={quat} castShadow><cylinderGeometry args={[r, r, len, 8]} /></mesh>
}

let heliAssets: ReturnType<typeof makeHeliAssets> | null = null
function makeHeliAssets() {
  const paint = getTextures('paintedMetal')
  return {
    body: litMaterial({ color: '#3b4232', map: paint.map, roughnessMap: paint.roughnessMap, roughness: 0.55, metalness: 0.35 }),
    dark: litMaterial({ color: '#161814', roughness: 0.8 }),
    metal: litMaterial({ color: '#3a3d3f', roughness: 0.4, metalness: 0.75 }),
    glass: litMaterial({ color: '#1c2428', roughness: 0.05, metalness: 0.9 }),
    red: litMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 3 }),
    green: litMaterial({ color: '#20ff60', emissive: '#20ff60', emissiveIntensity: 3 }),
    white: litMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 3 }),
    strobe: litMaterial({ color: '#ff2a1a', emissive: '#ff2a1a', emissiveIntensity: 0 }),
    disc: new MeshBasicMaterial({ color: '#101210', transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide }),
    cabin: new RoundedBoxGeometry(2.1, 1.9, 4.4, 4, 0.4),
    engine: new RoundedBoxGeometry(1.3, 0.6, 3.0, 3, 0.2),
    blade: new BoxGeometry(7.2, 0.05, 0.5).translate(3.75, 0, 0),
  }
}

/** Utility helo (skids, 4-blade main rotor, tail boom with fin and tail rotor). Nose faces -Z, skids on y = 0. */
export function HeliModel() {
  const rotor = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const m = (heliAssets ??= makeHeliAssets())
  const time = useRef(0)

  useFrame((_, dt) => {
    rotor.current!.rotation.y += dt * 28
    tail.current!.rotation.x += dt * 45
    time.current += dt
    m.strobe.emissiveIntensity = time.current % 1.2 < 0.08 ? 8 : 0
  })

  return (
    <group>
      {/* fuselage: cabin, nose, canopy, windows */}
      <mesh material={m.body} geometry={m.cabin} position={[0, 1.6, 0.2]} castShadow />
      <mesh material={m.body} position={[0, 1.35, -2.0]} scale={[1, 0.85, 1.6]} castShadow><sphereGeometry args={[1, 20, 14]} /></mesh>
      <mesh material={m.glass} position={[0, 1.62, -1.95]} scale={[1.02, 0.9, 1.4]}><sphereGeometry args={[1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} /></mesh>
      {[-1, 1].map((x) => (
        <group key={x}>
          <mesh material={m.glass} position={[x * 1.06, 1.85, -0.2]}><boxGeometry args={[0.02, 0.6, 1.0]} /></mesh>
          <mesh material={m.glass} position={[x * 1.06, 1.85, 1.05]}><boxGeometry args={[0.02, 0.55, 0.8]} /></mesh>
          {/* sliding door seams + rail */}
          <mesh material={m.dark} position={[x * 1.055, 1.5, -0.8]}><boxGeometry args={[0.02, 1.5, 0.03]} /></mesh>
          <mesh material={m.dark} position={[x * 1.055, 1.5, 1.6]}><boxGeometry args={[0.02, 1.5, 0.03]} /></mesh>
          <mesh material={m.metal} position={[x * 1.07, 2.35, 0.6]}><boxGeometry args={[0.04, 0.05, 3.4]} /></mesh>
          {/* exhausts angled back and out */}
          <mesh material={m.metal} position={[x * 0.62, 2.85, 1.85]} rotation={[Math.PI / 2 + 0.2, 0, x * 0.5]}><cylinderGeometry args={[0.15, 0.17, 0.6, 12]} /></mesh>
          {/* skids: rail, upturned toe, two legs */}
          <mesh material={m.metal} position={[x * 1.15, 0.06, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.055, 0.055, 4.2, 8]} /></mesh>
          <Tube a={[x * 1.15, 0.06, -1.9]} b={[x * 1.15, 0.4, -2.35]} r={0.055} material={m.metal} />
          <Tube a={[x * 1.15, 0.06, -1.1]} b={[x * 0.8, 0.75, -1.0]} r={0.06} material={m.metal} />
          <Tube a={[x * 1.15, 0.06, 1.4]} b={[x * 0.8, 0.75, 1.3]} r={0.06} material={m.metal} />
          {/* stub nav lights: red port (left), green starboard */}
          <mesh material={x < 0 ? m.red : m.green} position={[x * 1.08, 2.3, -1.3]}><sphereGeometry args={[0.06, 8, 6]} /></mesh>
        </group>
      ))}

      {/* engine deck, intakes, mast */}
      <mesh material={m.body} geometry={m.engine} position={[0, 2.75, 0.5]} castShadow />
      {[-0.4, 0.4].map((x) => <mesh key={x} material={m.dark} position={[x, 2.78, -1.0]}><boxGeometry args={[0.4, 0.35, 0.05]} /></mesh>)}
      <mesh material={m.metal} position={[0, 3.25, 0]}><cylinderGeometry args={[0.12, 0.14, 0.5, 10]} /></mesh>
      <mesh material={m.strobe} position={[0, 3.08, 1.7]}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
      <mesh material={m.strobe} position={[0, 0.62, 0.6]}><sphereGeometry args={[0.07, 8, 6]} /></mesh>
      {[0.3, 0.9].map((z) => <mesh key={z} material={m.dark} position={[0.3, 2.75, z + 1.3]} rotation={[-0.4, 0, 0]}><cylinderGeometry args={[0.01, 0.01, 0.5, 4]} /></mesh>)}

      {/* main rotor: hub + 4 blades, plus a faint disc that reads as motion blur */}
      <group ref={rotor} position={[0, 3.5, 0]}>
        <mesh material={m.metal}><cylinderGeometry args={[0.3, 0.3, 0.2, 12]} /></mesh>
        {[0, 1, 2, 3].map((i) => <mesh key={i} material={m.dark} geometry={m.blade} rotation={[0, (i * Math.PI) / 2, 0.02]} castShadow />)}
      </group>
      <mesh material={m.disc} position={[0, 3.5, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[7.4, 48]} /></mesh>

      {/* tail boom, fin, stabiliser, tail rotor */}
      <mesh material={m.body} position={[0, 2.15, 5.4]} rotation={[1.53, 0, 0]} castShadow><cylinderGeometry args={[0.22, 0.5, 6.4, 14]} /></mesh>
      <mesh material={m.body} position={[0, 3.0, 8.5]} rotation={[0.35, 0, 0]} castShadow><boxGeometry args={[0.12, 1.8, 1.0]} /></mesh>
      <mesh material={m.body} position={[0, 2.3, 7.9]} castShadow><boxGeometry args={[2.4, 0.06, 0.6]} /></mesh>
      <mesh material={m.white} position={[0, 2.35, 8.95]}><sphereGeometry args={[0.06, 8, 6]} /></mesh>
      <group ref={tail} position={[0.2, 3.3, 8.75]}>
        <mesh material={m.metal} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 0.15, 8]} /></mesh>
        <mesh material={m.dark}><boxGeometry args={[0.04, 2.4, 0.18]} /></mesh>
        <mesh material={m.dark} rotation={[Math.PI / 2, 0, 0]}><boxGeometry args={[0.04, 2.4, 0.18]} /></mesh>
      </group>
    </group>
  )
}
