import { useEffect, useState } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { GltfSoldier, loadSoldier, type SoldierLook } from './GltfSoldier'
import { SoldierRig } from './SoldierRig'
import type { CharacterRig } from './types'

/** The rigged GLB soldier once it has downloaded; the procedural soldier until then (or if offline). */
export function useSoldierRig(look: SoldierLook, load: () => Promise<GLTF> = loadSoldier): CharacterRig {
  const [rig, setRig] = useState<CharacterRig>(() => new SoldierRig())
  const key = JSON.stringify(look)
  useEffect(() => {
    let live = true
    load().then((g) => live && setRig(new GltfSoldier(g, JSON.parse(key) as SoldierLook))).catch(() => {})
    return () => { live = false }
  }, [key, load])
  useEffect(() => () => rig.dispose(), [rig])
  return rig
}
