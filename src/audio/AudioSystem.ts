// Procedural, layered Web Audio. Every public method is a named sound "recipe" — swap any of them for sampled
// AudioBuffers later without touching callers. Positional sounds use HRTF panners; distant gunfire is delayed by the
// speed of sound and low-passed by distance.

type Vec = { x: number; y: number; z: number }
type SurfaceSound = 'concrete' | 'metal' | 'wood' | 'dirt' | 'grass' | 'glass' | 'flesh' | 'fabric'
export type MechSound = 'magOut' | 'magIn' | 'bolt' | 'boltCycle' | 'equip' | 'dry' | 'inspect' | 'aimIn' | 'aimOut' | 'switch'
export type VoiceSound = 'suspicious' | 'alert' | 'contact' | 'reinforce' | 'lost' | 'hurt' | 'death' | 'search' | 'reload' | 'body'
export type LoopKind = 'wind' | 'insects' | 'hum' | 'generator' | 'radio' | 'fire' | 'engine' | 'truck' | 'rotor' | 'siren' | 'rain'

export interface ShotProfile {
  /** Sound file name in src/audio/sounds (falls back to `gunshot`, then to the synthesized shot). */
  file?: string
  body: number
  crack: number
  gain: number
  tail: number
  mech: number
}

export interface LoopHandle {
  gain: GainNode
  /** Optional parameter hooks (engine rpm, wind gusts). */
  set(param: 'rate' | 'level', value: number): void
  move(p: Vec): void
  stop(): void
}

/** Boost on the player's own gunshots (recordings and synth), relative to everyone else's. */
const PLAYER_SHOT_GAIN = 2.6
const SPEED_OF_SOUND = 343
const MAX_VOICES = 56

