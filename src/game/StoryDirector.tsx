import { createPortal, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, Color, Group, Scene, SRGBColorSpace, Vector3, type PerspectiveCamera } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { loadAllySoldier, loadEnemySoldier, loadSoldier, TINT, type SoldierLook } from '../characters/GltfSoldier'
import type { AnimState } from '../characters/types'
import { useSoldierRig } from '../characters/useSoldierRig'
import { HeliModel } from '../extraction/HelicopterView'
import { useGameStore } from '../state/gameStore'
import { briefingRoom } from './BriefingRoom'
import type { GameSession } from './GameSession'
import { shotAt, story, storyRender } from './storyTimeline'

/**
 * In-canvas half of the story film: drives the camera through the real base (world shots), EVA's office, and a small
 * stage scene where the game's own soldier models act out the cast — the enemy ranks and General Drask (enemy FBX),
 * Wren (the soldier GLB), Kestrel (red) and Canopy. Mounted after GameLoop/IntroCinematic so its camera wins.
 */

const look = new Vector3()
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
const newAnim = (): AnimState => ({
  speed: 0, crouch: 0, aim: 0, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99,
  dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw: 0,
})

// the cast (stable objects: useSoldierRig keys its load on them)
const WREN: SoldierLook = { tint: TINT.friend }
const KESTREL: SoldierLook = { tint: TINT.ally, armband: '#f2f2f2' }
const ENEMY: SoldierLook = { tint: TINT.enemy }
const DRASK: SoldierLook = { tint: '#202024', dye: 0.9, armband: '#a8322a', bulk: 1.12 }
const CANOPY: SoldierLook = { tint: '#3a4a5a' }

/** Where a stage actor is in the current shot (false = off stage). Runs every frame before the rig updates. */
type Act = (id: string, lt: number, g: Group, a: AnimState) => boolean

function Actor({ look: lk, load, act }: { look: SoldierLook; load?: () => Promise<GLTF>; act: Act }) {
  const rig = useSoldierRig(lk, load)
  const g = useRef<Group>(null)
  const anim = useMemo(newAnim, [])
  useFrame((_, dt) => {
    const { shot, lt } = shotAt(story.t)
    const on = useGameStore.getState().phase === 'story' && shot.where === 'stage' && act(shot.id, lt, g.current!, anim)
    g.current!.visible = on
    if (on) rig.update(Math.min(dt, 0.05), anim)
  })
  return <group ref={g} visible={false}><primitive object={rig.root} /></group>
}

/** Faces the stage camera (+Z); the soldier models face -Z at yaw 0. */
const FACE_CAMERA = Math.PI

/** The Varn Directorate's red banner (canvas texture) behind the ranks. */
function Banner() {
  const g = useRef<Group>(null)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 384
    const x = c.getContext('2d')!
    x.fillStyle = '#8f2620'
    x.fillRect(0, 0, 256, 384)
    x.fillStyle = '#16181b'
    x.beginPath()
    x.arc(128, 170, 70, 0, Math.PI * 2)
    x.fill()
    x.strokeStyle = '#f2f2f2'
    x.lineWidth = 18
    x.beginPath()
    x.moveTo(88, 200)
    x.lineTo(128, 130)
    x.lineTo(168, 200)
    x.stroke()
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  useFrame(() => {
    const { shot, lt } = shotAt(story.t)
    g.current!.visible = shot.id === 'army'
    g.current!.rotation.z = Math.sin(lt * 1.5) * 0.02
  })
  return (
    <group ref={g} visible={false}>
      {[-4.5, 4.5].map((x) => (
        <group key={x} position={[x, 0, -9]}>
          <mesh position={[0, 3, 0]}><cylinderGeometry args={[0.06, 0.06, 6, 8]} /><meshStandardMaterial color="#222" /></mesh>
          <mesh position={[0.9, 4.2, 0]}><planeGeometry args={[1.8, 2.7]} /><meshStandardMaterial map={tex} side={2} roughness={0.9} /></mesh>
        </group>
      ))}
    </group>
  )
}

