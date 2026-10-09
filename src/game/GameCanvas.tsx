import { Canvas } from '@react-three/fiber'
import { Fragment, useMemo } from 'react'
import { AgXToneMapping, PerspectiveCamera, Scene } from 'three'
import { EffectsView } from '../effects/EffectsView'
import { HelicopterView } from '../extraction/HelicopterView'
import { GuardsView } from '../enemies/GuardsView'
import { WeaponView } from '../weapons/WeaponView'
import { WorldView } from '../world/WorldView'
import { ComputersView } from '../world/ComputersView'
import { RainView } from '../world/RainView'
import { FlashlightView } from '../player/FlashlightView'
import { SecurityView } from '../security/SecurityView'
import { ParkedVehicles, VehicleView } from '../vehicles/VehicleView'
import { useGameStore } from '../state/gameStore'
import { useSettings } from '../state/settings'
import { GrenadeView } from '../weapons/GrenadeView'
import { GameLoop } from './GameLoop'
import { IntroCinematic } from './IntroCinematic'
import { RemotePlayerView } from '../net/RemotePlayerView'
import { input } from './input'
import { RenderPipeline } from './RenderPipeline'
import type { GameSession } from './GameSession'

export function GameCanvas({ session }: { session: GameSession }) {
  const scale = useSettings((s) => s.resolutionScale)
  const vm = useMemo(() => ({ scene: new Scene(), camera: new PerspectiveCamera(55, 1, 0.01, 10) }), [])
  return (
    <Canvas
      shadows="percentage"
      dpr={Math.min(window.devicePixelRatio || 1, 1.5) * scale}
      camera={{ fov: 72, near: 0.05, far: 1500 }}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: AgXToneMapping }}
      className="!fixed inset-0"
      onCreated={(state) => {
        // dev-only handle for automated screenshots / console debugging
        if (import.meta.env.DEV) Object.assign(window, { __r3f: state, __vm: vm, __input: input, __store: useGameStore })
      }}
    >
      {/* keyed so a restart remounts everything against the new session */}
      <Fragment key={session.id}>
        <GameLoop session={session} />
        <IntroCinematic session={session} vm={vm} />
        <WorldView session={session} />
        <ComputersView session={session} />
        <RainView session={session} />
        <FlashlightView session={session} />
        <GuardsView session={session} />
        <RemotePlayerView session={session} />
        <SecurityView session={session} />
        <VehicleView session={session} />
        <ParkedVehicles session={session} />
        <HelicopterView session={session} />
        <EffectsView session={session} />
        <GrenadeView session={session} />
        <WeaponView session={session} vm={vm} />
        <RenderPipeline session={session} vm={vm} />
      </Fragment>
    </Canvas>
  )
}
