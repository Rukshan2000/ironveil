import { settings, type Action } from '../state/settings'

/**
 * InputManager: the only place that listens to the keyboard and mouse. Event listeners write raw state, game code
 * reads named actions (`input.down('sprint')`) resolved through the remappable bindings in settings. Mouse buttons
 * are codes too (Mouse0 / Mouse2) so fire and aim can be rebound. A gamepad source can later feed the same sets.
 */
const down = new Set<string>()
const pressed = new Set<string>()
const released = new Set<string>()
const mouse = { dx: 0, dy: 0, wheel: 0 }
/** While set, the next key/button press is captured for rebinding instead of being played. */
let capture: ((code: string) => void) | null = null

/** Typing IMMORTAL anywhere toggles god mode. */
export const cheats = { god: false }
let typed = ''

// Keys the browser would otherwise act on (help, scroll, find, menus…).
const PREVENT = new Set(['F1', 'F2', 'F3', 'Space', 'Tab', 'ControlLeft', 'AltLeft', 'KeyC', 'KeyR', 'KeyE', 'KeyF', 'KeyV', 'KeyG', 'KeyH', 'KeyI', 'KeyQ', 'KeyZ'])

const codes = (a: Action) => settings().bindings[a] ?? []

export const input = {
  down: (a: Action) => codes(a).some((c) => down.has(c)),
  /** True only on the frame a bound key went down. */
  pressed: (a: Action) => codes(a).some((c) => pressed.has(c)),
  released: (a: Action) => codes(a).some((c) => released.has(c)),
  /** Two actions share a key (lean right / interact on E by default). */
  shares: (a: Action, b: Action) => codes(a).some((c) => codes(b).includes(c)),
  consumeMouse() {
    const d = { dx: mouse.dx, dy: mouse.dy }
    mouse.dx = mouse.dy = 0
    return d
  },
  /** Mouse wheel steps since last call (+1 = down / towards the user). */
  consumeWheel() {
    const w = Math.sign(mouse.wheel)
    mouse.wheel = 0
    return w
  },
  endFrame() {
    pressed.clear()
    released.clear()
  },
  /** Rebinding UI: resolves with the next key or button pressed (Escape cancels with null). */
  captureNext(): Promise<string | null> {
    return new Promise((resolve) => {
      capture = (code) => {
        capture = null
        resolve(code === 'Escape' ? null : code)
      }
    })
  },
}

const press = (code: string) => {
  if (!down.has(code)) pressed.add(code)
  down.add(code)
}
const release = (code: string) => {
  if (down.delete(code)) released.add(code)
}

export function attachInput(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (capture) {
      e.preventDefault()
      return capture(e.code)
    }
    typed = (typed + e.key.toUpperCase()).slice(-8)
    if (typed === 'IMMORTAL') {
      cheats.god = !cheats.god
      console.log(`God mode ${cheats.god ? 'ON' : 'OFF'}`)
    }
    if (PREVENT.has(e.code) && document.pointerLockElement) e.preventDefault()
    if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F2') e.preventDefault()
    if (!e.repeat) press(e.code)
  }
  const onKeyUp = (e: KeyboardEvent) => release(e.code)
  const onMouseMove = (e: MouseEvent) => {
    if (!document.pointerLockElement) return
    mouse.dx += e.movementX
    mouse.dy += e.movementY
  }
  const onMouseDown = (e: MouseEvent) => {
    if (capture) return capture(`Mouse${e.button}`)
    if (document.pointerLockElement) press(`Mouse${e.button}`)
  }
  const onMouseUp = (e: MouseEvent) => release(`Mouse${e.button}`)
  const onWheel = (e: WheelEvent) => {
    if (document.pointerLockElement) mouse.wheel += e.deltaY
  }
  const reset = () => {
    for (const c of down) released.add(c)
    down.clear()
  }
  const noMenu = (e: Event) => e.preventDefault()
  const onLockChange = () => !document.pointerLockElement && reset()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('blur', reset)
  window.addEventListener('contextmenu', noMenu)
  document.addEventListener('pointerlockchange', onLockChange)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('blur', reset)
    window.removeEventListener('contextmenu', noMenu)
    document.removeEventListener('pointerlockchange', onLockChange)
  }
}
