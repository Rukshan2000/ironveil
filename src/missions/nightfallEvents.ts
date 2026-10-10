import { Vector3 } from 'three'
import { calmState, orderInvestigate, orderSearch } from '../ai/guardBrain'
import type { GameSession } from '../game/GameSession'
import type { WorldEventDef } from '../world/WorldEventSystem'

const POWER_STATION = new Vector3(61, 0, -46)
const COMMS_BUILDING = new Vector3(40.5, 0, -50)
const calm = (s: GameSession) => s.alert.level < 3
const guard = (s: GameSession, id: string) => s.guards.find((g) => g.data.id === id)

/** Scripted beats for Operation Nightfall: handler guidance, enemy radio traffic, vehicles, patrol changes, escalation. */
export const NIGHTFALL_EVENTS: WorldEventDef[] = [
  // ---- insertion
  {
    id: 'insert-1', when: (s) => s.mission.state === 'INSERTION' && s.mission.stateTime > 1.5,
    run: (s) => s.radio.say('handler', 'CANOPY', 'WREN, CANOPY. You\'re on the ground two hundred metres south of the station. Glass the gate before you move — binoculars on B, map on M.'),
  },
  {
    id: 'insert-2', when: (s) => s.time > 11 && s.objectives.status.reach !== 'done',
    run: (s) => s.radio.say('handler', 'CANOPY', 'Main gate is the obvious way in. The west ditch and the utility tunnel on the east side are not. Your call.'),
  },
  {
    id: 'perimeter', when: (s) => s.objectives.status.reach === 'done',
    run: (s) => s.radio.say('handler', 'CANOPY', 'You\'re inside the wire. The comms building sits in the walled compound to the north-east.'),
  },

  // ---- routine life on the base
  {
    id: 'supply-call', when: (s) => s.time > 35 && calm(s),
    run: (s) => {
      s.radio.say('enemy', 'Control', 'Gate, Control. Supply truck inbound in a few minutes. Let it through.')
      s.radio.say('enemy', 'Gate one', 'Copy, Control.')
    },
  },
  {
    id: 'supply-truck', when: (s) => s.time > 80 && calm(s),
    run: (s) => {
      if (!s.vehicles.drive('supply-truck', 'supply', () => s.radio.say('enemy', 'Motor one', 'Supply truck is in at the motor pool.'), 7)) return
      s.radio.say('enemy', 'Gate one', 'Supply truck at the gate. Waving it through.')
    },
  },
  {
    id: 'radio-check', when: (s) => s.time > 120 && s.alert.level === 0, repeat: 150,
    run: (s) => s.radio.say('enemy', 'Control', 'All stations, Control. Radio check. Remain alert.'),
  },
  {
    // shift change: the outer patrol moves inside the fence
    id: 'shift-change', when: (s) => s.time > 160 && calm(s),
    run: (s) => {
      const g = guard(s, 'outer-patrol')
      if (!g || g.data.state === 'DEAD') return
      g.data.patrol = [new Vector3(-14, 0, 40), new Vector3(-58, 0, 40), new Vector3(-58, 0, -14), new Vector3(-40, 0, -12)]
      g.data.patrolIndex = 0
      s.radio.say('enemy', 'Control', 'Gate four, switch to the inner fence route. Check the west perimeter on your way.')
    },
  },
  {
    // the south tower turns its light onto the western approach
    id: 'searchlight-west', when: (s) => s.time > 220 && calm(s),
    run: (s) => {
      const l = s.security.searchlights.find((x) => x.def.id === 'sl-south')
      if (!l?.on) return
      l.yaw = 2.3
      s.radio.say('enemy', 'Control', 'South tower, swing your light onto the western approach. Movement reported out there last night.')
    },
  },

  // ---- objectives drive the story
  {
    id: 'keycard', when: (s) => s.inventory.has('sec-card'),
    run: (s) => s.radio.say('handler', 'CANOPY', 'That card opens the compound gates. It won\'t help if they lock the place down.'),
  },
  {
    id: 'download', when: (s) => s.objectives.status.download === 'done',
    run: (s) => {
      s.radio.say('handler', 'CANOPY', 'Logs are coming through clean. Now kill the uplink — power station on the east fence line.')
      // the terminal access is noticed: someone comes to look
      s.schedule(12, () => {
        if (s.alert.commsDown) return
        s.radio.say('enemy', 'Control', 'Compound, Control. Somebody has been on the comms terminal. Get eyes on the comms building.')
        let sent = 0
        for (const g of s.squads.squads.find((q) => q.id === 'compound')?.alive ?? []) {
          if (sent < 2 && calmState(g.data.state) && !g.data.stationary && orderInvestigate(g.data, COMMS_BUILDING)) sent++
        }
        s.alert.tracker.observe(1, s.time)
      })
    },
  },
  {
    id: 'uplink', when: (s) => s.objectives.status.uplink === 'done',
    run: (s) => {
      s.alert.commsDown = true
      s.radio.say('enemy', 'Utility one', 'Control, the uplink just dropped! Control? Control, do you copy?')
      s.radio.say('handler', 'CANOPY', 'They\'re deaf. Their squads are down to local radios — but they will come looking.')
      if (s.security.alarmActive) s.alert.lockdown()
      // escalation: a search team heads for the power station
      s.schedule(9, () => {
        for (const g of s.squads.squads.find((q) => q.id === 'power')?.alive ?? []) orderSearch(g.data, POWER_STATION, s.aiWorld!)
        s.alert.tracker.observe(2, s.time)
      })
    },
  },
]
