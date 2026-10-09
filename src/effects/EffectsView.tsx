import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferAttribute, Euler, BufferGeometry, CanvasTexture, Color, InstancedMesh, LineSegments, Matrix4,
  NormalBlending, PerspectiveCamera, Points, Quaternion, ShaderMaterial, SRGBColorSpace, Vector3, type Texture,
} from 'three'
import { litMaterial } from '../assets/materials'
import type { DecalKind } from '../combat/surfaces'
import type { GameSession } from '../game/GameSession'
import { useGameStore } from '../state/gameStore'
import type { ParticlePool } from './EffectsSystem'

const DECAL_LIFE = 40
const m = new Matrix4()
const q = new Quaternion()
const q2 = new Quaternion()
const s = new Vector3()
const p = new Vector3()
const Z = new Vector3(0, 0, 1)
const v = new Vector3()
const EULER = new Euler()

// ---- particles -------------------------------------------------------------------------------------

function particleMaterial(additive: boolean) {
  return new ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uLight: { value: new Color(1, 1, 1) } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale;
      varying float vAlpha; varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
        vAlpha = aSize > 0.0 ? aAlpha : 0.0;
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, ${additive ? '0.05' : '0.15'}, d) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * ${additive ? '2.0' : 'uLight'}, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
}

function usePoints(pool: ParticlePool, additive: boolean) {
  return useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pool.position, 3))
    g.setAttribute('aColor', new BufferAttribute(pool.color, 3))
    g.setAttribute('aSize', new BufferAttribute(pool.size, 1))
    g.setAttribute('aAlpha', new BufferAttribute(pool.alpha, 1))
    const pts = new Points(g, particleMaterial(additive))
    pts.frustumCulled = false
    pts.renderOrder = 2
    return pts
  }, [pool, additive])
}

function flagUpdate(pts: Points) {
  const g = pts.geometry
  for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (g.attributes[name] as BufferAttribute).needsUpdate = true
}

// ---- decals ----------------------------------------------------------------------------------------

/** Procedural bullet-hole textures (RGBA) per surface kind. */
function decalTexture(kind: DecalKind): Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const cx = size / 2
  const radial = (r: number, stops: [number, string][]) => {
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r)
    for (const [o, col] of stops) grad.addColorStop(o, col)
    g.fillStyle = grad
    g.beginPath()
    g.arc(cx, cx, r, 0, Math.PI * 2)
    g.fill()
  }
  if (kind === 'glass') {
    g.strokeStyle = 'rgba(230,240,245,0.85)'
    g.lineWidth = 1.2
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + Math.random() * 0.3
      g.beginPath()
      g.moveTo(cx, cx)
      let x = cx, y = cx
      for (let k = 0; k < 4; k++) {
        x += Math.cos(a + (Math.random() - 0.5) * 0.4) * (8 + Math.random() * 10)
        y += Math.sin(a + (Math.random() - 0.5) * 0.4) * (8 + Math.random() * 10)
        g.lineTo(x, y)
      }
      g.stroke()
    }
    for (const r of [14, 26]) {
      g.beginPath()
      g.arc(cx, cx, r, 0, Math.PI * 2)
      g.stroke()
    }
    radial(6, [[0, 'rgba(20,20,20,0.9)'], [1, 'rgba(200,210,215,0.6)']])
  } else if (kind === 'metal') {
    radial(40, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.6, 'rgba(70,60,50,0.5)'], [1, 'rgba(0,0,0,0)']])
    radial(22, [[0, 'rgba(10,10,10,1)'], [0.55, 'rgba(25,22,20,1)'], [0.7, 'rgba(190,190,185,0.95)'], [1, 'rgba(120,120,115,0)']])
  } else if (kind === 'wood') {
    radial(46, [[0, 'rgba(40,26,14,0.9)'], [0.4, 'rgba(70,48,28,0.6)'], [1, 'rgba(0,0,0,0)']])
    g.fillStyle = 'rgba(200,170,120,0.8)'
    for (let i = 0; i < 6; i++) {
      g.save()
      g.translate(cx, cx)
      g.rotate((i / 6) * Math.PI * 2 + Math.random())
      g.fillRect(8, -1.5, 14 + Math.random() * 14, 3)
      g.restore()
    }
    radial(14, [[0, 'rgba(8,6,4,1)'], [1, 'rgba(30,20,12,1)']])
  } else if (kind === 'dirt') {
    radial(60, [[0, 'rgba(30,24,16,0.85)'], [0.5, 'rgba(45,36,24,0.5)'], [1, 'rgba(0,0,0,0)']])
  } else {
    // concrete: chipped crater with pale dust ring
    radial(60, [[0, 'rgba(0,0,0,0)'], [0.35, 'rgba(210,205,190,0.45)'], [1, 'rgba(0,0,0,0)']])
    radial(30, [[0, 'rgba(15,15,14,1)'], [0.45, 'rgba(45,44,40,1)'], [0.8, 'rgba(90,88,82,0.8)'], [1, 'rgba(0,0,0,0)']])
    radial(10, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(10,10,10,1)']])
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

const DECAL_KINDS: DecalKind[] = ['concrete', 'metal', 'wood', 'glass', 'dirt']

function DecalPool({ session, kind }: { session: GameSession; kind: DecalKind }) {
  const ref = useRef<InstancedMesh>(null)
  const material = useMemo(() => {
    const mat = litMaterial({ map: decalTexture(kind), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: kind === 'metal' ? 0.4 : 1, metalness: kind === 'metal' ? 0.6 : 0 })
    return mat
  }, [kind])
  const ring = session.effects.decals[kind]
  useFrame(() => {
    const mesh = ref.current!
    const now = session.effects.time
    ring.items.forEach((d, i) => {
      const age = now - d.time
      q.setFromUnitVectors(Z, d.normal)
      q2.setFromAxisAngle(Z, d.rot)
      q.multiply(q2)
      m.compose(d.position, q, s.setScalar(age < DECAL_LIFE ? d.size : 0))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, material, ring.items.length]} frustumCulled={false} receiveShadow renderOrder={1}>
      <planeGeometry />
    </instancedMesh>
  )
}

// ---- shells ----------------------------------------------------------------------------------------

function Shells({ session }: { session: GameSession }) {
  const ref = useRef<InstancedMesh>(null)
  const material = useMemo(() => litMaterial({ color: '#b08a3c', metalness: 0.9, roughness: 0.35 }), [])
  const items = session.effects.shells.items
  useFrame(() => {
    const mesh = ref.current!
    const now = session.effects.time
    items.forEach((sh, i) => {
      q.setFromEuler(EULER.set(sh.rot.x, sh.rot.y, sh.rot.z))
      m.compose(sh.position, q, s.setScalar(now - sh.time < 20 ? sh.size : 0))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, material, items.length]} frustumCulled={false} castShadow>
      <cylinderGeometry args={[0.0055, 0.0055, 0.045, 6]} />
    </instancedMesh>
  )
}

// ---- tracers ---------------------------------------------------------------------------------------

function Tracers({ session }: { session: GameSession }) {
  const bullets = session.ballistics.bullets
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(bullets.length * 6), 3))
    return g
  }, [bullets])
  useFrame(() => {
    const attr = geo.attributes.position as BufferAttribute
    bullets.forEach((b, i) => {
      if (b.active && b.tracer && b.traveled > 4) {
        v.copy(b.vel).normalize()
        p.copy(b.pos).addScaledVector(v, -Math.min(b.traveled - 2, 14))
        attr.setXYZ(i * 2, p.x, p.y, p.z)
        attr.setXYZ(i * 2 + 1, b.pos.x, b.pos.y, b.pos.z)
      } else {
        attr.setXYZ(i * 2, 0, -1000, 0)
        attr.setXYZ(i * 2 + 1, 0, -1000, 0)
      }
    })
    attr.needsUpdate = true
  })
  return (
    <lineSegments geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color="#ffd9a0" transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} />
    </lineSegments>
  )
}

