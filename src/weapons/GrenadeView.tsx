import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Mesh } from 'three'
import type { GameSession } from '../game/GameSession'

/** Thrown grenades (pooled meshes) and the throw-arc preview while the pin is pulled. */
export function GrenadeView({ session }: { session: GameSession }) {
  const g = session.grenades
  const group = useRef<Group>(null)
  const marker = useRef<Mesh>(null)
  const line = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(g.arc.length * 3), 3))
    const l = new Line(geo, new LineBasicMaterial({ color: '#e8d9a0', transparent: true, opacity: 0.7, depthWrite: false }))
    l.frustumCulled = false
    return l
  }, [g])

  useFrame(() => {
    const meshes = group.current!.children
    g.pool.forEach((n, i) => {
      const m = meshes[i]
      m.visible = n.active
      if (!n.active) return
      m.position.copy(n.pos)
      m.rotation.set(n.rot, n.rot * 0.7, 0)
    })
    const pos = line.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < g.arcCount; i++) pos.setXYZ(i, g.arc[i].x, g.arc[i].y, g.arc[i].z)
    pos.needsUpdate = true
    line.geometry.setDrawRange(0, g.arcCount)
    line.visible = g.arcCount > 1
    const mk = marker.current!
    mk.visible = line.visible
    if (mk.visible) mk.position.copy(g.arc[g.arcCount - 1]).setY(g.arc[g.arcCount - 1].y + 0.03)
  })

  return (
    <>
      <group ref={group}>
        {g.pool.map((_, i) => (
          <mesh key={i} visible={false} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.1, 10]} />
            <meshStandardMaterial color="#3d4433" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
      </group>
      <primitive object={line} />
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.25, 0.35, 24]} />
        <meshBasicMaterial color="#e8d9a0" transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </>
  )
}
