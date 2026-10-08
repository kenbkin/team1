export type Coordinates = {
  lat: number
  lng: number
}

type ScreenPoint = {
  x: number
  y: number
}

// Provisional numerical allowance, pending manual globe/horizon validation.
export const PROJECTION_CONSISTENCY_TOLERANCE_PX = 0.5

export function getGuessCoordinates(
  candidate: Coordinates,
  point: ScreenPoint,
  project: (coordinates: Coordinates) => ScreenPoint,
): Coordinates | null {
  const { lat, lng } = candidate
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null
  }

  const projected = project({ lat, lng })
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null

  // Globe unprojection can map background pixels to a nearby horizon location.
  // This consistency check is not a guaranteed Earth-surface intersection test.
  if (Math.hypot(projected.x - point.x, projected.y - point.y) > PROJECTION_CONSISTENCY_TOLERANCE_PX) {
    return null
  }

  return { lat, lng }
}
