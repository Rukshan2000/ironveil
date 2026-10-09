import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { SoldierRig } from '../characters/SoldierRig'
import type { AnimState } from '../characters/types'
import type { GameSession } from '../game/GameSession'

/** The co-op friend, drawn with the soldier rig and driven by the state they stream us. */
export function RemotePlayerView({ session }: { session: GameSession }) {
  const rig = useMemo(() => new SoldierRig(), [])
  const root = useRef<Group>(null)
  const anim = useMemo<AnimState>(() => ({
    speed: 0, crouch: 0, aim: 0, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99,
    dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw: 0,
  }), [])

  useFrame((_, delta) => {
    const o = session.coop.other
    const g = root.current!
    g.visible = session.coop.connected && o.seen
    if (!g.visible) return
    g.position.copy(o.shown)
    g.rotation.y = o.yaw
    Object.assign(anim, { speed: o.speed, crouch: o.stance ? 1 : 0, aim: o.aim, sinceShot: o.sinceShot, dead: !o.alive, sinceDeath: o.sinceDeath, yaw: o.yaw })
    rig.update(Math.min(delta, 0.05), anim)
  })

  return <group ref={root} visible={false}><primitive object={rig.root} /></group>
}
