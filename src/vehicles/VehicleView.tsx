import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CylinderGeometry, Group } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { litMaterial } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { GameSession } from '../game/GameSession'
import { TRUCK } from './definitions'
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
  const { root, wheels, spins } = useChassis(vehicle)
  const def = vehicle.def
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

/** Keeps a vehicle's root on the physics chassis and its wheels on the raycast controller (suspension, steer, spin). */
function useChassis(vehicle: Vehicle) {
  const root = useRef<Group>(null)
  const wheels = useRef<(Group | null)[]>([])
  const spins = useRef<(Group | null)[]>([])
  const def = vehicle.def
  useFrame(() => {
    root.current!.position.copy(vehicle.position)
    root.current!.quaternion.copy(vehicle.quaternion)
    const c = vehicle.controller
    def.wheels.forEach((w, i) => {
      const g = wheels.current[i], sp = spins.current[i]
      if (!g || !sp) return
      g.position.set(w.at[0], w.at[1] - (c.wheelSuspensionLength(i) ?? def.suspension.rest), w.at[2])
      g.rotation.y = c.wheelSteering(i) ?? 0
      sp.rotation.x = c.wheelRotation(i) ?? 0
    })
  })
  return { root, wheels, spins }
}

let truckAssets: ReturnType<typeof makeTruckAssets> | null = null
function makeTruckAssets() {
  const paint = getTextures('paintedMetal')
  const canvas = getTextures('canvas')
  return {
    body: litMaterial({ color: '#4a5232', map: paint.map, roughnessMap: paint.roughnessMap, normalMap: paint.normalMap, roughness: 0.7, metalness: 0.3 }),
    tarp: litMaterial({ color: '#5b5f42', map: canvas.map, normalMap: canvas.normalMap, roughness: 0.95 }),
    dark: litMaterial({ color: '#1c1e1a', roughness: 0.75, metalness: 0.35 }),
    metal: litMaterial({ color: '#3d403a', roughness: 0.45, metalness: 0.7 }),
    tire: litMaterial({ color: '#171715', roughness: 0.95 }),
    glass: litMaterial({ color: '#2a3438', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.65 }),
    lamp: litMaterial({ color: '#fff8e0', emissive: '#ffe8b0', emissiveIntensity: 0.25 }),
    yellow: litMaterial({ color: '#c49a22', map: paint.map, roughnessMap: paint.roughnessMap, roughness: 0.6, metalness: 0.3 }),
    seat: litMaterial({ color: '#2a2722', roughness: 0.9 }),
    crate: litMaterial({ color: '#8a7448', map: getTextures('wood').map, roughness: 0.85 }),
    tail: litMaterial({ color: '#7a1410', emissive: '#ff2010', emissiveIntensity: 0.4 }),
    amber: litMaterial({ color: '#a86a10', emissive: '#ff9a20', emissiveIntensity: 0.3 }),
    hood: new RoundedBoxGeometry(1.75, 1.0, 1.15, 3, 0.1),
    cab: new RoundedBoxGeometry(2.3, 2.0, 1.6, 3, 0.12),
    forkBody: new RoundedBoxGeometry(1.1, 0.75, 1.75, 3, 0.12),
    forkWeight: new RoundedBoxGeometry(1.14, 0.8, 0.5, 3, 0.15),
    // canvas cover: straight sides + a flattened arch over the bed
    arch: new CylinderGeometry(1.22, 1.22, 4.5, 20, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.38, 1),
  }
}

