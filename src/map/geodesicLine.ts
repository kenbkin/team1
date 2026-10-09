import type { Coordinates } from './guessCoordinates'

// Native GeoJSON tiles cannot faithfully represent the extreme polar caps.
export const GEODESIC_LATITUDE_LIMIT = 85.0511287798066
const RADIANS = Math.PI / 180
const VECTOR_EPSILON = 1e-15
const ANGLE_EPSILON = 1e-14

type Vector = [number, number, number]
export type GeodesicPosition = [number, number]
export type GeodesicLineGeometry = {
  type: 'MultiLineString'
  coordinates: GeodesicPosition[][]
}

function validate(point: Readonly<Coordinates>): void {
  if (!point || typeof point !== 'object' || Array.isArray(point) ||
      typeof point.lat !== 'number' || typeof point.lng !== 'number') {
    throw new TypeError('Coordinates must have numeric lat and lng fields.')
  }
  if (!Number.isFinite(point.lat) || Math.abs(point.lat) > 90 ||
      !Number.isFinite(point.lng) || Math.abs(point.lng) > 180) {
    throw new RangeError('Coordinates must be finite and within geographic bounds.')
  }
}

function toVector({ lat, lng }: Readonly<Coordinates>): Vector {
  const latitude = lat * RADIANS
  const longitude = lng * RADIANS
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)]
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: Vector): Vector {
  const length = Math.hypot(...v)
  return [v[0] / length, v[1] / length, v[2] / length]
}

// Solve A cos(t) + B sin(t) = value on the finite arc. Analytic crossings
// catch polar excursions even when both neighboring one-degree samples are visible.
function crossings(a: number, b: number, value: number, angle: number): number[] {
  const radius = Math.hypot(a, b)
  if (radius < VECTOR_EPSILON || Math.abs(value) > radius) return []
  const phase = Math.atan2(b, a)
  const offset = Math.acos(Math.max(-1, Math.min(1, value / radius)))
  const roots: number[] = []
  for (const sign of [-1, 1]) {
    for (let turn = -1; turn <= 1; turn += 1) {
      const t = phase + sign * offset + turn * 2 * Math.PI
      if (t > ANGLE_EPSILON && t < angle - ANGLE_EPSILON) roots.push(t)
    }
  }
  return roots
}

/** Shortest spherical route, split at the antimeridian and clipped at polar caps.
 * Empty coordinates mean there is no renderable line. No camera state is involved.
 */
export function createGeodesicLine(start: Readonly<Coordinates>, end: Readonly<Coordinates>): GeodesicLineGeometry {
  validate(start)
  validate(end)
  const geometry: GeodesicLineGeometry = { type: 'MultiLineString', coordinates: [] }
  const a = toVector(start)
  const b = toVector(end)
  const normal = cross(a, b)
  const sine = Math.hypot(...normal)
  const cosine = Math.max(-1, Math.min(1, dot(a, b)))
  const angle = Math.atan2(sine, cosine)
  if (angle <= ANGLE_EPSILON) return geometry

  let tangent: Vector
  if (sine > VECTOR_EPSILON) {
    tangent = normalize(cross(normal, a))
  } else {
    // Indistinguishable antipodes: project the least-aligned positive Cartesian
    // axis onto a's tangent plane. Ties choose X, then Y, then Z; never random.
    const axis: Vector = [0, 0, 0]
    let index = 0
    for (let i = 1; i < 3; i += 1) if (Math.abs(a[i]) < Math.abs(a[index])) index = i
    axis[index] = 1
    const projection = dot(axis, a)
    tangent = normalize([axis[0] - projection * a[0], axis[1] - projection * a[1], axis[2] - projection * a[2]])
  }

  const at = (t: number): Vector => [
    a[0] * Math.cos(t) + tangent[0] * Math.sin(t),
    a[1] * Math.cos(t) + tangent[1] * Math.sin(t),
    a[2] * Math.cos(t) + tangent[2] * Math.sin(t),
  ]
  const cap = Math.sin(GEODESIC_LATITUDE_LIMIT * RADIANS)
  const seamRoots = crossings(a[1], tangent[1], 0, angle).filter((t) => at(t)[0] < 0)
  const boundaries = [0, angle, ...seamRoots,
    ...crossings(a[2], tangent[2], cap, angle),
    ...crossings(a[2], tangent[2], -cap, angle),
  ].sort((x, y) => x - y).filter((t, i, values) => i === 0 || t - values[i - 1] > ANGLE_EPSILON)

  for (let i = 1; i < boundaries.length; i += 1) {
    const from = boundaries[i - 1]
    const to = boundaries[i]
    const midpoint = at((from + to) / 2)
    if (Math.abs(midpoint[2]) > cap) continue
    const seamLongitude = midpoint[1] < 0 ? -180 : 180
    const count = Math.max(1, Math.ceil((to - from) / RADIANS))
    const part: GeodesicPosition[] = []
    for (let j = 0; j <= count; j += 1) {
      const t = j === count ? to : from + (to - from) * j / count
      const v = at(t)
      let lng = Math.atan2(v[1], v[0]) / RADIANS
      let lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / RADIANS
      // Preserve supplied endpoints instead of round-tripping their coordinates.
      if (t === 0) { lng = start.lng; lat = start.lat }
      if (t === angle) { lng = end.lng; lat = end.lat }
      // A seam endpoint may need its geographically equivalent sign to avoid a
      // world-spanning segment. Other renderable endpoints remain exactly intact.
      if (Math.abs(lng) === 180 || (t !== 0 && t !== angle && Math.abs(Math.abs(lng) - 180) < 1e-10)) {
        lng = seamLongitude
      }
      lat = Math.max(-GEODESIC_LATITUDE_LIMIT, Math.min(GEODESIC_LATITUDE_LIMIT, lat))
      const previous = part[part.length - 1]
      if (!previous || previous[0] !== lng || previous[1] !== lat) part.push([lng, lat])
    }
    if (part.length >= 2) geometry.coordinates.push(part)
  }
  return geometry
}

