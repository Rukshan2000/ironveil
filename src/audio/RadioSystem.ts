import { audio } from './AudioSystem'

export type RadioChannel = 'enemy' | 'handler'

export interface RadioLine {
  id: number
  channel: RadioChannel
  speaker: string
  text: string
  /**
   * Key of a recorded voice file, when one exists. Extension point: map keys to AudioBuffers and play them here
   * instead of the procedural squelch + chatter placeholder.
   */
  voice?: string
}

export interface RadioDisplay extends Omit<RadioLine, 'voice'> {
  /** Seconds the line stays on screen. */
  duration: number
}

const MAX_QUEUE = 4
const REPEAT_WINDOW = 10

let nextId = 1

/**
 * RadioSystem: a single shared net. Lines are queued so they never talk over each other, repeats are suppressed, and
 * enemy chatter is intercepted by the player's scanner (subtitled as INTERCEPT). Handler lines jump the queue.
 */
export class RadioSystem {
  /** Line currently being spoken. */
  current: RadioDisplay | null = null
  /** Recent lines, newest last (HUD log). */
  readonly log: RadioDisplay[] = []
  private queue: RadioLine[] = []
  private remaining = 0
  private recent = new Map<string, number>()
  private time = 0
  /** Called when a line starts (pushes to the UI store). */
  onLine?: (line: RadioDisplay) => void

  say(channel: RadioChannel, speaker: string, text: string, voice?: string) {
    const last = this.recent.get(text)
    if (last !== undefined && this.time - last < REPEAT_WINDOW) return
    this.recent.set(text, this.time)
    const line: RadioLine = { id: nextId++, channel, speaker, text, voice }
    if (channel === 'handler') this.queue.unshift(line)
    else {
      this.queue.push(line)
      // stale enemy chatter is dropped rather than read out a minute late
      while (this.queue.length > MAX_QUEUE) {
        const i = this.queue.findIndex((l) => l.channel === 'enemy')
        this.queue.splice(i < 0 ? 0 : i, 1)
      }
    }
  }

  update(dt: number) {
    this.time += dt
    if (this.current && (this.remaining -= dt) <= 0) this.current = null
    if (this.current || !this.queue.length) return
    const line = this.queue.shift()!
    const duration = Math.min(6, 1.6 + line.text.length * 0.045)
    const shown: RadioDisplay = { id: line.id, channel: line.channel, speaker: line.speaker, text: line.text, duration }
    this.current = shown
    this.remaining = duration + 0.4
    this.log.push(shown)
    if (this.log.length > 8) this.log.shift()
    // placeholder voice: squelch + filtered chatter for the length of the line
    audio.radioChatter(null, duration * 0.8, line.channel === 'handler' ? 0.7 : 0.45)
    this.onLine?.(shown)
  }
}
