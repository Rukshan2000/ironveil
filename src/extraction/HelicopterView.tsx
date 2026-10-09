import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group } from 'three'
import { litMaterial } from '../assets/materials'
import type { GameSession } from '../game/GameSession'

/** Extraction helicopter: simple utility-helo silhouette driven by the ExtractionSystem's flight path. */
export function HelicopterView({ session }: { session: GameSession }) {
  const root = useRef<Group>(null)
  const rotor = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const m = useMemo(() => ({
    body: litMaterial({ color: '#2f3428', roughness: 0.6, metalness: 0.4 }),
    dark: litMaterial({ color: '#141613', roughness: 0.8 }),
    glass: litMaterial({ color: '#4a5a60', roughness: 0.1, metalness: 0.3 }),
    nav: litMaterial({ color: '#ff3020', emissive: '#ff3020', emissiveIntensity: 3 }),
  }), [])

  useFrame((_, dt) => {
    const x = session.extraction
    const g = root.current!
    g.visible = x.available || session.mission.state === 'SUCCESS'
    if (!g.visible) return
    g.position.copy(x.heliPos)
    g.rotation.set(0, x.heliYaw, 0)
    rotor.current!.rotation.y += dt * 28
    tail.current!.rotation.x += dt * 40
  })

  return (
    <group ref={root} visible={false}>
      <mesh material={m.body} position={[0, 1.2, 0]} castShadow><boxGeometry args={[2.0, 1.8, 4.2]} /></mesh>
      <mesh material={m.glass} position={[0, 1.4, -2.3]} rotation={[0.35, 0, 0]}><boxGeometry args={[1.8, 1.2, 0.8]} /></mesh>
      <mesh material={m.body} position={[0, 1.6, 4.6]} castShadow><boxGeometry args={[0.45, 0.5, 5.4]} /></mesh>
      <mesh material={m.body} position={[0, 2.3, 7.1]}><boxGeometry args={[0.15, 1.5, 0.9]} /></mesh>
      <mesh material={m.dark} position={[0, 2.25, 0]}><boxGeometry args={[0.9, 0.5, 1.6]} /></mesh>
      {[-0.9, 0.9].map((x) => <mesh key={x} material={m.dark} position={[x, 0, 0]}><boxGeometry args={[0.1, 0.1, 3.6]} /></mesh>)}
      <mesh material={m.nav} position={[0, 2.6, 7.5]}><sphereGeometry args={[0.08, 6, 6]} /></mesh>
      <group ref={rotor} position={[0, 2.65, 0]}>
        <mesh material={m.dark}><boxGeometry args={[11, 0.05, 0.35]} /></mesh>
        <mesh material={m.dark} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[11, 0.05, 0.35]} /></mesh>
      </group>
      <group ref={tail} position={[0.2, 2.4, 7.3]}>
        <mesh material={m.dark}><boxGeometry args={[0.04, 1.6, 0.18]} /></mesh>
      </group>
    </group>
  )
}
