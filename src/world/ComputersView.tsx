import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { CanvasTexture, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import type { GameSession } from '../game/GameSession'
import { SCREEN, type ComputerDef } from './computers'

const plastic = new MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.55, metalness: 0.1 })
const casing = new MeshStandardMaterial({ color: '#2b2d30', roughness: 0.6, metalness: 0.3 })

/** Fake terminal output that scrolls on idle screens. */
const LOG = [
  'auth: session token refreshed', 'net0: link up 1000Mb/s', 'sync: 214 records pushed', 'cam-07: motion event logged',
  'relay: handshake ok [AES-256]', 'patrol grid: sector 4 clear', 'db: vacuum complete', 'uplink: queue depth 3',
  'watchdog: all services nominal', 'gate: badge 4471 accepted', 'radio: ch.2 carrier detected', 'backup: chunk 18/40 written',
]

function screenCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 184
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return { ctx: canvas.getContext('2d')!, tex }
}

/** Draws one frame of a workstation screen: title bar, scrolling log, and the download UI while it's being hacked. */
function drawScreen(ctx: CanvasRenderingContext2D, title: string, t: number, seed: number, progress: number | null, done: boolean) {
  const { width: w, height: h } = ctx.canvas
  ctx.fillStyle = '#03100a'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#0e3a24'
  ctx.fillRect(0, 0, w, 18)
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = '#7dffb0'
  ctx.fillText(title, 6, 13)
  ctx.fillText(new Date(1700000000000 + t * 1000).toISOString().slice(11, 19), w - 62, 13)
  ctx.font = '10px monospace'
  if (progress !== null || done) {
    const p = done ? 1 : progress!
    ctx.fillStyle = done ? '#7dffb0' : '#ffd36b'
    ctx.fillText(done ? '> TRANSFER COMPLETE' : '> BYPASSING ACCESS CONTROL...', 8, 40)
    ctx.fillText(`> ${done ? 'archive copied to device' : `copying ${Math.floor(p * 4096)} / 4096 KB`}`, 8, 56)
    ctx.strokeStyle = '#7dffb0'
    ctx.strokeRect(8, 70, w - 16, 16)
    ctx.fillStyle = '#2ee87a'
    ctx.fillRect(10, 72, (w - 20) * p, 12)
    ctx.fillStyle = '#7dffb0'
    ctx.fillText(`${Math.floor(p * 100)}%`, w / 2 - 10, 104)
    // file names flicking past while it copies
    if (!done) for (let i = 0; i < 5; i++) ctx.fillText(`  /intel/ops_${(Math.floor(t * 9) + i * 37 + seed) % 997}.dat`, 8, 124 + i * 12)
    return
  }
  const scroll = Math.floor(t * 1.6 + seed)
  for (let i = 0; i < 12; i++) {
    const line = LOG[(scroll + i) % LOG.length]
    ctx.fillStyle = i === 11 ? '#c8ffe0' : '#3fbf78'
    ctx.fillText(`[${String((scroll + i) * 7 % 86400).padStart(5, '0')}] ${line}`, 6, 32 + i * 12.5)
  }
  if (Math.floor(t * 2) % 2) ctx.fillRect(6, h - 10, 7, 9) // blinking cursor
}

/** Shared animated rack front: 1U server faces with blinking status and activity LEDs. */
function rackTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')!
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const draw = (t: number) => {
    ctx.fillStyle = '#121315'
    ctx.fillRect(0, 0, 64, 128)
    for (let u = 0; u < 14; u++) {
      const y = 3 + u * 9
      ctx.fillStyle = u % 5 === 4 ? '#0d0e10' : '#26282b'
      ctx.fillRect(3, y, 58, 7)
      if (u % 5 === 4) continue
      ctx.fillStyle = '#1a1b1d'
      for (let v = 0; v < 6; v++) ctx.fillRect(20 + v * 6, y + 2, 4, 3) // vents / drive bays
      const blink = Math.sin(t * (7 + u * 1.7) + u * 3) > 0.2
      ctx.fillStyle = '#2ee87a'
      ctx.fillRect(6, y + 2, 2, 2)
      ctx.fillStyle = blink ? '#ffb640' : '#3a2a10'
      ctx.fillRect(10, y + 2, 2, 2)
      if (u === 6 && Math.floor(t) % 3 === 0) {
        ctx.fillStyle = '#ff3b2e'
        ctx.fillRect(14, y + 2, 2, 2)
      }
    }
    tex.needsUpdate = true
  }
  return { tex, draw }
}

