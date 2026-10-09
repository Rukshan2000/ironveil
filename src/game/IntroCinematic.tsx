import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CatmullRomCurve3, Group, MathUtils, Vector3, type PerspectiveCamera, type Scene } from 'three'
import { deploy } from '../app/actions'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import { HeliModel } from '../extraction/HelicopterView'
import { useGameStore } from '../state/gameStore'
import type { GameSession } from './GameSession'

/**
 * 30 s insertion cinematic between briefing and play: the helo flies in, the camera sweeps over the station while
 * captions set up the story, the helo drops WREN at the insertion point and the camera settles into the player's eyes.
 */
export const INTRO_LENGTH = 30
const intro = { t: 0 }

const CAPTIONS: { from: number; to: number; text: string; kind?: 'title' | 'radio' }[] = [
  { from: 0.8, to: 4.6, text: 'HALVARD RIDGE SIGNALS STATION', kind: 'title' },
  { from: 4.8, to: 8, text: 'For six weeks it has routed coded traffic we cannot read. Tonight, that ends.' },
  { from: 8.5, to: 12.6, text: 'Sixteen guards. Cameras on the gate. Searchlights on both towers.' },
  { from: 12.8, to: 17.6, text: 'The logs sit on a terminal inside the walled security compound. Pull them, then cut the uplink.' },
  { from: 18.4, to: 21.8, text: 'One operative. No support until extraction.' },
  { from: 22, to: 25, text: 'Call sign: WREN.', kind: 'title' },
  { from: 25.6, to: 29.6, text: "CANOPY: WREN, you're on the ground. Good hunting.", kind: 'radio' },
]
const CUTS = [8, 18, 25]
const ease = (x: number) => MathUtils.smoothstep(x, 0, 1)
const look = new Vector3()
const tmp = new Vector3()

/** In-canvas half: helicopter, camera moves, rotor sound. Mount after GameLoop so it overrides the player camera. */
export function IntroCinematic({ session, vm }: { session: GameSession; vm: { scene: Scene } }) {
  const heli = useRef<Group>(null)
  const rotor = useRef<LoopHandle | null>(null)
  const yaw = useRef(0)

  const shot = useMemo(() => {
    const at = (x: number, z: number, up: number) => new Vector3(x, session.terrain.height(x, z) + up, z)
    const eye = session.player.eye(new Vector3())
    const lz = at(eye.x + 7, eye.z + 6, 0)
    // helo path: in from the west, low over the ridge, flare and land behind the player, then lift off north
    const keys: [number, Vector3][] = [
      [0, at(-180, lz.z + 50, 40)],
      [9, at(-90, lz.z + 40, 32)],
      [19, at(lz.x - 25, lz.z + 18, 18)],
      [23.5, at(lz.x, lz.z + 2, 3)],
      [25, lz.clone()],
      [27.5, lz.clone().setY(lz.y + 0.05)],
      [30, at(lz.x + 30, lz.z + 40, 22)],
    ]
    const curve = new CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal')
    const u = (t: number) => {
      const i = Math.max(0, keys.findIndex((k) => k[0] > t) - 1)
      const [t0] = keys[i], [t1] = keys[Math.min(i + 1, keys.length - 1)]
      return Math.min(1, (i + (t1 > t0 ? (t - t0) / (t1 - t0) : 0)) / (keys.length - 1))
    }
    const fwd = new Vector3(-Math.sin(session.player.yaw), 0, -Math.cos(session.player.yaw))
    return { at, eye, lz, curve, u, fwd }
  }, [session])

  // leaving the intro (skip or finished) cleans up; the vm scene holds the first-person weapon
  const phase = useGameStore((s) => s.phase)
  useEffect(() => {
    if (phase !== 'intro') return
    intro.t = 0
    rotor.current = audio.loop('engine', shot.lz, 1.4)
    rotor.current?.set('rate', 0.95)
    return () => {
      rotor.current?.stop()
      rotor.current = null
      vm.scene.visible = true
    }
  }, [phase, shot, vm])

  useFrame(({ camera }, delta) => {
    const g = heli.current!
    g.visible = useGameStore.getState().phase === 'intro' // not the hook value: it lags a frame behind deploy()
    if (!g.visible) return
    vm.scene.visible = false
    const t = (intro.t = Math.min(INTRO_LENGTH, intro.t + Math.min(delta, 0.05)))
    if (t >= INTRO_LENGTH) return deploy()

    // helicopter: follow the path, nose into the direction of travel, lean forward with speed
    const u = shot.u(t)
    shot.curve.getPoint(u, g.position)
    const speed = shot.curve.getPoint(shot.u(t + 0.1), tmp).sub(g.position).length() * 10
    if (speed > 1) {
      const turn = MathUtils.euclideanModulo(Math.atan2(-tmp.x, -tmp.z) - yaw.current + Math.PI, Math.PI * 2) - Math.PI
      yaw.current += turn * Math.min(1, delta * 2)
    }
    g.rotation.set(-Math.min(0.25, speed * 0.012), yaw.current, 0, 'YXZ')
    rotor.current?.move(g.position)

    // camera
    const h = g.position
    if (t < 8) {
      // chase alongside the helo
      camera.position.copy(h).add(tmp.set(-16 + t, 3 + t * 0.3, 18))
      look.copy(h).add(tmp.set(6, 0, 0))
    } else if (t < 18) {
      // slow orbit over the station, ending on the security compound
      const k = ease((t - 8) / 10)
      const a = MathUtils.lerp(-0.5, 0.7, k), r = MathUtils.lerp(125, 75, k)
      const x = Math.sin(a) * r, z = -10 + Math.cos(a) * r
      camera.position.copy(shot.at(x, z, MathUtils.lerp(62, 42, k)))
      look.set(MathUtils.lerp(0, 44, k), 3, MathUtils.lerp(0, -50, k))
    } else if (t < 25) {
      // on the ground at the LZ, watching it come in
      const k = (t - 18) / 7
      camera.position.copy(shot.lz).add(tmp.set(-12 + k * 2, 1.6, -9 + k * 1.5))
      look.copy(h).setY(h.y + 1.5)
    } else {
      // settle into the player's eyes, facing the station
      const k = ease((t - 25) / 4.5)
      camera.position.copy(shot.lz).add(tmp.set(-5, 2.2, -5)).lerp(shot.eye, k)
      look.copy(h).setY(h.y + 1.5).lerp(tmp.copy(shot.eye).addScaledVector(shot.fwd, 20), k)
    }
    camera.lookAt(look)
    const cam = camera as PerspectiveCamera
    cam.fov = t < 25 ? 50 : MathUtils.lerp(50, session.fov, ease((t - 25) / 4.5))
    cam.updateProjectionMatrix()
  })

  return <group ref={heli} visible={false}><HeliModel /></group>
}

