import type { Question } from './question'

export type QuestionBankValidationErrorCode =
  | 'invalid-entry'
  | 'invalid-string'
  | 'duplicate-id'
  | 'invalid-slug'
  | 'invalid-coordinate'
  | 'invalid-category'
  | 'invalid-difficulty'

export type QuestionBankValidationError = {
  index: number
  field: keyof Question | null
  code: QuestionBankValidationErrorCode
  message: string
}

const celebritySlug = /^[a-z]+(?:-[a-z]+)*$/

function isRequiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateQuestionBank(
  bank: readonly unknown[],
): QuestionBankValidationError[] {
  const errors: QuestionBankValidationError[] = []
  const firstIdIndices = new Map<string, number>()

  bank.forEach((entry, index) => {
    const report = (
      field: keyof Question | null,
      code: QuestionBankValidationErrorCode,
      message: string,
    ) => errors.push({ index, field, code, message })

    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      report(null, 'invalid-entry', 'Question must be a non-null object, not an array.')
      return
    }

    const question = entry as Record<string, unknown>
    // Check fields in Question declaration order for deterministic diagnostics.
    if (!isRequiredString(question.id)) {
      report('id', 'invalid-string', 'id must be a non-empty string.')
    } else {
      const firstIndex = firstIdIndices.get(question.id)
      if (firstIndex !== undefined) {
        report('id', 'duplicate-id', `id repeats the first occurrence at index ${firstIndex}.`)
      } else {
        firstIdIndices.set(question.id, index)
      }
    }

    if (!isRequiredString(question.celebrityId)) {
      report('celebrityId', 'invalid-string', 'celebrityId must be a non-empty string.')
    } else if (!celebritySlug.test(question.celebrityId)) {
      report('celebrityId', 'invalid-slug', 'celebrityId must contain lowercase ASCII words separated by single hyphens.')
    }

    for (const field of ['prompt', 'answerLabel'] as const) {
      if (!isRequiredString(question[field])) {
        report(field, 'invalid-string', `${field} must be a non-empty string.`)
      }
    }

    for (const [field, limit] of [['latitude', 90], ['longitude', 180]] as const) {
      const value = question[field]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -limit || value > limit) {
        report(field, 'invalid-coordinate', `${field} must be a finite number in [-${limit}, ${limit}].`)
      }
    }

    if (question.category !== 'birthplace' && question.category !== 'filming-location' && question.category !== 'other-location') {
      report('category', 'invalid-category', 'category must be birthplace, filming-location, or other-location.')
    }
    if (question.difficulty !== 'easy' && question.difficulty !== 'medium' && question.difficulty !== 'hard') {
      report('difficulty', 'invalid-difficulty', 'difficulty must be easy, medium, or hard.')
    }
    if (!isRequiredString(question.sourceNote)) {
      report('sourceNote', 'invalid-string', 'sourceNote must be a non-empty string.')
    }
  })

  return errors
}
