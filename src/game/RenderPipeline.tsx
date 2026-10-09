import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { Pass } from 'three/addons/postprocessing/Pass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { useSettings } from '../state/settings'
import type { GameSession } from './GameSession'

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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSaturation, uContrast, uVignette, uGrain, uHurt;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation * (1.0 - uHurt * 0.7));
      c += vec3(-0.008, 0.0, 0.014) * (1.0 - l) + vec3(0.016, 0.008, -0.012) * l;
      float v = smoothstep(0.95, 0.3, length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)) * 0.9);
      c *= mix(1.0 - uVignette - uHurt * 0.35, 1.0, v);
      c.r += uHurt * 0.06 * (1.0 - v);
      c += (hash(vUv * uResolution + fract(uTime) * 100.0) - 0.5) * uGrain;
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
    composer.addPass(new RenderPass(scene, camera))
    const ao = new GTAOPass(scene, camera, 1, 1)
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 })
    ao.blendIntensity = 0.85
    composer.addPass(ao)
    composer.addPass(new ViewModelPass(vm.scene, vm.camera))
    composer.addPass(new OutputPass())
    const grade = new ShaderPass(GradeShader)
    composer.addPass(grade)
    return { composer, ao, grade }
  }, [gl, scene, camera, vm])

  useEffect(() => {
    pipe.composer.setPixelRatio(gl.getPixelRatio())
    pipe.composer.setSize(size.width, size.height)
    pipe.grade.uniforms.uResolution.value.set(size.width, size.height)
  }, [pipe, gl, size])
  useEffect(() => () => pipe.composer.dispose(), [pipe])

  useFrame((state, delta) => {
    pipe.ao.enabled = quality === 'high' && post
    pipe.grade.enabled = post
    const u = pipe.grade.uniforms
    u.uTime.value = state.clock.elapsedTime
    const hp = session.player.health / 100
    u.uHurt.value = hp < 0.35 ? (0.35 - hp) / 0.35 : 0
    pipe.composer.render(delta)
  }, 1)

  return null
}
