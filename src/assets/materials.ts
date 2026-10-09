import { Color, DoubleSide, MeshStandardMaterial, Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import type { MaterialKey, Surface } from '../world/types'
import { getTextures, type TextureKey } from './textures'

export interface MaterialSpec {
  tex?: TextureKey
  /** Metres covered by one texture tile. */
  scale: number
  /** Default vertex tint; per-box `color` overrides. */
  color: number
  roughness?: number
  metalness?: number
  surface: Surface
  /** Bullets pass through cheaply (see combat/surfaces). */
  transparent?: boolean
}

/** Data table: every world material, its texture set, physical response and surface category. */
export const MATERIALS: Record<MaterialKey, MaterialSpec> = {
  ground: { tex: 'ground', scale: 7, color: 0xffffff, surface: 'grass' },
  dirt: { tex: 'dirt', scale: 5, color: 0xffffff, surface: 'dirt' },
  asphalt: { tex: 'asphalt', scale: 5, color: 0xffffff, surface: 'asphalt' },
  concrete: { tex: 'concrete', scale: 3, color: 0xffffff, surface: 'concrete' },
  concreteDark: { tex: 'concreteDark', scale: 3, color: 0xffffff, surface: 'concrete' },
  plaster: { tex: 'plaster', scale: 3, color: 0xb8b49e, surface: 'concrete' },
  blocks: { tex: 'blocks', scale: 3.2, color: 0xffffff, surface: 'concrete' },
  roof: { tex: 'roof', scale: 3, color: 0x6b6a62, metalness: 0.5, surface: 'metal' },
  corrugated: { tex: 'corrugated', scale: 3, color: 0x8a8d84, metalness: 0.55, surface: 'metal' },
  wood: { tex: 'wood', scale: 2, color: 0xffffff, surface: 'wood' },
  crate: { tex: 'wood', scale: 1.2, color: 0xd8c8a0, surface: 'wood' },
  container: { tex: 'container', scale: 2.6, color: 0x5c6b2f, metalness: 0.45, surface: 'metal' },
  metal: { tex: 'metal', scale: 1.5, color: 0x55585a, metalness: 0.7, surface: 'metal' },
  paintedMetal: { tex: 'paintedMetal', scale: 2, color: 0x4f5a3c, metalness: 0.35, surface: 'metal' },
  rust: { tex: 'rust', scale: 1.5, color: 0xffffff, metalness: 0.3, surface: 'metal' },
  fence: { tex: 'fence', scale: 1.6, color: 0xffffff, metalness: 0.8, surface: 'metal', transparent: true },
  glass: { scale: 1, color: 0x8a9ea6, roughness: 0.05, metalness: 0.1, surface: 'glass', transparent: true },
  sandbag: { tex: 'sandbag', scale: 1.2, color: 0xffffff, surface: 'fabric' },
  canvas: { tex: 'canvas', scale: 2, color: 0xffffff, surface: 'fabric' },
  rock: { tex: 'rock', scale: 3, color: 0xffffff, surface: 'concrete' },
  rubber: { scale: 1, color: 0x1c1c1c, roughness: 0.9, surface: 'vehicle' },
  foliage: { scale: 1, color: 0x3d4a2a, roughness: 1, surface: 'foliage', transparent: true },
  invisible: { scale: 1, color: 0, surface: 'concrete' },
}

// ---- interior lighting patch ---------------------------------------------------------------------

const MAX_INTERIORS = 16

/**
 * Shared uniforms for the indoor-darkening patch: inside an interior volume, indirect (sky/hemisphere/environment)
 * light is scaled down so rooms read darker than the yard. Direct sunlight still enters through doors and windows via
 * the shadow map, so window light falls in naturally.
 */
export const INTERIOR = {
  uInteriorMin: { value: Array.from({ length: MAX_INTERIORS }, () => new Vector3(1e5, 1e5, 1e5)) },
  uInteriorMax: { value: Array.from({ length: MAX_INTERIORS }, () => new Vector3(-1e5, -1e5, -1e5)) },
  uInteriorCount: { value: 0 },
  uInteriorAmbient: { value: 0.28 },
}

export function setInteriors(list: { min: readonly number[]; max: readonly number[] }[], ambient: number) {
  list.slice(0, MAX_INTERIORS).forEach((v, i) => {
    INTERIOR.uInteriorMin.value[i].set(v.min[0], v.min[1], v.min[2])
    INTERIOR.uInteriorMax.value[i].set(v.max[0], v.max[1], v.max[2])
  })
  INTERIOR.uInteriorCount.value = Math.min(MAX_INTERIORS, list.length)
  INTERIOR.uInteriorAmbient.value = ambient
}

const VERT_DECL = 'varying vec3 vInteriorPos;\n'
const VERT_BODY = `
  vec4 _iw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _iw = instanceMatrix * _iw;
  #endif
  vInteriorPos = (modelMatrix * _iw).xyz;
`
const FRAG_DECL = `
varying vec3 vInteriorPos;
uniform vec3 uInteriorMin[${MAX_INTERIORS}];
uniform vec3 uInteriorMax[${MAX_INTERIORS}];
uniform int uInteriorCount;
uniform float uInteriorAmbient;
float interiorFactor(vec3 p) {
  float f = 0.0;
  for (int i = 0; i < ${MAX_INTERIORS}; i++) {
    if (i >= uInteriorCount) break;
    vec3 d = min(p - uInteriorMin[i], uInteriorMax[i] - p);
    f = max(f, smoothstep(-0.12, 0.3, min(min(d.x, d.y), d.z)));
  }
  return f;
}
`
const FRAG_BODY = `
  {
    float _k = mix(1.0, uInteriorAmbient, interiorFactor(vInteriorPos));
    reflectedLight.indirectDiffuse *= _k;
    reflectedLight.indirectSpecular *= _k;
  }
`

/** Adds the interior-darkening patch to a lit material. Chains with any existing onBeforeCompile. */
export function patchInterior<M extends Material>(m: M, extra?: (s: WebGLProgramParametersWithUniforms) => void): M {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, INTERIOR)
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + VERT_BODY)
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>' + FRAG_BODY)
    extra?.(shader)
  }
  const key = m.customProgramCacheKey()
  m.customProgramCacheKey = () => key + '|interior' + (extra ? '+x' : '')
  return m
}

