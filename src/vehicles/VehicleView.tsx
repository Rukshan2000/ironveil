import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group } from 'three'
import { getMaterials, litMaterial } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { GameSession } from '../game/GameSession'
import { truck } from '../world/builders'
import { buildStaticChunks } from '../world/staticGeometry'
import type { Vehicle } from './VehicleSystem'

function useJeepMaterials() {
  return useMemo(() => {
    const paint = getTextures('paintedMetal')
    return {
      body: litMaterial({ color: '#4d5434', map: paint.map, roughnessMap: paint.roughnessMap, normalMap: paint.normalMap, roughness: 0.7, metalness: 0.35 }),
      dark: litMaterial({ color: '#1e201c', roughness: 0.7, metalness: 0.4 }),
      tire: litMaterial({ color: '#191917', roughness: 0.95 }),
      rim: litMaterial({ color: '#3a3d2e', roughness: 0.5, metalness: 0.6 }),
      seat: litMaterial({ color: '#2e2a22', roughness: 0.9 }),
      glass: litMaterial({ color: '#7a8a90', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3 }),
      lamp: litMaterial({ color: '#fff8e0', emissive: '#ffe8b0', emissiveIntensity: 0.2 }),
    }
  }, [])
}

/** Jeep visuals synced to the physics chassis and the wheel states of the raycast vehicle controller. */
function JeepView({ vehicle }: { vehicle: Vehicle }) {
  const m = useJeepMaterials()
  const root = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const spins = useRef<(Group | null)[]>([])
  const def = vehicle.def
  useFrame(() => {
    root.current!.position.copy(vehicle.position)
    root.current!.quaternion.copy(vehicle.quaternion)
    const c = vehicle.controller
    def.wheels.forEach((w, i) => {
      const g = wheels.current[i], s = spins.current[i]
      if (!g || !s) return
      g.position.set(w.at[0], w.at[1] - (c.wheelSuspensionLength(i) ?? def.suspension.rest), w.at[2])
      g.rotation.y = c.wheelSteering(i) ?? 0
      s.rotation.x = c.wheelRotation(i) ?? 0
    })
  })
  const y = def.chassisOffsetY
  return (
    <group ref={root}>
      {/* tub, hood, fenders */}
      <mesh material={m.body} position={[0, y - 0.04, 0.2]} castShadow receiveShadow><boxGeometry args={[1.8, 0.55, 2.9]} /></mesh>
      <mesh material={m.body} position={[0, y + 0.12, -1.55]} castShadow><boxGeometry args={[1.62, 0.5, 1.1]} /></mesh>
      <mesh material={m.dark} position={[0, y + 0.05, -2.12]}><boxGeometry args={[1.5, 0.45, 0.06]} /></mesh>
      {[-0.55, 0.55].map((x) => <mesh key={x} material={m.lamp} position={[x, y + 0.18, -2.16]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.09, 0.09, 0.04, 12]} /></mesh>)}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh material={m.body} position={[sx * 0.92, y + 0.3, -1.35]} castShadow><boxGeometry args={[0.3, 0.08, 0.95]} /></mesh>
          <mesh material={m.body} position={[sx * 0.92, y + 0.3, 1.3]} castShadow><boxGeometry args={[0.3, 0.08, 0.95]} /></mesh>
        </group>
      ))}
      <mesh material={m.dark} position={[0, y - 0.35, 0]}><boxGeometry args={[1.2, 0.18, 4.1]} /></mesh>
      {/* windscreen frame + roll bar */}
      <mesh material={m.dark} position={[0, y + 0.72, -0.95]} rotation={[-0.2, 0, 0]}><boxGeometry args={[1.62, 0.05, 0.05]} /></mesh>
      <mesh material={m.glass} position={[0, y + 0.55, -0.98]} rotation={[-0.2, 0, 0]}><boxGeometry args={[1.5, 0.38, 0.02]} /></mesh>
      {[-0.79, 0.79].map((x) => <mesh key={x} material={m.dark} position={[x, y + 0.55, -0.98]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.05, 0.42, 0.05]} /></mesh>)}
      {[-0.82, 0.82].map((x) => <mesh key={x} material={m.dark} position={[x, y + 0.85, 0.55]}><cylinderGeometry args={[0.03, 0.03, 0.9, 8]} /></mesh>)}
      <mesh material={m.dark} position={[0, y + 1.3, 0.55]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.03, 0.03, 1.66, 8]} /></mesh>
      {/* seats + steering wheel */}
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <mesh material={m.seat} position={[x, y + 0.42, -0.1]}><boxGeometry args={[0.5, 0.14, 0.5]} /></mesh>
          <mesh material={m.seat} position={[x, y + 0.72, 0.15]} rotation={[0.15, 0, 0]}><boxGeometry args={[0.5, 0.5, 0.1]} /></mesh>
        </group>
      ))}
      <mesh material={m.dark} position={[-0.42, y + 0.7, -0.6]} rotation={[1.1, 0, 0]}><torusGeometry args={[0.17, 0.018, 6, 18]} /></mesh>
      {/* spare tyre + jerry cans */}
      <mesh material={m.tire} position={[0, y + 0.25, 1.72]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.38, 0.38, 0.24, 16]} /></mesh>
      <mesh material={m.body} position={[0.7, y + 0.2, 1.68]}><boxGeometry args={[0.18, 0.4, 0.3]} /></mesh>
      {def.wheels.map((w, i) => (
        <group key={i} ref={(g) => (wheels.current[i] = g)} position={w.at}>
          <group ref={(g) => (spins.current[i] = g)}>
            <mesh material={m.tire} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[def.wheelRadius, def.wheelRadius, 0.3, 18]} /></mesh>
            <mesh material={m.rim} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[def.wheelRadius * 0.55, def.wheelRadius * 0.55, 0.31, 10]} /></mesh>
            <mesh material={m.tire} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[def.wheelRadius * 0.8, 0.07, 6, 18]} /></mesh>
            <mesh material={m.dark} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.09, 0.09, 0.34, 8]} /></mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

/** Truck visuals: the static decor truck's parts, merged once and carried by the physics chassis. */
function TruckView({ vehicle }: { vehicle: Vehicle }) {
  const root = useRef<Group>(null)
  const chunks = useMemo(() => buildStaticChunks(truck(0, 0, 0), []), [])
  useEffect(() => () => chunks.forEach((c) => c.geometry.dispose()), [chunks])
  const mats = getMaterials()
  useFrame(() => {
    root.current!.position.copy(vehicle.position)
    root.current!.quaternion.copy(vehicle.quaternion)
  })
  // the decor model stands on y = 0; the chassis origin sits at wheel-centre height above that
  return (
    <group ref={root}>
      <group position={[0, -(vehicle.def.wheelRadius + vehicle.def.suspension.rest - vehicle.def.wheels[0].at[1]), 0]}>
        {chunks.map((c, i) => <mesh key={i} geometry={c.geometry} material={mats[c.mat]} castShadow={c.castShadow} receiveShadow />)}
      </group>
    </group>
  )
}

export function VehicleView({ session }: { session: GameSession }) {
  return session.vehicles.vehicles.map((v) => (v.def.model === 'truck' ? <TruckView key={v.id} vehicle={v} /> : <JeepView key={v.id} vehicle={v} />))
}
