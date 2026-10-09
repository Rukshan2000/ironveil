import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedMesh,
  Matrix4, Quaternion, Vector3, type WebGLProgramParametersWithUniforms,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { litMaterial, patchInterior } from '../assets/materials'
import { getTextures } from '../assets/textures'
import { MeshLambertMaterial, MeshStandardMaterial } from 'three'
import type { GameSession } from '../game/GameSession'
import type { Plant } from './vegetation'

const GRASS_DRAW_DISTANCE = 75

/** Shared wind clock for all swaying vegetation. */
const WIND = { uTime: { value: 0 } }

/** Vertex sway that grows with height above the plant's base (`top` metres = full sway). */
function wind(amount: number, top: number) {
  return (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uTime = WIND.uTime
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec2 base = vec2(0.0);
        #ifdef USE_INSTANCING
          base = instanceMatrix[3].xz;
        #endif
        float h = clamp(position.y / ${top.toFixed(2)}, 0.0, 1.0);
        float w = sin(uTime * 1.3 + base.x * 0.21 + base.y * 0.17) * 0.6 + sin(uTime * 2.9 + base.x * 0.5) * 0.25 + 0.35;
        transformed.x += w * h * h * ${amount.toFixed(3)};
        transformed.z += w * h * h * ${(amount * 0.6).toFixed(3)};
      }`)
  }
}

function jitter(g: BufferGeometry, amount: number, seed: number) {
  const p = g.attributes.position as BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const k = Math.sin(i * 12.9898 + seed) * 43758.5453
    const n = (k - Math.floor(k) - 0.5) * amount
    p.setXYZ(i, p.getX(i) * (1 + n), p.getY(i) + n * 0.3, p.getZ(i) * (1 + n))
  }
  g.computeVertexNormals()
  return g
}

function treeGeometries() {
  const trunk = new CylinderGeometry(0.1, 0.2, 7, 6).translate(0, 3.5, 0)
  const tiers = [[2.3, 3.4, 3.4], [1.9, 3.0, 4.9], [1.45, 2.6, 6.3], [0.9, 2.0, 7.6]] as const
  const canopy = mergeGeometries(tiers.map(([r, h, y], i) => jitter(new ConeGeometry(r, h, 9, 2, true).translate(0, y, 0), 0.25, i).toNonIndexed()))!
  return { trunk, canopy }
}

function bushGeometry() {
  const parts = [[0, 0.55, 0, 0.75], [0.45, 0.45, 0.2, 0.55], [-0.35, 0.5, -0.25, 0.6], [0.1, 0.8, -0.1, 0.5]] as const
  return mergeGeometries(parts.map(([x, y, z, r], i) => jitter(new IcosahedronGeometry(r, 1), 0.3, i + 7).translate(x, y, z).toNonIndexed()))!
}

/** One clump of crossed grass blades with a dark-root → light-tip gradient and up-facing normals. */
function grassGeometry() {
  const pos: number[] = [], col: number[] = [], nor: number[] = []
  const blades = 7
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i
    const r = 0.08 + (i % 3) * 0.08
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const h = 0.35 + ((i * 37) % 10) / 22
    const lean = 0.12
    const w = 0.035
    const px = Math.cos(a + 1.57) * w, pz = Math.sin(a + 1.57) * w
    pos.push(x - px, 0, z - pz, x + px, 0, z + pz, x + Math.cos(a) * lean, h, z + Math.sin(a) * lean)
    const tip = i % 2 ? [0.62, 0.6, 0.38] : [0.5, 0.56, 0.32]
    col.push(0.2, 0.22, 0.13, 0.2, 0.22, 0.13, ...tip)
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  return g
}

const m = new Matrix4(), q = new Quaternion(), v = new Vector3(), s = new Vector3(), Y = new Vector3(0, 1, 0), c = new Color()

function fill(mesh: InstancedMesh, plants: Plant[], color?: (p: Plant, i: number) => Color) {
  plants.forEach((p, i) => {
    m.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(Y, p.rot), s.setScalar(p.scale))
    mesh.setMatrixAt(i, m)
    if (color) mesh.setColorAt(i, color(p, i))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
}

function Instanced({ plants, geometry, material, castShadow = false, color }: {
  plants: Plant[]; geometry: BufferGeometry; material: MeshStandardMaterial | MeshLambertMaterial; castShadow?: boolean; color?: (p: Plant, i: number) => Color
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => fill(ref.current!, plants, color), [plants, color])
  return <instancedMesh ref={ref} args={[geometry, material, plants.length]} castShadow={castShadow} receiveShadow />
}

export function VegetationView({ session }: { session: GameSession }) {
  const veg = session.vegetation
  const assets = useMemo(() => {
    const { trunk, canopy } = treeGeometries()
    const bark = getTextures('wood')
    return {
      trunk, canopy, bush: bushGeometry(), grass: grassGeometry(),
      trunkMat: litMaterial({ color: '#5a4a3c', map: bark.map, normalMap: bark.normalMap, roughness: 1 }),
      canopyMat: patchInterior(new MeshLambertMaterial({ color: '#ffffff', side: DoubleSide }), wind(0.35, 8)),
      bushMat: patchInterior(new MeshLambertMaterial({ color: '#ffffff', flatShading: true }), wind(0.08, 1.2)),
      grassMat: patchInterior(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), wind(0.12, 0.8)),
    }
  }, [])
  const canopyColor = useMemo(() => (_: Plant, i: number) => c.setRGB(0.03 + ((i * 7) % 5) * 0.004, 0.042 + ((i * 13) % 7) * 0.004, 0.024), [])
  const bushColor = useMemo(() => (_: Plant, i: number) => c.setRGB(0.045 + ((i * 3) % 4) * 0.006, 0.055 + ((i * 11) % 5) * 0.005, 0.028), [])
  const grassRefs = useRef<(InstancedMesh | null)[]>([])

  useFrame(({ clock, camera }) => {
    WIND.uTime.value = clock.elapsedTime
    veg.grass.forEach((chunk, i) => {
      const mesh = grassRefs.current[i]
      if (mesh) mesh.visible = Math.hypot(chunk.cx - camera.position.x, chunk.cz - camera.position.z) < GRASS_DRAW_DISTANCE
    })
  })

  return (
    <>
      {veg.trees.map((chunk, i) => (
        <group key={`t${i}`}>
          <Instanced plants={chunk} geometry={assets.trunk} material={assets.trunkMat} castShadow />
          <Instanced plants={chunk} geometry={assets.canopy} material={assets.canopyMat} castShadow color={canopyColor} />
        </group>
      ))}
      {veg.bushes.map((chunk, i) => <Instanced key={`b${i}`} plants={chunk} geometry={assets.bush} material={assets.bushMat} castShadow color={bushColor} />)}
      {veg.grass.map((chunk, i) => (
        <GrassChunk key={i} plants={chunk.plants} geometry={assets.grass} material={assets.grassMat} onMesh={(mesh) => (grassRefs.current[i] = mesh)} />
      ))}
    </>
  )
}

function GrassChunk({ plants, geometry, material, onMesh }: { plants: Plant[]; geometry: BufferGeometry; material: MeshLambertMaterial; onMesh: (m: InstancedMesh | null) => void }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    fill(ref.current!, plants)
    onMesh(ref.current)
  }, [plants, onMesh])
  return <instancedMesh ref={ref} args={[geometry, material, plants.length]} receiveShadow />
}
