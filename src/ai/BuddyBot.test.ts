import { describe, expect, it } from 'vitest'
import { keywords } from './BuddyBot'

describe('Player 2 offline orders', () => {
  it('maps plain words to orders', () => {
    expect(keywords('follow me').order).toBe('follow')
    expect(keywords('hold here').order).toBe('hold')
    expect(keywords('attack the warehouse').order).toBe('attack')
    expect(keywords('go quiet, hold fire').order).toBe('stealth')
    expect(keywords('move there').order).toBe('move')
    expect(keywords('your call').order).toBe('auto')
    expect(keywords('how are you').order).toBeNull()
  })
})
