import type { DetectionLevel } from '../../ai/perception'
import { objectiveTarget } from '../../missions/ObjectiveManager'
import { useGameStore, type MissionResults, type ObjectiveView } from '../../state/gameStore'
import { GRENADES } from '../../weapons/GrenadeSystem'
import type { GameSession } from '../GameSession'

const RANK: Record<DetectionLevel, number> = { hidden: 0, suspicious: 1, searching: 2, detected: 3 }

/** Copies a snapshot of session state into the React store. Called at a low rate (~10 Hz). */
export function publishHud(s: GameSession, perf: { fps: number; frameMs: number; drawCalls: number; triangles: number }) {
  const { player, weapon, guards, objectives, security, environment } = s
  let awareness = 0
  let detection: DetectionLevel = 'hidden'
  const raise = (d: DetectionLevel) => {
    if (RANK[d] > RANK[detection]) detection = d
  }
  for (const g of guards) {
    if (!g.active) continue
    const st = g.data.state
    if (st === 'DEAD') continue
    awareness = Math.max(awareness, g.data.suspicion)
    if (st === 'ALERT' || st === 'COMBAT' || st === 'RETREAT' || st === 'CALL_REINFORCEMENTS') raise('detected')
    else if (st === 'SEARCH' || st === 'INVESTIGATE') raise('searching')
    else if (st === 'SUSPICIOUS' || g.data.suspicion > 0.12) raise('suspicious')
    if (st === 'FLANK') raise('detected')
  }
  if (security.cameraDetection > 0.15) raise('suspicious')
  const target = objectiveTarget(s)
  const veh = s.vehicles.driving

  const store = useGameStore.getState()
  useGameStore.setState({
    stats: { ...s.stats },
    hud: {
      health: player.health,
      stamina: player.stamina,
      ammo: weapon.ammo,
      reserve: weapon.reserve,
      magSize: weapon.def.magazineSize,
      weaponName: weapon.def.name,
      fireMode: weapon.def.action === 'auto' ? 'AUTO' : weapon.def.action === 'bolt' ? 'BOLT' : 'SEMI',
      weaponState: weapon.state,
      detection,
      awareness,
      cameraDetection: security.cameraDetection,
      alarm: security.alarmActive,
      alarmReason: security.alarmReason,
      missionName: s.def.name,
      missionState: s.mission.state,
      objectiveIndex: objectives.index,
      objectives: objectiveViews(s),
      alertLevel: s.alert.level,
      commsDown: s.alert.commsDown,
      enemiesKilled: s.guards.filter((g) => g.data.state === 'DEAD').length,
      enemiesLeft: s.guards.filter((g) => g.active && g.data.state !== 'DEAD').length,
      extraction: s.extraction.available ? { inZone: s.extraction.inZone, progress: s.extraction.progress, total: s.extraction.total } : null,
      recon: s.recon.active
        ? { zoom: s.recon.zoom, range: s.recon.range, target: s.recon.target, tagProgress: s.recon.tagProgress, tagged: s.recon.tagged.size }
        : null,
      objectiveDistance: target ? Math.hypot(target[0] - player.feet.x, target[2] - player.feet.z) : null,
      prompt: s.prompt?.text ?? null,
      promptProgress: s.prompt?.progress ?? null,
      stance: player.stance,
      lean: player.lean,
      armor: player.armor,
      equipment: { name: GRENADES[s.grenades.selected].name, count: s.grenades.counts[s.grenades.selected], counts: { ...s.grenades.counts } },
      aim: weapon.aim,
      optic: weapon.def.optics && weapon.aim > 0.5 ? `${Math.round(weapon.def.optics[weapon.zoomIndex] * 10) / 10}×` : null,
      light: environment.playerLight,
      indoors: environment.playerIndoors,
      flashlight: player.flashlight,
      keycard: s.inventory.has('sec-card'),
      restricted: security.zoneAt(player.feet)?.label ?? null,
      timeLabel: environment.preset.label,
      driving: veh ? { name: veh.def.name, speed: Math.abs(veh.speed) * 3.6 } : null,
      holdingBreath: s.holdingBreath,
      training: s.training.view(),
    },
    debugInfo: store.debug
      ? {
          ...perf,
          position: [player.feet.x, player.feet.y, player.feet.z],
          grounded: player.grounded,
          stance: player.stance,
          speed: player.speed,
          guards: guards.filter((g) => g.active).map((g) => ({ id: g.data.id, state: g.data.state, suspicion: g.data.suspicion, health: g.data.health })),
          entities: 1 + guards.filter((g) => g.active && g.data.state !== 'DEAD').length + s.vehicles.vehicles.length,
          colliders: s.physics.colliderCount,
          bullets: s.ballistics.bullets.filter((b) => b.active).length,
          particles: s.effects.soft.live + s.effects.additive.live,
          objective: objectives.current?.label ?? 'complete',
        }
      : null,
  })
}

export function objectiveViews(s: GameSession): ObjectiveView[] {
  const m = s.objectives
  const cur = m.current
  return s.def.objectives.map((o) => {
    let progress: string | null = null
    if (o.kind === 'destroy') progress = `${m.progress[o.id]}/${o.targets.length}`
    else if ((o.kind === 'hack' || o.kind === 'disable') && m.progress[o.id] > 0 && m.status[o.id] !== 'done') progress = `${Math.round(m.progress[o.id] * 100)}%`
    return { id: o.id, label: o.label, optional: !!o.optional, status: m.status[o.id], current: o === cur, progress }
  })
}

/** Debrief snapshot. */
export function buildResults(s: GameSession): MissionResults {
  // every terminal download counts as intelligence
  const intelIds = s.def.objectives.filter((o) => o.kind === 'hack').map((o) => o.id)
  return {
    success: s.mission.state === 'SUCCESS',
    missionName: s.def.name,
    objectives: objectiveViews(s),
    detection: s.alert.detection,
    alarm: s.stats.alarms > 0,
    maxAlert: s.alert.tracker.maxLevel,
    kills: s.stats.kills,
    time: s.stats.time,
    intel: { collected: intelIds.filter((id) => s.objectives.status[id] === 'done').length, total: intelIds.length },
    accuracy: s.stats.shots ? s.stats.hits / s.stats.shots : null,
    headshots: s.stats.headshots,
    cause: s.player.deathCause,
  }
}