/** Truck body (everything but the wheels). Local frame: -Z forward, wheel centres at y -0.15, ground ≈ y -0.7. */
function TruckBody({ covered = true }: { covered?: boolean }) {
  const m = (truckAssets ??= makeTruckAssets())
  return (
    <>
      {/* ladder frame + bumpers */}
      {[-0.5, 0.5].map((x) => <mesh key={x} material={m.dark} position={[x, -0.05, 0]}><boxGeometry args={[0.16, 0.26, 7.2]} /></mesh>)}
      <mesh material={m.dark} position={[0, 0.05, -3.85]} castShadow><boxGeometry args={[2.4, 0.24, 0.22]} /></mesh>
      <mesh material={m.dark} position={[0, 0.0, 3.7]}><boxGeometry args={[2.3, 0.18, 0.16]} /></mesh>
      {[-0.75, 0.75].map((x) => <mesh key={x} material={m.metal} position={[x, 0.05, -4.0]}><boxGeometry args={[0.12, 0.12, 0.12]} /></mesh>)}

      {/* bonnet, grille, lights */}
      <mesh material={m.body} geometry={m.hood} position={[0, 0.66, -3.15]} castShadow />
      <mesh material={m.dark} position={[0, 0.62, -3.73]}><boxGeometry args={[1.3, 0.72, 0.04]} /></mesh>
      {[0.36, 0.5, 0.64, 0.78, 0.92].map((y) => <mesh key={y} material={m.metal} position={[0, y, -3.76]}><boxGeometry args={[1.22, 0.04, 0.03]} /></mesh>)}
      {[-1, 1].map((x) => (
        <group key={x}>
          <mesh material={m.dark} position={[x * 0.72, 0.8, -3.74]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.14, 0.14, 0.08, 14]} /></mesh>
          <mesh material={m.lamp} position={[x * 0.72, 0.8, -3.79]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.11, 0.11, 0.02, 14]} /></mesh>
          <mesh material={m.amber} position={[x * 0.95, 0.35, -3.9]}><boxGeometry args={[0.12, 0.08, 0.04]} /></mesh>
          {/* front wing over the steered wheel */}
          <mesh material={m.body} position={[x * 1.02, 0.62, -2.6]} castShadow><boxGeometry args={[0.5, 0.08, 1.35]} /></mesh>
          <mesh material={m.body} position={[x * 1.02, 0.42, -3.3]} rotation={[0.6, 0, 0]}><boxGeometry args={[0.5, 0.06, 0.45]} /></mesh>
        </group>
      ))}

      {/* cab: windscreen, side glass, mirrors, steps, door seams */}
      <mesh material={m.body} geometry={m.cab} position={[0, 1.1, -1.8]} castShadow />
      <mesh material={m.glass} position={[0, 1.62, -2.6]} rotation={[-0.06, 0, 0]}><boxGeometry args={[2.0, 0.72, 0.03]} /></mesh>
      <mesh material={m.dark} position={[0, 1.62, -2.62]}><boxGeometry args={[0.05, 0.72, 0.03]} /></mesh>
      <mesh material={m.dark} position={[0, 2.12, -1.8]}><boxGeometry args={[0.7, 0.06, 0.7]} /></mesh>
      {[-1, 1].map((x) => (
        <group key={x}>
          <mesh material={m.glass} position={[x * 1.16, 1.6, -1.95]}><boxGeometry args={[0.03, 0.6, 0.85]} /></mesh>
          <mesh material={m.dark} position={[x * 1.16, 1.1, -1.12]}><boxGeometry args={[0.02, 1.7, 0.03]} /></mesh>
          <mesh material={m.metal} position={[x * 1.17, 1.15, -1.3]}><boxGeometry args={[0.04, 0.04, 0.16]} /></mesh>
          <mesh material={m.metal} position={[x * 1.3, 1.65, -2.45]} rotation={[0, 0, x * 0.4]}><boxGeometry args={[0.3, 0.03, 0.03]} /></mesh>
          <mesh material={m.dark} position={[x * 1.45, 1.62, -2.45]}><boxGeometry args={[0.06, 0.32, 0.18]} /></mesh>
          <mesh material={m.metal} position={[x * 1.1, -0.2, -1.85]}><boxGeometry args={[0.32, 0.04, 0.5]} /></mesh>
        </group>
      ))}
      {/* fuel tank, battery box, exhaust stack, antenna */}
      <mesh material={m.metal} position={[-1.0, -0.12, -0.45]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.95, 16]} /></mesh>
      <mesh material={m.dark} position={[1.0, -0.12, -0.45]}><boxGeometry args={[0.45, 0.45, 0.7]} /></mesh>
      <mesh material={m.dark} position={[1.0, 1.3, -0.92]}><cylinderGeometry args={[0.065, 0.065, 2.1, 10]} /></mesh>
      <mesh material={m.metal} position={[1.0, 1.15, -0.85]}><cylinderGeometry args={[0.1, 0.1, 0.6, 10, 1, true, -Math.PI / 2, Math.PI]} /></mesh>
      <mesh material={m.dark} position={[-0.95, 2.6, -1.1]}><cylinderGeometry args={[0.008, 0.008, 1.1, 4]} /></mesh>

      {/* cargo bed: floor, drop sides, tailgate, canvas cover with an open, dark rear */}
      <mesh material={m.body} position={[0, 0.55, 1.35]} castShadow><boxGeometry args={[2.4, 0.15, 4.5]} /></mesh>
      {[-1, 1].map((x) => (
        <group key={x}>
          <mesh material={m.body} position={[x * 1.19, 0.92, 1.35]} castShadow><boxGeometry args={[0.06, 0.6, 4.5]} /></mesh>
          {[-0.4, 1.0, 2.4].map((z) => <mesh key={z} material={m.dark} position={[x * 1.23, 0.92, z]}><boxGeometry args={[0.03, 0.6, 0.06]} /></mesh>)}
          {/* rear mudguards over the tandem axle */}
          <mesh material={m.dark} position={[x * 1.05, 0.44, 1.4]}><boxGeometry args={[0.48, 0.05, 2.5]} /></mesh>
          <mesh material={m.tail} position={[x * 1.0, 0.25, 3.72]}><boxGeometry args={[0.18, 0.1, 0.04]} /></mesh>
        </group>
      ))}
      <mesh material={m.body} position={[0, 0.92, 3.6]}><boxGeometry args={[2.4, 0.6, 0.06]} /></mesh>
      <mesh material={m.body} position={[0, 0.92, -0.9]}><boxGeometry args={[2.4, 0.6, 0.06]} /></mesh>
      {covered ? (<>
      <mesh material={m.tarp} position={[0, 1.72, 1.35]} castShadow><boxGeometry args={[2.44, 1.0, 4.5]} /></mesh>
      <mesh material={m.tarp} geometry={m.arch} position={[0, 2.22, 1.35]} castShadow />
      <mesh material={m.dark} position={[0, 1.7, 3.61]}><boxGeometry args={[2.2, 0.95, 0.02]} /></mesh>
      <mesh material={m.tarp} position={[0, 2.25, 3.62]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.12, 0.12, 2.3, 10]} /></mesh>
      {[-0.2, 1.35, 2.9].map((z) => <mesh key={z} material={m.dark} position={[0, 1.24, z]}><boxGeometry args={[2.47, 0.04, 0.05]} /></mesh>)}
      </>) : (<>
        {/* open bed: lashed crates and a folded tarp */}
        {([[-0.5, 0.2, 0.9], [0.55, 0.4, 0.95], [-0.45, 1.3, 0.8], [0.4, 2.4, 1.1]] as const).map(([x, z, h], i) => (
          <mesh key={i} material={m.crate} position={[x, 0.62 + h / 2, z]} castShadow><boxGeometry args={[0.95, h, 0.95]} /></mesh>
        ))}
        <mesh material={m.tarp} position={[0, 0.75, 3.1]}><boxGeometry args={[2.0, 0.25, 0.7]} /></mesh>
      </>)}

    </>
  )
}

