import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { MeshStandardMaterial } from 'three'

/**
 * River boat (bow towards -Z, waterline at y = -0.35 so the group sits at deck height like `heliPos`): ours is a dark
 * green rigid-hull with a stern gun; the Varn patrol boats are grey with the Directorate's red stripe and a bow gun.
 * `hit` returns true while the hull should flash.
 */
export function BoatModel({ enemy = false, hit }: { enemy?: boolean; hit?: () => boolean }) {
  const hull = useRef<MeshStandardMaterial>(null)
  useFrame(() => {
    if (hull.current) hull.current.emissiveIntensity = hit?.() ? 0.8 : 0
  })
  const color = enemy ? '#3a3e42' : '#2f3a2c'
  const dark = <meshStandardMaterial color="#1a1c1c" roughness={0.7} />
  return (
    <group>
      {/* hull: tapered bow, flat stern, inflatable-style collar */}
      <mesh position={[0, -0.25, 0.4]} castShadow><boxGeometry args={[2.0, 0.6, 5.2]} /><meshStandardMaterial ref={hull} color={color} roughness={0.6} metalness={0.2} emissive="#ff7a40" emissiveIntensity={0} /></mesh>
      <mesh position={[0, -0.25, -2.6]} rotation-y={Math.PI / 4} castShadow><boxGeometry args={[1.42, 0.6, 1.42]} /><meshStandardMaterial color={color} roughness={0.6} metalness={0.2} /></mesh>
      {[-1, 1].map((x) => <mesh key={x} position={[x * 1.05, 0.05, 0.2]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.22, 0.22, 5.4, 10]} />{dark}</mesh>)}
      {/* console and windscreen amidships */}
      <mesh position={[0, 0.35, -0.4]} castShadow><boxGeometry args={[0.9, 0.8, 0.7]} />{dark}</mesh>
      <mesh position={[0, 0.95, -0.7]} rotation-x={-0.4}><boxGeometry args={[0.95, 0.5, 0.03]} /><meshStandardMaterial color="#1b2a33" roughness={0.1} metalness={0.8} /></mesh>
      {/* outboard motor */}
      <mesh position={[0, 0.25, 3.1]} castShadow><boxGeometry args={[0.5, 0.9, 0.5]} />{dark}</mesh>
      {/* gun on a pintle: off the stern on ours, over the bow on theirs */}
      <group position={[0, 0.6, enemy ? -1.9 : 2.3]} rotation-y={enemy ? 0 : Math.PI}>
        <mesh><cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />{dark}</mesh>
        <mesh position={[0, 0.5, -0.5]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.05, 0.05, 1.2, 8]} />{dark}</mesh>
        <mesh position={[0, 0.5, -0.05]}><boxGeometry args={[0.25, 0.25, 0.4]} />{dark}</mesh>
      </group>
      {enemy && [-1, 1].map((x) => <mesh key={x} position={[x * 1.01, -0.2, 0.4]}><boxGeometry args={[0.02, 0.2, 2.4]} /><meshStandardMaterial color="#a8322a" /></mesh>)}
    </group>
  )
}
