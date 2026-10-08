import { describe, expect, it } from 'vitest'
import { calculateDistanceKm } from './calculateDistanceKm'
import type { GeographicCoordinates } from './calculateDistanceKm'

const origin = { lat: 0, lng: 0 }
// Fixed spherical reference for R = 6371.0088 km, rounded to 6 decimal places.
const MAX_DISTANCE_KM = 20015.114442

function expectInvalid(point: unknown, error: typeof TypeError | typeof RangeError) {
  const coordinates = point as GeographicCoordinates
  expect(() => calculateDistanceKm(coordinates, origin)).toThrow(error)
  expect(() => calculateDistanceKm(origin, coordinates)).toThrow(error)
}

describe('calculateDistanceKm', () => {
  it.each([
    origin, { lat: 51.5074, lng: -0.1278 }, { lat: -33.8688, lng: 151.2093 },
    { lat: -89.999, lng: 179.999 }, { lat: -0, lng: -0 },
  ])('returns exact zero for identical coordinates %j', (point) => {
    expect(calculateDistanceKm(point, { ...point })).toBe(0)
  })

  it.each([-90, -37, 0, 51, 90])('returns exact zero across +/-180 at latitude %s', (lat) => {
    expect(calculateDistanceKm({ lat, lng: -180 }, { lat, lng: 180 })).toBe(0)
    expect(calculateDistanceKm({ lat, lng: 180 }, { lat, lng: -180 })).toBe(0)
  })

  it.each([90, -90])('returns exact zero at the same pole %s regardless of longitude', (lat) => {
    expect(calculateDistanceKm({ lat, lng: -123 }, { lat, lng: 47 })).toBe(0)
    expect(calculateDistanceKm({ lat, lng: 180 }, { lat, lng: 0 })).toBe(0)
  })

  it('retains a tiny genuine separation without rounding it to zero', () => {
    const distance = calculateDistanceKm(origin, { lat: 0, lng: 0.000000001 })
    expect(distance).toBeGreaterThan(0)
    expect(Math.abs(distance - 0.0000001111950802335)).toBeLessThan(1e-15)
  })

  it('matches the equatorial one-degree reference', () => {
    expect(calculateDistanceKm(origin, { lat: 0, lng: 1 })).toBeCloseTo(111.195080, 6)
  })

  it('matches the published Newport-Cleveland great-circle reference', () => {
    // GeoPy example: https://github.com/geopy/geopy/blob/master/geopy/distance.py
    // (41.49008, -71.312796) -> (41.499498, -81.695391): 536.997990696 miles.
    // Converted fixed reference: 864.214494 km. Tolerance 0.001 km accommodates
    // rounding and GeoPy's radius of 6371.009 km versus our 6371.0088 km.
    const distance = calculateDistanceKm(
      { lat: 41.49008, lng: -71.312796 },
      { lat: 41.499498, lng: -81.695391 },
    )
    expect(Math.abs(distance - 864.214494)).toBeLessThan(0.001)
  })

  it('takes the short path across the antimeridian', () => {
    const a = { lat: 0, lng: 179 }
    const b = { lat: 0, lng: -179 }
    expect(calculateDistanceKm(a, b)).toBeCloseTo(222.390160, 6)
    expect(calculateDistanceKm(b, a)).toBeCloseTo(222.390160, 6)
  })

  it.each([89.999, -89.999])('handles nearby positions around pole latitude %s', (lat) => {
    // Opposite meridians, 0.001 degrees from the pole: a 0.002-degree surface arc.
    const distance = calculateDistanceKm({ lat, lng: 0 }, { lat, lng: 180 })
    expect(Math.abs(distance - 0.222390160)).toBeLessThan(1e-9)
  })

  it.each([
    [origin, { lat: 0, lng: 180 }],
    [{ lat: 90, lng: -180 }, { lat: -90, lng: 180 }],
    [{ lat: 30, lng: 20 }, { lat: -30, lng: -160 }],
  ])('handles exact antipodes %j and %j', (a, b) => {
    expect(Math.abs(calculateDistanceKm(a, b) - MAX_DISTANCE_KM)).toBeLessThan(0.001)
  })

  it.each([
    [origin, { lat: 0.000001, lng: 179.999999 }],
    [{ lat: 45, lng: -30 }, { lat: -44.999999, lng: 149.999999 }],
  ])('keeps near-antipodal distances finite and bounded for %j and %j', (a, b) => {
    const distance = calculateDistanceKm(a, b)
    expect(Number.isFinite(distance)).toBe(true)
    expect(distance).toBeGreaterThan(20015.11)
    expect(distance).toBeLessThanOrEqual(MAX_DISTANCE_KM + 0.000001)
  })

  it.each([
    [{ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 }],
    [{ lat: 60, lng: 179 }, { lat: -20, lng: -179 }],
    [{ lat: -89.999, lng: -30 }, { lat: -89.99, lng: 145 }],
  ])('is symmetric for %j and %j', (a, b) => {
    expect(calculateDistanceKm(a, b)).toBeCloseTo(calculateDistanceKm(b, a), 8)
  })

  it.each([
    { lat: -90, lng: -180 }, { lat: -90, lng: 180 },
    { lat: 90, lng: -180 }, { lat: 90, lng: 180 },
    { lat: 0, lng: -180 }, { lat: 0, lng: 180 },
  ])('accepts coordinate boundary %j', (point) => {
    const distance = calculateDistanceKm(point, origin)
    expect(Number.isFinite(distance)).toBe(true)
    expect(distance).toBeGreaterThanOrEqual(0)
    expect(distance).toBeLessThanOrEqual(MAX_DISTANCE_KM + 0.000001)
  })

  it.each([null, undefined, 42, '0,0', true, [], () => undefined])(
    'rejects malformed coordinate object %s with TypeError', (point) => {
      expectInvalid(point, TypeError)
    },
  )

  it.each([{}, { lat: 0 }, { lng: 0 }])('rejects missing coordinate fields %j', (point) => {
    expectInvalid(point, TypeError)
  })

  describe.each([['lat', 90], ['lng', 180]] as const)('%s validation', (field, limit) => {
    it.each(['0', null, undefined, false, {}])('rejects nonnumeric field %j with TypeError', (value) => {
      expectInvalid({ ...origin, [field]: value }, TypeError)
    })

    it.each([NaN, Infinity, -Infinity])('rejects non-finite field %s with RangeError', (value) => {
      expectInvalid({ ...origin, [field]: value }, RangeError)
    })

    it.each([-1, 1])('rejects out-of-range field on side %s with RangeError', (side) => {
      expectInvalid({ ...origin, [field]: side * (limit + 0.01) }, RangeError)
    })
  })

  it('validates both inputs before any exact-zero shortcut', () => {
    const invalid = { lat: 90, lng: 181 }
    expect(() => calculateDistanceKm(invalid, invalid)).toThrow(RangeError)
    expect(() => calculateDistanceKm({ lat: 90, lng: 0 }, invalid)).toThrow(RangeError)
    expect(() => calculateDistanceKm({ lat: -90, lng: 0 }, { lat: -90, lng: NaN })).toThrow(RangeError)
    const missing = { lat: 0 } as GeographicCoordinates
    expect(() => calculateDistanceKm(missing, missing)).toThrow(TypeError)
  })

  it('preserves frozen inputs and is deterministic across repeated calls', () => {
    const a = Object.freeze({ lat: 25, lng: 179 })
    const b = Object.freeze({ lat: -35, lng: -170 })
    const snapshot = [{ ...a }, { ...b }]
    const first = calculateDistanceKm(a, b)
    expect(calculateDistanceKm(a, b)).toBe(first)
    expect([a, b]).toEqual(snapshot)
  })
})