function TruckWheel({ r }: { r: number }) {
  const m = (truckAssets ??= makeTruckAssets())
  return (
    <>
            <mesh material={m.tire} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[r, r, 0.4, 22]} /></mesh>
            {/* chunky tread blocks */}
            {Array.from({ length: 12 }, (_, k) => (
              <mesh key={k} material={m.tire} rotation={[(k / 12) * Math.PI * 2, 0, 0]} position={[0, Math.cos((k / 12) * Math.PI * 2) * r, Math.sin((k / 12) * Math.PI * 2) * r]}>
                <boxGeometry args={[0.38, 0.05, 0.12]} />
              </mesh>
            ))}
            <mesh material={m.body} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[r * 0.55, r * 0.55, 0.42, 12]} /></mesh>
            <mesh material={m.metal} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[r * 0.2, r * 0.2, 0.46, 8]} /></mesh>
    </>
  )
}

/** Military 6x6 cargo truck: bonneted cab, canvas-covered bed, working wheels. */
function TruckView({ vehicle }: { vehicle: Vehicle }) {
  const { root, wheels, spins } = useChassis(vehicle)
  const def = vehicle.def
  return (
    <group ref={root}>
      <TruckBody />
      {def.wheels.map((w, i) => (
        <group key={i} ref={(g) => (wheels.current[i] = g)} position={w.at}>
          <group ref={(g) => (spins.current[i] = g)}><TruckWheel r={def.wheelRadius} /></group>
        </group>
      ))}
    </group>
  )
}

