import type { Question } from './question'

export function selectQuestions(
  bank: readonly Question[],
  count: number,
  random: () => number = Math.random,
): Question[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative safe integer.')
  }
  if (count === 0 || bank.length === 0) return []

  const ids = new Set<string>()
  for (const question of bank) {
    if (ids.has(question.id)) {
      throw new Error('Question bank contains duplicate IDs.')
    }
    ids.add(question.id)
  }

  const shuffled = [...bank]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const value = random()
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('random must return a finite number in [0, 1).')
    }
    const target = Math.floor(value * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }

  return shuffled.slice(0, Math.min(count, shuffled.length))
}