/** DOM half: letterbox, captions, cut fades and the skip prompt. */
export function IntroOverlay() {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      setT(intro.t)
      raf = requestAnimationFrame(tick)
    })
    const onKey = (e: KeyboardEvent) => (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') && deploy()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const black = Math.max(1 - t / 1.2, ...CUTS.map((c) => 1 - Math.abs(t - c) / 0.35), 0)
  const bars = 1 - ease((t - 27.5) / 2)
  const cap = CAPTIONS.find((c) => t >= c.from && t <= c.to)
  const capAlpha = cap ? Math.min(1, (t - cap.from) / 0.4, (cap.to - t) / 0.4) : 0

  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <div className="absolute inset-0 bg-black" style={{ opacity: black }} />
      <div className="absolute inset-x-0 top-0 h-[11vh] bg-black" style={{ transform: `scaleY(${bars})`, transformOrigin: 'top' }} />
      <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black" style={{ transform: `scaleY(${bars})`, transformOrigin: 'bottom' }} />
      {cap && (
        <div className="absolute inset-x-4 bottom-[13vh] text-center" style={{ opacity: capAlpha }}>
          {cap.kind === 'title' && <div className="text-2xl tracking-[0.35em] text-hud sm:text-3xl">{cap.text}</div>}
          {cap.kind === 'radio' && <div className="text-lg tracking-wide text-warn">{cap.text}</div>}
          {!cap.kind && <div className="mx-auto max-w-3xl text-lg leading-relaxed text-hud/90">{cap.text}</div>}
        </div>
      )}
      <button
        className="pointer-events-auto absolute bottom-[3vh] right-6 border border-hud/30 px-4 py-1 text-[11px] tracking-[0.25em] text-hud/70 hover:border-hud"
        onClick={(e) => { e.stopPropagation(); deploy() }}
      >
        SKIP — SPACE
      </button>
    </div>
  )
}
