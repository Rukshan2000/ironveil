import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, ConeGeometry, Group, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial, SpotLight, Vector3 } from 'three'
import { getMaterials, litMaterial } from '../assets/materials'
import type { GameSession } from '../game/GameSession'
import type { CameraState, DoorState, PanelState, SearchlightState } from './SecuritySystem'

const housing = () => litMaterial({ color: '#c8c8bc', roughness: 0.5, metalness: 0.3 })
const dark = () => litMaterial({ color: '#202220', roughness: 0.6, metalness: 0.5 })

function SecurityCamera({ cam, session }: { cam: CameraState; session: GameSession }) {
  const head = useRef<Group>(null)
  const led = useRef<MeshStandardMaterial>(null)
  const mats = useMemo(() => ({ housing: housing(), dark: dark() }), [])
  useFrame(() => {
    const h = head.current!
    h.rotation.set(cam.dead ? -0.9 : cam.pitch, cam.yaw, cam.dead ? 0.4 : 0, 'YXZ')
    const blink = cam.seeing ? Math.sin(session.time * 18) > 0 : Math.sin(session.time * 2) > 0.85
    led.current!.emissiveIntensity = cam.dead ? 0 : cam.detection >= 1 || session.security.alarmActive ? 5 : blink ? 4 : 0.3
  })
  const [x, y, z] = cam.def.position
  return (
    <group position={[x, y, z]}>
      <mesh material={mats.dark} position={[0, 0.2, 0]}><boxGeometry args={[0.08, 0.35, 0.08]} /></mesh>
      <group ref={head}>
        <mesh material={mats.housing} castShadow><boxGeometry args={[0.2, 0.18, 0.42]} /></mesh>
        <mesh material={mats.housing} position={[0, 0.11, 0.02]}><boxGeometry args={[0.26, 0.03, 0.5]} /></mesh>
        <mesh material={mats.dark} position={[0, 0, -0.22]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.04, 14]} /></mesh>
        <mesh position={[0.07, -0.05, -0.215]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial ref={led} color="#300" emissive="#ff2010" emissiveIntensity={1} />
        </mesh>
      </group>
    </group>
  )
}