/** Drop-in sound files: src/audio/sounds/<name>.mp3|ogg|wav replaces the synthesized sound of that name (see README.md there). */
const FILES = Object.entries(import.meta.glob('./sounds/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
  .map(([path, url]) => [path.slice('./sounds/'.length).replace(/\.\w+$/, ''), url] as const)

/** The `ambience` sound file playing on a crossfaded loop: `next` is when the following copy starts. */
interface Bed {
  gain: GainNode
  next: number
  playing: AudioBufferSourceNode[]
}

/** Seconds each loop pass overlaps the next; equal-power curves so the seam has no dip or click. */
const BED_OVERLAP = 2
const FADE_IN = Float32Array.from({ length: 64 }, (_, i) => Math.sin((i / 63) * (Math.PI / 2)))
const FADE_OUT = Float32Array.from({ length: 64 }, (_, i) => Math.cos((i / 63) * (Math.PI / 2)))

interface Out {
  input: AudioNode
  /** Seconds of propagation delay already applied. */
  delay: number
}

export class AudioSystem {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private sfx!: GainNode
  private amb!: GainNode
  private ui!: GainNode
  private voiceBus!: GainNode
  private volumes = { master: 0.8, music: 0.55, effects: 1, voice: 1 }
  private reverb!: ConvolverNode
  private reverbIn!: GainNode
  private white!: AudioBuffer
  private brown!: AudioBuffer
  private voices = 0
  private readonly listener = { x: 0, y: 0, z: 0 }
  private loops: LoopHandle[] = []
  private readonly samples = new Map<string, AudioBuffer>()
  private ambience: { timer: number; level: { wind: number; insects: number; birds: number }; sources: Vec[]; wind?: LoopHandle; insects?: LoopHandle; rain?: LoopHandle; rainLevel: number; bed?: Bed; bedLevel: number } | null = null

  get ready() {
    return !!this.ctx
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext())
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 4
      comp.attack.value = 0.003
      comp.release.value = 0.25
      comp.connect(ctx.destination)
      this.master = ctx.createGain()
      this.master.connect(comp)
      this.sfx = this.bus(1)
      this.amb = this.bus(0.55)
      this.ui = this.bus(0.5)
      this.voiceBus = this.bus(1)
      this.setVolumes(this.volumes)
      this.reverb = ctx.createConvolver()
      this.reverb.buffer = this.impulse(2.4, 2.6)
      this.reverbIn = ctx.createGain()
      this.reverbIn.gain.value = 0.55
      this.reverbIn.connect(this.reverb).connect(this.master)
      this.white = this.noiseBuffer(2, false)
      this.brown = this.noiseBuffer(4, true)
      for (const [name, url] of FILES) {
        fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => this.samples.set(name, buf))
          .catch(() => console.warn(`Sound file ${name} could not be loaded`))
      }
    }
    void this.ctx.resume()
  }

  /** Settings → bus gains. Ambience stands in for music (there is no score). */
  setVolumes(v: { master: number; music: number; effects: number; voice: number }) {
    this.volumes = { ...v }
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(v.master, t, 0.05)
    this.amb.gain.setTargetAtTime(0.55 * v.music, t, 0.05)
    this.sfx.gain.setTargetAtTime(v.effects, t, 0.05)
    this.ui.gain.setTargetAtTime(0.5 * v.effects, t, 0.05)
    this.voiceBus.gain.setTargetAtTime(v.voice, t, 0.05)
  }

  /** Pause menu: freeze every sound (loops, tails, delayed gunfire) where it is. */
  setPaused(paused: boolean) {
    if (!this.ctx) return
    void (paused ? this.ctx.suspend() : this.ctx.resume())
  }

  private bus(gain: number) {
    const g = this.ctx!.createGain()
    g.gain.value = gain
    g.connect(this.master)
    return g
  }

  private noiseBuffer(seconds: number, brown: boolean) {
    const ctx = this.ctx!
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const d = b.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      if (brown) {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else d[i] = w
    }
    return b
  }

  /** Outdoor-ish stereo reverb tail: exponentially decaying noise with early reflections. */
  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const len = ctx.sampleRate * seconds
    const b = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        const t = i / len
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.012 ? 0 : 1)
      }
      // a couple of discrete slap-back echoes off distant buildings/hills
      for (const [at, g] of [[0.09, 0.5], [0.23, 0.3], [0.41, 0.18]]) {
        const i = Math.floor(at * ctx.sampleRate + ch * 90)
        for (let k = 0; k < 400; k++) d[i + k] += (Math.random() * 2 - 1) * g * (1 - k / 400)
      }
    }
    return b
  }

  setListener(pos: Vec, fwd: Vec, up: Vec) {
    const ctx = this.ctx
    if (!ctx) return
    this.listener.x = pos.x
    this.listener.y = pos.y
    this.listener.z = pos.z
    const l = ctx.listener
    const t = ctx.currentTime
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02)
      l.positionY.setTargetAtTime(pos.y, t, 0.02)
      l.positionZ.setTargetAtTime(pos.z, t, 0.02)
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02)
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02)
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02)
      l.upX.setTargetAtTime(up.x, t, 0.02)
      l.upY.setTargetAtTime(up.y, t, 0.02)
      l.upZ.setTargetAtTime(up.z, t, 0.02)
    } else {
      l.setPosition(pos.x, pos.y, pos.z)
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z)
    }
  }

  private distanceTo(p: Vec) {
    return Math.hypot(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z)
  }

  /**
   * Creates the output chain for one sound: optional panner, distance low-pass, muffling, speed-of-sound delay and
   * reverb send. Returns null when over the voice budget.
   */
  private out(opts: { pos?: Vec | null; ref?: number; rolloff?: number; wet?: number; muffle?: boolean; bus?: GainNode; delaySound?: boolean; life: number }): Out | null {
    const ctx = this.ctx
    if (!ctx || this.voices >= MAX_VOICES) return null
    this.voices++
    setTimeout(() => this.voices--, (opts.life + 0.2) * 1000)
    let node: AudioNode = opts.bus ?? this.sfx
    let delay = 0
    let wet = opts.wet ?? 0.15
    if (opts.pos) {
      const d = this.distanceTo(opts.pos)
      const panner = new PannerNode(ctx, {
        panningModel: 'HRTF', distanceModel: 'inverse', refDistance: opts.ref ?? 2, rolloffFactor: opts.rolloff ?? 1, maxDistance: 2000,
        positionX: opts.pos.x, positionY: opts.pos.y, positionZ: opts.pos.z,
      })
      panner.connect(node)
      node = panner
      // air absorbs highs over distance; walls muffle
      const cutoff = Math.min(opts.muffle ? 900 : 20000, 20000 / (1 + d * 0.012))
      if (cutoff < 18000) {
        const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: cutoff, Q: 0.5 })
        lp.connect(node)
        node = lp
      }
      if (opts.delaySound && d > 25) delay = d / SPEED_OF_SOUND
      wet = Math.min(0.9, wet + d * 0.004)
    }
    const send = new GainNode(ctx, { gain: wet })
    send.connect(this.reverbIn)
    const input = new GainNode(ctx, { gain: 1 })
    input.connect(node)
    input.connect(send)
    return { input, delay }
  }

  /** Plays a loaded sound file instead of the recipe. Returns false when there is no file of that name. */
  private sample(dest: AudioNode, at: number, ...names: string[]): boolean {
    // `name` or numbered variants `name-1`, `name-2`… (one picked at random so repeats don't sound canned)
    const variants = (n: string) => [this.samples.get(n), ...Array.from({ length: 12 }, (_, i) => this.samples.get(`${n}-${i + 1}`))].filter((b): b is AudioBuffer => !!b)
    const pool = names.map(variants).find((v) => v.length)
    const buf = pool?.[Math.floor(Math.random() * pool.length)]
    if (!buf) return false
    // slight pitch variation so repeated sounds don't machine-gun
    const src = new AudioBufferSourceNode(this.ctx!, { buffer: buf, playbackRate: 0.96 + Math.random() * 0.08 })
    src.connect(dest)
    src.start(this.ctx!.currentTime + at)
    return true
  }

  // ---- primitives ------------------------------------------------------------------------------------

  private noise(dest: AudioNode, at: number, o: { volume: number; attack?: number; decay: number; type?: BiquadFilterType; freq: number; q?: number; endFreq?: number; rate?: number; brown?: boolean }) {
    const ctx = this.ctx!
    const t = ctx.currentTime + at
    const src = new AudioBufferSourceNode(ctx, { buffer: o.brown ? this.brown : this.white, playbackRate: (o.rate ?? 1) * (0.92 + Math.random() * 0.16) })
    const f = new BiquadFilterNode(ctx, { type: o.type ?? 'lowpass', frequency: o.freq, Q: o.q ?? 0.7 })
    if (o.endFreq) f.frequency.exponentialRampToValueAtTime(o.endFreq, t + o.decay)
    const g = new GainNode(ctx, { gain: 0 })
    const a = o.attack ?? 0.002
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.volume), t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.decay)
    src.connect(f).connect(g).connect(dest)
    src.start(t, Math.random() * 1.5, a + o.decay + 0.05)
  }

  private tone(dest: AudioNode, at: number, o: { freq: number; endFreq?: number; volume: number; attack?: number; decay: number; type?: OscillatorType }) {
    const ctx = this.ctx!
    const t = ctx.currentTime + at
    const osc = new OscillatorNode(ctx, { type: o.type ?? 'sine', frequency: o.freq })
    if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + o.decay)
    const g = new GainNode(ctx, { gain: 0 })
    const a = o.attack ?? 0.002
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.volume), t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.decay)
    osc.connect(g).connect(dest)
    osc.start(t)
    osc.stop(t + a + o.decay + 0.05)
  }

  /** Metallic click: a couple of short resonant bandpassed noise ticks. */
  private click(dest: AudioNode, at: number, freq: number, volume: number) {
    this.noise(dest, at, { volume, decay: 0.025, type: 'bandpass', freq, q: 6 })
    this.noise(dest, at + 0.004, { volume: volume * 0.5, decay: 0.04, type: 'bandpass', freq: freq * 1.9, q: 9 })
  }

  // ---- weapons ---------------------------------------------------------------------------------------

  /** Layered gunshot: transient, body thump, supersonic crack, mechanism and a long reverberant tail. */
  gunshot(p: ShotProfile, pos: Vec | null, suppressedNearby = false) {
    const dist = pos ? this.distanceTo(pos) : 0
    const o = this.out({ pos, ref: 10, rolloff: 0.9, wet: 0.35, delaySound: true, life: p.tail + 0.5, muffle: suppressedNearby })
    if (!o) return
    const { input, delay } = o
    // your own gun is right at your ear: much louder than anyone else's
    const d = pos ? input : new GainNode(this.ctx!, { gain: PLAYER_SHOT_GAIN })
    if (d !== input) d.connect(input)
    if (this.sample(d, delay, p.file ?? 'gunshot', 'gunshot')) return
    const far = Math.min(1, dist / 150)
    const g = p.gain
    this.noise(d, delay, { volume: 1.1 * g * (1 - far * 0.8), decay: 0.035, type: 'highpass', freq: 1800 })
    this.noise(d, delay, { volume: 1.0 * g, decay: 0.16 + far * 0.2, freq: 1800 - far * 1300, endFreq: 300 })
    this.tone(d, delay, { freq: p.body, endFreq: p.body * 0.45, volume: 0.9 * g, decay: 0.14 + far * 0.15 })
    if (!pos || dist < 120) this.noise(d, delay, { volume: 0.5 * g * (1 - far), decay: 0.05, type: 'bandpass', freq: p.crack, q: 1.2 })
    this.noise(d, delay + 0.03, { volume: 0.32 * g, decay: p.tail * (0.6 + far * 0.6), freq: 700 - far * 400, brown: true, attack: 0.02 })
    if (!pos) this.click(d, 0.012, 3200, 0.12 * p.mech)
  }

  /** Keyboard key (or a mouse click): a soft plastic tick, close to the ear. */
  keyTap(mouse = false) {
    const o = this.out({ life: 0.15, wet: 0.02 })
    if (!o) return
    if (this.sample(o.input, 0, mouse ? 'mouse-click' : 'key-tap')) return
    this.noise(o.input, 0, { volume: mouse ? 0.05 : 0.035 + Math.random() * 0.02, decay: 0.02, type: 'bandpass', freq: mouse ? 4200 : 2200 + Math.random() * 900, q: 3 })
    this.noise(o.input, 0.012, { volume: 0.015, decay: 0.03, type: 'bandpass', freq: 900, q: 1.5 })
  }

  /** Grenade detonation: a deep boom with a long rolling tail (frag), or a sharp crack (flashbang). */
  explosion(pos: Vec, kind: 'frag' | 'flash' | 'smoke') {
    const o = this.out({ pos, ref: 14, rolloff: 0.8, wet: 0.5, delaySound: true, life: 3.5 })
    if (!o) return
    const { input: d, delay } = o
    if (this.sample(d, delay, `explosion-${kind}`)) return
    if (kind === 'smoke') {
      this.click(d, delay, 900, 0.3)
      this.noise(d, delay + 0.02, { volume: 0.5, attack: 0.05, decay: 2.2, type: 'bandpass', freq: 1400, q: 0.6 })
      return
    }
    const flash = kind === 'flash'
    this.noise(d, delay, { volume: 1.4, decay: flash ? 0.05 : 0.08, type: 'highpass', freq: flash ? 2500 : 900 })
    this.noise(d, delay, { volume: 1.3, decay: flash ? 0.35 : 0.9, freq: flash ? 2400 : 900, endFreq: 120 })
    this.tone(d, delay, { freq: flash ? 140 : 70, endFreq: 28, volume: 1.2, decay: flash ? 0.3 : 0.9 })
    this.noise(d, delay + 0.05, { volume: 0.5, decay: 2.6, freq: 400, brown: true, attack: 0.05 })
  }

  /** Pin pulled / spoon released. */
  pin() {
    const o = this.out({ life: 0.4, wet: 0.02 })
    if (!o) return
    if (this.sample(o.input, 0, 'pin')) return
    this.click(o.input, 0, 3600, 0.22)
    this.click(o.input, 0.09, 2400, 0.15)
  }

  /** Metal canister clattering on a hard floor. */
  grenadeBounce(pos: Vec, strength: number) {
    const o = this.out({ pos, ref: 1.5, life: 0.4, wet: 0.08 })
    if (!o) return
    if (this.sample(o.input, 0, 'grenade-bounce')) return
    this.click(o.input, 0, 1700 + Math.random() * 500, 0.3 * strength)
    this.noise(o.input, 0.01, { volume: 0.12 * strength, decay: 0.08, type: 'bandpass', freq: 900, q: 2 })
  }

  /** Flashbang tinnitus: a thin high tone fading over a few seconds. */
  ringing(amount: number) {
    const o = this.out({ bus: this.ui, life: 4, wet: 0 })
    if (!o) return
    this.tone(o.input, 0, { freq: 3400 + Math.random() * 300, volume: 0.06 * amount, attack: 0.05, decay: 3.5 * amount })
  }

  mech(kind: MechSound, pos?: Vec | null) {
    const o = this.out({ pos, ref: 1.2, life: 0.6, wet: 0.05 })
    if (!o) return
    const d = o.input
    if (this.sample(d, 0, `mech-${kind}`)) return
    switch (kind) {
      case 'magOut':
        this.click(d, 0, 2400, 0.25)
        this.noise(d, 0.03, { volume: 0.12, decay: 0.12, type: 'bandpass', freq: 900, q: 2 })
        break
      case 'magIn':
        this.noise(d, 0, { volume: 0.12, decay: 0.08, type: 'bandpass', freq: 1200, q: 2 })
        this.click(d, 0.07, 1800, 0.35)
        this.click(d, 0.09, 2600, 0.2)
        break
      case 'bolt':
        this.click(d, 0, 1500, 0.3)
        this.noise(d, 0.04, { volume: 0.15, decay: 0.06, type: 'bandpass', freq: 2200, q: 3 })
        this.click(d, 0.12, 1100, 0.45)
        break
      case 'boltCycle':
        this.click(d, 0, 1300, 0.3)
        this.noise(d, 0.08, { volume: 0.18, decay: 0.12, type: 'bandpass', freq: 1800, q: 2 })
        this.click(d, 0.32, 2000, 0.3)
        this.noise(d, 0.36, { volume: 0.16, decay: 0.1, type: 'bandpass', freq: 1500, q: 2 })
        this.click(d, 0.5, 1200, 0.4)
        break
      case 'equip':
        this.noise(d, 0, { volume: 0.1, decay: 0.2, type: 'bandpass', freq: 700, q: 1 })
        this.click(d, 0.18, 1600, 0.2)
        break
      case 'switch':
        this.noise(d, 0, { volume: 0.08, decay: 0.15, type: 'bandpass', freq: 500, q: 1 })
        break
      case 'dry':
        this.click(d, 0, 3000, 0.25)
        break
      case 'inspect':
        this.click(d, 0.2, 1700, 0.12)
        this.noise(d, 0.6, { volume: 0.06, decay: 0.3, type: 'bandpass', freq: 600, q: 1 })
        this.click(d, 1.4, 2200, 0.15)
        break
      case 'aimIn':
      case 'aimOut':
        this.noise(d, 0, { volume: 0.05, decay: 0.12, type: 'bandpass', freq: kind === 'aimIn' ? 900 : 700, q: 1 })
        break
    }
  }

  // ---- player / world -------------------------------------------------------------------------------

  footstep(surface: SurfaceSound, intensity: number, pos?: Vec | null) {
    const o = this.out({ pos, ref: 1.5, rolloff: 1.4, life: 0.35, wet: 0.04 })
    if (!o) return
    const d = o.input
    // sound files follow the step's loudness too (sneaking vs sprinting), like the synthesized steps
    const step = new GainNode(this.ctx!, { gain: Math.min(1, 0.25 + intensity * 0.75) })
    step.connect(d)
    if (this.sample(step, 0, `footstep-${surface}`, 'footstep')) return
    step.disconnect()
    const v = 0.06 + intensity * 0.18
    switch (surface) {
      case 'metal':
        this.noise(d, 0, { volume: v, decay: 0.05, type: 'bandpass', freq: 1400, q: 3 })
        this.tone(d, 0, { freq: 380 + Math.random() * 60, volume: v * 0.4, decay: 0.18, type: 'triangle' })
        break
      case 'wood':
        this.noise(d, 0, { volume: v, decay: 0.07, type: 'bandpass', freq: 500, q: 2 })
        this.tone(d, 0, { freq: 140, volume: v * 0.4, decay: 0.08 })
        break
      case 'grass':
        this.noise(d, 0, { volume: v * 0.7, decay: 0.14, type: 'highpass', freq: 2500, attack: 0.02 })
        this.noise(d, 0, { volume: v * 0.4, decay: 0.06, freq: 300 })
        break
      case 'dirt':
      case 'fabric':
        this.noise(d, 0, { volume: v, decay: 0.09, type: 'bandpass', freq: 900, q: 0.8, attack: 0.008 })
        this.noise(d, 0.02, { volume: v * 0.5, decay: 0.1, type: 'highpass', freq: 3500 })
        break
      case 'glass':
        this.noise(d, 0, { volume: v, decay: 0.12, type: 'highpass', freq: 4000 })
        break
      default:
        this.noise(d, 0, { volume: v, decay: 0.05, type: 'bandpass', freq: 1100, q: 1.5 })
        this.noise(d, 0.01, { volume: v * 0.4, decay: 0.03, type: 'highpass', freq: 4000 })
    }
    // gear rattle on heavier steps
    if (intensity > 0.5) this.noise(d, 0.03, { volume: 0.03 * intensity, decay: 0.08, type: 'bandpass', freq: 3000, q: 4 })
  }

  land(intensity: number) {
    const o = this.out({ life: 0.4 })
    if (!o) return
    this.noise(o.input, 0, { volume: 0.25 * intensity, decay: 0.15, freq: 400 })
    this.tone(o.input, 0, { freq: 90, endFreq: 50, volume: 0.25 * intensity, decay: 0.15 })
    this.noise(o.input, 0.02, { volume: 0.06 * intensity, decay: 0.1, type: 'bandpass', freq: 3000, q: 4 })
  }

  impact(surface: SurfaceSound, pos: Vec) {
    const o = this.out({ pos, ref: 3, life: 0.5, wet: 0.2 })
    if (!o) return
    const d = o.input
    if (this.sample(d, 0, `impact-${surface}`, 'impact')) return
    switch (surface) {
      case 'metal':
        this.noise(d, 0, { volume: 0.4, decay: 0.04, type: 'highpass', freq: 2500 })
        this.tone(d, 0, { freq: 900 + Math.random() * 900, volume: 0.15, decay: 0.35, type: 'triangle' })
        this.tone(d, 0, { freq: 2300 + Math.random() * 800, volume: 0.08, decay: 0.25 })
        break
      case 'wood':
        this.noise(d, 0, { volume: 0.45, decay: 0.08, type: 'bandpass', freq: 700, q: 1.5 })
        this.noise(d, 0.01, { volume: 0.2, decay: 0.12, type: 'highpass', freq: 3000 })
        break
      case 'glass':
        this.noise(d, 0, { volume: 0.4, decay: 0.05, type: 'highpass', freq: 3500 })
        for (let i = 0; i < 5; i++) this.tone(d, 0.02 + Math.random() * 0.25, { freq: 3000 + Math.random() * 4000, volume: 0.05, decay: 0.08 })
        break
      case 'dirt':
      case 'grass':
      case 'fabric':
        this.noise(d, 0, { volume: 0.35, decay: 0.12, freq: 600 })
        break
      case 'flesh':
        this.noise(d, 0, { volume: 0.35, decay: 0.07, freq: 500 })
        this.tone(d, 0, { freq: 120, endFreq: 70, volume: 0.2, decay: 0.08 })
        break
      default:
        this.noise(d, 0, { volume: 0.45, decay: 0.05, type: 'highpass', freq: 1500 })
        this.noise(d, 0.01, { volume: 0.25, decay: 0.2, type: 'bandpass', freq: 800, q: 0.7 })
    }
  }

  ricochet(pos: Vec) {
    const o = this.out({ pos, ref: 4, life: 0.6, wet: 0.3 })
    if (!o) return
    const f = 2400 + Math.random() * 1800
    this.tone(o.input, 0, { freq: f, endFreq: f * 0.55, volume: 0.12, decay: 0.45, type: 'sine' })
  }

  /** Supersonic crack + whistle of a bullet passing close to the player's head. */
  whizz(pos: Vec) {
    const o = this.out({ pos, ref: 1, life: 0.3, wet: 0.1 })
    if (!o) return
    this.noise(o.input, 0, { volume: 0.7, decay: 0.03, type: 'highpass', freq: 3000 })
    this.noise(o.input, 0.005, { volume: 0.25, decay: 0.16, type: 'bandpass', freq: 5000, endFreq: 1500, q: 3 })
  }

  shellTink(pos: Vec, strength: number) {
    const o = this.out({ pos, ref: 1, rolloff: 1.5, life: 0.3, wet: 0.05 })
    if (!o) return
    this.tone(o.input, 0, { freq: 4200 + Math.random() * 1600, volume: 0.06 * strength, decay: 0.12, type: 'sine' })
    this.tone(o.input, 0, { freq: 6800 + Math.random() * 900, volume: 0.03 * strength, decay: 0.08, type: 'sine' })
  }

  /** One breath (inhale or exhale), louder when winded. */
  breath(exertion: number, inhale: boolean) {
    const o = this.out({ life: 1, bus: this.ui })
    if (!o) return
    this.noise(o.input, 0, { volume: 0.02 + exertion * 0.09, attack: inhale ? 0.25 : 0.08, decay: inhale ? 0.25 : 0.45, type: 'bandpass', freq: inhale ? 1500 : 900, q: 1.2 })
  }

  /** Cloth/gear rustle while moving or shouldering the weapon. */
  cloth(intensity: number) {
    const o = this.out({ life: 0.4, bus: this.ui })
    if (!o) return
    this.noise(o.input, 0, { volume: 0.03 * intensity, attack: 0.04, decay: 0.2, type: 'bandpass', freq: 2200, q: 0.8 })
  }

  // ---- AI -------------------------------------------------------------------------------------------

  /**
   * Placeholder voice barks: a formant-filtered buzz with a speech-like pitch contour, plus radio squelch for
   * radio calls. Replace with recorded VO later; keys stay the same.
   */
  voice(kind: VoiceSound, pos: Vec, radio = false, occluded = false) {
    const o = this.out({ pos, ref: 4, rolloff: 1.1, life: 2, wet: 0.2, muffle: occluded, bus: this.voiceBus })
    if (!o) return
    const d = o.input
    // recorded shouts: a callout's own file, or one of the generic military vocals (not for pain / death cries)
    const generic = kind !== 'hurt' && kind !== 'death'
    const names = generic && Math.random() < 0.5 ? ['voice', `voice-${kind}`] : [`voice-${kind}`, ...(generic ? ['voice'] : [])]
    if (this.sample(d, 0, ...names)) return
    const ctx = this.ctx!
    const syllables = { suspicious: [1, 0.7], alert: [1.3, 1.1, 0.9], contact: [1.2, 1.2, 1, 0.8], reinforce: [1, 1.1, 0.9, 1, 0.8, 0.7], lost: [0.9, 0.8], hurt: [1.4], death: [1.1], search: [1, 0.9, 1], reload: [1, 0.9], body: [1.3, 1.2, 1.1] }[kind]
    const base = 105 + Math.random() * 30
    let t = radio ? 0.12 : 0
    if (radio) this.noise(d, 0, { volume: 0.12, decay: 0.08, type: 'bandpass', freq: 2500, q: 2 })
    for (const pitch of syllables) {
      const dur = kind === 'hurt' || kind === 'death' ? 0.35 : 0.11 + Math.random() * 0.08
      const start = ctx.currentTime + t
      const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: base * pitch })
      osc.frequency.linearRampToValueAtTime(base * pitch * (kind === 'death' ? 0.5 : 0.85), start + dur)
      const f1 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500 + Math.random() * 300, Q: 4 })
      const f2 = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1300 + Math.random() * 700, Q: 5 })
      const g = new GainNode(ctx, { gain: 0 })
      const loud = kind === 'alert' || kind === 'contact' ? 0.5 : kind === 'hurt' || kind === 'death' ? 0.45 : 0.28
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(loud, start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(f1).connect(g)
      osc.connect(f2).connect(g)
      if (radio) {
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1600, Q: 0.9 })
        g.connect(band).connect(d)
      } else g.connect(d)
      osc.start(start)
      osc.stop(start + dur + 0.02)
      t += dur + 0.03 + Math.random() * 0.05
    }
    if (radio) this.noise(d, t, { volume: 0.1, decay: 0.12, type: 'bandpass', freq: 2200, q: 2 })
  }

  /** Short unintelligible radio traffic (squelch + filtered noise "speech"). */
  radioChatter(pos: Vec | null, seconds = 1.6, volume = 1) {
    const o = this.out({ pos, ref: 2, rolloff: 1.4, life: seconds + 0.3, wet: pos ? 0.1 : 0, bus: this.voiceBus })
    if (!o) return
    const d = o.input
    if (volume !== 1) (d as GainNode).gain.value = volume
    this.noise(d, 0, { volume: 0.08, decay: 0.06, type: 'bandpass', freq: 2600, q: 3 })
    for (let t = 0.1; t < seconds; t += 0.09 + Math.random() * 0.12) {
      this.noise(d, t, { volume: 0.05 + Math.random() * 0.05, attack: 0.02, decay: 0.07, type: 'bandpass', freq: 900 + Math.random() * 900, q: 3 })
    }
    this.noise(d, seconds, { volume: 0.08, decay: 0.12, type: 'bandpass', freq: 2400, q: 2 })
  }

  // ---- UI -------------------------------------------------------------------------------------------

  cue(kind: 'hit' | 'kill' | 'objective' | 'beep' | 'pickup' | 'denied' | 'hurt') {
    const o = this.out({ bus: this.ui, life: 0.5, wet: 0 })
    if (!o) return
    const d = o.input
    if (this.sample(d, 0, `cue-${kind}`)) return
    if (kind === 'hit') this.noise(d, 0, { volume: 0.18, decay: 0.03, type: 'bandpass', freq: 3500, q: 4 })
    if (kind === 'kill') {
      this.noise(d, 0, { volume: 0.2, decay: 0.04, type: 'bandpass', freq: 3000, q: 4 })
      this.tone(d, 0.02, { freq: 180, endFreq: 90, volume: 0.15, decay: 0.12 })
    }
    if (kind === 'objective') {
      this.tone(d, 0, { freq: 660, volume: 0.1, decay: 0.12, type: 'triangle' })
      this.tone(d, 0.12, { freq: 880, volume: 0.1, decay: 0.2, type: 'triangle' })
    }
    if (kind === 'beep') this.tone(d, 0, { freq: 1400, volume: 0.04, decay: 0.05 })
    if (kind === 'pickup') {
      this.click(d, 0, 2000, 0.2)
      this.tone(d, 0.05, { freq: 990, volume: 0.06, decay: 0.12, type: 'triangle' })
    }
    if (kind === 'denied') this.tone(d, 0, { freq: 220, volume: 0.1, decay: 0.2, type: 'square' })
    if (kind === 'hurt') {
      this.noise(d, 0, { volume: 0.4, decay: 0.12, freq: 350 })
      this.tone(d, 0, { freq: 70, endFreq: 40, volume: 0.35, decay: 0.2 })
    }
  }

  // ---- loops ----------------------------------------------------------------------------------------

  loop(kind: LoopKind, pos?: Vec | null, level = 1): LoopHandle | null {
    const ctx = this.ctx
    if (!ctx) return null
    const gain = new GainNode(ctx, { gain: 0 })
    let dest: AudioNode = this.amb
    let panner: PannerNode | null = null
    if (pos) {
      const ref = { hum: 1.5, generator: 3, radio: 1.5, fire: 1.5, engine: 4, truck: 4, rotor: 8, siren: 12, rain: 1, wind: 1, insects: 1 }[kind]
      panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, rolloffFactor: 1.3, maxDistance: 1000, positionX: pos.x, positionY: pos.y, positionZ: pos.z })
      panner.connect(kind === 'engine' || kind === 'truck' || kind === 'rotor' || kind === 'siren' ? this.sfx : this.amb)
      dest = panner
    }
    gain.connect(dest)
    const stops: (() => void)[] = []
    const src = (buffer: AudioBuffer, rate = 1) => {
      const s = new AudioBufferSourceNode(ctx, { buffer, loop: true, playbackRate: rate })
      s.start(ctx.currentTime, Math.random() * 2)
      stops.push(() => s.stop())
      return s
    }
    const osc = (type: OscillatorType, f: number) => {
      const o = new OscillatorNode(ctx, { type, frequency: f })
      o.start()
      stops.push(() => o.stop())
      return o
    }
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = osc('sine', rate)
      const g = new GainNode(ctx, { gain: depth })
      o.connect(g).connect(target)
      return o
    }
    let rateParam: ((v: number) => void) | null = null

    // a sound file named loop-<kind> replaces the synthesized loop
    const file = this.samples.get(`loop-${kind}`)
    if (file) {
      const s = src(file)
      s.connect(gain)
      // engines rev: pitch follows rpm (0..1), idle a little below the recording
      if (kind === 'truck' || kind === 'engine') rateParam = (rpm) => s.playbackRate.setTargetAtTime(0.75 + rpm * 0.6, ctx.currentTime, 0.1)
      gain.gain.setTargetAtTime(0.6 * level, ctx.currentTime, 0.4)
    } else switch (kind) {
      case 'wind': {
        const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.6 })
        src(this.brown, 0.7).connect(f).connect(gain)
        lfo(0.07, 180, f.frequency)
        const hiss = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1800, Q: 0.5 })
        const hg = new GainNode(ctx, { gain: 0.05 })
        src(this.white, 0.5).connect(hiss).connect(hg).connect(gain)
        lfo(0.11, 0.04, hg.gain)
        rateParam = (v) => f.frequency.setTargetAtTime(300 + v * 500, ctx.currentTime, 1.5)
        gain.gain.setTargetAtTime(0.5 * level, ctx.currentTime, 1)
        break
      }
      case 'insects': {
        const f = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 5200, Q: 8 })
        const am = new GainNode(ctx, { gain: 0 })
        src(this.white).connect(f).connect(am).connect(gain)
        lfo(23, 0.5, am.gain)
        lfo(0.3, 600, f.frequency)
        gain.gain.setTargetAtTime(0.05 * level, ctx.currentTime, 2)
        break
      }
      case 'hum': {
        for (const [freq, v] of [[50, 0.35], [100, 0.25], [150, 0.12], [250, 0.05]]) {
          const g = new GainNode(ctx, { gain: v })
          osc('sine', freq).connect(g).connect(gain)
        }
        const buzz = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2000, Q: 3 })
        const bg = new GainNode(ctx, { gain: 0.03 })
        src(this.white).connect(buzz).connect(bg).connect(gain)
        gain.gain.setTargetAtTime(0.18 * level, ctx.currentTime, 0.5)
        break
      }
      case 'generator': {
        const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260, Q: 2 })
        const o = osc('sawtooth', 29)
        const thump = new GainNode(ctx, { gain: 0.6 })
        o.connect(f).connect(thump).connect(gain)
        lfo(14.5, 0.35, thump.gain)
        const mf = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 1 })
        const mg = new GainNode(ctx, { gain: 0.08 })
        src(this.white, 0.6).connect(mf).connect(mg).connect(gain)
        gain.gain.setTargetAtTime(0.4 * level, ctx.currentTime, 0.5)
        break
      }
      case 'radio': {
        const f = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1400, Q: 1.5 })
        const am = new GainNode(ctx, { gain: 0.02 })
        src(this.white).connect(f).connect(am).connect(gain)
        lfo(0.4, 0.02, am.gain)
        gain.gain.setTargetAtTime(0.12 * level, ctx.currentTime, 0.5)
        break
      }
      case 'fire': {
        const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 0.5 })
        src(this.brown, 1.4).connect(f).connect(gain)
        const crackle = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 3000 })
        const cg = new GainNode(ctx, { gain: 0 })
        src(this.white).connect(crackle).connect(cg).connect(gain)
        lfo(7.3, 0.06, cg.gain)
        gain.gain.setTargetAtTime(0.3 * level, ctx.currentTime, 0.5)
        break
      }
      case 'truck': // no truck / rotor file: the synthesized engine
      case 'rotor':
      case 'engine': {
        const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 3 })
        const a = osc('sawtooth', 32), b = osc('square', 16)
        const bg = new GainNode(ctx, { gain: 0.4 })
        a.connect(f)
        b.connect(bg).connect(f)
        f.connect(gain)
        const nf = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 600, Q: 1 })
        const ng = new GainNode(ctx, { gain: 0.15 })
        src(this.brown, 1).connect(nf).connect(ng).connect(gain)
        rateParam = (rpm) => {
          const t = ctx.currentTime
          a.frequency.setTargetAtTime(28 + rpm * 70, t, 0.08)
          b.frequency.setTargetAtTime(14 + rpm * 35, t, 0.08)
          f.frequency.setTargetAtTime(260 + rpm * 900, t, 0.08)
          ng.gain.setTargetAtTime(0.1 + rpm * 0.25, t, 0.1)
        }
        gain.gain.setTargetAtTime(0.35 * level, ctx.currentTime, 0.3)
        break
      }
      case 'rain': {
        // hiss of drops plus a soft low rumble on roofs and ground; level is driven by the weather
        const hiss = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3800, Q: 0.4 })
        src(this.white, 0.9).connect(hiss).connect(gain)
        const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 450 })
        const lg = new GainNode(ctx, { gain: 0.6 })
        src(this.brown, 0.8).connect(low).connect(lg).connect(gain)
        gain.gain.setTargetAtTime(0.3 * level, ctx.currentTime, 0.5)
        break
      }
      case 'siren': {
        const o = osc('triangle', 600)
        lfo(0.25, 220, o.frequency)
        const f = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 0.8 })
        o.connect(f).connect(gain)
        gain.gain.setTargetAtTime(0.4 * level, ctx.currentTime, 0.4)
        break
      }
    }

    const handle: LoopHandle = {
      gain,
      set: (param, v) => {
        if (param === 'rate') rateParam?.(v)
        else gain.gain.setTargetAtTime(v, ctx.currentTime, 0.3)
      },
      move: (p) => {
        if (!panner) return
        panner.positionX.setTargetAtTime(p.x, ctx.currentTime, 0.05)
        panner.positionY.setTargetAtTime(p.y, ctx.currentTime, 0.05)
        panner.positionZ.setTargetAtTime(p.z, ctx.currentTime, 0.05)
      },
      stop: () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
        setTimeout(() => {
          stops.forEach((s) => s())
          gain.disconnect()
          panner?.disconnect()
        }, 800)
        this.loops = this.loops.filter((l) => l !== handle)
      },
    }
    this.loops.push(handle)
    return handle
  }

  // ---- ambience -------------------------------------------------------------------------------------

  /** Starts the bed (wind, insects) and positional sources; `update` adds occasional distant events. */
  startAmbience(level: { wind: number; insects: number; birds: number }, sources: { kind: LoopKind; position: readonly number[] }[]) {
    this.stopAll()
    if (!this.ctx) return
    const wind = this.loop('wind', null, level.wind) ?? undefined
    const insects = level.insects > 0 ? this.loop('insects', null, level.insects) ?? undefined : undefined
    for (const s of sources) this.loop(s.kind, { x: s.position[0], y: s.position[1], z: s.position[2] })
    this.ambience = { timer: 4, level, sources: sources.map((s) => ({ x: s.position[0], y: s.position[1], z: s.position[2] })), wind, insects, rain: this.loop('rain', null, 0) ?? undefined, rainLevel: 0, bedLevel: 1 }
  }

  /** Scales the outdoor bed (wind + insects) — audio zones duck it indoors. */
  setBedLevel(k: number) {
    const a = this.ambience
    if (!a) return
    a.wind?.set('level', 0.5 * a.level.wind * k)
    a.insects?.set('level', 0.05 * a.level.insects * k)
    a.rain?.set('level', this.rainGain * a.rainLevel * k)
    a.bedLevel = k
    a.bed?.gain.gain.setTargetAtTime(0.7 * k, this.ctx!.currentTime, 0.3)
  }

  /** The recorded rain (loop-rain) is much quieter than the synthesized hiss, so it gets more gain. */
  private get rainGain() {
    return this.samples.has('loop-rain') ? 1.1 : 0.3
  }

  /** Rain on the soundscape (0..1), ducked indoors like the rest of the bed. */
  setRain(k: number) {
    const a = this.ambience
    if (!a || Math.abs(a.rainLevel - k) < 0.01) return
    a.rainLevel = k
    a.rain?.set('level', this.rainGain * k * a.bedLevel)
  }

  /** Keeps the `ambience` file looping: schedules the next copy to start BED_OVERLAP seconds before this one ends. */
  private updateBed() {
    const a = this.ambience!
    const ctx = this.ctx!
    const buf = this.samples.get('ambience') // decodes after unlock, so the bed may start a moment late
    if (!buf) return
    if (!a.bed) {
      const gain = new GainNode(ctx, { gain: 0.7 * a.bedLevel })
      gain.connect(this.amb)
      a.bed = { gain, next: ctx.currentTime + 0.05, playing: [] }
    }
    const bed = a.bed
    const x = Math.min(BED_OVERLAP, buf.duration / 4)
    while (bed.next < ctx.currentTime + 1) {
      const t = bed.next
      const src = new AudioBufferSourceNode(ctx, { buffer: buf })
      const g = new GainNode(ctx, { gain: 0 })
      g.gain.setValueCurveAtTime(FADE_IN, t, x)
      g.gain.setValueAtTime(1, t + buf.duration - x)
      g.gain.setValueCurveAtTime(FADE_OUT, t + buf.duration - x, x)
      src.connect(g).connect(bed.gain)
      src.start(t)
      src.onended = () => {
        g.disconnect()
        bed.playing = bed.playing.filter((p) => p !== src)
      }
      bed.playing.push(src)
      bed.next = t + buf.duration - x
    }
  }

  /** Random sparse events: distant gunfire, a far vehicle, birds, gusts. Kept quiet on purpose. */
  update(dt: number) {
    const a = this.ambience
    if (!a || !this.ctx) return
    this.updateBed()
    if ((a.timer -= dt) > 0) return
    a.timer = 6 + Math.random() * 14
    const l = this.listener
    const r = Math.random()
    const far = (min: number, max: number) => {
      const ang = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min)
      return { x: l.x + Math.cos(ang) * d, y: l.y + 5, z: l.z + Math.sin(ang) * d }
    }
    if (r < 0.18) {
      // distant firefight: a short burst far off in the hills
      const p = far(500, 900)
      const shots = 2 + Math.floor(Math.random() * 6)
      for (let i = 0; i < shots; i++) setTimeout(() => this.gunshot({ body: 110, crack: 2500, gain: 0.9, tail: 2, mech: 0 }, p), i * (90 + Math.random() * 60))
    } else if (r < 0.4) {
      // a truck grinding along a far road
      const p = far(250, 400)
      const eng = this.loop('truck', p, 0.0)
      if (eng) {
        eng.set('rate', 0.35)
        eng.set('level', 0.5)
        setTimeout(() => eng.set('level', 0), 4000)
        setTimeout(() => eng.stop(), 6000)
      }
    } else if (r < 0.4 + a.level.birds * 0.4) {
      const o = this.out({ pos: far(30, 80), ref: 6, life: 2, wet: 0.3 })
      if (o) for (let i = 0; i < 4; i++) this.tone(o.input, i * 0.18, { freq: 2800 + Math.random() * 1500, endFreq: 3800, volume: 0.04, decay: 0.12 })
    } else if (a.wind) {
      a.wind.set('rate', Math.random())
    }
  }

  stopAll() {
    for (const l of [...this.loops]) l.stop()
    const bed = this.ambience?.bed
    if (bed && this.ctx) {
      bed.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
      setTimeout(() => {
        bed.playing.forEach((s) => s.stop())
        bed.gain.disconnect()
      }, 800)
    }
    this.ambience = null
  }
}

export const audio = new AudioSystem()
