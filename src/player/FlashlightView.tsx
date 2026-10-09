import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Object3D, Vector3, type SpotLight } from 'three'
import type { GameSession } from '../game/GameSession'

const fwd = new Vector3()

/** Weapon-mounted flashlight: a single persistent spot light (intensity toggled to avoid shader recompiles). */
export function FlashlightView({ session }: { session: GameSession }) {
  const light = useRef<SpotLight>(null)
  const target = useMemo(() => new Object3D(), [])
  useEffect(() => {
    light.current!.target = target
  }, [target])
  useFrame(({ camera }) => {
    const l = light.current!
    const on = session.player.flashlight && session.player.active
    l.intensity = on ? 60 : 0
    camera.getWorldDirection(fwd)
    l.position.copy(camera.position).addScaledVector(fwd, 0.3).add({ x: 0, y: -0.15, z: 0 })
    target.position.copy(camera.position).addScaledVector(fwd, 10)
    target.updateMatrixWorld()
  })
  return (
    <>
      <spotLight ref={light} color="#fff4e0" distance={38} angle={0.42} penumbra={0.55} decay={1.4} intensity={0} />
      <primitive object={target} />
    </>
  )
}
