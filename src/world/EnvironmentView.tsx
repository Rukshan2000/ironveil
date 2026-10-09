import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DirectionalLight, FogExp2, Object3D, PMREMGenerator, Scene, Vector3 } from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { setInteriors } from '../assets/materials'
import type { GameSession } from '../game/GameSession'
import { useSettings } from '../state/settings'

const SHADOW_EXTENT = 55

/** Sky, sun, hemisphere/environment lighting and fog for the session's time of day. */
export function EnvironmentView({ session }: { session: GameSession }) {
  const { gl, scene } = useThree()
  const env = session.environment
  const p = env.preset
  const quality = useSettings((s) => s.quality)
  const shadows = useSettings((s) => s.shadows)
  const sun = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])

  const sky = useMemo(() => {
    const s = new Sky()
    s.scale.setScalar(4000)
    const u = s.material.uniforms
    u.turbidity.value = p.sky.turbidity
    u.rayleigh.value = p.sky.rayleigh
    u.mieCoefficient.value = p.sky.mie
    u.mieDirectionalG.value = p.sky.mieG
    u.sunPosition.value.copy(env.sunDir)
    return s
  }, [p, env])

  useEffect(() => {
    // bake the sky into an environment map once; PBR materials reflect it
    const pmrem = new PMREMGenerator(gl)
    const skyScene = new Scene()
    // night: a dim moonlit gradient instead of the daylight sky shader
    if (p.label.startsWith('NIGHT')) skyScene.background = new Color('#0b111c')
    else skyScene.add(sky.clone())
    const rt = pmrem.fromScene(skyScene, 0, 1, 5000)
    scene.environment = rt.texture
    scene.environmentIntensity = p.envIntensity
    scene.fog = new FogExp2(p.fogColor, p.fogDensity)
    gl.toneMappingExposure = p.exposure
    setInteriors(session.layout.interiors, p.interiorAmbient)
    return () => {
      rt.dispose()
      pmrem.dispose()
      scene.environment = null
      scene.fog = null
    }
  }, [gl, scene, sky, p, session])

  useEffect(() => {
    const s = sun.current!
    s.target = target
    s.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048)
    s.shadow.map?.dispose()
    s.shadow.map = null
  }, [quality, target])

  const snapped = useMemo(() => new Vector3(), [])
  useFrame(() => {
    // keep the shadow frustum centred on the player, snapped to texels so shadows don't shimmer
    const s = sun.current!
    const texel = (SHADOW_EXTENT * 2) / s.shadow.mapSize.x
    const f = session.player.feet
    snapped.set(Math.round(f.x / texel) * texel, 0, Math.round(f.z / texel) * texel)
    target.position.copy(snapped)
    s.position.copy(snapped).addScaledVector(env.sunDir, 150)
    target.updateMatrixWorld()
  })

  const night = p.label.startsWith('NIGHT')
  return (
    <>
      {night ? <color attach="background" args={['#070a10']} /> : <primitive object={sky} />}
      <hemisphereLight args={[p.hemiSky, p.hemiGround, p.hemiIntensity]} />
      <directionalLight
        ref={sun} color={p.sunColor} intensity={p.sunIntensity} castShadow={shadows}
        shadow-camera-left={-SHADOW_EXTENT} shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT} shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={10} shadow-camera-far={320} shadow-bias={-0.0004} shadow-normalBias={0.035}
      />
      <primitive object={target} />
    </>
  )
}
