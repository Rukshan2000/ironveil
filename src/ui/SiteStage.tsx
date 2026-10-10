import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box3, Group, MathUtils, Vector3, type Object3D } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { GltfSoldier, loadAllySoldier, loadEnemySoldier, loadSoldier, TINT, type SoldierLook } from '../characters/GltfSoldier'
import type { AnimState } from '../characters/types'
import { useSoldierRig } from '../characters/useSoldierRig'

/**
 * 3D for the landing site, built from the game's own models: the hero line-up (Wren, Kestrel and a Varn soldier on a
 * turntable, camera following the mouse) and the character viewer (drag to orbit, scroll to zoom).
 */

export type CastId = 'wren' | 'kestrel' | 'eva' | 'canopy' | 'drask' | 'garrison'

const LOOKS: Record<Exclude<CastId, 'eva'>, { look: SoldierLook; load: () => Promise<GLTF>; aim: number }> = {
  wren: { look: { tint: TINT.friend }, load: loadSoldier, aim: 0 },
  kestrel: { look: { tint: TINT.ally, armband: '#f2f2f2' }, load: loadAllySoldier, aim: 1 },
  canopy: { look: { tint: '#3a4a5a' }, load: loadSoldier, aim: 0 },
  drask: { look: { tint: '#202024', dye: 0.9, armband: '#a8322a', bulk: 1.12 }, load: loadEnemySoldier, aim: 0 },
  garrison: { look: { tint: '#1b1c1f', dye: 0.7, armband: '#d0a020' }, load: loadEnemySoldier, aim: 1 },
}
const ENEMY = { look: { tint: TINT.enemy } as SoldierLook, load: loadEnemySoldier, aim: 1 }

const idle = (aim: number): AnimState => ({
  speed: 0, crouch: 0, aim, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99,
  dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw: 0,
})

/** A posed game soldier (idle, rifle low or shouldered); hidden until the real model has downloaded. */
function Soldier({ look, load, aim, position = [0, 0, 0], yaw = 0 }: { look: SoldierLook; load: () => Promise<GLTF>; aim: number; position?: [number, number, number]; yaw?: number }) {
  const rig = useSoldierRig(look, load)
  const anim = useMemo(() => idle(aim), [aim])
  useFrame((_, dt) => rig.update(Math.min(dt, 0.05), anim))
  return <group position={position} rotation-y={yaw} visible={rig instanceof GltfSoldier}><primitive object={rig.root} /></group>
}

/** EVA's model (meshopt-compressed GLB), scaled to 1.7 m and stood on the floor. */
let evaPending: Promise<Object3D> | null = null
const loadEva = () => (evaPending ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/eva.glb').then((g) => {
  const m = g.scene
  m.traverse((o) => { o.castShadow = true; o.frustumCulled = false })
  const b = new Box3().setFromObject(m)
  m.scale.multiplyScalar(1.7 / (b.max.y - b.min.y))
  m.updateMatrixWorld(true)
  m.position.y -= new Box3().setFromObject(m).min.y
  return m
}))

function Eva() {
  const [model, setModel] = useState<Object3D | null>(null)
  useEffect(() => {
    let live = true
    loadEva().then((m) => live && setModel(clone(m))).catch(() => {})
    return () => { live = false }
  }, [])
  return model ? <primitive object={model} /> : null
}

function Lights({ rim = '#d9a441' }: { rim?: string }) {
  return (
    <>
      <hemisphereLight args={['#c8d0dc', '#1a1a18', 0.7]} />
      <directionalLight position={[3, 6, 4]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
      <pointLight position={[-3, 2.2, -2.5]} color={rim} intensity={18} distance={9} />
      <pointLight position={[3, 1.5, -2]} color="#7fb6d6" intensity={10} distance={8} />
    </>
  )
}

/** Turntable floor: a dark disc with a faint tactical grid ring. */
function Floor({ r = 4 }: { r?: number }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[r, 64]} /><meshStandardMaterial color="#1b1e1c" roughness={0.9} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}><ringGeometry args={[r - 0.06, r, 96]} /><meshBasicMaterial color="#a9bf8e" transparent opacity={0.35} /></mesh>
      <gridHelper args={[r * 2, 16, '#2c3a2c', '#222a24']} position-y={0.002} />
    </group>
  )
}

