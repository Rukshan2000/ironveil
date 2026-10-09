import { useEffect, useRef, useState } from 'react'
import { requestLock } from '../app/actions'
import { coop } from '../net/coop'
import { useGameStore } from '../state/gameStore'

const SHOW_FOR = 10_000

/** Co-op text chat (Enter) and voice call (T). Typing releases the mouse but does not pause the game. */
export function CoopChat() {
  const status = useGameStore((s) => s.coopStatus)
  const chat = useGameStore((s) => s.chat)
  const open = useGameStore((s) => s.chatOpen)
  const voice = useGameStore((s) => s.voice)
  const [text, setText] = useState('')
  const [, tick] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const connected = status === 'connected'

  useEffect(() => {
    if (!connected) return
    const onKey = (e: KeyboardEvent) => {
      if (useGameStore.getState().chatOpen || e.repeat) return
      if (e.code === 'Enter') {
        e.preventDefault()
        useGameStore.setState({ chatOpen: true }) // before releasing the mouse, so App doesn't pause
        document.exitPointerLock()
      }
      if (e.code === 'KeyT') coop.toggleVoice()
    }
    window.addEventListener('keydown', onKey)
    // re-render now and then so old lines fade out
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearInterval(t)
    }
  }, [connected])
  useEffect(() => {
    if (open) field.current?.focus()
  }, [open])

  if (!connected) return null
  const close = () => {
    setText('')
    useGameStore.setState({ chatOpen: false })
    if (useGameStore.getState().phase === 'playing') requestLock()
  }
  const now = performance.now()
  const lines = open ? chat.slice(-8) : chat.filter((l) => now - l.at < SHOW_FOR).slice(-5)

  return (
    <div className="pointer-events-none fixed bottom-[22vh] left-4 z-20 w-[min(420px,calc(100vw-2rem))] text-[14px]">
      {voice !== 'off' && (
        <div className="mb-2 inline-block border border-hud/30 bg-black/50 px-3 py-1 text-[11px] tracking-[0.2em]">
          {voice === 'on' && <span className="text-accent">● VOICE ON — T TO HANG UP</span>}
          {voice === 'calling' && <span className="text-hud">CALLING FRIEND… — T TO CANCEL</span>}
          {voice === 'ringing' && <span className="animate-pulse text-warn">FRIEND IS CALLING — T TO ANSWER</span>}
        </div>
      )}
      {lines.map((l) => (
        <div key={l.id} className="mb-1 bg-black/40 px-2 py-0.5 leading-snug" style={{ opacity: open ? 1 : Math.min(1, (SHOW_FOR - (now - l.at)) / 2000) }}>
          <span className={l.mine ? 'text-hud-dim' : 'text-warn'}>{l.mine ? 'You' : 'Friend'}:</span> <span className="text-hud">{l.text}</span>
        </div>
      ))}
      {open && (
        <input
          ref={field}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation() // keep game controls and cheat codes out of chat
            if (e.key === 'Enter') {
              coop.sendChat(text)
              close()
            }
            if (e.key === 'Escape') close()
          }}
          onBlur={() => useGameStore.getState().chatOpen && close()}
          placeholder="Message your friend…  Enter to send · Esc to cancel"
          className="pointer-events-auto mt-1 w-full border border-hud/40 bg-black/70 px-2 py-1.5 text-hud outline-none placeholder:text-hud-dim focus:border-hud"
        />
      )}
      {!open && <div className="text-[10px] tracking-[0.2em] text-hud-dim/70">ENTER — CHAT · T — VOICE</div>}
    </div>
  )
}
