import { Vector3 } from 'three'
import { calmState, orderInvestigate, orderSearch } from '../ai/guardBrain'
import type { GameSession } from '../game/GameSession'
import type { WorldEventDef } from '../world/WorldEventSystem'

const CONTROL_HOUSE = new Vector3(38, 0, -40)
const GENERATOR_SHED = new Vector3(56, 0, -20)
/** Seconds from the dam siren to the gates opening by hand, unless the generator dies first. */
const MANUAL_OPEN = 180
const calm = (s: GameSession) => s.alert.level < 3
const guard = (s: GameSession, id: string) => s.guards.find((g) => g.data.id === id)
const generatorDown = (s: GameSession) => s.objectives.status.power === 'done'

/** Scripted beats for Operation Low Water: handler guidance, dam radio traffic, the ledger, the manual-opening countdown. */
export const LOW_WATER_EVENTS: WorldEventDef[] = [
  // ---- insertion
  {
    id: 'insert-1', when: (s) => s.mission.state === 'INSERTION' && s.mission.stateTime > 1.5,
    run: (s) => s.radio.say('handler', 'CANOPY', 'WREN, CANOPY. Water\'s cold and fast. The crest lights sweep the river, so stay low in the channel until they pass.'),
  },
  {
    id: 'insert-2', when: (s) => s.time > 12 && s.objectives.status.reach !== 'done',
    run: (s) => s.radio.say('handler', 'CANOPY', 'The fence is broken where it meets the river, west side of the works. The road gate has a camera and a tower on it.'),
  },
  {
    id: 'inside', when: (s) => s.objectives.status.reach === 'done',
    run: (s) => s.radio.say('handler', 'CANOPY', 'You\'re in. The control house sits right under the dam wall, east of the spillway.'),
  },

  // ---- routine life at the dam
  {
    id: 'gate-test', when: (s) => s.time > 40 && calm(s),
    run: (s) => {
      s.radio.say('enemy', 'Control', 'Sluice crew, the general wants the gates tested at oh-four-hundred. Full open on his word.')
      s.radio.say('enemy', 'Sluice one', 'Copy. Program is loaded and waiting.')
    },
  },
  {
    id: 'radio-check', when: (s) => s.time > 120 && s.alert.level === 0, repeat: 150,
    run: (s) => s.radio.say('enemy', 'Control', 'Crest, Control. Radio check. Keep those lights on the water.'),
  },
  {
    // the west crest light swings down onto the river channel
    id: 'light-river', when: (s) => s.time > 150 && calm(s),
    run: (s) => {
      const l = s.security.searchlights.find((x) => x.def.id === 'sl-crest-west')
      if (!l?.on) return
      l.yaw = Math.PI + 0.05
      s.radio.say('enemy', 'Control', 'West crest, put your light on the river. Fisherman reported movement in the reeds.')
    },
  },
  {
    // the engineer walks over to the jetty for a smoke
    id: 'engineer-walk', when: (s) => s.time > 200 && calm(s),
    run: (s) => {
      const g = guard(s, 'engineer')
      if (!g || g.data.state === 'DEAD') return
      g.data.patrol = [new Vector3(-24, 0, 26), new Vector3(-32, 0, -22)]
      g.data.patrolIndex = 0
    },
  },

  // ---- objectives drive the story
  {
    id: 'ledger', when: (s) => s.inventory.has('eng-ledger'),
    run: (s) => {
      s.radio.say('handler', 'CANOPY', 'Read me the last page, WREN.')
      s.schedule(6, () => s.radio.say('handler', 'CANOPY', '...Those are our own cipher groups. Keep that ledger on you. Show it to nobody but Eva.'))
    },
  },
  {
    id: 'sluice', when: (s) => s.objectives.status.sluice === 'done',
    run: (s) => {
      s.radio.say('handler', 'CANOPY', 'Program\'s locked. They\'ll try the backup generator to force it. Shed is east of the switchyard. Kill it.')
      s.schedule(14, () => {
        if (generatorDown(s)) return
        s.radio.say('enemy', 'Control', 'Control house, why are the gate readouts frozen? Get someone in there.')
        let sent = 0
        for (const g of s.squads.squads.find((q) => q.id === 'control')?.alive ?? []) {
          if (sent < 2 && calmState(g.data.state) && !g.data.stationary && orderInvestigate(g.data, CONTROL_HOUSE)) sent++
        }
        s.alert.tracker.observe(1, s.time)
      })
    },
  },
  {
    id: 'power', when: (s) => generatorDown(s),
    run: (s) => {
      s.radio.say('enemy', 'Sluice one', 'Control, the backup set just died. Gates won\'t answer. Nothing answers!')
      if (s.security.alarmActive) s.alert.lockdown()
      s.schedule(8, () => {
        for (const g of s.squads.squads.find((q) => q.id === 'power')?.alive ?? []) orderSearch(g.data, GENERATOR_SHED, s.aiWorld!)
        s.alert.tracker.observe(2, s.time)
      })
    },
  },

  // ---- the siren starts a manual opening: kill the generator before the gates move
  {
    id: 'manual-open', when: (s) => s.security.alarmActive && !generatorDown(s),
    run: (s) => {
      s.radio.say('enemy', 'Control', 'Intruders on the dam! Open the gates now. Manual, on the backup set!')
      s.radio.say('handler', 'CANOPY', 'They\'re forcing the gates by hand. You have three minutes. That generator has to die.')
      for (const left of [MANUAL_OPEN, 120, 60, 30, 10]) {
        s.schedule(MANUAL_OPEN - left, () => !generatorDown(s) && !s.mission.over && s.notify(`MANUAL OPENING — ${left} s: sabotage the backup generator`, 'warn'))
      }
      s.schedule(MANUAL_OPEN, () => {
        if (generatorDown(s) || s.mission.over) return
        s.radio.say('handler', 'CANOPY', 'The gates are moving... WREN, the valley\'s going under.')
        s.fail('The sluices opened — the valley flooded')
      })
    },
  },
]
