import { describe, expect, it } from 'vitest'
import { WeaponController } from './WeaponController'
import { AR_K7, VK_8 } from './definitions'

const ready = (w: WeaponController) => (w.tick(5, false, false), w)

describe('WeaponController', () => {
  it('respects fire rate and fires magazine + chambered round', () => {
    const w = new WeaponController(AR_K7)
    expect(w.trigger(true)).toBe('fired')
    expect(w.trigger(true)).toBe(null) // still cooling down
    let shots = 1
    for (let i = 0; i < 1000 && w.ammo > 0; i++) {
      w.tick(60 / AR_K7.fireRate, false, false)
      if (w.trigger(true) === 'fired') shots++
    }
    expect(shots).toBe(AR_K7.magazineSize + 1)
    w.tick(0.2, false, false)
    expect(w.state).toBe('EMPTY')
  })

  it('tactical reload keeps the chambered round and emits mag events in order', () => {
    const w = new WeaponController(AR_K7)
    w.ammo = 5
    expect(w.startReload()).toBe(true)
    expect(w.reloadKind).toBe('tactical')
    const events = []
    for (let t = 0; t < AR_K7.reload.tactical + 0.1; t += 0.05) {
      events.push(...w.tick(0.05, false, false))
      // once the magazine is out, the trigger does nothing
      if (w.reloading && w.reloadProgress > AR_K7.reload.magOut) expect(w.trigger(true)).toBe(null)
    }
    expect(events).toEqual(['magOut', 'magIn', 'reloaded'])
    expect(w.ammo).toBe(AR_K7.magazineSize + 1)
    expect(w.reserve).toBe(AR_K7.reserveAmmo - (AR_K7.magazineSize - 4))
  })

  it('empty reload is slower, works the bolt and loads a fresh magazine', () => {
    const w = new WeaponController(AR_K7)
    w.ammo = 0
    w.startReload()
    expect(w.reloadDuration).toBe(AR_K7.reload.empty)
    const events = []
    for (let t = 0; t < AR_K7.reload.empty + 0.1; t += 0.05) events.push(...w.tick(0.05, false, false))
    expect(events).toContain('bolt')
    expect(w.ammo).toBe(AR_K7.magazineSize)
  })

  it('semi-auto needs a fresh trigger press', () => {
    const w = new WeaponController({ ...AR_K7, action: 'semi' })
    expect(w.trigger(true)).toBe('fired')
    w.tick(1, false, false)
    expect(w.trigger(true)).toBe(null)
    w.trigger(false)
    expect(w.trigger(true)).toBe('fired')
  })

  it('bolt action must cycle between shots', () => {
    const w = new WeaponController(VK_8)
    expect(w.trigger(true)).toBe('fired')
    w.trigger(false)
    w.tick(0.5, false, false)
    expect(w.state).toBe('CYCLING')
    expect(w.trigger(true)).toBe(null)
    w.trigger(false)
    expect(w.tick(VK_8.boltCycle, false, false)).toContain('cycled')
    expect(w.trigger(true)).toBe('fired')
  })

  it('cannot fire while sprinting or right after', () => {
    const w = ready(new WeaponController(AR_K7))
    w.tick(0.3, false, true)
    expect(w.state).toBe('SPRINTING')
    expect(w.trigger(true)).toBe(null)
    w.trigger(false)
    w.tick(0.25, false, false)
    expect(w.trigger(true)).toBe('fired')
  })

  it('aiming tightens spread', () => {
    const w = new WeaponController(AR_K7)
    const hip = w.spread(false)
    w.tick(1, true, false)
    expect(w.spread(false)).toBeLessThan(hip)
    expect(w.state).toBe('ADS')
  })

  it('a trigger press before the magazine is out abandons a tactical reload and fires', () => {
    const w = ready(new WeaponController(AR_K7))
    w.ammo = 5
    w.startReload()
    w.tick(0.05, false, false)
    expect(w.trigger(true)).toBe('fired')
    expect(w.reloading).toBe(false)
    expect(w.ammo).toBe(4)
  })

  it('switching lowers the weapon first and blocks fire, reload and aim until drawn', () => {
    const w = ready(new WeaponController(AR_K7))
    w.lower()
    expect(w.state).toBe('HOLSTERING')
    expect(w.trigger(true)).toBe(null)
    expect(w.startReload()).toBe(false)
    w.tick(0.1, true, false)
    expect(w.aim).toBe(0)
    w.tick(w.holsterTime, false, false)
    expect(w.lowered).toBe(true)
  })

  it('optic zoom steps only while aimed and resets when the sights come down', () => {
    const w = ready(new WeaponController(VK_8))
    expect(w.stepZoom(1)).toBe(false)
    for (let i = 0; i < 20; i++) w.tick(0.05, true, false)
    expect(w.stepZoom(1)).toBe(true)
    expect(w.zoomTarget).toBe(2)
    for (let i = 0; i < 20; i++) w.tick(0.05, true, false)
    expect(w.zoom).toBeCloseTo(2, 1)
    for (let i = 0; i < 20; i++) w.tick(0.05, false, false)
    expect(w.zoomIndex).toBe(0)
  })
})
