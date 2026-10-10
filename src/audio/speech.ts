import { useSettings } from '../state/settings'

/**
 * Spoken lines (story narrator, EVA, Kestrel) through the browser's speech synthesis, working around Chrome's quirks:
 * speaking right after cancel() is silently dropped (so the new line waits a beat), utterances can be garbage-collected
 * mid-sentence (so they are kept until they end), and the engine can stick in "paused" (so it is resumed first).
 */
export type Speaker = 'narrator' | 'eva' | 'kestrel'

const STYLE: Record<Speaker, { names: RegExp; female: boolean; rate: number; pitch: number }> = {
  narrator: { names: /daniel|alex|arthur|google uk english male|guy|ryan|david|fred/i, female: false, rate: 0.98, pitch: 0.9 },
  eva: { names: /samantha|victoria|karen|moira|tessa|serena|zira|susan|aria|jenny|libby|sonia|google uk english female|female/i, female: true, rate: 1.04, pitch: 1.05 },
  kestrel: { names: /tom|aaron|oliver|rishi|mark|google us english|male/i, female: false, rate: 1.02, pitch: 0.8 },
}
const FEMALE = /samantha|victoria|karen|moira|tessa|serena|zira|susan|aria|jenny|libby|sonia|female|fiona|kate|ava|allison/i

function voiceFor(who: Speaker): SpeechSynthesisVoice | null {
  const en = (window.speechSynthesis?.getVoices() ?? []).filter((v) => v.lang.startsWith('en'))
  const s = STYLE[who]
  return en.find((v) => s.names.test(v.name) && FEMALE.test(v.name) === s.female) ?? en.find((v) => FEMALE.test(v.name) === s.female) ?? en[0] ?? null
}

const live = new Set<SpeechSynthesisUtterance>()
let pending = 0

/**
 * Speaks a line. `interrupt` cuts off whatever is being said (narration moving to the next shot); otherwise the line
 * queues behind it (dialogue).
 */
export function say(text: string, who: Speaker, { interrupt = false } = {}) {
  const synth = window.speechSynthesis
  if (!synth || !text) return
  const st = useSettings.getState()
  const volume = Math.min(1, st.master * st.voice)
  if (volume <= 0) return
  const go = () => {
    if (synth.paused) synth.resume()
    const u = new SpeechSynthesisUtterance(text)
    const v = voiceFor(who)
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    u.rate = STYLE[who].rate
    u.pitch = STYLE[who].pitch
    u.volume = volume
    live.add(u)
    u.onend = u.onerror = () => live.delete(u)
    synth.speak(u)
  }
  if (interrupt) {
    clearTimeout(pending)
    if (synth.speaking || synth.pending) {
      synth.cancel()
      pending = window.setTimeout(go, 120)
      return
    }
  }
  go()
}

/** Stops all speech (skips, scene changes). */
export function hush() {
  clearTimeout(pending)
  window.speechSynthesis?.cancel()
}

// voices load asynchronously in Chrome; asking once early starts the load
globalThis.speechSynthesis?.getVoices()
