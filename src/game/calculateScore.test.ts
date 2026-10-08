import { describe, expect, it } from 'vitest'
import { calculateScore } from './calculateScore'

const references = [
  [0, 1000], [10, 995], [50, 975], [100, 951], [250, 882], [500, 779],
  [1000, 607], [2000, 368], [5000, 82], [10000, 7], [20000, 0],
] as const

describe('calculateScore', () => {
  it.each(references)('returns %s km reference score %s', (distance, score) => {
    expect(calculateScore(distance)).toBe(score)
  })

  it('accepts negative zero as zero', () => {
    expect(calculateScore(-0)).toBe(1000)
  })

  it('produces non-increasing integer scores in [0, 1000]', () => {
    let previous = 1000
    for (let distance = 0; distance <= 21000; distance += 25) {
      const score = calculateScore(distance)
      expect(Number.isInteger(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1000)
      expect(score).toBeLessThanOrEqual(previous)
      previous = score
    }
  })

  it.each([20015, 20015.114442, 20015.114443])('scores near maximum Earth distance %s as zero', (distance) => {
    expect(calculateScore(distance)).toBe(0)
  })

  it.each([1000000, Number.MAX_VALUE])('accepts very large finite distance %s', (distance) => {
    expect(calculateScore(distance)).toBe(0)
  })

  it.each([-Number.MIN_VALUE, -0.01, -1, -Number.MAX_VALUE, NaN, Infinity, -Infinity])(
    'rejects invalid numeric distance %s with RangeError', (distance) => {
      expect(() => calculateScore(distance)).toThrow(RangeError)
    },
  )

  it.each(['0', null, undefined, true, {}, [], 1n])('rejects nonnumber distance %s with TypeError', (distance) => {
    expect(() => calculateScore(distance as number)).toThrow(TypeError)
  })

  it.each([
    [1, 1000], [1.001, 999],
    [1386.29, 500], [1386.3, 500],
    [15201.8, 1], [15201.81, 0],
  ])('uses full-precision distance %s before rounding to %s points', (distance, score) => {
    // Fixed values straddle integer-score rounding transitions; rounding the
    // input kilometers first would fail the 1.001 km and 15201.81 km cases.
    expect(calculateScore(distance)).toBe(score)
  })

  it('returns identical results for repeated calls', () => {
    const distance = 1234.56789
    const first = calculateScore(distance)
    expect(calculateScore(distance)).toBe(first)
    expect(calculateScore(distance)).toBe(first)
  })
})
