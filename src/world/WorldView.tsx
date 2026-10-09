import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Mesh, MeshStandardMaterial, Object3D, SpotLight } from 'three'
import { getMaterials, litMaterial, patchInterior } from '../assets/materials'
import { getTextures } from '../assets/textures'
import type { GameSession } from '../game/GameSession'
import { objectiveTarget } from '../missions/ObjectiveManager'
import { EnvironmentView } from './EnvironmentView'
import { buildStaticChunks } from './staticGeometry'
import type { LampDef } from './types'
import { VegetationView } from './VegetationView'

/** Terrain material: grass texture blended towards worn dirt by the `splat` vertex attribute. */
function terrainMaterial() {
  const grass = getTextures('ground'), dirt = getTextures('dirt')
  const m = new MeshStandardMaterial({ vertexColors: true, map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap, roughness: 1 })
  m.normalScale.set(0.55, 0.55)
  return patchInterior(m, (s) => {
    s.uniforms.dirtMap = { value: dirt.map }
    s.vertexShader = 'attribute float splat;\nvarying float vSplat;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;')
    s.fragmentShader = 'uniform sampler2D dirtMap;\nvarying float vSplat;\n' + s.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 grassC = texture2D(map, vMapUv);
        vec4 dirtC = mix(texture2D(dirtMap, vMapUv * 2.6), texture2D(dirtMap, vMapUv * 0.55), 0.35);
        float edge = smoothstep(0.35, 0.65, vSplat + (grassC.g - 0.3) * 0.6);
        diffuseColor *= mix(grassC, dirtC, edge);
      #endif`)
  })
}

const housingMat = () => litMaterial({ color: '#33352f', roughness: 0.6, metalness: 0.6 })

function Lamp({ lamp, on, intensity }: { lamp: LampDef; on: boolean; intensity: number }) {
  const [x, y, z] = lamp.position
  const light = useRef<SpotLight>(null)
  const aim = useMemo(() => new Object3D(), [])
  const mat = useMemo(housingMat, [])
  const wall = lamp.yaw !== undefined
  useEffect(() => {
    if (!light.current) return
    const dx = wall ? -Math.sin(lamp.yaw!) * 4 : 0, dz = wall ? -Math.cos(lamp.yaw!) * 4 : 0
    aim.position.set(x + dx, 0, z + dz + (lamp.post ? 0.6 : 0))
    aim.updateMatrixWorld()
    light.current.target = aim
  }, [aim, lamp, wall, x, z])

  return (
    <>
      {lamp.post && (
        <group position={[x, 0, z]}>
          <mesh position={[0, y / 2, 0]} castShadow material={mat}><cylinderGeometry args={[0.07, 0.1, y, 8]} /></mesh>
          <mesh position={[0, y - 0.05, 0.35]} material={mat}><boxGeometry args={[0.06, 0.06, 0.7]} /></mesh>
        </group>
      )}
      <group position={[x, y, z + (lamp.post ? 0.6 : 0)]} rotation={[0, lamp.yaw ?? 0, 0]}>
        <mesh material={mat} castShadow><boxGeometry args={[0.55, 0.14, 0.32]} /></mesh>
        <mesh position={[0, -0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.46, 0.24]} />
          <meshStandardMaterial color="#fff2cf" emissive="#ffdca0" emissiveIntensity={on ? 4 : 0} side={2} />
        </mesh>
      </group>
      {on && (
        <mesh position={[x, 0.065, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[lamp.radius * 0.8, 32]} />
          <meshBasicMaterial color="#ffcf80" transparent opacity={0.035} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {lamp.realLight && (
        <spotLight
          ref={light} position={[x, y - 0.1, z + (lamp.post ? 0.6 : 0)]} color="#ffd9a6" intensity={on ? intensity : 0}
          distance={lamp.radius * 2.6} angle={1.0} penumbra={0.7} decay={1.6}
        />
      )}
      <primitive object={aim} />
    </>
  )
}

function ObjectiveMarker({ session }: { session: GameSession }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const pos = objectiveTarget(session)
    const mesh = ref.current!
    const p = session.player.feet
    mesh.visible = !!pos && Math.hypot(pos[0] - p.x, pos[2] - p.z) > 3
    if (!pos) return
    const t = clock.elapsedTime
    mesh.position.set(pos[0], pos[1] + 1.2 + Math.sin(t * 2) * 0.08, pos[2])
    mesh.rotation.y = t
  })
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[0.12]} />
      <meshBasicMaterial color="#d8e6c0" transparent opacity={0.55} depthTest={false} />
    </mesh>
  )
}

export function WorldView({ session }: { session: GameSession }) {
  const { layout, environment } = session
  const chunks = useMemo(() => buildStaticChunks(layout.boxes.filter((b) => b.mat !== 'foliage'), layout.cables), [layout])
  const terrain = useMemo(() => ({ geometry: session.terrain.buildGeometry(), material: terrainMaterial() }), [session])
  useEffect(() => () => chunks.forEach((c) => c.geometry.dispose()), [chunks])
  const mats = getMaterials()
  const [ex, , ez] = layout.extraction.position
  const preset = environment.preset

  return (
    <>
      <EnvironmentView session={session} />
      <mesh geometry={terrain.geometry} material={terrain.material} receiveShadow />
      {chunks.map((c, i) => (
        <mesh key={i} geometry={c.geometry} material={mats[c.mat]} castShadow={c.castShadow} receiveShadow />
      ))}
      <VegetationView session={session} />
      {layout.lamps.map((l, i) => <Lamp key={i} lamp={l} on={preset.lampsOn} intensity={preset.lampIntensity} />)}
      {/* extraction zone: painted ring on the pad */}
      <mesh position={[ex, 0.14, ez]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[layout.extraction.radius - 0.15, layout.extraction.radius, 48]} />
        <meshBasicMaterial color="#c8b440" transparent opacity={0.6} />
      </mesh>
      <ObjectiveMarker session={session} />
    </>
  )
}