/** Soft volumetric beam: additive cone that fades along its length and at the edges. */
function beamMaterial() {
  return new ShaderMaterial({
    uniforms: { uOn: { value: 1 } },
    vertexShader: `varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){ vAlong = clamp(position.z / 34.0, 0.0, 1.0); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOn; varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){ float fade = pow(1.0 - vAlong, 1.8); float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * fade * rim * 0.12 * uOn, 1.0); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2,
  })
}

function Searchlight({ light, session }: { light: SearchlightState; session: GameSession }) {
  const head = useRef<Group>(null)
  const spot = useRef<SpotLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const beam = useMemo(beamMaterial, [])
  const cone = useMemo(() => new ConeGeometry(4.2, 34, 24, 1, true).translate(0, -17, 0).rotateX(-Math.PI / 2), [])
  const mats = useMemo(() => ({ dark: dark(), lens: new MeshStandardMaterial({ color: '#fff8e0', emissive: '#fff2d0', emissiveIntensity: 6 }) }), [])
  const look = useMemo(() => new Vector3(), [])
  useEffect(() => {
    spot.current!.target = target
  }, [target])
  useFrame(() => {
    const [x, y, z] = light.def.position
    look.set(x, y, z).add(light.dir)
    head.current!.lookAt(look)
    target.position.set(x, y, z).addScaledVector(light.dir, 30)
    target.updateMatrixWorld()
    spot.current!.intensity = light.on ? 900 : 0
    beam.uniforms.uOn.value = light.on ? 1 : 0
    mats.lens.emissiveIntensity = light.on ? 6 : 0
    void session
  })
  return (
    <>
      <group ref={head} position={light.def.position}>
        <mesh material={mats.dark} castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.32, 0.26, 0.55, 16]} /></mesh>
        <mesh material={mats.lens} position={[0, 0, 0.28]}><circleGeometry args={[0.28, 20]} /></mesh>
        <mesh geometry={cone} material={beam} position={[0, 0, 0.3]} />
      </group>
      <spotLight ref={spot} position={light.def.position} color="#fff3dc" angle={0.13} penumbra={0.35} distance={95} decay={1.3} intensity={0} />
      <primitive object={target} />
    </>
  )
}

function AlarmPanel({ panel, session }: { panel: PanelState; session: GameSession }) {
  const led = useRef<MeshStandardMaterial>(null)
  const beacon = useRef<Group>(null)
  const beaconMat = useRef<MeshStandardMaterial>(null)
  const mats = useMemo(() => ({ box: litMaterial({ color: '#8a2a20', roughness: 0.5, metalness: 0.3 }), dark: dark() }), [])
  useFrame(({ clock }) => {
    led.current!.emissive.set(panel.disabled ? '#000' : session.security.alarmActive ? '#ff2000' : '#20ff40')
    led.current!.emissiveIntensity = panel.disabled ? 0 : 3
    const on = session.security.alarmActive
    beacon.current!.rotation.y = clock.elapsedTime * 8
    beaconMat.current!.emissiveIntensity = on ? 8 : 0.1
  })
  const [x, y, z] = panel.def.position
  return (
    <group position={[x, y, z]} rotation={[0, panel.def.yaw, 0]}>
      <mesh material={mats.box} castShadow><boxGeometry args={[0.34, 0.44, 0.1]} /></mesh>
      <mesh material={mats.dark} position={[0, 0.05, -0.055]}><boxGeometry args={[0.14, 0.14, 0.02]} /></mesh>
      <mesh position={[0.1, 0.16, -0.055]}><sphereGeometry args={[0.018, 8, 8]} /><meshStandardMaterial ref={led} color="#111" emissive="#20ff40" /></mesh>
      <group ref={beacon} position={[0, 0.5, 0.0]}>
        <mesh><cylinderGeometry args={[0.07, 0.08, 0.13, 12]} /><meshStandardMaterial ref={beaconMat} color="#ff8a20" emissive="#ff6a00" transparent opacity={0.9} /></mesh>
        <mesh position={[0.05, 0, 0]}><boxGeometry args={[0.02, 0.1, 0.1]} /><meshStandardMaterial color="#222" /></mesh>
      </group>
    </group>
  )
}

function Door({ door }: { door: DoorState }) {
  const g = useRef<Group>(null)
  const mat = useMemo(() => getMaterials()[door.def.mat ?? 'wood'], [door])
  const handle = useMemo(dark, [])
  useFrame(() => {
    const r = door.body.rotation()
    g.current!.quaternion.set(r.x, r.y, r.z, r.w)
  })
  const { width, height } = door.def
  return (
    <group ref={g} position={door.def.hinge}>
      <mesh material={mat} position={[width / 2, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.07]} />
      </mesh>
      <mesh material={handle} position={[width - 0.12, 1.0, 0.06]}><boxGeometry args={[0.12, 0.03, 0.03]} /></mesh>
      <mesh material={handle} position={[width - 0.12, 1.0, -0.06]}><boxGeometry args={[0.12, 0.03, 0.03]} /></mesh>
      {door.def.lockedBy && <mesh position={[width + 0.08, 1.2, 0.08]}><boxGeometry args={[0.08, 0.12, 0.03]} /><meshStandardMaterial color="#222" emissive="#2080ff" emissiveIntensity={1.5} /></mesh>}
    </group>
  )
}

function Pickups({ session }: { session: GameSession }) {
  const refs = useRef<(Mesh | null)[]>([])
  const mat = useMemo(() => litMaterial({ color: '#d8dccc', roughness: 0.4, emissive: '#2a6ad0', emissiveIntensity: 0.6 }), [])
  useFrame(({ clock }) => {
    session.pickups.forEach((p, i) => {
      const m = refs.current[i]
      if (!m) return
      m.visible = !p.taken
      m.position.set(p.position[0], p.position[1] + 0.03 + Math.sin(clock.elapsedTime * 2) * 0.004, p.position[2])
      m.rotation.y = clock.elapsedTime * 0.3
    })
  })
  // re-render when a dropped pickup is appended
  return session.pickups.map((p, i) => (
    <mesh key={`${p.id}-${i}`} ref={(m) => (refs.current[i] = m)} material={mat} castShadow>
      <boxGeometry args={[0.085, 0.004, 0.054]} />
    </mesh>
  ))
}

export function SecurityView({ session }: { session: GameSession }) {
  const sec = session.security
  return (
    <>
      {sec.cameras.map((c) => <SecurityCamera key={c.def.id} cam={c} session={session} />)}
      {sec.searchlights.map((l) => <Searchlight key={l.def.id} light={l} session={session} />)}
      {sec.panels.map((p) => <AlarmPanel key={p.def.id} panel={p} session={session} />)}
      {sec.doors.map((d) => <Door key={d.def.id} door={d} />)}
      <Pickups session={session} />
    </>
  )
}
