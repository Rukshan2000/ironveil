import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three'
import { audio } from '../audio/AudioSystem'
import type { GameSession } from '../game/GameSession'

const DROPS = 2600
/** Rain falls in a box this size around the camera (metres), wrapping so it always surrounds the player. */
const BOX = 36
const HEIGHT = 22
const FALL = 13
const LENGTH = 0.45

/** Falling rain streaks around the camera and the rain sound, both following the weather. */
export function RainView({ session }: { session: GameSession }) {
  const rain = useMemo(() => {
    const pos = new Float32Array(DROPS * 6)
    const seed = new Float32Array(DROPS * 3)
    for (let i = 0; i < DROPS; i++) {
      seed[i * 3] = Math.random() * BOX
      seed[i * 3 + 1] = Math.random() * HEIGHT
      seed[i * 3 + 2] = Math.random() * BOX
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    const l = new LineSegments(g, new LineBasicMaterial({ color: '#aab4c4', transparent: true, opacity: 0, depthWrite: false }))
    l.frustumCulled = false
    return { l, pos, seed }
  }, [])

  useFrame(({ camera }) => {
    const env = session.environment
    const k = env.mix.rain
    audio.setRain(k)
    rain.l.visible = k > 0.03 && !env.playerIndoors
    if (!rain.l.visible) return
    ;(rain.l.material as LineBasicMaterial).opacity = 0.32 * k * (env.night ? 0.6 : 1)
    const c = camera.position
    const t = session.time
    const { pos, seed } = rain
    const wrap = (v: number, size: number) => ((v % size) + size) % size
    // only as many drops as the downpour is heavy
    const n = Math.floor(DROPS * k)
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6
      if (i >= n) {
        pos.fill(0, o, o + 6)
        continue
      }
      const x = c.x - BOX / 2 + wrap(seed[i * 3] - c.x + t * 0.8, BOX)
      const z = c.z - BOX / 2 + wrap(seed[i * 3 + 2] - c.z, BOX)
      const y = c.y - HEIGHT / 2 + wrap(seed[i * 3 + 1] - t * FALL, HEIGHT)
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z
      pos[o + 3] = x - 0.03; pos[o + 4] = y + LENGTH; pos[o + 5] = z
    }
    rain.l.geometry.attributes.position.needsUpdate = true
  })

  return <primitive object={rain.l} />
}
