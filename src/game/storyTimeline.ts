import type { Scene } from 'three'
import { BUDDY_NAME } from '../ai/BuddyBot'
import { useGameStore } from '../state/gameStore'

/**
 * The story film's shot list, shared by the DOM overlay (StoryFilm: subtitles, name cards, narration) and the
 * in-canvas director (StoryDirector: camera, the 3D stage, EVA's office, the real base).
 */
export type Where = 'world' | 'stage' | 'office' | 'title'
export interface Card { name: () => string; role: () => string; color: string; at: number }
export interface Shot { id: string; dur: number; where: Where; text: () => string; card?: Card }

const solo = () => useGameStore.getState().buddyActive

export const SHOTS: Shot[] = [
  { id: 'valley', dur: 9, where: 'world', text: () => 'The Halvard Valley. Farms, a river, and a border that has been quiet for twenty years.' },
  {
    id: 'army', dur: 10, where: 'stage',
    text: () => 'Across the ridge, General Ivo Drask and his army, the Varn Directorate, have been massing soldiers for months — waiting for one order.',
    card: { name: () => 'GEN. IVO DRASK', role: () => 'VARN DIRECTORATE · THE ENEMY', color: '#c9503e', at: 1.5 },
  },
  { id: 'station', dur: 9, where: 'world', text: () => "Six weeks ago, Drask's 9th Signals Detachment seized the relay station on Halvard Ridge. Every night his coded orders pass through it." },
  {
    id: 'eva', dur: 9, where: 'office',
    text: () => 'At Valley Defence Command, operations officer Eva decodes one word from the static: DAWN. The attack is coming — but where, and when?',
    card: { name: () => 'EVA', role: () => 'OPERATIONS OFFICER · VALLEY DEFENCE COMMAND', color: '#7fb6d6', at: 0.8 },
  },
  {
    id: 'wren', dur: 8, where: 'stage', text: () => "There is no time to move an army. So Eva sends a ghost. Call sign: Wren. That's you.",
    card: { name: () => 'WREN', role: () => 'YOU · INFILTRATION OPERATIVE', color: '#a9bf8e', at: 1.2 },
  },
  {
    id: 'partner', dur: 10, where: 'stage',
    text: () => `Wren won't go in alone. ${solo() ? `${BUDDY_NAME}, the best rifleman in the valley,` : 'Your partner'} wears red — so you never mistake a friend for a foe.`,
    card: { name: () => (solo() ? BUDDY_NAME.toUpperCase() : 'PARTNER'), role: () => (solo() ? 'AI SQUADMATE · RED UNIFORM · PROTECTS YOU' : 'PLAYER 2 · RED UNIFORM'), color: '#d9554a', at: 1.5 },
  },
  {
    id: 'canopy', dur: 7, where: 'stage', text: () => 'From the moment you land, Canopy is your voice on the radio.',
    card: { name: () => 'CANOPY', role: () => 'YOUR HANDLER · ON THE RADIO', color: '#7fb6d6', at: 0.8 },
  },
  { id: 'mission', dur: 9, where: 'world', text: () => "Steal Drask's orders. Cut his uplink so no one can report the theft. Get out before dawn." },
  { id: 'title', dur: 5, where: 'title', text: () => 'Operation Nightfall.' },
]

export const STORY_LENGTH = SHOTS.reduce((a, s) => a + s.dur, 0)

/** Film clock (s), advanced by the overlay. `freeze` holds it at a time (screenshots / debugging). */
export const story: { t: number; freeze?: number } = { t: 0 }
/** Scene the render pipeline draws instead of the world while a stage shot is on (null = world / office). */
export const storyRender: { scene: Scene | null } = { scene: null }

export function shotAt(t: number) {
  let i = 0, lt = t
  while (i < SHOTS.length - 1 && lt >= SHOTS[i].dur) lt -= SHOTS[i++].dur
  return { i, lt, shot: SHOTS[i] }
}
