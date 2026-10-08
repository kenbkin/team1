import { describe, expect, it, vi } from 'vitest'
import type { Question } from './question'
import { questionBank } from './questionBank'
import { selectQuestions } from './selectQuestions'

function fixture(id: string): Question {
  return {
    id,
    celebrityId: 'test-actor',
    prompt: 'Synthetic selection prompt.',
    answerLabel: 'Synthetic location',
    latitude: 0,
    longitude: 0,
    category: 'birthplace',
    difficulty: 'easy',
    sourceNote: 'Synthetic test fixture; not production content.',
  }
}

function syntheticBank(): Question[] {
  return ['a', 'b', 'c', 'd'].map(fixture)
}

function sequence(values: readonly number[]): () => number {
  let index = 0
  return () => {
    if (index >= values.length) throw new Error('Test random sequence exhausted.')
    return values[index++]
  }
}

function expectUniqueMembers(result: Question[], bank: readonly Question[]) {
  expect(new Set(result.map(({ id }) => id)).size).toBe(result.length)
  for (const question of result) expect(bank).toContain(question)
}

describe('selectQuestions', () => {
  it('returns a new empty array for zero count without processing IDs or calling random', () => {
    const duplicateBank = [fixture('a'), fixture('a')]
    const random = vi.fn(() => 0)
    const result = selectQuestions(duplicateBank, 0, random)
    expect(result).toEqual([])
    expect(result).not.toBe(selectQuestions(duplicateBank, 0, random))
    expect(random).not.toHaveBeenCalled()
  })

  it.each([1, 2, 4, 10])('selects the available requested count for %s', (count) => {
    const bank = syntheticBank()
    const result = selectQuestions(bank, count, () => 0)
    expect(result).toHaveLength(Math.min(count, bank.length))
    expectUniqueMembers(result, bank)
    if (count >= bank.length) {
      expect(result.map(({ id }) => id).sort()).toEqual(bank.map(({ id }) => id).sort())
    }
  })

  it.each([0, 1, 10])('returns a new empty array for an empty bank and count %s', (count) => {
    const bank: readonly Question[] = []
    const random = vi.fn(() => 0)
    expect(selectQuestions(bank, count, random)).toEqual([])
    expect(selectQuestions(bank, count, random)).not.toBe(bank)
    expect(random).not.toHaveBeenCalled()
  })

  it.each([1, 10])('selects a singleton without random calls for count %s', (count) => {
    const bank = [fixture('a')]
    const random = vi.fn(() => 0)
    const result = selectQuestions(bank, count, random)
    expect(result).toEqual(bank)
    expect(result).not.toBe(bank)
    expect(result[0]).toBe(bank[0])
    expect(random).not.toHaveBeenCalled()
  })

  it('allows repeated celebrity IDs without balancing', () => {
    const bank = syntheticBank()
    const result = selectQuestions(bank, bank.length, () => 0)
    expect(result).toHaveLength(4)
    expect(new Set(result.map(({ celebrityId }) => celebrityId)).size).toBe(1)
    expectUniqueMembers(result, bank)
  })

  it('rejects duplicate IDs before consuming randomness', () => {
    const random = vi.fn(() => 0)
    expect(() => selectQuestions([fixture('a'), fixture('b'), fixture('a')], 1, random)).toThrow(Error)
    expect(random).not.toHaveBeenCalled()
  })

  it('uses exact case-sensitive IDs', () => {
    const bank = [fixture('a'), fixture('A'), fixture(' a ')]
    expectUniqueMembers(selectQuestions(bank, 3, () => 0), bank)
  })

  it('produces the expected Fisher–Yates order from an injected sequence', () => {
    const result = selectQuestions(syntheticBank(), 4, sequence([0.5, 0, 0.75]))
    expect(result.map(({ id }) => id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('produces identical results from fresh identical sequences', () => {
    const bank = syntheticBank()
    expect(selectQuestions(bank, 2, sequence([0.5, 0, 0.75]))).toEqual(
      selectQuestions(bank, 2, sequence([0.5, 0, 0.75])),
    )
  })

  it.each([
    [0, ['b', 'c', 'd', 'a']],
    [1 - Number.EPSILON, ['a', 'b', 'c', 'd']],
  ] as const)('handles random boundary %s', (value, ids) => {
    expect(selectQuestions(syntheticBank(), 4, () => value).map(({ id }) => id)).toEqual(ids)
  })

  it.each([-0.01, 1, 2, NaN, Infinity, -Infinity])('rejects invalid random value %s', (value) => {
    expect(() => selectQuestions(syntheticBank(), 1, () => value)).toThrow(RangeError)
  })

  it('validates every consumed random value', () => {
    expect(() => selectQuestions(syntheticBank(), 1, sequence([0, NaN]))).toThrow(RangeError)
  })

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid count %s before bank processing or randomness', (count) => {
      const random = vi.fn(() => 0)
      expect(() => selectQuestions([fixture('a'), fixture('a')], count, random)).toThrow(RangeError)
      expect(() => selectQuestions([], count, random)).toThrow(RangeError)
      expect(random).not.toHaveBeenCalled()
    },
  )

  it('accepts the largest safe count and returns only available entries', () => {
    const bank = syntheticBank()
    const result = selectQuestions(bank, Number.MAX_SAFE_INTEGER, () => 0)
    expect(result).toHaveLength(bank.length)
    expectUniqueMembers(result, bank)
  })

  it('preserves frozen bank and objects, returns original references in an independent array', () => {
    const bank = syntheticBank()
    const snapshot = structuredClone(bank)
    bank.forEach(Object.freeze)
    Object.freeze(bank)
    const result = selectQuestions(bank, bank.length, () => 0)
    expect(bank).toEqual(snapshot)
    expect(result).not.toBe(bank)
    expectUniqueMembers(result, bank)
    result.pop()
    expect(bank).toEqual(snapshot)
  })
})

describe('approved sample bank', () => {
  it('TEMPORARY: contains exactly six approved sample questions', () => {
    expect(questionBank).toHaveLength(6)
  })

  it('selects all six sample questions with unique IDs and original membership', () => {
    const result = selectQuestions(questionBank, questionBank.length, () => 0)
    expect(result).toHaveLength(6)
    expectUniqueMembers(result, questionBank)
  })
})
