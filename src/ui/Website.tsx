import { useRef, useState, type ReactNode } from 'react'
import { BUDDY_NAME } from '../ai/BuddyBot'
import { startMission } from '../app/actions'
import { unlocked } from '../missions/registry'
import { EVA_CREDIT } from '../game/BriefingRoom'
import { useGameStore } from '../state/gameStore'
import { controls } from './Screens'
import { CastViewer, HeroScene, Tilt, type CastId } from './SiteStage'

/**
 * The game's landing site, shown first. START GAME loads the mission and plays the story film, then the briefing;
 * DEPLOY there plays the mission story (EVA + the flight in). MAIN MENU leads to insertion time, settings and co-op.
 */

const CAST: { id: CastId; name: string; role: string; color: string; side: 'ally' | 'enemy'; text: string }[] = [
  { id: 'wren', name: 'WREN', role: 'You · infiltration operative', color: '#a9bf8e', side: 'ally', text: 'A ghost, not an army. Sent alone over the ridge with a carbine, a sidearm and a marksman rifle — and orders to come back before dawn.' },
  { id: 'kestrel', name: BUDDY_NAME.toUpperCase(), role: 'AI squadmate · red uniform', color: '#d9554a', side: 'ally', text: 'The best rifleman in the valley. Uses its own judgement until you give an order, then puts your orders first. Rides in the truck bed and shoots while you drive.' },
  { id: 'eva', name: 'EVA', role: 'Operations officer', color: '#7fb6d6', side: 'ally', text: 'Valley Defence Command\'s operations officer. Decoded the word DAWN from Drask\'s traffic — and briefs you before insertion.' },
  { id: 'canopy', name: 'CANOPY', role: 'Your handler · on the radio', color: '#7fb6d6', side: 'ally', text: 'The calm voice in your ear from the moment you land. Tracks the station\'s radio net and calls the changes as they happen.' },
  { id: 'drask', name: 'GEN. IVO DRASK', role: 'Varn Directorate · the enemy', color: '#c9503e', side: 'enemy', text: 'Commander of the Varn Directorate. His army waits across the border for one order — and that order passes through Halvard Ridge.' },
  { id: 'garrison', name: '9TH SIGNALS', role: 'Drask\'s garrison · lockdown team shown', color: '#c9503e', side: 'enemy', text: 'Riflemen, rushers, heavies and tower snipers holding the relay station. Raise the alarm and fixed reaction squads arrive by level.' },
]

const FEATURES: [string, string][] = [
  ['Stealth first', 'Light, sound and movement all count. Stay low, slow and dark; tag guards with binoculars; cut the cameras.'],
  [`${BUDDY_NAME}, your AI squadmate`, 'Give orders in plain words — "hold the warehouse", "attack", "your call". Kestrel protects you first.'],
  ['Two-player co-op', 'Host a room and share the code. Ride in your partner\'s truck, revive beside them, finish the mission together.'],
  ['Security that escalates', 'Four security levels, each bringing a fixed reaction squad with its own uniform and heavier weapons.'],
  ['Vehicles', 'Drive the jeep or the open-top truck through the base — your squadmate rides in the back and fights from it.'],
  ['Dawn, dusk or night', 'Pick the insertion time. Night vision, flashlights and searchlights change how the base is played.'],
]

const LEVELS: [string, string, string][] = [
  ['1', 'Suspicious', '+2 · olive fatigues, caps'],
  ['2', 'Local alert', '+3 · tan coveralls'],
  ['3', 'Facility alarm', '+4 by truck · plate carriers, scoped rifles'],
  ['4', 'Lockdown', '+5 · black, yellow armbands, hardest hitting'],
]

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
      <div className="text-[11px] tracking-[0.4em] text-warn">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-bold tracking-[0.12em] text-[#ecebe2] sm:text-4xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  )
}

