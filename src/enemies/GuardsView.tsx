import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, PointLight, Vector3 } from 'three'
import type { AIState } from '../ai/guardBrain'
import { loadEnemySoldier, TINT, type SoldierLook } from '../characters/GltfSoldier'
import { useSoldierRig } from '../characters/useSoldierRig'
import type { GameSession } from '../game/GameSession'
import { useGameStore } from '../state/gameStore'
import type { GuardEntity } from './guards'
import { flashTexture } from '../weapons/WeaponView'

const STATE_COLORS: Record<AIState, Color> = {
  IDLE: new Color('#5aa0ff'), PATROL: new Color('#5aa0ff'), SUSPICIOUS: new Color('#ffd040'), INVESTIGATE: new Color('#ffb040'),
  SEARCH: new Color('#ff9a40'), ALERT: new Color('#ff8030'), COMBAT: new Color('#ff3030'), FLANK: new Color('#ff5050'), RETREAT: new Color('#d040ff'),
  CALL_REINFORCEMENTS: new Color('#ff40a0'), DEAD: new Color('#444444'),
}
const LOD_FAR = 45

/** Dress by type and rank, so you can read a soldier before he opens fire. */
function lookFor(g: GuardEntity): SoldierLook {
  const look: SoldierLook = {
    rifleman: { tint: TINT.enemy, head: 'helmet' as const },
    heavy: { tint: '#3b4030', head: 'helmet' as const, vest: true, bulk: 1.08 },
    sniper: { tint: '#5b5a40', head: 'boonie' as const },
    rusher: { tint: '#2c313b', head: 'beanie' as const },
  }[g.data.kind]
  if (g.carries) return { ...look, tint: '#3d4250', head: 'cap' }
  if (g.leader) return { ...look, head: g.data.kind === 'rifleman' ? 'beret' : look.head, armband: '#b02222' }
  return look
}
const aimAt = new Vector3()
/** Star-shaped soft flash shared by every guard's muzzle (a bare plane reads as a square). */
let flashMap: ReturnType<typeof flashTexture> | null = null
const ANIM_CULL = 110

function GuardView({ guard, session, debug }: { guard: GuardEntity; session: GameSession; debug: boolean }) {
  const rig = useSoldierRig(useMemo(() => lookFor(guard), [guard]), loadEnemySoldier)
  // sniper's laser: visible while he has you in his sights, brighter just before the shot
  const laser = useMemo(() => {
    const l = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), new LineBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.6, toneMapped: false }))
    l.frustumCulled = false
    l.visible = false
    return l
  }, [])
  const last = useRef({ rig, x: guard.data.position.x, z: guard.data.position.z })
  const root = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const cone = useRef<Mesh>(null)
  const lod = useRef<0 | 1>(0)

  useFrame(({ camera }, delta) => {
    const d = guard.data
    const g = root.current!
    g.visible = guard.active
    if (!guard.active) return
    g.position.copy(d.position)
    g.rotation.y = d.yaw
    const dist = camera.position.distanceTo(d.position)
    const level = dist > LOD_FAR ? 1 : 0
    const fresh = last.current.rig !== rig // rig just swapped to the downloaded model: pose it once, even if frozen
    if (level !== lod.current || fresh) {
      lod.current = level
      rig.setDetail(level)
    }
    // direction of travel, for rigs that strafe / back-pedal
    const mx = d.position.x - last.current.x, mz = d.position.z - last.current.z
    if (mx * mx + mz * mz > 1e-5) guard.anim.moveYaw = Math.atan2(-mx, -mz)
    last.current = { rig, x: d.position.x, z: d.position.z }
    // far guards animate only when on screen-ish range; corpses settle and freeze
    if (fresh || (dist < ANIM_CULL && !(guard.anim.dead && guard.anim.sinceDeath > 6))) rig.update(Math.min(delta, 0.05), guard.anim)

    laser.visible = d.kind === 'sniper' && d.state !== 'DEAD' && guard.debug.los && (d.state === 'COMBAT' || d.state === 'ALERT')
    if (laser.visible) {
      const o = session.coop.other
      if (guard.target === 'peer') aimAt.copy(o.shown).setY(o.shown.y + 1.3)
      else session.player.chest(aimAt)
      const pos = laser.geometry.attributes.position
      pos.setXYZ(0, rig.muzzle.x, rig.muzzle.y, rig.muzzle.z)
      pos.setXYZ(1, aimAt.x, aimAt.y, aimAt.z)
      pos.needsUpdate = true
      ;(laser.material as LineBasicMaterial).opacity = d.fireCooldown < 0.7 ? 0.55 + Math.sin(session.time * 30) * 0.3 : 0.3
    }

    const f = flash.current!
    f.visible = session.time - guard.muzzleTime < 0.05
    if (f.visible) {
      f.position.copy(rig.muzzle)
      g.worldToLocal(f.position)
      f.rotation.set(0, 0, Math.random() * Math.PI)
      f.scale.setScalar(0.8 + Math.random() * 0.5)
    }

    if (!debug || !cone.current) return
    cone.current.visible = d.state !== 'DEAD'
    cone.current.scale.setScalar(d.visionRange)
    ;(cone.current.material as MeshBasicMaterial).color.copy(STATE_COLORS[d.state])
  })

  return (
    <>
    <primitive object={laser} />
    <group ref={root}>
      <primitive object={rig.root} />
      <mesh ref={flash} visible={false}>
        <planeGeometry args={[0.45, 0.45]} />
        <meshBasicMaterial map={(flashMap ??= flashTexture())} color="#ffd8a0" blending={AdditiveBlending} transparent depthWrite={false} side={2} toneMapped={false} />
      </mesh>
      {debug && (
        <mesh ref={cone} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1, 24, Math.PI / 2 - guard.data.fov / 2, guard.data.fov]} />
          <meshBasicMaterial transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
    </>
  )
}

/** One shared light for enemy muzzle flashes, moved to the most recent shooter (avoids per-guard lights). */
function MuzzleLight({ session }: { session: GameSession }) {
  const light = useRef<PointLight>(null)
  const p = useMemo(() => new Vector3(), [])
  useFrame(() => {
    let latest: GuardEntity | null = null
    for (const g of session.guards) if (!latest || g.muzzleTime > latest.muzzleTime) latest = g
    const on = !!latest && session.time - latest.muzzleTime < 0.05
    light.current!.intensity = on ? 18 : 0
    if (on) light.current!.position.copy(p.copy(latest!.data.position).setY(latest!.data.position.y + 1.5))
  })
  return <pointLight ref={light} color="#ffb060" distance={9} decay={2} intensity={0} />
}

export function GuardsView({ session }: { session: GameSession }) {
  const debug = useGameStore((s) => s.debug)
  return (
    <>
      {session.guards.map((g) => <GuardView key={g.data.id} guard={g} session={session} debug={debug} />)}
      <MuzzleLight session={session} />
    </>
  )
}
