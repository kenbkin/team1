import { describe, expect, it, vi } from 'vitest'
import { getGuessCoordinates, PROJECTION_CONSISTENCY_TOLERANCE_PX } from './guessCoordinates'

describe('getGuessCoordinates', () => {
  it('accepts valid coordinates with a matching screen projection', () => {
    const coordinates = { lat: 12, lng: 34 }
    const point = { x: 100, y: 200 }
    const project = vi.fn(() => point)
    const result = getGuessCoordinates(coordinates, point, project)
    expect(result).toEqual(coordinates)
    expect(result).not.toBe(coordinates)
    expect(project).toHaveBeenCalledExactlyOnceWith(coordinates)
  })

  it.each([
    { lat: -90, lng: -180 }, { lat: -90, lng: 180 },
    { lat: 90, lng: -180 }, { lat: 90, lng: 180 }, { lat: 0, lng: 0 },
  ])('accepts coordinate boundaries %j', (coordinates) => {
    const point = { x: 0, y: 0 }
    expect(getGuessCoordinates(coordinates, point, () => point)).toEqual(coordinates)
  })

  describe.each(['lat', 'lng'] as const)('invalid %s', (field) => {
    const limit = field === 'lat' ? 90 : 180
    it.each([-limit - 0.01, limit + 0.01, NaN, Infinity, -Infinity])('rejects %s before projecting', (value) => {
      const project = vi.fn(() => ({ x: 0, y: 0 }))
      expect(getGuessCoordinates({ lat: 0, lng: 0, [field]: value }, { x: 0, y: 0 }, project)).toBeNull()
      expect(project).not.toHaveBeenCalled()
    })
  })

  describe.each(['x', 'y'] as const)('screen component %s', (field) => {
    it.each([NaN, Infinity, -Infinity])('rejects invalid click component %s', (value) => {
      const project = vi.fn(() => ({ x: 0, y: 0 }))
      expect(getGuessCoordinates({ lat: 0, lng: 0 }, { x: 0, y: 0, [field]: value }, project)).toBeNull()
      expect(project).not.toHaveBeenCalled()
    })

    it.each([NaN, Infinity, -Infinity])('rejects invalid projected component %s', (value) => {
      expect(getGuessCoordinates({ lat: 0, lng: 0 }, { x: 0, y: 0 },
        () => ({ x: 0, y: 0, [field]: value }))).toBeNull()
    })
  })

  it('rejects finite horizon coordinates whose projection differs from the background click', () => {
    expect(getGuessCoordinates({ lat: 20, lng: 80 }, { x: 10, y: 20 },
      () => ({ x: 100, y: 200 }))).toBeNull()
  })

  it.each([
    [0.49, true], [0.5, true], [0.500001, false],
  ] as const)('handles screen distance %s at the tolerance boundary', (distance, accepted) => {
    const result = getGuessCoordinates({ lat: 0, lng: 0 }, { x: 0, y: 0 },
      () => ({ x: distance, y: 0 }))
    expect(result !== null).toBe(accepted)
    expect(PROJECTION_CONSISTENCY_TOLERANCE_PX).toBe(0.5)
  })

  it('uses Euclidean distance rather than independent axis limits', () => {
    expect(getGuessCoordinates({ lat: 0, lng: 0 }, { x: 0, y: 0 },
      () => ({ x: 0.4, y: 0.4 }))).toBeNull()
  })

  it('preserves frozen coordinate, click, and projection inputs', () => {
    const coordinates = Object.freeze({ lat: 12, lng: 34 })
    const point = Object.freeze({ x: 100, y: 200 })
    const projected = Object.freeze({ x: 100.25, y: 200 })
    expect(getGuessCoordinates(coordinates, point, () => projected)).toEqual(coordinates)
    expect(coordinates).toEqual({ lat: 12, lng: 34 })
    expect(point).toEqual({ x: 100, y: 200 })
    expect(projected).toEqual({ x: 100.25, y: 200 })
  })
})
