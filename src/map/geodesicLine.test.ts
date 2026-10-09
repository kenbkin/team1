import { describe, expect, it } from 'vitest'
import type { GeodesicLineGeometry, GeodesicPosition } from './geodesicLine'
import { calculateDistanceKm } from '../game/calculateDistanceKm'
import type { Coordinates } from './guessCoordinates'
import { createGeodesicLine, GEODESIC_LATITUDE_LIMIT, prepareGeodesicPrefix } from './geodesicLine'

const point = ([lng, lat]: GeodesicPosition): Coordinates => ({ lat, lng })
const vector = ([lng, lat]: GeodesicPosition) => {
  const phi = lat * Math.PI / 180
  const lambda = lng * Math.PI / 180
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)]
}
function routeLength(route: GeodesicLineGeometry) {
  return route.coordinates.reduce((sum, part) => sum + part.slice(1).reduce(
    (length, p, i) => length + calculateDistanceKm(point(part[i]), point(p)), 0), 0)
}
function expectValid(route: GeodesicLineGeometry) {
  expect(route.type).toBe('MultiLineString')
  expect(route.coordinates.flat().length).toBeLessThanOrEqual(195)
  for (const part of route.coordinates) {
    expect(part.length).toBeGreaterThanOrEqual(2)
    for (const [lng, lat] of part) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true)
      expect(Math.abs(lng)).toBeLessThanOrEqual(180)
      expect(Math.abs(lat)).toBeLessThanOrEqual(GEODESIC_LATITUDE_LIMIT)
    }
    for (let i = 1; i < part.length; i += 1) {
      expect(Math.abs(part[i][0] - part[i - 1][0])).toBeLessThanOrEqual(180)
      const distance = calculateDistanceKm(point(part[i - 1]), point(part[i]))
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(111.195081)
    }
  }
}

const ordinaryRoutes: [Coordinates, Coordinates][] = [
  [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }],
  [{ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 }],
  [{ lat: 40.7128, lng: -74.006 }, { lat: 35.6762, lng: 139.6503 }],
  [{ lat: -33.8688, lng: 151.2093 }, { lat: 51.5074, lng: -0.1278 }],
  [{ lat: 0, lng: 0 }, { lat: 0.000001, lng: 179.999999 }],
  [{ lat: 45, lng: -30 }, { lat: -44.999999, lng: 149.999999 }],
]

