import { describe, expect, it } from 'vitest'
import { ObjectiveManager } from './ObjectiveManager'
import type { MissionDef } from './types'

const mission: MissionDef = {
  id: 't', name: 'T', briefing: '',
  objectives: [
    { id: 'a', kind: 'reach', label: '', position: [10, 0, 0], radius: 2 },
    { id: 'b', kind: 'eliminate', label: '', targetId: 'boss' },
    { id: 'c', kind: 'collect', label: '', itemId: 'disk' },
    { id: 'd', kind: 'hack', label: '', interactId: 'pc', duration: 3 },
    { id: 'e', kind: 'extract', label: '', position: [0, 0, 0], radius: 3 },
    { id: 'cams', kind: 'destroy', label: '', targets: ['c1', 'c2'], optional: true },
    { id: 'ghost', kind: 'avoid', label: '', event: 'alarm', optional: true },
    { id: 'files', kind: 'collect', label: '', itemId: 'files', optional: true },
  ],
}

describe('ObjectiveManager', () => {
  it('completes primaries strictly in order', () => {
    const m = new ObjectiveManager(mission)
    const done: string[] = []
    m.onCompleted = (o) => done.push(o.id)
    m.handle({ type: 'extracted' }) // not current yet
    m.handle({ type: 'killed', entityId: 'boss' }) // out of order
    expect(m.index).toBe(0)
    m.handle({ type: 'position', x: 9, z: 1 })
    m.handle({ type: 'killed', entityId: 'grunt' })
    m.handle({ type: 'killed', entityId: 'boss' })
    m.handle({ type: 'collected', itemId: 'disk' })
    m.handle({ type: 'interacted', interactId: 'pc' })
    expect(m.complete).toBe(false)
    m.handle({ type: 'extracted' })
    expect(done).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(m.complete).toBe(true)
    expect(m.current).toBe(null)
  })

  it('runs optionals in parallel and never blocks the primaries', () => {
    const m = new ObjectiveManager(mission)
    m.handle({ type: 'collected', itemId: 'files' })
    expect(m.status.files).toBe('done')
    m.handle({ type: 'destroyed', targetId: 'c1' })
    expect(m.progress.cams).toBe(1)
    m.handle({ type: 'destroyed', targetId: 'c1' }) // same camera twice
    expect(m.status.cams).toBe('active')
    m.handle({ type: 'destroyed', targetId: 'c2' })
    expect(m.status.cams).toBe('done')
    expect(m.index).toBe(0)
  })

  it('fails avoid objectives on the event and completes them at the end otherwise', () => {
    const a = new ObjectiveManager(mission)
    a.handle({ type: 'alarm' })
    a.finalize()
    expect(a.status.ghost).toBe('failed')
    const b = new ObjectiveManager(mission)
    b.finalize()
    expect(b.status.ghost).toBe('done')
  })

  it('restores checkpoint state', () => {
    const m = new ObjectiveManager(mission)
    m.restore({ a: 'done', b: 'done', ghost: 'failed' }, ['c1'])
    expect(m.current?.id).toBe('c')
    expect(m.status.c).toBe('active')
    expect(m.progress.cams).toBe(1)
  })
})
