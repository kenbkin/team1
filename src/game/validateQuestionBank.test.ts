import { describe, expect, it } from 'vitest'
import type { Question } from './question'
import { questionBank } from './questionBank'
import { validateQuestionBank } from './validateQuestionBank'

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fixture-001',
    celebrityId: 'test-actor',
    prompt: 'Synthetic validation prompt.',
    answerLabel: 'Synthetic location',
    latitude: 0,
    longitude: 0,
    category: 'birthplace',
    difficulty: 'easy',
    sourceNote: 'Synthetic test fixture; not verified production content.',
    ...overrides,
  }
}

function diagnostics(bank: readonly unknown[]) {
  return validateQuestionBank(bank).map(({ index, field, code }) => ({ index, field, code }))
}

describe('validateQuestionBank', () => {
  it('accepts a valid bank and repeated celebrity IDs', () => {
    expect(validateQuestionBank([fixture(), fixture({ id: 'fixture-002' })])).toEqual([])
  })

  it('accepts an empty bank', () => {
    expect(validateQuestionBank([])).toEqual([])
  })

  it('reports every duplicate after the first deterministically', () => {
    const bank = [fixture({ id: 'unique' }), fixture(), fixture(), fixture()]
    expect(diagnostics(bank)).toEqual([
      { index: 2, field: 'id', code: 'duplicate-id' },
      { index: 3, field: 'id', code: 'duplicate-id' },
    ])
    for (const error of validateQuestionBank(bank)) {
      expect(error.message).toContain('index 1')
    }
  })

  it('compares IDs exactly and case-sensitively without trimming', () => {
    expect(validateQuestionBank([
      fixture({ id: 'example' }), fixture({ id: 'Example' }), fixture({ id: ' example ' }),
    ])).toEqual([])
  })

  describe.each([['latitude', 90], ['longitude', 180]] as const)('%s', (field, limit) => {
    it.each([-limit, 0, limit])('accepts boundary or zero value %s', (value) => {
      expect(validateQuestionBank([fixture({ [field]: value })])).toEqual([])
    })

    it.each([-limit - 0.01, limit + 0.01, NaN, Infinity, -Infinity, '0', undefined, null])(
      'rejects invalid coordinate %s', (value) => {
        expect(diagnostics([fixture({ [field]: value })])).toEqual([
          { index: 0, field, code: 'invalid-coordinate' },
        ])
      },
    )

    it('rejects a missing coordinate property', () => {
      const question = fixture()
      delete question[field]
      expect(diagnostics([question])).toEqual([{ index: 0, field, code: 'invalid-coordinate' }])
    })
  })

  describe.each(['id', 'celebrityId', 'prompt', 'answerLabel', 'sourceNote'] satisfies (keyof Question)[])(
    'required string %s', (field) => {
      it.each([undefined, null, 42, false, {}, [], '', ' \t\n'])('rejects %j', (value) => {
        expect(diagnostics([fixture({ [field]: value })])).toEqual([
          { index: 0, field, code: 'invalid-string' },
        ])
      })

      it('rejects a missing property', () => {
        const question = fixture()
        delete question[field]
        expect(diagnostics([question])).toEqual([{ index: 0, field, code: 'invalid-string' }])
      })
    },
  )

  it.each(['tom-hanks', 'scarlett-johansson', 'cher'])('accepts slug %s', (celebrityId) => {
    expect(validateQuestionBank([fixture({ celebrityId })])).toEqual([])
  })

  it.each([
    'Tom-Hanks', 'tom--hanks', '-tom-hanks', 'tom-hanks-', 'tom hanks',
    'tom_hanks', 'tom2-hanks', 'tóm-hanks', "tom'hanks", ' tom-hanks ',
    'tom-hanks\n', 'tom-hanks\r\n',
  ])('rejects malformed non-empty slug %j', (celebrityId) => {
    expect(diagnostics([fixture({ celebrityId })])).toEqual([
      { index: 0, field: 'celebrityId', code: 'invalid-slug' },
    ])
  })

  describe.each([
    ['category', ['birthplace', 'filming-location', 'other-location'], 'invalid-category'],
    ['difficulty', ['easy', 'medium', 'hard'], 'invalid-difficulty'],
  ] as const)('%s vocabulary', (field, allowed, code) => {
    it.each(allowed)('accepts %s', (value) => {
      expect(validateQuestionBank([fixture({ [field]: value })])).toEqual([])
    })

    it.each([undefined, null, 42, {}, '', 'unknown', 'EASY', ' birthplace '])('rejects %j', (value) => {
      expect(diagnostics([fixture({ [field]: value })])).toEqual([{ index: 0, field, code }])
    })

    it('rejects a missing property', () => {
      const question = fixture()
      delete question[field]
      expect(diagnostics([question])).toEqual([{ index: 0, field, code }])
    })
  })

  it.each([null, undefined, 'text', 42, true, [], () => undefined, Symbol('fixture')])(
    'reports only invalid-entry for malformed entry %s', (entry) => {
      expect(diagnostics([entry])).toEqual([{ index: 0, field: null, code: 'invalid-entry' }])
    },
  )

  it('collects all errors in entry and Question field order', () => {
    const bank = [fixture(), fixture({
      celebrityId: 'Bad Slug', prompt: '', answerLabel: null,
      latitude: Infinity, longitude: 181, category: 'unknown',
      difficulty: 'unknown', sourceNote: '',
    }), null]
    const expected = [
      { index: 1, field: 'id', code: 'duplicate-id' },
      { index: 1, field: 'celebrityId', code: 'invalid-slug' },
      { index: 1, field: 'prompt', code: 'invalid-string' },
      { index: 1, field: 'answerLabel', code: 'invalid-string' },
      { index: 1, field: 'latitude', code: 'invalid-coordinate' },
      { index: 1, field: 'longitude', code: 'invalid-coordinate' },
      { index: 1, field: 'category', code: 'invalid-category' },
      { index: 1, field: 'difficulty', code: 'invalid-difficulty' },
      { index: 1, field: 'sourceNote', code: 'invalid-string' },
      { index: 2, field: null, code: 'invalid-entry' },
    ]
    expect(diagnostics(bank)).toEqual(expected)
    expect(diagnostics(bank)).toEqual(expected)
  })

  it('does not mutate or normalize valid or invalid inputs, including extra properties', () => {
    const bank = [fixture({ prompt: ' padded prompt ', extra: { note: 'retain' } }),
      fixture({ id: 'fixture-002', celebrityId: 'Bad Slug', latitude: 100, longitude: '0' })]
    const snapshot = structuredClone(bank)
    Object.freeze(bank[0].extra)
    bank.forEach(Object.freeze)
    Object.freeze(bank)
    expect(validateQuestionBank(bank)).toHaveLength(3)
    expect(bank).toEqual(snapshot)
  })

  it('accepts extra runtime properties', () => {
    expect(validateQuestionBank([fixture({ extra: 'ignored' })])).toEqual([])
  })

  it('validates the exported approved bank', () => {
    expect(validateQuestionBank(questionBank)).toEqual([])
  })
})
