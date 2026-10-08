export function calculateScore(distanceKm: number): number {
  if (typeof distanceKm !== 'number') {
    throw new TypeError('distanceKm must be a number.')
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('distanceKm must be finite and non-negative.')
  }

  // Approved MVP rule: integer points, maximum 1000, shared by all categories.
  return Math.round(1000 * Math.exp(-distanceKm / 2000))
}
