import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdditiveBlending, CatmullRomCurve3, Group, MathUtils, Vector3, type PerspectiveCamera, type Scene } from 'three'
import { deploy } from '../app/actions'
import { audio, type LoopHandle } from '../audio/AudioSystem'
import { BoatModel } from '../extraction/BoatModel'
import { BOAT_DECK } from '../extraction/ExtractionSystem'
import { HeliModel } from '../extraction/HelicopterView'
import { useGameStore } from '../state/gameStore'
import { bindingLabel } from '../state/settings'
import { LOW_WATER_PLAN } from '../missions/lowWaterStory'
import { briefingRoom, EVA_CREDIT } from './BriefingRoom'
import type { GameSession } from './GameSession'

/**
 * ~54 s insertion cinematic between briefing and play. Story first (chasing the helo in), then the mission plan: the
 * camera visits each task's location in order with a numbered card and a beacon on the spot, then the helo drops WREN
 * at the insertion point and the camera settles into the player's eyes.
 */
/** The flyover part; it plays after EVA's briefing in the office. */
const FLY_LENGTH = 54

/** Mission plan shots: where the camera looks, how it frames it, and what the player has to do there. */
const PLAN_START = 12
const PLAN_SHOT = 6
export interface PlanStep { at: [number, number]; r: number; h: number; a: number; title: string; text: () => string; optional?: boolean }
/** A mission's flyover: opening title, the line under it, CANOPY's first call and the plan steps (five, to fit the timing). */
export interface Plan { title: string; tagline: string; radio: string; steps: PlanStep[] }
const NIGHTFALL_STEPS: PlanStep[] = [
  { at: [0, 18], r: 85, h: 48, a: -0.4, title: 'GET INSIDE THE WIRE', text: () => 'Three ways in: the drainage ditch on the west side, the utility tunnel under the east fence, or the main gate — fastest, and most watched.' },
  { at: [46, -6], r: 30, h: 20, a: 0.6, optional: true, title: 'TAKE THE KEYCARD', text: () => 'The officer patrolling the warehouse office carries the card for the security compound gates. Without it you will have to hack the lock.' },
  { at: [44, -50], r: 32, h: 22, a: 1.0, title: 'STEAL THE ORDERS', text: () => `The comms terminal is in the walled security compound, north-east. Hold ${bindingLabel('interact')} on it for ten seconds to copy the traffic logs.` },
  { at: [62, -46], r: 26, h: 18, a: 1.9, title: 'CUT THE UPLINK', text: () => 'The uplink transformer is at the power station on the east fence. Sabotage it and the station goes deaf — they cannot report the theft.' },
  { at: [-48, -54], r: 30, h: 20, a: -2.3, title: 'EXTRACT', text: () => 'With the uplink down a helicopter comes to the north-west landing pad. Get there and hold it until it lands.' },
]
const NIGHTFALL_PLAN: Plan = {
  title: 'HALVARD RIDGE SIGNALS STATION',
  tagline: 'One operative. No support until extraction.',
  radio: "CANOPY: WREN, you're on the ground. Step one — get inside the wire. Your objective is always top left.",
  steps: NIGHTFALL_STEPS,
}
const PLANS: Record<string, Plan> = { nightfall: NIGHTFALL_PLAN, 'low-water': LOW_WATER_PLAN }

/** Intro clock and the loaded mission's plan / briefing length (set when the intro starts). */
const intro = { t: 0, office: 56, plan: NIGHTFALL_PLAN }
const introLength = () => intro.office + FLY_LENGTH
/** Space / skip: from the briefing jump to the flyover, from the flyover deploy. */
function skip() {
  if (intro.t < intro.office - 0.5) intro.t = intro.office - 0.5
  else deploy()
}

const PLAN_END = PLAN_START + NIGHTFALL_STEPS.length * PLAN_SHOT
const LAND = PLAN_END // camera on the ground watching the helo come in
const SETTLE = LAND + 7 // camera eases into the player's eyes

