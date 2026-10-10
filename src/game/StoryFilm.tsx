import { useEffect, useRef, useState } from 'react'
import { endStory } from '../app/actions'
import { hush, say } from '../audio/speech'
import { mission } from '../missions/registry'
import { useGameStore } from '../state/gameStore'
import { shotAt, story, storyLength } from './storyTimeline'

/**
 * DOM half of the story film shown before each mission: letterbox, narration (speech synthesis), subtitles, name cards
 * and the title. The pictures come from StoryDirector inside the canvas — the real base, EVA's office and a stage
 * with the game's own soldier models. Space / Esc / Enter or the button skips it.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function StoryFilm() {
  const [t, setT] = useState(0)
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    hush()
    endStory()
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const now = story.freeze ?? (performance.now() - start) / 1000
      story.t = now
      setT(now)
      if (now >= storyLength()) return finishRef.current()
      raf = requestAnimationFrame(tick)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
        e.preventDefault()
        finishRef.current()
      }
    }
    story.t = 0
    raf = requestAnimationFrame(tick)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      hush()
    }
  }, [])

  const m = mission(useGameStore((s) => s.session?.def.id ?? ''))
  const { i, lt, shot } = shotAt(t)
  useEffect(() => say(shotAt(story.t).shot.text(), 'narrator', { interrupt: true }), [i])
  // dip to black between shots
  const fade = Math.min(clamp01(lt / 0.6), clamp01((shot.dur - lt) / 0.6))
  const card = shot.card
  const cardIn = card ? clamp01((lt - card.at) * 2) * clamp01((shot.dur - 0.8 - lt) * 2) : 0
  const font = { fontFamily: "'DIN Alternate', 'Bahnschrift', 'Roboto Condensed', sans-serif" }

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black" style={{ opacity: 1 - fade }} />
      <div className="absolute inset-x-0 top-0 h-[8vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 flex h-[16vh] items-center justify-center bg-black px-8">
        <div className="max-w-4xl text-center text-lg leading-relaxed text-hud/90">{shot.text()}</div>
      </div>
      <div className="absolute inset-x-0 bottom-[16vh] h-[3px] bg-hud/10"><div className="h-full bg-warn/60" style={{ width: `${(t / storyLength()) * 100}%` }} /></div>

      {card && (
        <div className="absolute left-[5vw] top-[14vh] border-l-[10px] bg-black/70 px-7 py-4" style={{ ...font, borderColor: card.color, opacity: cardIn, transform: `translateX(${(1 - cardIn) * 40}px)` }}>
          <div className="text-5xl font-bold tracking-[0.18em] text-[#ecebe2]">{card.name()}</div>
          <div className="mt-2 text-sm tracking-[0.25em]" style={{ color: card.color }}>{card.role()}</div>
        </div>
      )}

      {shot.where === 'title' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ ...font, opacity: clamp01(lt) }}>
          <div className="text-xl tracking-[0.6em] text-warn">MISSION {m.number}</div>
          <div className="mt-4 text-7xl font-bold tracking-[0.3em] text-[#ecebe2] drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{m.def.name}</div>
        </div>
      )}

      <button
        onClick={finish}
        className="pointer-events-auto absolute right-6 top-[2vh] border border-hud/40 bg-black/60 px-4 py-1.5 text-[11px] tracking-[0.25em] text-hud hover:border-hud"
      >
        SKIP STORY — SPACE
      </button>
    </div>
  )
}