/** Canopy's radio desk. */
function RadioDesk() {
  const g = useRef<Group>(null)
  useFrame(() => {
    g.current!.visible = shotAt(story.t).shot.id === 'canopy'
  })
  return (
    <group ref={g} visible={false} position={[0, 0, 0.75]}>
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.6, 0.9, 0.7]} /><meshStandardMaterial color="#3b3328" roughness={0.8} /></mesh>
      <mesh position={[-0.3, 1.05, 0]} castShadow><boxGeometry args={[0.6, 0.3, 0.35]} /><meshStandardMaterial color="#2c3329" roughness={0.6} /></mesh>
      <mesh position={[-0.45, 1.45, 0.05]}><cylinderGeometry args={[0.01, 0.01, 0.6, 6]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.15, 1.12, 0.18]}><boxGeometry args={[0.18, 0.06, 0.01]} /><meshBasicMaterial color="#7fdc8a" toneMapped={false} /></mesh>
    </group>
  )
}

/** The enemy ranks: two rows behind Drask, standing to attention, a slight sway. */
const RANKS: [number, number][] = [-3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.6].flatMap((x, i) => [[x, -3.2 - (i % 2) * 0.2], [x + 0.6, -5.4]] as [number, number][])

export function StoryDirector({ session, vm }: { session: GameSession; vm: { scene: Scene } }) {
  const stage = useMemo(() => {
    const s = new Scene()
    s.background = new Color('#141414')
    return s
  }, [])
  const heli = useRef<Group>(null)
  const ground = (x: number, z: number, up: number) => new Vector3(x, session.terrain.height(x, z) + up, z)

  useFrame(({ camera }) => {
    const h = heli.current!
    const phase = useGameStore.getState().phase
    if (phase !== 'story') {
      h.visible = false
      if (storyRender.scene) {
        storyRender.scene = null
        briefingRoom.active = false
        vm.scene.visible = true
      }
      return
    }
    const { shot, lt } = shotAt(story.t)
    const cam = camera as PerspectiveCamera
    vm.scene.visible = false // no first-person gun in the film
    storyRender.scene = shot.where === 'stage' ? stage : null
    if (shot.where !== 'office') briefingRoom.active = false
    h.visible = shot.id === 'mission'
    let fov = 45

    switch (shot.id) {
      case 'valley': {
        // high over the valley from the south, drifting towards the ridge
        const k = ease(lt / shot.dur)
        cam.position.copy(ground(-20 + k * 20, 230 - k * 90, 70 - k * 25))
        look.copy(ground(0, -10, 6))
        break
      }
      case 'station': {
        // slow orbit around the comms building and the security compound — the real station and its guards
        const a = 0.7 + lt * 0.07
        cam.position.copy(ground(44 + Math.sin(a) * 46, -50 + Math.cos(a) * 46, 24 - lt * 0.6))
        look.copy(ground(44, -50, 6))
        break
      }
      case 'mission': {
        // the insertion helicopter crossing the dark valley towards the base
        h.position.copy(ground(-200 + lt * 18, 70 - lt * 6, 34))
        h.rotation.set(-0.12, -Math.PI / 2 + 0.3, 0, 'YXZ')
        cam.position.copy(ground(-150 + lt * 12, 95 - lt * 3, 26))
        look.copy(h.position).add({ x: 10, y: 0, z: -6 })
        fov = 50
        break
      }
      case 'title': {
        const a = -0.6 + lt * 0.05
        cam.position.copy(ground(Math.sin(a) * 150, -5 + Math.cos(a) * 150, 85))
        look.copy(ground(10, -15, 0))
        break
      }
      case 'eva': {
        // her real office: start on EVA, then over her shoulder to the screen
        if (!briefingRoom.active) briefingRoom.start(session.layout)
        const k = ease((lt - 3.5) / 3)
        cam.position.set(-0.75 + k * 1.1, 1.52 - k * 0.1, 0.2 + k * 0.6)
        look.set(-1.45 + k * 2.1, 1.5 + k * 0.05, -1.85 - k * 1.0)
        briefingRoom.showcase(lt, cam)
        fov = 36
        break
      }
      case 'army':
        (stage.background as Color).set('#2a1512')
        cam.position.set(Math.sin(lt * 0.1) * 0.6, 1.75, 8.5 - lt * 0.38)
        look.set(0, 1.55, 0)
        fov = 38
        break
      case 'wren': {
        (stage.background as Color).set('#151a12')
        const a = -0.6 + lt * 0.11
        cam.position.set(Math.sin(a) * 3.6, 1.45, Math.cos(a) * 3.6)
        look.set(0, 1.25, 0)
        fov = 38
        break
      }
      case 'partner':
        (stage.background as Color).set('#1c1312')
        cam.position.set(Math.sin(lt * 0.05) * 0.5, 1.5, 5.2 - lt * 0.12)
        look.set(0, 1.25, 0)
        fov = 40
        break
      case 'canopy':
        (stage.background as Color).set('#10161c')
        cam.position.set(0.9 - lt * 0.05, 1.65, 3.6)
        look.set(0, 1.3, 0)
        fov = 38
        break
    }
    cam.lookAt(look)
    if (cam.fov !== fov) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  })

  return (
    <>
      <group ref={heli} visible={false} scale={1.4}><HeliModel /></group>
      {createPortal(
        <>
          <hemisphereLight args={['#c8d0dc', '#2a2622', 0.9]} />
          <directionalLight position={[3, 6, 5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
          <pointLight position={[-2, 2.5, 2]} color="#ffb070" intensity={8} distance={10} />
          <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[30, 48]} /><meshStandardMaterial color="#2b2b28" roughness={0.95} /></mesh>
          <Banner />
          <RadioDesk />

          {/* the enemy: General Drask in front of his ranks */}
          <Actor look={DRASK} load={loadEnemySoldier} act={(id, lt, g, a) => {
            if (id !== 'army') return false
            g.position.set(0, 0, Math.max(0, 1.2 - lt * 0.6))
            g.rotation.y = FACE_CAMERA
            a.speed = lt < 2 ? 0.6 : 0
            a.yaw = FACE_CAMERA
            return true
          }} />
          {RANKS.map(([x, z], i) => (
            <Actor key={i} look={ENEMY} load={loadEnemySoldier} act={(id, lt, g, a) => {
              if (id !== 'army') return false
              g.position.set(x, 0, z)
              g.rotation.y = FACE_CAMERA + Math.sin(lt * 0.7 + i) * 0.03
              a.aim = i % 3 === 0 ? 1 : 0
              a.yaw = g.rotation.y
              return true
            }} />
          ))}

          {/* Wren: alone in the spotlight, then meeting the partner */}
          <Actor look={WREN} load={loadSoldier} act={(id, lt, g, a) => {
            if (id === 'wren') {
              g.position.set(0, 0, 0)
              g.rotation.y = FACE_CAMERA - 0.3
              a.aim = lt > 3 ? 1 : 0
              a.yaw = g.rotation.y
              return true
            }
            if (id !== 'partner') return false
            const k = ease(lt / 3)
            g.position.set(-3 + k * 2.5, 0, 0)
            g.rotation.y = -Math.PI / 2 // facing +X, towards the partner
            a.speed = lt < 3 ? 1.4 : 0
            a.yaw = g.rotation.y
            a.handshake = lt > 3.3 ? Math.min(1, (lt - 3.3) * 3) : 0
            return true
          }} />
          <Actor look={KESTREL} load={loadAllySoldier} act={(id, lt, g, a) => {
            if (id !== 'partner') return false
            const k = ease(lt / 3)
            g.position.set(3 - k * 2.5, 0, 0)
            g.rotation.y = Math.PI / 2 // facing -X, towards Wren
            a.speed = lt < 3 ? 1.4 : 0
            a.yaw = g.rotation.y
            a.handshake = lt > 3.3 ? Math.min(1, (lt - 3.3) * 3) : 0
            return true
          }} />
          <Actor look={CANOPY} load={loadSoldier} act={(id, _lt, g, a) => {
            if (id !== 'canopy') return false
            g.position.set(0, 0, 0)
            g.rotation.y = FACE_CAMERA
            a.radio = true
            a.yaw = FACE_CAMERA
            return true
          }} />
        </>,
        stage,
      )}
    </>
  )
}