type Caption = { from: number; to: number; text: string; kind?: 'title' | 'radio' }
const captions = (p: Plan): Caption[] => [
  { from: 0.8, to: 4.4, text: p.title, kind: 'title' },
  { from: LAND + 0.3, to: LAND + 3.3, text: p.tagline },
  { from: LAND + 3.5, to: LAND + 6.5, text: 'Call sign: WREN.', kind: 'title' },
  { from: SETTLE + 0.4, to: FLY_LENGTH - 0.4, text: p.radio, kind: 'radio' },
]
const CUTS = [PLAN_START, ...NIGHTFALL_STEPS.map((_, i) => PLAN_START + (i + 1) * PLAN_SHOT)]
const stepAt = (t: number) => (t >= PLAN_START && t < PLAN_END ? Math.floor((t - PLAN_START) / PLAN_SHOT) : -1)
const ease = (x: number) => MathUtils.smoothstep(x, 0, 1)
const look = new Vector3()
const tmp = new Vector3()

/** In-canvas half: helicopter, camera moves, rotor sound. Mount after GameLoop so it overrides the player camera. */
export function IntroCinematic({ session, vm }: { session: GameSession; vm: { scene: Scene } }) {
  const heli = useRef<Group>(null)
  const beacon = useRef<Group>(null)
  const rotor = useRef<LoopHandle | null>(null)
  const yaw = useRef(0)

  const shot = useMemo(() => {
    const at = (x: number, z: number, up: number) => new Vector3(x, session.terrain.height(x, z) + up, z)
    const eye = session.player.eye(new Vector3())
    const fwd = new Vector3(-Math.sin(session.player.yaw), 0, -Math.cos(session.player.yaw))
    const river = session.def.ride === 'boat' ? session.river : null
    if (river) {
      // boat: up the river from the bottom of the valley, nose in at the bank by the player, then back downstream
      const u0 = river.nearest(eye.x, eye.z)
      const lz = river.at(u0).setY(river.y + BOAT_DECK)
      const keys: [number, number][] = [[0, u0 + 0.5], [LAND + 1, u0 + 0.08], [SETTLE - 1.5, u0 + 0.01], [SETTLE, u0], [SETTLE + 2.5, u0], [FLY_LENGTH, u0 + 0.15]]
      const path = (t: number, out: Vector3) => {
        const i = Math.max(0, keys.findIndex((k) => k[0] > t) - 1)
        const [t0, a] = keys[i], [t1, b] = keys[Math.min(i + 1, keys.length - 1)]
        return river.at(a + (b - a) * (t1 > t0 ? Math.min(1, (t - t0) / (t1 - t0)) : 0), out).setY(river.y + BOAT_DECK)
      }
      return { at, eye, lz, path, fwd, boat: true }
    }
    const lz = at(eye.x + 7, eye.z + 6, 0)
    // helo path: in from the west, low over the ridge, flare and land behind the player, then lift off north
    const keys: [number, Vector3][] = [
      [0, at(-180, lz.z + 50, 40)],
      [PLAN_START - 1, at(-90, lz.z + 40, 32)],
      [LAND + 1, at(lz.x - 25, lz.z + 18, 18)],
      [SETTLE - 1.5, at(lz.x, lz.z + 2, 3)],
      [SETTLE, lz.clone()],
      [SETTLE + 2.5, lz.clone().setY(lz.y + 0.05)],
      [FLY_LENGTH, at(lz.x + 30, lz.z + 40, 22)],
    ]
    const curve = new CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal')
    const u = (t: number) => {
      const i = Math.max(0, keys.findIndex((k) => k[0] > t) - 1)
      const [t0] = keys[i], [t1] = keys[Math.min(i + 1, keys.length - 1)]
      return Math.min(1, (i + (t1 > t0 ? (t - t0) / (t1 - t0) : 0)) / (keys.length - 1))
    }
    const path = (t: number, out: Vector3) => curve.getPoint(u(t), out)
    return { at, eye, lz, path, fwd, boat: false }
  }, [session])

  // leaving the intro (skip or finished) cleans up; the vm scene holds the first-person weapon
  const phase = useGameStore((s) => s.phase)
  useEffect(() => {
    if (phase !== 'intro') return
    intro.t = 0
    briefingRoom.start(session.layout, session.def)
    intro.office = briefingRoom.length
    intro.plan = PLANS[session.def.id] ?? NIGHTFALL_PLAN
    audio.setBedLevel(0.15) // indoors for the briefing
    return () => {
      briefingRoom.stop()
      audio.setBedLevel(1)
      rotor.current?.stop()
      rotor.current = null
      vm.scene.visible = true
    }
  }, [phase, shot, vm, session])

  useFrame(({ camera }, delta) => {
    const g = heli.current!
    g.visible = useGameStore.getState().phase === 'intro' // not the hook value: it lags a frame behind deploy()
    if (!g.visible) return
    vm.scene.visible = false
    const total = (intro.t = Math.min(introLength(), intro.t + Math.min(delta, 0.05)))
    if (total >= introLength()) return deploy()
    // part one: EVA's briefing in the office (its own scene, swapped in by the render pipeline)
    if (total < intro.office) {
      g.visible = false
      briefingRoom.update(total, camera as PerspectiveCamera)
      return
    }
    if (briefingRoom.active) {
      briefingRoom.stop()
      audio.setBedLevel(1)
      rotor.current = audio.loop(shot.boat ? 'engine' : 'rotor', shot.lz, shot.boat ? 1.1 : 1.4)
      if (!shot.boat) rotor.current?.set('rate', 0.95)
    }
    const t = total - intro.office

    // helicopter / boat: follow the path, nose into the direction of travel, lean forward with speed
    shot.path(t, g.position)
    const speed = shot.path(t + 0.1, tmp).sub(g.position).length() * 10
    if (speed > 1) {
      const turn = MathUtils.euclideanModulo(Math.atan2(-tmp.x, -tmp.z) - yaw.current + Math.PI, Math.PI * 2) - Math.PI
      yaw.current += turn * Math.min(1, delta * 2)
    }
    g.rotation.set(shot.boat ? Math.min(0.08, speed * 0.008) : -Math.min(0.25, speed * 0.012), yaw.current, 0, 'YXZ')
    rotor.current?.move(g.position)

    // camera
    const h = g.position
    const step = stepAt(t)
    const b = beacon.current!
    b.visible = step >= 0
    if (t < PLAN_START) {
      // chase alongside the helo
      camera.position.copy(h).add(tmp.set(-16 + t, 3 + t * 0.3, 18))
      look.copy(h).add(tmp.set(6, 0, 0))
    } else if (step >= 0) {
      // mission plan: slow orbit around each task's location, a beacon standing on the spot
      const s = intro.plan.steps[step]
      const k = (t - PLAN_START - step * PLAN_SHOT) / PLAN_SHOT
      const a = s.a + k * 0.45, r = s.r * (1 - k * 0.12)
      const [x, z] = s.at
      camera.position.copy(shot.at(x + Math.sin(a) * r, z + Math.cos(a) * r, s.h * (1 - k * 0.1)))
      look.copy(shot.at(x, z, 2))
      b.position.copy(shot.at(x, z, 0))
      b.scale.setScalar(step === 0 ? 2.2 : 1)
      b.children[1].scale.setScalar(1 + (t * 0.8) % 1 * 0.6) // ring pulse
    } else if (t < SETTLE) {
      // on the ground at the LZ, watching it come in
      const k = (t - LAND) / (SETTLE - LAND)
      camera.position.copy(shot.lz).add(tmp.set(-12 + k * 2, 1.6, -9 + k * 1.5))
      look.copy(h).setY(h.y + 1.5)
    } else {
      // settle into the player's eyes, facing the station
      const k = ease((t - SETTLE) / 4.5)
      camera.position.copy(shot.lz).add(tmp.set(-5, 2.2, -5)).lerp(shot.eye, k)
      look.copy(h).setY(h.y + 1.5).lerp(tmp.copy(shot.eye).addScaledVector(shot.fwd, 20), k)
    }
    camera.lookAt(look)
    const cam = camera as PerspectiveCamera
    cam.fov = t < SETTLE ? 50 : MathUtils.lerp(50, session.fov, ease((t - SETTLE) / 4.5))
    cam.updateProjectionMatrix()
  })

  return (
    <>
      <group ref={heli} visible={false}>{session.def.ride === 'boat' ? <BoatModel /> : <HeliModel />}</group>
      {/* objective beacon: a tall light column and a pulsing ground ring */}
      <group ref={beacon} visible={false}>
        <mesh position={[0, 30, 0]}>
          <cylinderGeometry args={[0.6, 1.4, 60, 16, 1, true]} />
          <meshBasicMaterial color="#ffb640" transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.3, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[3.2, 4, 40]} />
          <meshBasicMaterial color="#ffb640" transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

/** DOM half: letterbox, captions, cut fades and the skip prompt. */
export function IntroOverlay() {
  const [total, setT] = useState(0)
  useEffect(() => {
    let raf = requestAnimationFrame(function tick() {
      setT(intro.t)
      raf = requestAnimationFrame(tick)
    })
    const onKey = (e: KeyboardEvent) => (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') && skip()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (total < intro.office) return <OfficeOverlay t={total} />
  const t = total - intro.office
  const black = Math.max(1 - t / 0.8, ...CUTS.map((c) => 1 - Math.abs(t - c) / 0.35), 0)
  const bars = 1 - ease((t - (SETTLE + 2.5)) / 2)
  const cap = captions(intro.plan).find((c) => t >= c.from && t <= c.to)
  const capAlpha = cap ? Math.min(1, (t - cap.from) / 0.4, (cap.to - t) / 0.4) : 0
  const step = stepAt(t)
  const s = intro.plan.steps[step]
  const stepT = t - PLAN_START - step * PLAN_SHOT
  const stepAlpha = s ? Math.min(1, (stepT - 0.3) / 0.4, (PLAN_SHOT - 0.3 - stepT) / 0.4) : 0
  const required = intro.plan.steps.filter((x) => !x.optional)

  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <div className="absolute inset-0 bg-black" style={{ opacity: black }} />
      <div className="absolute inset-x-0 top-0 h-[11vh] bg-black" style={{ transform: `scaleY(${bars})`, transformOrigin: 'top' }} />
      <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black" style={{ transform: `scaleY(${bars})`, transformOrigin: 'bottom' }} />
      {s && (
        <div className="absolute inset-x-4 bottom-[13vh] flex justify-center" style={{ opacity: Math.max(0, stepAlpha) }}>
          <div className="flex max-w-3xl items-start gap-5 border-l-2 border-warn bg-black/55 px-6 py-4 text-left">
            <div className="text-5xl font-semibold leading-none text-warn tnum">{s.optional ? '+' : required.indexOf(s) + 1}</div>
            <div>
              <div className="hud-label">{s.optional ? 'Optional — makes it easier' : `Mission plan · step ${required.indexOf(s) + 1} of ${required.length}`}</div>
              <div className="mt-1 text-2xl tracking-[0.2em] text-hud">{s.title}</div>
              <div className="mt-1.5 text-[15px] leading-relaxed text-hud/85">{s.text()}</div>
            </div>
          </div>
        </div>
      )}
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

/** Briefing half of the overlay: letterbox, EVA's subtitles, fade in/out and a skip prompt. */
function OfficeOverlay({ t }: { t: number }) {
  const black = Math.max(1 - t / 1.4, 1 - (intro.office - t) / 0.6, 0)
  const line = briefingRoom.brief.lines.find((l) => t >= l.from && t <= l.to)
  const alpha = line ? Math.min(1, (t - line.from) / 0.3, (line.to - t) / 0.3) : 0
  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <div className="absolute inset-0 bg-black" style={{ opacity: black }} />
      <div className="absolute inset-x-0 top-0 h-[9vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[9vh] bg-black" />
      <div className="hud-label absolute left-6 top-[10.5vh] text-hud/60">Operations room · three hours before insertion</div>
      {briefingRoom.custom && <div className="absolute bottom-[2.5vh] left-6 text-[10px] tracking-wider text-hud/40">EVA model: {EVA_CREDIT}</div>}
      {line && (
        <div className="absolute inset-x-4 bottom-[11vh] text-center" style={{ opacity: alpha }}>
          <div className="mx-auto max-w-3xl text-lg leading-relaxed text-hud">
            <span className="mr-2 text-accent tracking-[0.2em]">EVA:</span>{line.text}
          </div>
        </div>
      )}
      <button
        className="pointer-events-auto absolute bottom-[2.5vh] right-6 border border-hud/30 px-4 py-1 text-[11px] tracking-[0.25em] text-hud/70 hover:border-hud"
        onClick={(e) => { e.stopPropagation(); skip() }}
      >
        SKIP BRIEFING — SPACE
      </button>
    </div>
  )
}
