import { BUDDY_NAME } from '../ai/BuddyBot'
import type { Brief } from '../game/BriefingRoom'
import type { Plan } from '../game/IntroCinematic'
import type { Shot } from '../game/storyTimeline'
import { bindingLabel } from '../state/settings'
import { useGameStore } from '../state/gameStore'

/** Operation Low Water's story: the film before the mission, EVA's briefing and the insertion plan. */

const solo = () => useGameStore.getState().buddyActive
const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

/** The story film (ids prefixed `lw-`; `stage` reuses a set the Nightfall film built). */
export const LOW_WATER_SHOTS: Shot[] = [
  {
    id: 'lw-valley', dur: 9, where: 'world',
    text: () => 'The Halvard Valley, two nights later. Rain on the river. It is running higher than it has in years.',
    cam: (lt, ground) => {
      const k = ease(lt / 9)
      return { pos: ground(-10 + k * 10, 220 - k * 80, 55 - k * 20), look: ground(0, -50, 10) }
    },
  },
  {
    id: 'lw-eva', dur: 8, where: 'office', stage: 'eva', topic: 'flood',
    text: () => 'Eva finally cracks the stolen orders. DAWN is not an attack. It is a flood.',
  },
  {
    id: 'lw-dam', dur: 10, where: 'world',
    text: () => "Tessaly Dam, held by Drask's 4th Engineers. At first light every sluice opens, and the valley goes under.",
    cam: (lt, ground) => {
      const a = -0.55 + lt * 0.06
      return { pos: ground(Math.sin(a) * 75, -50 + Math.cos(a) * 75, 24 - lt * 0.5), look: ground(0, -54, 8) }
    },
  },
  {
    id: 'lw-army', dur: 9, where: 'stage', stage: 'army',
    text: () => 'When the water drops, his tanks drive across the riverbed. No bridges left, and no defences to stop them.',
    card: { name: () => 'GEN. IVO DRASK', role: () => 'VARN DIRECTORATE · THE ENEMY', color: '#c9503e', at: 1.5 },
  },
  {
    id: 'lw-leak', dur: 9, where: 'office', stage: 'eva', topic: 'leak',
    text: () => 'Something else keeps Eva up at night. Those gunships knew exactly where your helicopter would land. Somebody told them.',
  },
  {
    id: 'lw-team', dur: 9, where: 'stage', stage: 'partner',
    text: () => `So nobody gets a flight plan this time. Wren and ${solo() ? BUDDY_NAME : 'your partner'} go in by the river, in the dark.`,
    card: { name: () => (solo() ? `WREN + ${BUDDY_NAME.toUpperCase()}` : 'WREN + PARTNER'), role: () => 'IN BY THE RIVER · NO FLIGHT PLAN', color: '#a9bf8e', at: 1.2 },
  },
  {
    id: 'lw-canopy', dur: 7, where: 'stage', stage: 'canopy',
    text: () => 'Only Canopy knows the route.',
    card: { name: () => 'CANOPY', role: () => 'YOUR HANDLER · TRUSTED?', color: '#7fb6d6', at: 0.8 },
  },
  {
    id: 'lw-mission', dur: 9, where: 'world',
    text: () => 'Get into the control house. Lock the sluices. Find out who sold the landing zone. Get out before the sun comes up.',
    cam: (lt, ground) => ({ pos: ground(-12 + lt * 0.3, 92 - lt * 5, 5), look: ground(-6, 6 - lt * 3, 3), fov: 50 }),
  },
  {
    id: 'lw-title', dur: 5, where: 'title',
    text: () => 'Operation Low Water.',
    cam: (lt, ground) => {
      const a = -0.5 + lt * 0.05
      return { pos: ground(Math.sin(a) * 150, -20 + Math.cos(a) * 150, 80), look: ground(0, -45, 5) }
    },
  },
]