describe('createGeodesicLine', () => {
  it.each(ordinaryRoutes)('preserves endpoints and spherical length for %j to %j', (a, b) => {
    const route = createGeodesicLine(a, b)
    expectValid(route)
    expect(route.coordinates[0][0]).toEqual([a.lng, a.lat])
    expect(route.coordinates.at(-1)?.at(-1)).toEqual([b.lng, b.lat])
    // Haversine loses some precision very near antipodes; a meter is sufficient.
    expect(Math.abs(routeLength(route) - calculateDistanceKm(a, b))).toBeLessThan(0.001)
  })

  it('keeps intermediate vertices on the great-circle plane, not a lat/lng chord', () => {
    const a = { lat: 40, lng: -70 }
    const b = { lat: 30, lng: 100 }
    const u = vector([a.lng, a.lat])
    const v = vector([b.lng, b.lat])
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const route = createGeodesicLine(a, b)
    expectValid(route)
    for (const p of route.coordinates.flat()) {
      const w = vector(p)
      expect(Math.abs(w.reduce((sum, value, i) => sum + value * normal[i], 0))).toBeLessThan(1e-12)
    }
    expect(Math.max(...route.coordinates.flat().map((p) => p[1]))).toBeGreaterThan(70)
  })

  it.each([
    [{ lat: 12, lng: 34 }, { lat: 12, lng: 34 }],
    [{ lat: 30, lng: 180 }, { lat: 30, lng: -180 }],
    [{ lat: 90, lng: -123 }, { lat: 90, lng: 47 }],
    [{ lat: -90, lng: 20 }, { lat: -90, lng: 160 }],
  ])('returns empty geometry for equivalent points %j and %j', (a, b) => {
    expect(createGeodesicLine(a, b)).toEqual({ type: 'MultiLineString', coordinates: [] })
  })

  it.each([1, -1])('splits a short seam crossing in direction %s', (direction) => {
    const a = { lat: 0, lng: direction * 179 }
    const b = { lat: 0, lng: direction * -179 }
    const route = createGeodesicLine(a, b)
    expectValid(route)
    expect(route.coordinates).toHaveLength(2)
    expect(route.coordinates[0].at(-1)).toEqual([direction * 180, 0])
    expect(route.coordinates[1][0]).toEqual([direction * -180, 0])
    expect(routeLength(route)).toBeCloseTo(222.390160, 5)
  })

  it.each([1, -1])('uses the spherical seam latitude in direction %s', (direction) => {
    const route = createGeodesicLine({ lat: 45, lng: direction * 170 }, { lat: 45, lng: direction * -170 })
    expectValid(route)
    const left = route.coordinates[0].at(-1)!
    const right = route.coordinates[1][0]
    // Independent symmetric great-circle reference: tan(phi_seam)=tan(45)/cos(10).
    const expected = Math.atan(1 / Math.cos(10 * Math.PI / 180)) * 180 / Math.PI
    expect(left[1]).toBeCloseTo(expected, 10)
    expect(right[1]).toBeCloseTo(expected, 10)
    expect(left[0]).toBe(direction * 180)
    expect(right[0]).toBe(direction * -180)
  })

  it.each([
    [{ lat: 10, lng: 180 }, { lat: 20, lng: -170 }],
    [{ lat: 20, lng: 170 }, { lat: 10, lng: -180 }],
    [{ lat: 20, lng: -170 }, { lat: 10, lng: 180 }],
    [{ lat: 10, lng: -180 }, { lat: 20, lng: 170 }],
    [{ lat: -20, lng: 180 }, { lat: 20, lng: -180 }],
  ])('handles seam endpoints without world jumps or empty parts: %j to %j', (a, b) => {
    const route = createGeodesicLine(a, b)
    expectValid(route)
    expect(route.coordinates).toHaveLength(1)
    expect(routeLength(route)).toBeCloseTo(calculateDistanceKm(a, b), 6)
    expect(calculateDistanceKm(point(route.coordinates[0][0]), a)).toBeLessThan(1e-8)
    expect(calculateDistanceKm(point(route.coordinates[0].at(-1)!), b)).toBeLessThan(1e-8)
  })

  it.each([
    [{ lat: 0, lng: 0 }, { lat: 0, lng: 180 }],
    [{ lat: 30, lng: 20 }, { lat: -30, lng: -160 }],
  ])('chooses a deterministic finite semicircle for exact antipodes %j and %j', (a, b) => {
    const route = createGeodesicLine(a, b)
    expectValid(route)
    expect(createGeodesicLine(a, b)).toEqual(route)
    expect(routeLength(route)).toBeCloseTo(Math.PI * 6371.0088, 5)
    expect(route.coordinates[0][0]).toEqual([a.lng, a.lat])
    expect(route.coordinates.at(-1)?.at(-1)).toEqual([b.lng, b.lat])
  })

  it.each([1, -1])('retains the resolvable near-antipodal route on side %s', (sign) => {
    const route = createGeodesicLine({ lat: 0, lng: 0 }, { lat: 0, lng: sign * 179.999999 })
    expectValid(route)
    expect(route.coordinates.flat().every(([lng, lat]) => sign * lng >= 0 && Math.abs(lat) < 1e-10)).toBe(true)
  })

  it.each([1, -1])('leaves a gap across the %s polar cap', (sign) => {
    const a = { lat: sign * 80, lng: 0 }
    const b = { lat: sign * 80, lng: 180 }
    const route = createGeodesicLine(a, b)
    expectValid(route)
    expect(route.coordinates).toHaveLength(2)
    expect(route.coordinates[0].at(-1)![1]).toBeCloseTo(sign * GEODESIC_LATITUDE_LIMIT, 10)
    expect(route.coordinates[1][0][1]).toBeCloseTo(sign * GEODESIC_LATITUDE_LIMIT, 10)
    expect(routeLength(route)).toBeLessThan(calculateDistanceKm(a, b))
    expect(route.coordinates[0].at(-1)![0]).toBeCloseTo(0, 9)
    expect(Math.abs(route.coordinates[1][0][0])).toBeCloseTo(180, 9)
  })

  it('clips polar endpoints without inventing a boundary-parallel route', () => {
    const route = createGeodesicLine({ lat: 90, lng: 0 }, { lat: 0, lng: 0 })
    expectValid(route)
    expect(route.coordinates[0][0][1]).toBeCloseTo(GEODESIC_LATITUDE_LIMIT, 10)
    expect(route.coordinates[0].at(-1)).toEqual([0, 0])
    expect(createGeodesicLine({ lat: 89, lng: 0 }, { lat: 89, lng: 10 }).coordinates).toEqual([])
  })

  it('detects a narrow polar excursion between nominal samples', () => {
    const route = createGeodesicLine({ lat: 85.04, lng: -5 }, { lat: 85.04, lng: 5 })
    expectValid(route)
    expect(route.coordinates).toHaveLength(2)
    expect(route.coordinates[0].at(-1)![0]).toBeLessThan(route.coordinates[1][0][0])
  })

  it('preserves frozen inputs and returns independently owned geometry', () => {
    const a = Object.freeze({ lat: 20, lng: 30 })
    const b = Object.freeze({ lat: -10, lng: 150 })
    const route = createGeodesicLine(a, b)
    const snapshot = structuredClone(route)
    route.coordinates[0][0][0] = 99
    expect(createGeodesicLine(a, b)).toEqual(snapshot)
    expect(a).toEqual({ lat: 20, lng: 30 })
    expect(b).toEqual({ lat: -10, lng: 150 })
  })

  it.each([null, undefined, [], {}, { lat: '0', lng: 0 }, { lat: 0 }])('rejects malformed coordinates %j', (bad) => {
    const p = bad as unknown as Coordinates
    expect(() => createGeodesicLine(p, { lat: 0, lng: 0 })).toThrow(TypeError)
    expect(() => createGeodesicLine({ lat: 0, lng: 0 }, p)).toThrow(TypeError)
  })

  it.each([{ lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }])(
    'rejects nonfinite or out-of-bounds coordinates %j', (bad) => {
      expect(() => createGeodesicLine(bad, { lat: 0, lng: 0 })).toThrow(RangeError)
      expect(() => createGeodesicLine({ lat: 0, lng: 0 }, bad)).toThrow(RangeError)
    },
  )

  it('keeps a deterministic geographic sweep finite, bounded and free of jumps', () => {
    const points = [-90, -89, -85, -45, 0, 45, 85, 89, 90].flatMap((lat) =>
      [-180, -179, -90, 0, 90, 179, 180].map((lng) => ({ lat, lng })))
    const failures: string[] = []
    for (const a of points) for (const b of points) {
      const route = createGeodesicLine(a, b)
      let valid = route.coordinates.flat().length <= 195
      for (const part of route.coordinates) {
        valid &&= part.length >= 2
        valid &&= part.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) &&
          Math.abs(lng) <= 180 && Math.abs(lat) <= GEODESIC_LATITUDE_LIMIT)
        for (let i = 1; i < part.length; i += 1) {
          const distance = calculateDistanceKm(point(part[i - 1]), point(part[i]))
          valid &&= Math.abs(part[i][0] - part[i - 1][0]) <= 180 && distance > 0 && distance <= 111.195081
        }
      }
      if (!valid) failures.push(JSON.stringify({ a, b, route }))
    }
    expect(failures).toEqual([])
  })
})


