import { useEffect, useState } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { GltfSoldier, loadSoldier, TINT, type SoldierLook } from './GltfSoldier'
import { SoldierRig } from './SoldierRig'
import type { CharacterRig } from './types'

/** The rigged GLB soldier once it has downloaded; the procedural soldier until then (or if offline). */
export function useSoldierRig(look: SoldierLook, load: () => Promise<GLTF> = loadSoldier): CharacterRig {
  const [rig, setRig] = useState<CharacterRig>(() => new SoldierRig(look.tint === TINT.ally ? TINT.ally : undefined))
  const key = JSON.stringify(look)
  useEffect(() => {
    let live = true
    load().then((g) => live && setRig(new GltfSoldier(g, JSON.parse(key) as SoldierLook))).catch((e) => console.warn('Soldier model failed, keeping the procedural one', e))
    return () => { live = false }
  }, [key, load])
  useEffect(() => () => rig.dispose(), [rig])
  return rig
}
