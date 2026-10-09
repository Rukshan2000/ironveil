import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, Mesh, MeshBasicMaterial, MeshStandardMaterial, SpotLight } from 'three'
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
/** Shared by every lamp so the whole base dims and lights together with the day cycle. */
const lampFace = new MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffdca0', emissiveIntensity: 0, side: 2 })
const lampPool = new MeshBasicMaterial({ color: '#ffcf80', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })

function Lamp({ lamp }: { lamp: LampDef }) {
  const [x, y, z] = lamp.position
  const mat = useMemo(housingMat, [])
  if (lamp.tower) {
    // floodlight mast: lattice-ish pole, a cage at the top and three heads angled down over the yard
    return (
      <>
        <group position={[x, 0, z]}>
          {[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([dx, dz], i) => (
            <mesh key={i} position={[dx * 0.6, y / 2, dz * 0.6]} rotation={[dz * 0.05, 0, -dx * 0.05]} castShadow material={mat}>
              <boxGeometry args={[0.08, y, 0.08]} />
            </mesh>
          ))}
          {[0.25, 0.5, 0.75].map((k) => (
            <mesh key={k} position={[0, y * k, 0]} material={mat}><boxGeometry args={[0.5 - k * 0.2, 0.05, 0.5 - k * 0.2]} /></mesh>
          ))}
          <mesh position={[0, y + 0.1, 0]} material={mat}><boxGeometry args={[1.6, 0.1, 0.5]} /></mesh>
          {[-0.55, 0, 0.55].map((dx, i) => (
            <group key={dx} position={[dx, y + 0.4, 0]} rotation={[0.5, (i - 1) * 0.6, 0]}>
              <mesh material={mat} castShadow><boxGeometry args={[0.45, 0.45, 0.2]} /></mesh>
              <mesh position={[0, 0, -0.105]} rotation={[0, Math.PI, 0]} material={lampFace}><planeGeometry args={[0.38, 0.38]} /></mesh>
            </group>
          ))}
        </group>
        <mesh position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]} material={lampPool}>
          <circleGeometry args={[lamp.radius * 0.8, 40]} />
        </mesh>
      </>
    )
  }
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
        <mesh position={[0, -0.075, 0]} rotation={[Math.PI / 2, 0, 0]} material={lampFace}>
          <planeGeometry args={[0.46, 0.24]} />
        </mesh>
      </group>
      <mesh position={[x, 0.065, z]} rotation={[-Math.PI / 2, 0, 0]} material={lampPool}>
        <circleGeometry args={[lamp.radius * 0.8, 32]} />
      </mesh>
    </>
  )
}

/** Real lights for the lamps: a fixed pool moved to the lamps nearest the camera (so the light count, and the shaders,
 *  never change), all dimming with the day cycle. */
const POOL = 22
function LampLights({ session }: { session: GameSession }) {
  const lamps = session.layout.lamps
  const pool = useMemo(() => Array.from({ length: Math.min(POOL, lamps.length) }, () => {
    const l = new SpotLight('#ffd9a6', 0, 20, 1.0, 0.7, 1.6)
    l.target.position.set(0, -1, 0)
    return l
  }), [lamps])
  const state = useMemo(() => ({ timer: 0 }), [])
  useFrame(({ camera }, dt) => {
    const env = session.environment
    lampFace.emissiveIntensity = 4 * env.lamps
    lampPool.opacity = 0.07 * env.lamps
    if ((state.timer -= dt) <= 0) {
      state.timer = 0.5
      const c = camera.position
      const near = lamps.map((l, i) => [i, (l.position[0] - c.x) ** 2 + (l.position[2] - c.z) ** 2] as const).sort((a, b) => a[1] - b[1])
      pool.forEach((light, k) => {
        const l = lamps[near[k][0]]
        const [x, y, z] = l.position
        const oz = l.post ? 0.6 : 0
        light.position.set(x, y - 0.1, z + oz)
        // wall lights throw their beam out from the wall; the rest point down
        const dx = l.yaw !== undefined ? -Math.sin(l.yaw) * 4 : 0, dz = l.yaw !== undefined ? -Math.cos(l.yaw) * 4 : 0
        light.target.position.set(x + dx, 0, z + oz + dz)
        light.target.updateMatrixWorld()
        light.distance = l.radius * 2.6
        light.angle = l.tower ? 1.25 : 1.0
        light.userData.boost = l.tower ? 2.4 : 1
      })
    }
    for (const light of pool) light.intensity = env.preset.lampIntensity * (light.userData.boost ?? 1)
  })
  return <>{pool.map((l, i) => <group key={i}><primitive object={l} /><primitive object={l.target} /></group>)}</>
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
  const { layout } = session
  const chunks = useMemo(() => buildStaticChunks(layout.boxes.filter((b) => b.mat !== 'foliage'), layout.cables), [layout])
  const terrain = useMemo(() => ({ geometry: session.terrain.buildGeometry(), material: terrainMaterial() }), [session])
  useEffect(() => () => chunks.forEach((c) => c.geometry.dispose()), [chunks])
  const mats = getMaterials()
  const [ex, , ez] = layout.extraction.position

  return (
    <>
      <EnvironmentView session={session} />
      <mesh geometry={terrain.geometry} material={terrain.material} receiveShadow />
      {chunks.map((c, i) => (
        <mesh key={i} geometry={c.geometry} material={mats[c.mat]} castShadow={c.castShadow} receiveShadow />
      ))}
      <VegetationView session={session} />
      {layout.lamps.map((l, i) => <Lamp key={i} lamp={l} />)}
      <LampLights session={session} />
      {/* extraction zone: painted ring on the pad */}
      <mesh position={[ex, 0.14, ez]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[layout.extraction.radius - 0.15, layout.extraction.radius, 48]} />
        <meshBasicMaterial color="#c8b440" transparent opacity={0.6} />
      </mesh>
      <ObjectiveMarker session={session} />
    </>
  )
}
