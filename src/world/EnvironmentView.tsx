import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DirectionalLight, FogExp2, HemisphereLight, Object3D, PMREMGenerator, Scene, Vector3, type WebGLRenderTarget } from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { setInteriors } from '../assets/materials'
import type { GameSession } from '../game/GameSession'
import { useSettings } from '../state/settings'

const SHADOW_EXTENT = 55
/** Seconds between environment-map re-bakes as the sky changes (PMREM is a few ms; the change is slow). */
const REBAKE = 3
const NIGHT_SKY = new Color('#070a10')
const fogTint = new Color()

/** Sky, sun/moon, hemisphere/environment lighting and fog, following the live day cycle and weather every frame. */
export function EnvironmentView({ session }: { session: GameSession }) {
  const { gl, scene } = useThree()
  const env = session.environment
  const p = env.preset
  const quality = useSettings((s) => s.quality)
  const shadows = useSettings((s) => s.shadows)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const target = useMemo(() => new Object3D(), [])

  // the sky dome plus a copy (sharing its material) in a scene of its own for baking reflections
  const bake = useMemo(() => {
    const sky = new Sky()
    sky.scale.setScalar(4000)
    const skyScene = new Scene()
    skyScene.add(sky.clone())
    return { sky, skyScene, pmrem: new PMREMGenerator(gl), rt: null as WebGLRenderTarget | null, timer: 0 }
  }, [gl])

  useEffect(() => {
    scene.fog = new FogExp2(p.fogColor, p.fogDensity)
    scene.background = NIGHT_SKY.clone()
    return () => {
      bake.rt?.dispose()
      bake.pmrem.dispose()
      scene.environment = null
      scene.fog = null
      scene.background = null
    }
  }, [scene, bake, p])

  useEffect(() => {
    const s = sun.current!
    s.target = target
    s.shadow.mapSize.set(quality === 'high' ? 4096 : 2048, quality === 'high' ? 4096 : 2048)
    s.shadow.map?.dispose()
    s.shadow.map = null
  }, [quality, target])

  const snapped = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    // sky shader follows the real sun; after dark it gives way to a plain night sky
    const u = bake.sky.material.uniforms
    u.turbidity.value = p.sky.turbidity
    u.rayleigh.value = p.sky.rayleigh
    u.mieCoefficient.value = p.sky.mie
    u.mieDirectionalG.value = p.sky.mieG
    u.sunPosition.value.copy(env.skySun)
    bake.sky.visible = !env.night
    ;(scene.background as Color).copy(NIGHT_SKY).lerp(fogTint.set(p.fogColor), 0.25)

    const s = sun.current!
    s.color.set(p.sunColor)
    s.intensity = p.sunIntensity
    const h = hemi.current!
    h.color.set(p.hemiSky)
    h.groundColor.set(p.hemiGround)
    h.intensity = p.hemiIntensity
    const fog = scene.fog as FogExp2
    fog.color.set(p.fogColor)
    fog.density = p.fogDensity
    gl.toneMappingExposure = p.exposure
    scene.environmentIntensity = p.envIntensity

    // re-bake reflections now and then as the sky changes
    if ((bake.timer -= dt) <= 0) {
      bake.timer = REBAKE
      const skyCopy = bake.skyScene.children[0]
      skyCopy.visible = !env.night
      bake.skyScene.background = env.night ? NIGHT_SKY : null
      const old = bake.rt
      bake.rt = bake.pmrem.fromScene(bake.skyScene, 0, 1, 5000)
      scene.environment = bake.rt.texture
      old?.dispose()
      setInteriors(session.layout.interiors, p.interiorAmbient)
    }

    // keep the shadow frustum centred on the player, snapped to texels so shadows don't shimmer
    const texel = (SHADOW_EXTENT * 2) / s.shadow.mapSize.x
    const f = session.player.feet
    snapped.set(Math.round(f.x / texel) * texel, 0, Math.round(f.z / texel) * texel)
    target.position.copy(snapped)
    s.position.copy(snapped).addScaledVector(env.sunDir, 150)
    target.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={bake.sky} />
      <hemisphereLight ref={hemi} args={[p.hemiSky, p.hemiGround, p.hemiIntensity]} />
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
