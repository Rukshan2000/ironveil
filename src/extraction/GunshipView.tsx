import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import type { GameSession } from '../game/GameSession'

/** The Varn gunships of the escape: a fixed pool drawn from `session.escape.gunships` (dark attack helicopters). */
const POOL = 4

export function GunshipView({ session }: { session: GameSession }) {
  return Array.from({ length: POOL }, (_, i) => <Gunship key={i} session={session} index={i} />)
}

function Gunship({ session, index }: { session: GameSession; index: number }) {
  const g = useRef<Group>(null)
  const rotor = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const hull = useRef<MeshStandardMaterial>(null)
  useFrame((_, dt) => {
    const ship = session.escape?.gunships[index]
    const root = g.current!
    root.visible = !!ship && ship.state !== 'gone'
    if (!ship || !root.visible) return
    root.position.copy(ship.pos)
    // nose down when cruising, rolling over as a wreck
    root.rotation.set(ship.state === 'falling' ? 0.6 : -0.12, ship.yaw, ship.state === 'falling' ? Math.sin(session.time * 4) * 0.5 : 0, 'YXZ')
    rotor.current!.rotation.y += dt * (ship.state === 'falling' ? 8 : 28)
    tail.current!.rotation.x += dt * 40
    // flash when hit
    hull.current!.emissiveIntensity = session.escape!.t - ship.hitAt < 0.08 ? 0.8 : 0
  })
  const dark = <meshStandardMaterial color="#24272a" roughness={0.55} metalness={0.4} />
  return (
    <group ref={g} visible={false}>
      {/* fuselage (nose towards -Z), tandem canopy, tail boom with fin */}
      <mesh castShadow><boxGeometry args={[1.5, 1.6, 5.2]} /><meshStandardMaterial ref={hull} color="#2e3236" roughness={0.5} metalness={0.45} emissive="#ff7a40" emissiveIntensity={0} /></mesh>
      <mesh position={[0, -0.1, -3.0]} castShadow><boxGeometry args={[1.2, 1.2, 1.2]} />{dark}</mesh>
      <mesh position={[0, 0.55, -1.8]}><boxGeometry args={[1.0, 0.8, 2.2]} /><meshStandardMaterial color="#1b2a33" roughness={0.1} metalness={0.8} /></mesh>
      <mesh position={[0, 0.25, 5.0]} castShadow><boxGeometry args={[0.5, 0.5, 5.4]} />{dark}</mesh>
      <mesh position={[0, 1.1, 7.4]}><boxGeometry args={[0.12, 1.8, 1.0]} />{dark}</mesh>
      <mesh position={[0, 1.4, 7.5]}><boxGeometry args={[0.14, 0.4, 0.8]} /><meshStandardMaterial color="#a8322a" /></mesh>
      {/* stub wings with rocket pods, chin gun */}
      <mesh position={[0, -0.2, 0.2]}><boxGeometry args={[4.2, 0.12, 0.9]} />{dark}</mesh>
      {[-1.8, 1.8].map((x) => <mesh key={x} position={[x, -0.45, 0.1]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.28, 0.28, 1.4, 10]} /><meshStandardMaterial color="#3b3f36" /></mesh>)}
      <mesh position={[0, -0.85, -3.3]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.07, 0.07, 1.2, 6]} />{dark}</mesh>
      {/* the Directorate's red stripe on the sides */}
      {[-0.76, 0.76].map((x) => <mesh key={x} position={[x, 0.1, 0.8]}><boxGeometry args={[0.02, 0.35, 1.6]} /><meshStandardMaterial color="#a8322a" /></mesh>)}
      {/* rotors */}
      <group ref={rotor} position={[0, 1.15, 0]}>
        <mesh><cylinderGeometry args={[0.18, 0.18, 0.4, 8]} />{dark}</mesh>
        {[0, Math.PI / 2].map((a) => <mesh key={a} rotation-y={a} position={[0, 0.2, 0]}><boxGeometry args={[12, 0.05, 0.35]} /><meshStandardMaterial color="#111" /></mesh>)}
      </group>
      <group ref={tail} position={[0.32, 1.1, 7.6]}>
        {[0, Math.PI / 2].map((a) => <mesh key={a} rotation-x={a}><boxGeometry args={[0.04, 2.0, 0.18]} /><meshStandardMaterial color="#111" /></mesh>)}
      </group>
    </group>
  )
}
