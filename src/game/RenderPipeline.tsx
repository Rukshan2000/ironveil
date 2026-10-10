import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { FogExp2, HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Pass } from 'three/addons/postprocessing/Pass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { useSettings } from '../state/settings'
import type { GameSession } from './GameSession'
import { useGameStore } from '../state/gameStore'
import { storyRender } from './storyTimeline'
import { briefingRoom } from './BriefingRoom'

/** Draws the first-person weapon scene over the world after clearing depth, so it never clips into walls. */
class ViewModelPass extends Pass {
  constructor(private readonly scene: Scene, private readonly camera: Camera) {
    super()
    this.needsSwap = false
  }
  render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget) {
    const auto = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(this.renderToScreen ? null : read)
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = auto
  }
}

/** Display-referred grade: gentle contrast, muted saturation, split toning, vignette, film grain, damage desaturation. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uSaturation: { value: 0.88 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.025 },
    uHurt: { value: 0 },
    uNV: { value: 0 },
    uNVGain: { value: 6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSaturation, uContrast, uVignette, uGrain, uHurt, uNV, uNVGain;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 raw = texture2D(tDiffuse, vUv).rgb;
      vec3 c = raw;
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation * (1.0 - uHurt * 0.7));
      c += vec3(-0.008, 0.0, 0.014) * (1.0 - l) + vec3(0.016, 0.008, -0.012) * l;
      float v = smoothstep(0.95, 0.3, length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)) * 0.9);
      c *= mix(1.0 - uVignette - uHurt * 0.35, 1.0, v);
      c.r += uHurt * 0.06 * (1.0 - v);
      c += (hash(vUv * uResolution + fract(uTime) * 100.0) - 0.5) * uGrain;
      // night vision: amplify the light (exposure is already raised in the scene; this curve lifts the deep shadows
      // without blowing out lamps), phosphor green, light tube noise, faint scanlines and the round goggle edge.
      // Taken from the ungraded image so contrast and vignette don't crush the dark first.
      if (uNV > 0.0) {
        float lum = dot(raw, vec3(0.2126, 0.7152, 0.0722));
        float amp = 1.0 - exp(-pow(lum, 0.6) * uNVGain) + 0.04;
        float noise = (hash(vUv * uResolution * 0.5 + fract(uTime * 13.0) * 371.0) - 0.5) * mix(0.1, 0.04, amp);
        float scan = 0.96 + 0.04 * sin(vUv.y * uResolution.y * 1.4);
        vec3 nv = vec3(0.36, 1.0, 0.46) * clamp(amp + noise, 0.0, 1.1) * scan;
        float tube = smoothstep(0.66, 0.5, length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)));
        c = mix(c, nv * tube, uNV);
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
}

export interface ViewModelTarget {
  scene: Scene
  camera: Camera
}

/** Owns the frame's final render (useFrame priority 1). */
export function RenderPipeline({ session, vm }: { session: GameSession; vm: ViewModelTarget }) {
  const { gl, scene, camera, size } = useThree()
  const quality = useSettings((s) => s.quality)
  const post = useSettings((s) => s.postProcessing)

  const pipe = useMemo(() => {
    gl.info.autoReset = false
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
    const composer = new EffectComposer(gl, target)
    const main = new RenderPass(scene, camera)
    composer.addPass(main)
    const ao = new GTAOPass(scene, camera, 1, 1)
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 })
    ao.blendIntensity = 0.85
    composer.addPass(ao)
    composer.addPass(new ViewModelPass(vm.scene, vm.camera))
    composer.addPass(new OutputPass())
    const grade = new ShaderPass(GradeShader)
    composer.addPass(grade)
    return { composer, ao, grade, main }
  }, [gl, scene, camera, vm])

  useEffect(() => {
    pipe.composer.setPixelRatio(gl.getPixelRatio())
    pipe.composer.setSize(size.width, size.height)
    pipe.grade.uniforms.uResolution.value.set(size.width, size.height)
  }, [pipe, gl, size])
  useEffect(() => () => pipe.composer.dispose(), [pipe])

  useFrame((state, delta) => {
    // EVA's briefing room is its own scene; swap it in while the briefing plays
    const office = briefingRoom.active
    // the story film's stage (its own scene, like the office) replaces the world while a stage shot is on
    const stage = storyRender.scene
    pipe.main.scene = stage ?? (office ? briefingRoom.scene : scene)
    if (office || stage) gl.toneMappingExposure = 1
    // the story film's wide shots and the helicopter escape look across the whole valley: thin the haze (reset by the
    // environment each frame)
    else if ((useGameStore.getState().phase === 'story' || session.escape) && scene.fog instanceof FogExp2) scene.fog.density *= 0.35
    pipe.ao.enabled = quality === 'high' && post && !office && !stage
    const nv = session.player.nvBlend
    // goggles amplify real light and see through the dark haze, with auto-gain: full boost at night, little at dusk
    // (the environment resets exposure and fog every frame)
    const dark = Math.min(1, Math.max(0, (0.4 - session.environment.preset.ambientVisibility) / 0.28))
    if (!office && nv > 0) {
      gl.toneMappingExposure *= 1 + nv * 3 * dark
      if (scene.fog instanceof FogExp2) scene.fog.density *= 1 - nv * 0.5 * dark
    }
    pipe.grade.enabled = post || nv > 0.01 // night vision lives in the grade pass
    const u = pipe.grade.uniforms
    u.uNV.value = nv
    u.uNVGain.value = 2.5 + 3.5 * dark
    u.uTime.value = state.clock.elapsedTime
    const hp = session.player.health / 100
    u.uHurt.value = hp < 0.35 ? (0.35 - hp) / 0.35 : 0
    pipe.composer.render(delta)
  }, 1)

  return null
}
