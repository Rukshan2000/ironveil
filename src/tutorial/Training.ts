import { audio } from '../audio/AudioSystem'
import { input } from '../game/input'
import type { GameSession } from '../game/GameSession'
import { bindingLabel as k, settings } from '../state/settings'

interface Step {
  title: string
  text: () => string
  /** Completion check, polled every frame. */
  done: (s: GameSession, t: Training) => boolean
  /** Information-only steps advance on their own after this many seconds. */
  info?: number
  /** Skip the step when this is true (e.g. firing once you're within earshot of the base). */
  skip?: (s: GameSession) => boolean
}

/** Out here (far south of the gate) gunshots don't reach the guards. */
const SAFE_RANGE_Z = 100

const STEPS: Step[] = [
  { title: 'Movement', text: () => `${k('forward')} ${k('left')} ${k('back')} ${k('right')} to move`, done: (_, t) => t.travelled > 4 },
  { title: 'Sprint', text: () => `Hold ${k('sprint')} to sprint — it costs stamina and is loud`, done: (s) => s.player.sprinting },
  { title: 'Crouch', text: () => `${k('crouch')} to crouch — slower, quieter, harder to spot`, done: (s) => s.player.stance === 'crouch' },
  { title: 'Prone', text: () => `${k('prone')} to go prone — the stealthiest stance, steadiest aim`, done: (s) => s.player.stance === 'prone' },
  { title: 'Stand / vault', text: () => `${k('jump')} stands you up; at a low wall or crate it vaults over`, done: (s) => s.player.stance === 'stand' },
  { title: 'Lean', text: () => `${k('leanLeft')} / ${k('leanRight')} to lean out from cover`, done: (s) => Math.abs(s.player.lean) > 0.7 },
  { title: 'Aim', text: () => `Hold ${k('aim')} to aim down sights`, done: (s) => s.weapon.aim > 0.9 },
  {
    title: 'Fire', text: () => `${k('fire')} to fire — this far out, nobody hears it`, done: (s) => s.stats.shots > 0,
    skip: (s) => s.player.feet.z < SAFE_RANGE_Z,
  },
  { title: 'Reload', text: () => `${k('reload')} to reload — a tactical reload keeps the chambered round`, done: (s) => s.weapon.reloading || s.weapon.ammo === s.weapon.maxLoaded, skip: (s) => s.weapon.ammo === s.weapon.maxLoaded },
  { title: 'Weapons & optics', text: () => `${k('weapon1')} ${k('weapon2')} ${k('weapon3')} or the wheel switch weapons · wheel while aiming changes optic zoom`, done: (_, t) => t.switched, info: 9 },
  { title: 'Interact', text: () => `Look at a door, terminal, body or vehicle and press ${k('interact')} · some need ${k('interact')} held`, done: () => false, info: 6 },
  { title: 'Equipment', text: () => `Hold ${k('grenade')} to ready a grenade and see its arc, release to throw · ${k('cycleGrenade')} cycles frag / smoke / flash`, done: (s) => s.grenades.priming, info: 9 },
  { title: 'Objective', text: () => `Your objective and its distance are top-left · hold ${k('objectives')} for all objectives, ${k('map')} opens the map`, done: (_, t) => t.checkedMap, info: 9 },
  { title: 'Extraction', text: () => 'Once the uplink is down, reach the landing zone and hold it until the helicopter is on the ground', done: () => false, info: 7 },
]

/** Short training sequence during insertion. Ends on its own once you're inside the perimeter. */
export class Training {
  index = 0
  active: boolean
  travelled = 0
  switched = false
  checkedMap = false
  private timer = 0
  private lastWeapon: number
  private lastZoom = 0
  private last = { x: 0, z: 0 }

  constructor(private readonly s: GameSession) {
    this.active = settings().tutorial
    this.lastWeapon = s.weaponIndex
    this.last = { x: s.player.feet.x, z: s.player.feet.z }
  }

  get step(): Step | null {
    return this.active ? STEPS[this.index] ?? null : null
  }

  get total() {
    return STEPS.length
  }

  /** HUD view of the current step. */
  view() {
    const st = this.step
    return st ? { title: st.title, text: st.text(), index: this.index + 1, total: STEPS.length } : null
  }

  update(dt: number) {
    const s = this.s
    if (!this.active) return
    if (!settings().tutorial || s.objectives.status.reach === 'done') {
      this.active = false
      return
    }
    const p = s.player.feet
    this.travelled += Math.hypot(p.x - this.last.x, p.z - this.last.z)
    this.last = { x: p.x, z: p.z }
    if (s.weaponIndex !== this.lastWeapon || s.weapon.zoomIndex !== this.lastZoom) this.switched = true
    this.lastWeapon = s.weaponIndex
    this.lastZoom = s.weapon.zoomIndex
    if (input.pressed('map') || input.pressed('objectives')) this.checkedMap = true

    const st = STEPS[this.index]
    if (!st) {
      this.active = false
      return
    }
    this.timer += dt
    if (st.skip?.(s) || st.done(s, this) || (st.info && this.timer > st.info)) {
      if (!st.skip?.(s) && !st.info) audio.cue('beep')
      this.index++
      this.timer = 0
      if (this.index >= STEPS.length) {
        this.active = false
        s.notify('Training complete — good luck, WREN', 'good')
      }
    }
  }
}