// ---- material cache ------------------------------------------------------------------------------

let cache: Record<MaterialKey, MeshStandardMaterial> | null = null

/** Shared world materials (created lazily — needs a DOM for canvas textures). Base colour is white; tint comes from vertex colours. */
export function getMaterials() {
  if (cache) return cache
  const out = {} as Record<MaterialKey, MeshStandardMaterial>
  for (const key of Object.keys(MATERIALS) as MaterialKey[]) {
    const spec = MATERIALS[key]
    const t = spec.tex ? getTextures(spec.tex) : null
    const m = new MeshStandardMaterial({
      vertexColors: true,
      roughness: spec.roughness ?? 1,
      metalness: spec.metalness ?? 0,
      ...(t && { map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, aoMap: t.aoMap, aoMapIntensity: 0.8 }),
    })
    if (key === 'fence') {
      m.alphaMap = t!.map
      m.alphaTest = 0.25
      m.side = DoubleSide
    }
    if (key === 'glass') {
      m.transparent = true
      m.opacity = 0.35
      m.depthWrite = false
    }
    if (key === 'foliage') m.side = DoubleSide
    if (key === 'invisible') m.visible = false
    out[key] = patchInterior(m)
  }
  return (cache = out)
}

/** A one-off lit material (characters, props) that also respects interior darkening. */
export function litMaterial(params: ConstructorParameters<typeof MeshStandardMaterial>[0]) {
  return patchInterior(new MeshStandardMaterial(params))
}

export const tint = (hex: number, jitter = 0, seed = Math.random()) => new Color(hex).offsetHSL(0, 0, (seed - 0.5) * jitter)
