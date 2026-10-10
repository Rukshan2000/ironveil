import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, Vector3 } from 'three'
import { loadAllySoldier, TINT } from '../characters/GltfSoldier'
import type { AnimState } from '../characters/types'
import { useSoldierRig } from '../characters/useSoldierRig'
import type { GameSession } from '../game/GameSession'
import { seatAt } from '../vehicles/VehicleSystem'

const LOOK = { tint: TINT.ally, armband: '#f2f2f2' }

/** The other player (co-op friend or AI Player 2): the downloaded Mixamo soldier in red, procedural until it loads. */
export function RemotePlayerView({ session }: { session: GameSession }) {
  const rig = useSoldierRig(LOOK, loadAllySoldier)
  const root = useRef<Group>(null)
  const anim = useMemo<AnimState>(() => ({
    speed: 0, crouch: 0, aim: 0, sinceShot: 99, reload: -1, radio: false, turnRate: 0, lookYaw: 0, sinceHit: 99,
    dead: false, sinceDeath: 0, deathDir: new Vector3(0, 0, 1), yaw: 0,
  }), [])

  useFrame((_, delta) => {
    const o = session.coop.other
    const g = root.current!
    // driving: shown at the wheel of vehicles with an open driver spot, else the vehicle hides them
    const drives = o.vehicle >= 0 ? session.vehicles.vehicles[o.vehicle] : null
    g.visible = session.coop.partner && o.seen && (!drives || !!drives.def.ride)
    if (!g.visible) return
    if (drives) {
      g.position.copy(seatAt(drives, 'driver'))
      g.quaternion.copy(drives.quaternion)
    } else {
      g.position.copy(o.shown)
      g.rotation.set(0, o.yaw, 0)
    }
    Object.assign(anim, { speed: drives ? 0 : o.speed, crouch: o.stance || drives ? 1 : 0, aim: o.aim, sinceShot: o.sinceShot, dead: !o.alive, sinceDeath: o.sinceDeath, yaw: o.yaw, pitch: o.pitch, handshake: o.handshake })
    // direction of travel from where they're heading (streamed position) vs. where we show them
    const dx = o.feet.x - o.shown.x, dz = o.feet.z - o.shown.z
    if (dx * dx + dz * dz > 0.0025) anim.moveYaw = Math.atan2(-dx, -dz)
    rig.update(Math.min(delta, 0.05), anim)
  })

  return <group ref={root} visible={false}><primitive object={rig.root} /></group>
}