describe('prepareGeodesicPrefix', () => {
  const a = { lat: 40.7128, lng: -74.006 }
  const b = { lat: 35.6762, lng: 139.6503 }

  it('starts empty and finishes with exactly the original geometry', () => {
    const full = createGeodesicLine(a, b)
    const prefix = prepareGeodesicPrefix(full)
    expect(prefix(0)).toEqual({ type: 'MultiLineString', coordinates: [] })
    expect(prefix(1)).toEqual(full)
  })

  it.each([-Infinity, -1, NaN])('clamps progress %s to an empty route', (progress) => {
    expect(prepareGeodesicPrefix(createGeodesicLine(a, b))(progress).coordinates).toEqual([])
  })

  it.each([1, 2, Infinity])('clamps progress %s to the exact completed route', (progress) => {
    const full = createGeodesicLine(a, b)
    expect(prepareGeodesicPrefix(full)(progress)).toEqual(full)
  })

  it.each([0.001, 0.1, 0.37, 0.5, 0.75, 0.999])('advances by spherical arc length at progress %s', (progress) => {
    const full = createGeodesicLine(a, b)
    const partial = prepareGeodesicPrefix(full)(progress)
    expectValid(partial)
    expect(partial.coordinates[0][0]).toEqual([a.lng, a.lat])
    expect(routeLength(partial)).toBeCloseTo(routeLength(full) * progress, 6)
    const tip = point(partial.coordinates.at(-1)!.at(-1)!)
    expect(calculateDistanceKm(a, tip) + calculateDistanceKm(tip, b)).toBeCloseTo(calculateDistanceKm(a, b), 6)
    // Completed samples are retained; only the advancing endpoint is new.
    for (let i = 0; i < partial.coordinates.length; i += 1) {
      expect(partial.coordinates[i].slice(0, -1)).toEqual(full.coordinates[i].slice(0, partial.coordinates[i].length - 1))
    }
  })

  it('interpolates an advancing endpoint rather than jumping between samples', () => {
    const prefix = prepareGeodesicPrefix(createGeodesicLine({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }))
    const early = prefix(0.0123).coordinates[0].at(-1)!
    const later = prefix(0.0124).coordinates[0].at(-1)!
    expect(early[0]).toBeCloseTo(0.123, 10)
    expect(later[0]).toBeCloseTo(0.124, 10)
    expect(early[1]).toBeCloseTo(0, 10)
  })

  it('never moves the tip backward as progress increases', () => {
    const full = createGeodesicLine(a, b)
    const prefix = prepareGeodesicPrefix(full)
    let previousDistance = 0
    for (let i = 1; i <= 100; i += 1) {
      const partial = prefix(i / 100)
      const distance = calculateDistanceKm(a, point(partial.coordinates.at(-1)!.at(-1)!))
      expect(distance).toBeGreaterThanOrEqual(previousDistance)
      previousDistance = distance
    }
    expect(previousDistance).toBeCloseTo(calculateDistanceKm(a, b), 7)
  })

  it.each([1, -1])('keeps direction %s seam crossings split throughout the reveal', (direction) => {
    const full = createGeodesicLine({ lat: 45, lng: direction * 170 }, { lat: 45, lng: direction * -170 })
    const prefix = prepareGeodesicPrefix(full)
    for (const progress of [0.01, 0.49, 0.5, 0.51, 0.75, 0.99, 1]) {
      const partial = prefix(progress)
      expectValid(partial)
      expect(routeLength(partial)).toBeCloseTo(routeLength(full) * progress, 6)
      if (progress < 0.49) expect(partial.coordinates).toHaveLength(1)
      if (progress > 0.51) {
        expect(partial.coordinates).toHaveLength(2)
        expect(partial.coordinates[0].at(-1)).toEqual(full.coordinates[0].at(-1))
        expect(partial.coordinates[1][0]).toEqual(full.coordinates[1][0])
      }
    }
  })

  it.each([1, -1])('travels through a hidden polar gap without drawing a bridge (%s)', (sign) => {
    const full = createGeodesicLine({ lat: sign * 80, lng: 0 }, { lat: sign * 80, lng: 180 })
    const prefix = prepareGeodesicPrefix(full)
    const beforeGap = prefix(0.3)
    const inGap = prefix(0.5)
    const afterGap = prefix(0.8)
    expect(beforeGap).toEqual(inGap)
    expect(inGap.coordinates).toHaveLength(1)
    expect(inGap.coordinates[0]).toEqual(full.coordinates[0])
    expect(afterGap.coordinates).toHaveLength(2)
    expect(afterGap.coordinates[1][0]).toEqual(full.coordinates[1][0])
    for (const progress of [0.1, 0.3, 0.5, 0.8, 0.99, 1]) expectValid(prefix(progress))
  })

  it('retains empty coincident geometry at every progress', () => {
    const prefix = prepareGeodesicPrefix(createGeodesicLine(a, a))
    for (const progress of [0, 0.2, 0.5, 1]) expect(prefix(progress).coordinates).toEqual([])
  })

  it.each([
    [{ lat: 0, lng: 0 }, { lat: 0.000001, lng: 179.999999 }],
    [{ lat: 30, lng: 20 }, { lat: -30, lng: -160 }],
    [{ lat: 90, lng: 0 }, { lat: 0, lng: 0 }],
    [{ lat: -20, lng: 180 }, { lat: 20, lng: -180 }],
  ])('keeps difficult prefixes finite and nondegenerate: %j to %j', (start, end) => {
    const full = createGeodesicLine(start, end)
    const prefix = prepareGeodesicPrefix(full)
    for (const progress of [0.001, 0.1, 0.5, 0.8, 0.999, 1]) expectValid(prefix(progress))
    expect(prefix(1)).toEqual(full)
  })

  it('is deterministic and never mutates or shares the input or returned coordinates', () => {
    const full = createGeodesicLine(a, b)
    const snapshot = structuredClone(full)
    full.coordinates.forEach((part) => { part.forEach(Object.freeze); Object.freeze(part) })
    Object.freeze(full.coordinates)
    Object.freeze(full)
    const prefix = prepareGeodesicPrefix(full)
    const first = prefix(0.37)
    expect(prefix(0.37)).toEqual(first)
    first.coordinates[0][0][0] = 999
    const completed = prefix(1)
    completed.coordinates[0][0][0] = 999
    expect(prefix(1)).toEqual(snapshot)
    expect(full).toEqual(snapshot)
    expect(prefix(0.37).coordinates[0][0]).toEqual([a.lng, a.lat])
  })
})
