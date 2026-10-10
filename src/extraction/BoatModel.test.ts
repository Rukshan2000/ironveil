import { describe, expect, it } from 'vitest'
import { hullGeometry, sponsonGeometry } from './BoatModel'

describe('boat hull', () => {
  const { geometry, gunwale } = hullGeometry(7, 2.3, 0.55, 0.05)
  geometry.computeBoundingBox()
  const b = geometry.boundingBox!

  it('builds finite geometry of the requested size', () => {
    expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true)
    expect(b.max.z - b.min.z).toBeCloseTo(7, 1)
    expect(b.max.x - b.min.x).toBeCloseTo(2.3, 1)
  })

  it('floats: keel below the waterline (-0.35), gunwale above it, sheer highest at the bow', () => {
    expect(b.min.y).toBeLessThan(-0.35)
    expect(b.max.y).toBeGreaterThan(-0.35)
    expect(gunwale[0][1]).toBeGreaterThan(gunwale[gunwale.length - 1][1])
    expect(gunwale[0][0]).toBeLessThan(gunwale[gunwale.length - 1][0]) // fine bow, full stern
  })

  it('wraps a sponson tube round the gunwale', () => {
    const tube = sponsonGeometry(gunwale, 0.26)
    tube.computeBoundingBox()
    expect(tube.boundingBox!.max.x).toBeGreaterThan(b.max.x)
  })
})