function DebugRays({ session }: { session: GameSession }) {
  const ref = useRef<LineSegments>(null)
  const items = session.effects.shotRays.items
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(items.length * 6), 3))
    return g
  }, [items])
  useFrame(() => {
    const attr = geo.attributes.position as BufferAttribute
    items.forEach((t, i) => {
      const alive = session.time - t.time < 3
      attr.setXYZ(i * 2, t.from.x, t.from.y, t.from.z)
      attr.setXYZ(i * 2 + 1, alive ? t.to.x : t.from.x, alive ? t.to.y : t.from.y, alive ? t.to.z : t.from.z)
    })
    attr.needsUpdate = true
    geo.computeBoundingSphere()
  })
  return (
    <lineSegments ref={ref} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color="#40ff80" />
    </lineSegments>
  )
}

/** Particles, decals, shell casings, tracers and (debug) player shot rays — all pooled. */
export function EffectsView({ session }: { session: GameSession }) {
  const debug = useGameStore((st) => st.debug)
  const fx = session.effects
  const additive = usePoints(fx.additive, true)
  const soft = usePoints(fx.soft, false)
  const { size } = useThree()
  const light = useMemo(() => new Color(session.environment.preset.hemiSky).lerp(new Color(session.environment.preset.sunColor), 0.35).multiplyScalar(session.environment.preset.label.startsWith('NIGHT') ? 0.35 : 0.9), [session])

  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera
    const scale = size.height / 2 / Math.tan((cam.fov * Math.PI) / 360)
    for (const pts of [additive, soft]) {
      const mat = pts.material as ShaderMaterial
      mat.uniforms.uScale.value = scale
      flagUpdate(pts)
    }
    ;(soft.material as ShaderMaterial).uniforms.uLight.value.copy(light).multiplyScalar(session.environment.playerIndoors ? 0.5 : 1)
  })

  return (
    <>
      {DECAL_KINDS.map((k) => <DecalPool key={k} session={session} kind={k} />)}
      <Shells session={session} />
      <primitive object={soft} />
      <primitive object={additive} />
      <Tracers session={session} />
      {debug && <DebugRays session={session} />}
    </>
  )
}