/** EVA's briefing in the office before deploying. */
export const LOW_WATER_BRIEF: Brief = {
  lines: [
    { from: 1.5, to: 7.0, topic: 'logo', shot: 'wide', text: 'Wren. Welcome back. Sit down. The orders you brought out of Halvard Ridge are decoded.' },
    { from: 7.4, to: 13.4, topic: 'flood', shot: 'close', text: 'DAWN was never a border crossing. At first light Drask opens every sluice on the Tessaly Dam at once.' },
    { from: 13.8, to: 20.4, topic: 'overview', shot: 'screen', gesture: true, text: 'The flood takes our river line, the bridges and every farm below. When the water drops, his tanks cross the riverbed.' },
    { from: 20.8, to: 27.0, topic: 'entry', shot: 'screen', gesture: true, text: 'Go in up the river. The fence is broken where it meets the water. The crest lights sweep the channel, so stay low.' },
    { from: 27.4, to: 34.6, topic: 'sluice', shot: 'screen', gesture: true, text: 'Lock the sluice program in the control house at the foot of the dam. Then kill the backup generator, or they will force the gates by hand.' },
    { from: 35.0, to: 43.0, topic: 'leak', shot: 'close', text: 'And Wren, those gunships knew where your helicopter would land. Somebody told them. The engineer on the west bank keeps a radio ledger. Bring it to me.' },
    { from: 43.4, to: 49.6, topic: 'extract', shot: 'close', text: 'A boat will wait at the west-bank jetty. No flight plan this time. Only Canopy knows the route. Good luck.' },
  ],
  topics: {
    logo: { title: 'OPERATION LOW WATER', lines: ['Mission briefing — eyes only', 'Operative: WREN · Handler: CANOPY'], at: [] },
    flood: { title: 'DAWN = FLOOD', lines: ['Every sluice opens at first light', 'River line and bridges lost', 'Armour crosses the dry bed'], at: [[0, -54]] },
    overview: { title: 'TESSALY DAM', lines: ['4th Engineers · 14 guards', 'Two marksmen on the crest', 'Searchlights on the river'], at: [[0, -54], [-24, -53], [24, -53]] },
    entry: { title: '1 · GET INSIDE', lines: ['A — River channel (quiet, wet)', 'B — West bank, footbridge', 'C — Road gate (fast, watched)'], at: [[10, -10], [-4, 2], [30, 36]] },
    sluice: { title: '2 · LOCK THE SLUICES', lines: ['Gate controller — control house', 'Hold to overwrite (10 s)', '3 · Then kill the generator'], at: [[40, -42], [58, -20]] },
    leak: { title: 'SOMEBODY TALKED', lines: ['Gunships found the Nightfall LZ', 'Engineer\'s radio ledger', 'Hut on the west bank'], at: [[-34, -24]] },
    extract: { title: '4 · EXTRACT', lines: ['Boat — west-bank jetty', 'Hold until it docks', 'Downriver, under fire'], at: [[-20, 30]] },
  },
  showcase: 'flood',
}

/** The insertion: EVA's briefing, then the mission plan flyover and the boat dropping WREN on the bank. */
export const LOW_WATER_PLAN: Plan = {
  title: 'TESSALY DAM · 4TH ENGINEERS',
  tagline: 'Two operatives. No flight plan this time.',
  radio: "CANOPY: WREN, you're on the bank. Step one — get past the fence line. Your objective is always top left.",
  steps: [
    { at: [10, -10], r: 75, h: 42, a: -0.5, title: 'GET INSIDE', text: () => 'Wade up the river to the broken fence, cross the footbridge to the west bank, or take the road gate — fastest, and most watched.' },
    { at: [-34, -24], r: 26, h: 18, a: -1.2, optional: true, title: 'TAKE THE LEDGER', text: () => 'The engineer keeps a radio ledger in his hut on the west bank. If anyone sold the Nightfall LZ, it is in there.' },
    { at: [40, -42], r: 30, h: 22, a: 0.5, title: 'LOCK THE SLUICES', text: () => `The gate controller is in the control house at the foot of the dam. Hold ${bindingLabel('interact')} on it for ten seconds to overwrite the program.` },
    { at: [58, -20], r: 26, h: 18, a: 1.4, title: 'KILL THE GENERATOR', text: () => 'The backup generator in the shed east of the switchyard can force the gates by hand. Sabotage it. If the siren sounds, you have three minutes.' },
    { at: [-20, 30], r: 30, h: 18, a: -2.3, title: 'EXTRACT', text: () => 'A boat comes up the river to the west-bank jetty. Hold it until it docks, then get downriver.' },
  ],
}