/** Hero backdrop: contour lines of the ridge and a sweeping radar over the station. */
function Backdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="0.68" cy="0.42" r="0.6"><stop offset="0" stopColor="#1f2a22" /><stop offset="1" stopColor="#0b0e12" /></radialGradient>
        <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#a9bf8e" stopOpacity="0" /><stop offset="1" stopColor="#a9bf8e" stopOpacity="0.28" /></linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#glow)" />
      <g fill="none" stroke="#a9bf8e" strokeOpacity="0.09" strokeWidth="1.5">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M -50 ${360 + i * 38} C 300 ${250 + i * 40} 600 ${430 + i * 30} 900 ${330 + i * 36} S 1400 ${260 + i * 42} 1700 ${380 + i * 34}`} />
        ))}
      </g>
      <g transform="translate(1090 380)">
        {[80, 160, 240, 320].map((r) => <circle key={r} r={r} fill="none" stroke="#a9bf8e" strokeOpacity="0.12" />)}
        <path d="M -330 0 L 330 0 M 0 -330 L 0 330" stroke="#a9bf8e" strokeOpacity="0.08" />
        <g className="site-sweep"><path d="M 0 0 L 320 0 A 320 320 0 0 0 226 -226 Z" fill="url(#sweep)" /></g>
        <circle r="7" fill="#c9503e" className="blink" />
        <circle cx="-120" cy="90" r="4" fill="#d9a441" className="blink" />
        <circle cx="150" cy="-60" r="4" fill="#d9a441" className="blink" />
        <text x="16" y="-12" fill="#c9503e" fontSize="16" letterSpacing="3" fontFamily="var(--font-mono)">HALVARD RIDGE</text>
      </g>
    </svg>
  )
}

/** Pick a character: their actual game model loads in the viewer (drag to orbit, scroll to zoom). */
function CastSection() {
  const [who, setWho] = useState<CastId>('wren')
  const c = CAST.find((x) => x.id === who)!
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="grid content-start gap-2">
        {CAST.map((x) => (
          <button
            key={x.id}
            onClick={() => setWho(x.id)}
            className={`flex items-center gap-4 border px-4 py-3 text-left transition-all ${x.id === who ? 'translate-x-2 bg-white/[0.06]' : 'border-white/10 bg-white/[0.02] hover:translate-x-1 hover:bg-white/[0.04]'}`}
            style={{ borderColor: x.id === who ? x.color : undefined }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-bold" style={{ borderColor: x.color, color: x.color }}>{x.name.replace('GEN. ', '').slice(0, 2)}</div>
            <div className="min-w-0">
              <div className="font-bold tracking-[0.15em] text-[#ecebe2]">{x.name}</div>
              <div className="truncate text-[10px] tracking-[0.2em]" style={{ color: x.color }}>{x.role.toUpperCase()}</div>
            </div>
            <div className="ml-auto text-[9px] tracking-[0.3em] text-hud-dim">{x.side === 'ally' ? 'ALLY' : 'ENEMY'}</div>
          </button>
        ))}
      </div>
      <div className="relative min-h-[520px] overflow-hidden border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent" style={{ borderTopColor: c.color, borderTopWidth: 3 }}>
        <div className="absolute inset-0"><CastViewer who={who} rim={c.color} /></div>
        <div className="pointer-events-none absolute left-5 top-4">
          <div className="text-3xl font-bold tracking-[0.15em] text-[#ecebe2]">{c.name}</div>
          <div className="mt-1 text-[11px] tracking-[0.25em]" style={{ color: c.color }}>{c.role.toUpperCase()}</div>
        </div>
        <div className="pointer-events-none absolute right-5 top-5 text-[10px] tracking-[0.3em] text-hud-dim">DRAG TO ROTATE · SCROLL TO ZOOM</div>
        <p className="pointer-events-none absolute inset-x-5 bottom-4 max-w-xl bg-black/50 p-3 text-[15px] leading-relaxed text-hud/85">{c.text}</p>
      </div>
    </div>
  )
}

export function Website() {
  const page = useRef<HTMLDivElement>(null)
  const go = (id: string) => page.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth' })
  const start = (e: React.MouseEvent) => {
    e.stopPropagation()
    void startMission('nightfall')
  }
  const lowWaterOpen = unlocked('low-water')
  const menu = (e: React.MouseEvent) => {
    e.stopPropagation()
    useGameStore.getState().setPhase('menu')
  }
  const primary = 'border border-warn bg-warn/10 px-8 py-3 text-sm font-bold tracking-[0.3em] text-warn transition-colors hover:bg-warn hover:text-black'
  const secondary = 'border border-hud/30 px-8 py-3 text-sm tracking-[0.3em] text-hud transition-colors hover:border-hud'

  return (
    <div ref={page} className="fixed inset-0 z-30 overflow-y-auto bg-[#0b0e12] select-text">
      {/* nav */}
      <nav className="sticky top-0 z-10 border-b border-white/5 bg-[#0b0e12]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-8">
          <button onClick={() => go('top')} className="text-lg font-bold tracking-[0.35em] text-[#ecebe2]">IRONVEIL</button>
          <div className="ml-auto hidden gap-6 text-[11px] tracking-[0.3em] text-hud-dim md:flex">
            {[['story', 'STORY'], ['cast', 'CHARACTERS'], ['enemy', 'THE ENEMY'], ['features', 'FEATURES'], ['controls', 'CONTROLS']].map(([id, label]) => (
              <button key={id} onClick={() => go(id)} className="hover:text-hud">{label}</button>
            ))}
          </div>
          <button onClick={start} className="ml-auto border border-warn px-4 py-1.5 text-[11px] tracking-[0.3em] text-warn hover:bg-warn hover:text-black md:ml-0">START GAME</button>
        </div>
      </nav>

      {/* hero */}
      <header id="top" className="relative flex min-h-[92vh] items-center overflow-hidden">
        <Backdrop />
        {/* the game's own soldiers on a turntable; the camera leans with the mouse */}
        <div className="absolute inset-y-0 right-0 hidden w-[58%] md:block"><HeroScene /></div>
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 bg-gradient-to-r from-[#0b0e12] via-[#0b0e12]/70 to-transparent md:block" />
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-8">
          <div className="text-[11px] tracking-[0.5em] text-warn">TACTICAL INFILTRATION · MISSION 01</div>
          <h1 className="mt-4 text-6xl font-bold tracking-[0.25em] text-[#ecebe2] sm:text-8xl">IRONVEIL</h1>
          <div className="mt-3 text-xl tracking-[0.5em] text-hud/80 sm:text-2xl">OPERATION NIGHTFALL</div>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-hud/80">
            An army waits across the border for one order. Tonight you steal it — one operative, one partner, one night on Halvard Ridge.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <button onClick={start} className={primary}>START GAME</button>
            <button onClick={menu} className={secondary}>MAIN MENU · CO-OP</button>
          </div>
          <div className="mt-4 text-[12px] tracking-[0.15em] text-hud-dim">Start Game plays the story film, then your mission briefing. Deploy from the briefing for the mission story and insertion.</div>
        </div>
        <button onClick={() => go('story')} className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.4em] text-hud-dim hover:text-hud">SCROLL ▾</button>
      </header>

      <Section id="story" eyebrow="THE STORY" title="Twenty quiet years end at dawn">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="space-y-5 text-[17px] leading-relaxed text-hud/85">
            <p>The <b className="text-[#ecebe2]">Halvard Valley</b> — farms, a river, and a border that has been quiet for twenty years.</p>
            <p>Across the ridge, <b className="text-danger">General Ivo Drask</b> and his army, the <b className="text-danger">Varn Directorate</b>, have been massing soldiers for months. Six weeks ago his 9th Signals Detachment seized the old relay station on Halvard Ridge; every night his coded orders pass through it.</p>
            <p>At <b className="text-[#7fb6d6]">Valley Defence Command</b>, operations officer Eva decodes one word from the static: <b className="text-warn">DAWN</b>. There is no time to move an army. So she sends a ghost.</p>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-6">
            <div className="hud-label">Mission orders</div>
            <ol className="mt-4 space-y-4">
              {['Get inside the wire — ditch, tunnel or the main gate', 'Steal the orders from the comms terminal', 'Cut the uplink at the power station', 'Extract from the north-west landing zone before dawn'].map((t, i) => (
                <li key={t} className="flex gap-4"><span className="text-2xl font-bold text-warn">{i + 1}</span><span className="pt-1 text-hud/85">{t}</span></li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section id="next" eyebrow="MISSION 02 · OPERATION LOW WATER" title="DAWN was never an attack">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="space-y-5 text-[17px] leading-relaxed text-hud/85">
            <p>The stolen orders decode at last. At first light Drask's engineers open every sluice of the <b className="text-[#ecebe2]">Tessaly Dam</b>. The flood takes the valley's river line, and when the water drops his tanks cross the empty riverbed.</p>
            <p>And somebody told his gunships where your helicopter would land. This time there is no flight plan: Wren goes in <b className="text-warn">up the river</b>, and only Canopy knows the route.</p>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-6">
            <div className="hud-label">Mission orders</div>
            <ol className="mt-4 space-y-4">
              {['Get past the fence line — river, west bank or the road gate', 'Lock the sluice program in the control house', 'Kill the backup generator before they force the gates', 'Hold the west-bank jetty for the boat, then run downriver'].map((t, i) => (
                <li key={t} className="flex gap-4"><span className="text-2xl font-bold text-warn">{i + 1}</span><span className="pt-1 text-hud/85">{t}</span></li>
              ))}
            </ol>
            <button
              disabled={!lowWaterOpen}
              onClick={(e) => { e.stopPropagation(); void startMission('low-water') }}
              className={`mt-6 ${lowWaterOpen ? primary : 'cursor-not-allowed border border-hud/15 px-8 py-3 text-sm tracking-[0.3em] text-hud-dim'}`}
            >
              {lowWaterOpen ? 'PLAY MISSION 02' : 'LOCKED — COMPLETE NIGHTFALL'}
            </button>
          </div>
        </div>
      </Section>

      <Section id="cast" eyebrow="CHARACTERS" title="Who's who on the ridge">
        <CastSection />
      </Section>

      <Section id="enemy" eyebrow="THE ENEMY" title="Every alarm has a price">
        <p className="max-w-2xl text-[17px] leading-relaxed text-hud/80">Nineteen guards hold the station. Each time their security level rises, one fixed reaction squad comes in — 33 at most. Learn the uniforms and you know what you are facing.</p>
        <div className="mt-8 grid gap-3">
          {LEVELS.map(([n, name, what]) => (
            <Tilt key={n} max={4} className="flex items-center gap-5 border border-white/10 bg-white/[0.02] px-5 py-4">
              <div className="text-3xl font-bold text-danger">{n}</div>
              <div className="w-40 text-sm tracking-[0.2em] text-[#ecebe2]">{name.toUpperCase()}</div>
              <div className="text-hud/75">{what}</div>
            </Tilt>
          ))}
        </div>
      </Section>

      <Section id="features" eyebrow="FEATURES" title="How Nightfall plays">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <Tilt key={title} className="h-full border-l-2 border-accent/60 bg-white/[0.03] p-6">
              <h3 className="text-lg font-bold tracking-[0.08em] text-[#ecebe2]">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-hud/75">{text}</p>
            </Tilt>
          ))}
        </div>
      </Section>

      <Section id="controls" eyebrow="CONTROLS" title="Keyboard and mouse">
        <div className="grid gap-x-10 gap-y-2 sm:grid-cols-2">
          {controls().map(([key, what]) => (
            <div key={what} className="flex justify-between border-b border-white/5 py-2 text-[14px]">
              <span className="text-warn">{key}</span><span className="text-hud/80">{what}</span>
            </div>
          ))}
          <div className="flex justify-between border-b border-white/5 py-2 text-[14px]"><span className="text-warn">Enter</span><span className="text-hud/80">Order {BUDDY_NAME} / chat</span></div>
        </div>
      </Section>

      {/* final call to action */}
      <section className="border-t border-white/5 py-24 text-center">
        <div className="text-[11px] tracking-[0.5em] text-warn">THE ORDER IS COMING</div>
        <h2 className="mt-4 text-4xl font-bold tracking-[0.2em] text-[#ecebe2]">BE GONE BEFORE DAWN</h2>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <button onClick={start} className={primary}>START GAME</button>
          <button onClick={menu} className={secondary}>MAIN MENU · CO-OP</button>
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 py-8 text-center text-[11px] leading-relaxed tracking-[0.1em] text-hud-dim">
        IRONVEIL · Operation Nightfall — all names, places and story are original to this project.<br />
        EVA model: {EVA_CREDIT}.
      </footer>
    </div>
  )
}
