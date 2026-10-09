import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { clearCheckpoint } from '../missions/checkpoint'
import { useGameStore } from '../state/gameStore'
import type { GameSession } from './GameSession'
import { input } from './input'
import { buildResults, publishHud } from './systems/hudSync'

const HUD_INTERVAL = 0.1
const offset = new Vector3()

/** Drives the session from R3F's frame loop and syncs the camera + audio listener. Runs before all other frame callbacks. */
export function GameLoop({ session }: { session: GameSession }) {
  const hudTimer = useRef(0)
  const frames = useRef(0)
  const worst = useRef(0)

  useFrame(({ camera, gl }, delta) => {
    const dt = Math.min(delta, 0.05) // avoid tunnelling after tab switches
    const store = useGameStore.getState()
    if (input.pressed('debug')) store.toggleDebug()
    if (input.pressed('validate')) useGameStore.setState({ validationOpen: !store.validationOpen })

    if (store.phase === 'playing') {
      if (input.pressed('map')) useGameStore.setState({ mapOpen: !store.mapOpen })
      session.update(dt)
      if (session.status !== 'playing') {
        if (session.status === 'complete') clearCheckpoint()
        useGameStore.setState({ results: buildResults(session), mapOpen: false })
        store.setPhase(session.status === 'dead' ? 'dead' : 'complete')
        document.exitPointerLock()
      }
    }
    input.endFrame()

    const p = session.player
    if (!session.applyVehicleCamera(camera)) {
      p.eye(camera.position)
      camera.rotation.set(p.pitch + p.recoilPitch + p.swayPitch + p.camPitch, p.yaw + p.recoilYaw + p.swayYaw, p.camRoll, 'YXZ')
      // bob offsets are in view space so they follow the head, not the world axes
      camera.position.add(offset.copy(p.camOffset).applyEuler(camera.rotation))
      // near misses shake the view a touch; explosions shake it hard
      if (session.suppression > 0.05) camera.rotation.z += (Math.random() - 0.5) * session.suppression * 0.01
      if (session.shake > 0.01) {
        const k = session.shake * session.shake * 0.035
        camera.rotation.x += (Math.random() - 0.5) * k
        camera.rotation.y += (Math.random() - 0.5) * k
      }
    }
    const cam = camera as PerspectiveCamera
    const fov = (session.fov = session.viewFov())
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    session.updateListener(camera, dt)

    // renderer stats accumulate over every pass of the previous frame (autoReset is off, see RenderPipeline)
    const info = gl.info.render
    const calls = info.calls, tris = info.triangles
    gl.info.reset()
    frames.current++
    worst.current = Math.max(worst.current, delta)
    hudTimer.current += delta
    if (hudTimer.current >= HUD_INTERVAL) {
      publishHud(session, { fps: Math.round(frames.current / hudTimer.current), frameMs: Math.round(worst.current * 1000 * 10) / 10, drawCalls: calls, triangles: tris })
      hudTimer.current = 0
      frames.current = 0
      worst.current = 0
    }
  }, -1)

  return null
}