/** Prepare arc-length prefix extraction once for a completed createGeodesicLine
 * result. Hidden polar gaps count toward travel, but are never connected visually.
 * Only the advancing segment is interpolated; the original sampled route survives.
 */
export function prepareGeodesicPrefix(geometry: GeodesicLineGeometry): (progress: number) => GeodesicLineGeometry {
  const parts = geometry.coordinates.map((part) => part.map(([lng, lat]): GeodesicPosition => [lng, lat]))
  let travelled = 0
  let previous: GeodesicPosition | undefined
  const cached = parts.map((part) => {
    const vectors = part.map(([lng, lat]) => toVector({ lat, lng }))
    const distances: number[] = []
    const tangents: Vector[] = []
    const angles: number[] = []
    if (previous) {
      const gapStart = toVector({ lat: previous[1], lng: previous[0] })
      travelled += Math.atan2(Math.hypot(...cross(gapStart, vectors[0])), dot(gapStart, vectors[0]))
    }
    distances.push(travelled)
    for (let i = 1; i < part.length; i += 1) {
      const normal = cross(vectors[i - 1], vectors[i])
      const angle = Math.atan2(Math.hypot(...normal), dot(vectors[i - 1], vectors[i]))
      angles.push(angle)
      // Completed routes have nonzero, at-most-one-degree visible segments.
      tangents.push(angle > VECTOR_EPSILON ? normalize(cross(normal, vectors[i - 1])) : [0, 0, 0])
      travelled += angle
      distances.push(travelled)
    }
    previous = part.at(-1)
    return { part, vectors, distances, tangents, angles }
  })
  const copyParts = (): GeodesicLineGeometry => ({
    type: 'MultiLineString',
    coordinates: parts.map((part) => part.map(([lng, lat]) => [lng, lat])),
  })

  return (progress) => {
    const bounded = Number.isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress))
    const result: GeodesicLineGeometry = { type: 'MultiLineString', coordinates: [] }
    if (bounded === 0 || travelled === 0) return result
    if (bounded === 1) return copyParts()
    const target = travelled * bounded
    for (const { part, vectors, distances, tangents, angles } of cached) {
      if (target <= distances[0]) break
      const visible: GeodesicPosition[] = [[...part[0]]]
      for (let i = 1; i < part.length; i += 1) {
        if (target >= distances[i]) {
          visible.push([...part[i]])
          continue
        }
        const angle = target - distances[i - 1]
        if (angle > VECTOR_EPSILON && angles[i - 1] > VECTOR_EPSILON) {
          const a = vectors[i - 1]
          const tangent = tangents[i - 1]
          const v: Vector = [
            a[0] * Math.cos(angle) + tangent[0] * Math.sin(angle),
            a[1] * Math.cos(angle) + tangent[1] * Math.sin(angle),
            a[2] * Math.cos(angle) + tangent[2] * Math.sin(angle),
          ]
          let lng = Math.atan2(v[1], v[0]) / RADIANS
          // Preserve the side of a seam-aligned part despite trig roundoff.
          if (Math.abs(Math.abs(lng) - 180) < 1e-10) lng = part[i - 1][0] < 0 ? -180 : 180
          const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / RADIANS
          const tip: GeodesicPosition = [lng,
            Math.max(-GEODESIC_LATITUDE_LIMIT, Math.min(GEODESIC_LATITUDE_LIMIT, lat))]
          const last = visible.at(-1)!
          if (tip[0] !== last[0] || tip[1] !== last[1]) visible.push(tip)
        }
        break
      }
      if (visible.length >= 2) result.coordinates.push(visible)
      if (target < distances.at(-1)!) break
    }
    return result
  }
}
