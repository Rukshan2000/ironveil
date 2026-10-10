import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { litMaterial } from '../assets/materials'
import type { GameSession } from '../game/GameSession'
import { TERRAIN_SIZE } from './terrain'

/**
 * Visual water (layout.water): one flat sheet at river level across the whole map, which only shows where the
 * terrain dips below it (the carved channels), plus the reservoir behind a dam. No physics: the channels are wading depth.
 */
export function WaterView({ session }: { session: GameSession }) {
  const w = session.layout.water
  const mat = useMemo(() => litMaterial({ color: '#1d2f33', roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.86 }), [])
  // a slow shimmer: the sheet's roughness breathes so moving light catches it differently
  useFrame(({ clock }) => {
    mat.roughness = 0.08 + Math.sin(clock.elapsedTime * 0.7) * 0.03
  })
  if (!w) return null
  const r = w.reservoir
  const depth = r ? TERRAIN_SIZE / 2 + r.z : 0 // from the map's north edge down to the dam
  return (
    <>
      <mesh material={mat} position={[0, w.y, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE]} />
      </mesh>
      {r && (
        <mesh material={mat} position={[0, r.y, r.z - depth / 2]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[TERRAIN_SIZE, depth]} />
        </mesh>
      )}
    </>
  )
}
