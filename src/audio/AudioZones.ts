import type { Vector3 } from 'three'
import type { AudioZoneDef } from '../world/types'
import { audio, type LoopHandle } from './AudioSystem'

/** Base gains the loop recipes use, so a zone's `level` is relative to the recipe's normal loudness. */
const BASE = { hum: 0.18, generator: 0.4, radio: 0.12 }
const POLL = 0.25

/**
 * AudioZones: room tone per area. Each zone owns non-positional loops that fade in while the player is inside it,
 * and ducks the outdoor bed (wind, insects). Positional sources (generators, transformers) stay in AudioSystem.
 * Extension point: per-zone reverb sends for echoey interiors.
 */
export class AudioZones {
  private loops: { zone: AudioZoneDef; handle: LoopHandle; level: number; base: number }[] = []
  private current: AudioZoneDef | null = null
  private timer = 0
  zoneId: string | null = null

  constructor(private readonly zones: AudioZoneDef[]) {
    for (const zone of zones) {
      for (const l of zone.loops) {
        const handle = audio.loop(l.kind, null, 0)
        if (handle) this.loops.push({ zone, handle, level: l.level, base: BASE[l.kind] })
      }
    }
  }

  update(dt: number, p: Vector3) {
    if ((this.timer -= dt) > 0) return
    this.timer = POLL
    const zone = this.zones.find((z) => p.x > z.rect[0] && p.x < z.rect[2] && p.z > z.rect[1] && p.z < z.rect[3]) ?? null
    if (zone === this.current) return
    this.current = zone
    this.zoneId = zone?.id ?? null
    for (const l of this.loops) l.handle.set('level', l.zone === zone ? l.base * l.level : 0)
    audio.setBedLevel(zone ? zone.outdoor : 1)
  }
}