// ---- hero ----------------------------------------------------------------------------------------------

/** Mouse position over the whole page, -1..1 (the hero text sits over the canvas, so R3F's pointer won't do). */
const mouse = { x: 0, y: 0 }

function HeroRig() {
  const table = useRef<Group>(null)
  const { camera } = useThree()
  useEffect(() => {
    const move = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  useFrame((_, dt) => {
    table.current!.rotation.y += dt * 0.12
    // camera leans with the mouse
    camera.position.x = MathUtils.damp(camera.position.x, mouse.x * 1.4, 3, dt)
    camera.position.y = MathUtils.damp(camera.position.y, 1.9 - mouse.y * 0.6, 3, dt)
    camera.lookAt(0, 0.95, 0)
  })
  // the line-up stands right of centre so the hero title on the left stays clear
  return (
    <group ref={table} position-x={0.9}>
      <Floor r={3.4} />
      <Soldier {...LOOKS.wren} position={[0, 0, 0.4]} yaw={0.2} />
      <Soldier {...LOOKS.kestrel} position={[1.25, 0, -0.45]} yaw={0.6} />
      <Soldier {...ENEMY} position={[-1.3, 0, -0.9]} yaw={-0.5 + Math.PI} />
    </group>
  )
}

export function HeroScene() {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.9, 8.2], fov: 30 }} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent' }}>
      <fog attach="fog" args={['#0b0e12', 8, 15]} />
      <Lights />
      <HeroRig />
    </Canvas>
  )
}

// ---- character viewer -----------------------------------------------------------------------------------

function Orbit({ resetKey }: { resetKey: string }) {
  const { camera, gl } = useThree()
  const ctrl = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.target.set(0, 1, 0)
    c.enablePan = false
    c.enableDamping = true
    c.minDistance = 1.6
    c.maxDistance = 6
    c.minPolarAngle = 0.5
    c.maxPolarAngle = 1.65
    c.autoRotate = true
    c.autoRotateSpeed = 1.4
    c.addEventListener('start', () => (c.autoRotate = false))
    ctrl.current = c
    return () => c.dispose()
  }, [camera, gl])
  // a new character: back to the front view, spinning again
  useEffect(() => {
    camera.position.set(0, 1.4, 3.6)
    if (ctrl.current) ctrl.current.autoRotate = true
  }, [resetKey, camera])
  useFrame(() => ctrl.current?.update())
  return null
}

export function CastViewer({ who, rim }: { who: CastId; rim: string }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.4, 3.6], fov: 35 }} gl={{ alpha: true, antialias: true }} style={{ background: 'transparent', cursor: 'grab' }}>
      <Lights rim={rim} />
      <Floor r={1.6} />
      <Orbit resetKey={who} />
      {who === 'eva' ? <Eva /> : <Soldier key={who} {...LOOKS[who]} />}
    </Canvas>
  )
}

// ---- tilt card ------------------------------------------------------------------------------------------

/** A card that tilts towards the mouse in 3D, with a moving glare. */
export function Tilt({ children, className = '', max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ x: 0, y: 0, gx: 50, gy: 50, on: false })
  return (
    <div style={{ perspective: 900 }}>
      <div
        ref={el}
        onPointerMove={(e) => {
          const r = el.current!.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height
          setT({ x: (0.5 - py) * max, y: (px - 0.5) * max, gx: px * 100, gy: py * 100, on: true })
        }}
        onPointerLeave={() => setT({ x: 0, y: 0, gx: 50, gy: 50, on: false })}
        className={`relative transition-transform duration-150 ease-out ${className}`}
        style={{ transform: `rotateX(${t.x}deg) rotateY(${t.y}deg) translateZ(${t.on ? 12 : 0}px)`, transformStyle: 'preserve-3d' }}
      >
        {children}
        <div className="pointer-events-none absolute inset-0 transition-opacity" style={{ opacity: t.on ? 1 : 0, background: `radial-gradient(circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,0.09), transparent 55%)` }} />
      </div>
    </div>
  )
}
