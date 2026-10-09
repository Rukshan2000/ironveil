import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { TINT } from '../characters/GltfSoldier'
import type { AnimState } from '../characters/types'
import { useSoldierRig } from '../characters/useSoldierRig'
import type { GameSession } from '../game/GameSession'

/** The co-op friend: the rigged GLB soldier once it has downloaded, the procedural one until then (or offline). */
export function RemotePlayerView({ session }: { session: GameSession }) {
  const rig = useSoldierRig({ tint: TINT.friend })
  const root = useRef<Group>(null)
  const anim = useMemo<AnimState>(() => ({
    speed: 0, crouch: 0, aim: 0, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99,
    dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw: 0,
  }), [])

  useFrame((_, delta) => {
    const o = session.coop.other
    const g = root.current!
    g.visible = session.coop.connected && o.seen && o.vehicle < 0 // inside a vehicle: the vehicle shows them
    if (!g.visible) return
    g.position.copy(o.shown)
    g.rotation.y = o.yaw
    Object.assign(anim, { speed: o.speed, crouch: o.stance ? 1 : 0, aim: o.aim, sinceShot: o.sinceShot, dead: !o.alive, sinceDeath: o.sinceDeath, yaw: o.yaw, pitch: o.pitch })
    // direction of travel from where they're heading (streamed position) vs. where we show them
    const dx = o.feet.x - o.shown.x, dz = o.feet.z - o.shown.z
    if (dx * dx + dz * dz > 0.0025) anim.moveYaw = Math.atan2(-dx, -dz)
    rig.update(Math.min(delta, 0.05), anim)
  })

  return <group ref={root} visible={false}><primitive object={rig.root} /></group>
}
