export type GeographicCoordinates = Readonly<{
  lat: number
  lng: number
}>

const EARTH_RADIUS_KM = 6371.0088
const DEGREES_TO_RADIANS = Math.PI / 180

function validateCoordinates(point: GeographicCoordinates): void {
  if (point === null || typeof point !== 'object' || Array.isArray(point)) {
    throw new TypeError('Coordinates must be a non-null object with numeric lat and lng fields.')
  }

  for (const [field, limit] of [['lat', 90], ['lng', 180]] as const) {
    const value = point[field]
    if (typeof value !== 'number') {
      throw new TypeError('Coordinate fields must be numbers.')
    }
    if (!Number.isFinite(value) || value < -limit || value > limit) {
      throw new RangeError('Coordinates must be finite, with lat in [-90, 90] and lng in [-180, 180].')
    }
  }
}

// Shortest surface distance on a sphere, in unrounded kilometers; ignores elevation.
export function calculateDistanceKm(
  a: GeographicCoordinates,
  b: GeographicCoordinates,
): number {
  validateCoordinates(a)
  validateCoordinates(b)

  let deltaLongitude = b.lng - a.lng
  if (deltaLongitude > 180) deltaLongitude -= 360
  if (deltaLongitude < -180) deltaLongitude += 360

  // Longitude is irrelevant at the same exact pole; +/-180 denotes the same meridian.
  if (a.lat === b.lat && (deltaLongitude === 0 || Math.abs(a.lat) === 90)) return 0

  const latitudeA = a.lat * DEGREES_TO_RADIANS
  const latitudeB = b.lat * DEGREES_TO_RADIANS
  const deltaLatitude = (b.lat - a.lat) * DEGREES_TO_RADIANS
  const deltaLongitudeRadians = deltaLongitude * DEGREES_TO_RADIANS
  const h = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitudeRadians / 2) ** 2
  // Roundoff near antipodes can otherwise make sqrt(1 - h) invalid.
  const clampedH = Math.min(1, Math.max(0, h))

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(clampedH), Math.sqrt(1 - clampedH))
}