/** Warehouse forklift. Local frame: forks towards -Z, ground at y 0. */
function ForkliftModel() {
  const m = (truckAssets ??= makeTruckAssets())
  return (
    <>
      <mesh material={m.yellow} geometry={m.forkBody} position={[0, 0.62, 0.15]} castShadow />
      <mesh material={m.dark} geometry={m.forkWeight} position={[0, 0.68, 1.02]} castShadow />
      <mesh material={m.seat} position={[0, 1.05, 0.38]}><boxGeometry args={[0.5, 0.12, 0.45]} /></mesh>
      <mesh material={m.seat} position={[0, 1.35, 0.6]} rotation={[0.15, 0, 0]}><boxGeometry args={[0.5, 0.5, 0.1]} /></mesh>
      <mesh material={m.dark} position={[0, 1.15, -0.2]} rotation={[0.5, 0, 0]}><cylinderGeometry args={[0.025, 0.025, 0.55, 6]} /></mesh>
      <mesh material={m.dark} position={[0, 1.4, -0.08]} rotation={[1.1, 0, 0]}><torusGeometry args={[0.15, 0.018, 6, 16]} /></mesh>
      {/* overhead guard */}
      {([[-0.5, -0.38], [0.5, -0.38], [-0.5, 0.78], [0.5, 0.78]] as const).map(([x, z]) => (
        <mesh key={`${x}${z}`} material={m.dark} position={[x, 1.55, z]}><boxGeometry args={[0.06, 1.25, 0.06]} /></mesh>
      ))}
      {[-0.5, 0.5].map((x) => <mesh key={x} material={m.dark} position={[x, 2.18, 0.2]}><boxGeometry args={[0.07, 0.05, 1.25]} /></mesh>)}
      {[-0.3, 0, 0.3, 0.6].map((z) => <mesh key={z} material={m.dark} position={[0, 2.18, z]}><boxGeometry args={[1.05, 0.03, 0.04]} /></mesh>)}
      <mesh material={m.amber} position={[0.4, 2.27, 0.7]}><cylinderGeometry args={[0.06, 0.07, 0.12, 10]} /></mesh>
      {/* mast, lift cylinder, carriage, forks */}
      {[-0.38, 0.38].map((x) => <mesh key={x} material={m.metal} position={[x, 1.25, -0.75]} castShadow><boxGeometry args={[0.09, 2.4, 0.12]} /></mesh>)}
      {[0.3, 1.3, 2.4].map((y) => <mesh key={y} material={m.metal} position={[0, y, -0.75]}><boxGeometry args={[0.85, 0.07, 0.08]} /></mesh>)}
      <mesh material={m.metal} position={[0, 1.0, -0.66]}><cylinderGeometry args={[0.05, 0.05, 1.7, 8]} /></mesh>
      <mesh material={m.dark} position={[0, 0.45, -0.85]}><boxGeometry args={[0.92, 0.5, 0.06]} /></mesh>
      {[-0.26, 0.26].map((x) => (
        <group key={x}>
          <mesh material={m.metal} position={[x, 0.07, -1.38]} castShadow><boxGeometry args={[0.12, 0.05, 1.05]} /></mesh>
          <mesh material={m.metal} position={[x, 0.3, -0.88]}><boxGeometry args={[0.12, 0.5, 0.05]} /></mesh>
        </group>
      ))}
      {/* lamps */}
      {[-0.42, 0.42].map((x) => <mesh key={x} material={m.lamp} position={[x, 1.95, -0.4]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.05, 0.05, 0.05, 10]} /></mesh>)}
      {/* solid tyres: drive wheels at the front, small steer wheels at the back */}
      {([[-0.56, 0.3, -0.45, 0.3], [0.56, 0.3, -0.45, 0.3], [-0.5, 0.24, 0.78, 0.24], [0.5, 0.24, 0.78, 0.24]] as const).map(([x, y, z, r]) => (
        <group key={`${x}${z}`} position={[x, y, z]}>
          <mesh material={m.tire} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[r, r, 0.24, 18]} /></mesh>
          <mesh material={m.yellow} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[r * 0.55, r * 0.55, 0.26, 10]} /></mesh>
        </group>
      ))}
    </>
  )
}

/** Parked scenery vehicles from the layout, drawn over their hidden collision boxes. */
export function ParkedVehicles({ session }: { session: GameSession }) {
  const wheels = TRUCK.wheels
  return session.layout.props.map((p, i) => (
    <group key={i} position={[p.position[0], 0, p.position[1]]} rotation={[0, p.yaw, 0]}>
      {p.model === 'forklift' ? <ForkliftModel /> : (
        // the truck model's wheel centres sit at y -0.15; the decor truck's at 0.55 above the ground
        <group position={[0, 0.7, 0]}>
          <TruckBody covered={p.model === 'truck'} />
          {wheels.map((w, k) => <group key={k} position={[w.at[0], w.at[1] - TRUCK.suspension.rest, w.at[2]]}><TruckWheel r={TRUCK.wheelRadius} /></group>)}
        </group>
      )}
    </group>
  ))
}

export function VehicleView({ session }: { session: GameSession }) {
  return session.vehicles.vehicles.map((v) => (v.def.model === 'truck' ? <TruckView key={v.id} vehicle={v} /> : <JeepView key={v.id} vehicle={v} />))
}