function Workstation({ c, mat }: { c: Extract<ComputerDef, { kind: 'workstation' }>; mat: MeshBasicMaterial }) {
  return (
    <group position={c.position} rotation-y={c.yaw}>
      {/* monitor: bezel, screen, neck, foot */}
      <mesh position={[0, SCREEN.y, SCREEN.z - 0.018]} material={plastic} castShadow>
        <boxGeometry args={[SCREEN.w + 0.04, SCREEN.h + 0.04, 0.03]} />
      </mesh>
      <mesh position={[0, SCREEN.y, SCREEN.z - 0.002]} material={mat}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
      </mesh>
      <mesh position={[0, 0.12, SCREEN.z - 0.04]} material={plastic}>
        <boxGeometry args={[0.05, 0.22, 0.03]} />
      </mesh>
      <mesh position={[0, 0.008, SCREEN.z - 0.02]} material={plastic}>
        <boxGeometry args={[0.22, 0.016, 0.16]} />
      </mesh>
      {/* keyboard with key rows, mouse on a pad */}
      <mesh position={[0, 0.012, 0.2]} rotation-x={0.06} material={plastic} castShadow>
        <boxGeometry args={[0.44, 0.022, 0.15]} />
      </mesh>
      {[0, 1, 2, 3].map((r) => (
        <mesh key={r} position={[0, 0.025, 0.15 + r * 0.032]} material={casing}>
          <boxGeometry args={[0.4, 0.008, 0.024]} />
        </mesh>
      ))}
      <mesh position={[0.33, 0.003, 0.2]} material={casing}>
        <boxGeometry args={[0.2, 0.004, 0.17]} />
      </mesh>
      <mesh position={[0.33, 0.017, 0.2]} material={plastic} castShadow>
        <boxGeometry args={[0.06, 0.026, 0.1]} />
      </mesh>
      {/* PC tower with power LED */}
      <mesh position={[-0.5, 0.21, -0.05]} material={casing} castShadow>
        <boxGeometry args={[0.18, 0.42, 0.4]} />
      </mesh>
      <mesh position={[-0.5, 0.38, 0.152]}>
        <boxGeometry args={[0.012, 0.012, 0.004]} />
        <meshBasicMaterial color="#3aa0ff" toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Workstations with live screens and server racks with blinking LEDs. */
export function ComputersView({ session }: { session: GameSession }) {
  const defs = session.layout.computers ?? []
  const screens = useMemo(() => defs.filter((c): c is Extract<ComputerDef, { kind: 'workstation' }> => c.kind === 'workstation').map((c, i) => {
    const s = screenCanvas()
    return { c, ...s, seed: i * 5, done: false, mat: new MeshBasicMaterial({ map: s.tex, toneMapped: false }) }
  }), [defs])
  const rack = useMemo(() => {
    const r = rackTexture()
    return { ...r, mat: new MeshBasicMaterial({ map: r.tex, toneMapped: false, color: '#bbbbbb' }) }
  }, [])
  const timer = useMemo(() => ({ t: 0 }), [])

  useFrame((_, dt) => {
    // ~8 fps is plenty for terminals and LEDs, and keeps canvas uploads cheap
    if ((timer.t += dt) < 0.12) return
    timer.t = 0
    const t = session.time
    const objs = session.objectives
    for (const s of screens) {
      const o = s.c.id ? objs.mission.objectives.find((x) => 'interactId' in x && x.interactId === s.c.id) : undefined
      const p = o ? objs.progress[o.id] : 0
      if (o && objs.status[o.id] === 'done') s.done = true
      drawScreen(s.ctx, s.c.title ?? 'TERMINAL', t, s.seed, p > 0 && !s.done ? p : null, s.done)
      s.tex.needsUpdate = true
    }
    rack.draw(t)
  })

  return (
    <>
      {screens.map((s, i) => <Workstation key={i} c={s.c} mat={s.mat} />)}
      {defs.map((c, i) => c.kind === 'rack' && (
        <mesh key={`r${i}`} position={[c.position[0], c.position[1] + c.size[1] / 2, c.position[2]]} rotation-y={c.yaw} material={rack.mat}>
          <planeGeometry args={[c.size[0] * 0.92, c.size[1] * 0.94]} />
        </mesh>
      ))}
    </>
  )
}
