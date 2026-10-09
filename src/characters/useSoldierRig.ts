import { useEffect, useState } from 'react'
import { GltfSoldier, loadSoldier } from './GltfSoldier'
import { SoldierRig } from './SoldierRig'
import type { CharacterRig } from './types'

/** The rigged GLB soldier once it has downloaded; the procedural soldier until then (or if offline). */
export function useSoldierRig(tint: string): CharacterRig {
  const [rig, setRig] = useState<CharacterRig>(() => new SoldierRig())
  useEffect(() => {
    let live = true
    loadSoldier().then((g) => live && setRig(new GltfSoldier(g, tint))).catch(() => {})
    return () => { live = false }
  }, [tint])
  useEffect(() => () => rig.dispose(), [rig])
  return rig
}
