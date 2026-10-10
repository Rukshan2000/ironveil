import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { GameSession } from '../game/GameSession'

/** Health packs: a green field-medic case with a white cross (the cross glows so they read in the dark). Gone once used. */
export function MedkitView({ session }: { session: GameSession }) {
  return session.medkits.map((m, i) => <Medkit key={i} kit={m} />)
}

function Medkit({ kit }: { kit: GameSession['medkits'][number] }) {
  const g = useRef<Group>(null)
  useFrame(() => {
    g.current!.visible = !kit.taken
  })
  const cross = (
    <>
      <mesh position={[0, 0, 0]}><boxGeometry args={[0.16, 0.012, 0.05]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 0, 0]}><boxGeometry args={[0.05, 0.012, 0.16]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} /></mesh>
    </>
  )
  return (
    <group ref={g} position={kit.position} rotation-y={(kit.position.x * 7.3) % Math.PI}>
      <mesh position={[0, 0.09, 0]} castShadow><boxGeometry args={[0.42, 0.18, 0.28]} /><meshStandardMaterial color="#2f6b3a" roughness={0.6} /></mesh>
      <mesh position={[0, 0.19, 0]}><boxGeometry args={[0.16, 0.03, 0.04]} /><meshStandardMaterial color="#1c2a1e" /></mesh>
      <group position={[0, 0.181, 0]}>{cross}</group>
      <group position={[0, 0.09, 0.141]} rotation-x={Math.PI / 2}>{cross}</group>
    </group>
  )
}
