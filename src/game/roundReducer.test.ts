import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeographicCoordinates } from './calculateDistanceKm'
import type { Question } from './question'
import {
  createRoundState, getMaxScore, getTotalScore, MAX_QUESTION_SCORE,
  ROUND_QUESTION_COUNT, roundReducer,
} from './roundReducer'
import type { RoundAction, RoundState } from './roundReducer'
import { selectQuestions } from './selectQuestions'

function fixture(id: string, longitude = 0): Question {
  return {
    id, celebrityId: 'test-actor', prompt: 'Where is this synthetic location?',
    answerLabel: 'Synthetic location', latitude: 0, longitude,
    category: 'birthplace', difficulty: 'easy', sourceNote: 'Synthetic round fixture.',
  }
}

const questions = [fixture('a'), fixture('b', 1), fixture('c', 180)]

function identity(state: RoundState) {
  return { generation: state.generation, questionId: state.selectedQuestions[state.currentIndex].id }
}

function place(state: RoundState, coordinates: GeographicCoordinates = { lat: 0, lng: 0 }) {
  return roundReducer(state, { type: 'placeGuess', ...identity(state), coordinates })
}

function submit(state: RoundState) {
  return roundReducer(state, { type: 'submit', ...identity(state) })
}

function next(state: RoundState) {
  return roundReducer(state, { type: 'next', ...identity(state) })
}

function complete(selectedQuestions: readonly Question[]) {
  let state = createRoundState(selectedQuestions)
  for (let index = 0; index < selectedQuestions.length; index += 1) {
    state = next(submit(place(state)))
  }
  return state
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

afterEach(() => vi.restoreAllMocks())

describe('round initialization', () => {
  it('selects five distinct members from a larger bank and starts at zero', () => {
    const bank = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => fixture(id))
    const selected = selectQuestions(bank, ROUND_QUESTION_COUNT, () => 0)
    const state = createRoundState(selected)
    expect(ROUND_QUESTION_COUNT).toBe(5)
    expect(state.selectedQuestions).toHaveLength(5)
    expect(new Set(state.selectedQuestions.map(({ id }) => id)).size).toBe(5)
    state.selectedQuestions.forEach((question) => expect(bank).toContain(question))
    expect(state.phase).toBe('active')
    expect(state.currentIndex).toBe(0)
    expect(state.generation).toBe(0)
    expect(state.currentQuestionState).toEqual({ phase: 'guessing', guess: null })
    expect(state.completedResults).toEqual([])
    expect(getTotalScore(state)).toBe(0)
    expect(getMaxScore(state)).toBe(5000)
  })

  it('uses the full undersized selection and its actual maximum', () => {
    const selected = selectQuestions(questions, ROUND_QUESTION_COUNT, () => 0)
    const state = createRoundState(selected)
    expect(state.selectedQuestions).toHaveLength(3)
    expect(new Set(state.selectedQuestions.map(({ id }) => id)).size).toBe(3)
    expect(getMaxScore(state)).toBe(3000)
    expect(state.selectedQuestions[state.currentIndex]).toBe(selected[0])
  })

  it('initializes a single-question round', () => {
    const state = createRoundState(selectQuestions([questions[0]], ROUND_QUESTION_COUNT))
    expect(state.phase).toBe('active')
    expect(state.selectedQuestions).toEqual([questions[0]])
    expect(getMaxScore(state)).toBe(1000)
  })

  it('handles an empty bank as unavailable, with no false completed round', () => {
    const state = createRoundState(selectQuestions([], ROUND_QUESTION_COUNT))
    expect(state.phase).toBe('unavailable')
    expect(state.currentIndex).toBe(0)
    expect(state.currentQuestionState).toEqual({ phase: 'guessing', guess: null })
    expect(state.completedResults).toEqual([])
    expect(getTotalScore(state)).toBe(0)
    expect(getMaxScore(state)).toBe(0)
    const actions: RoundAction[] = [
      { type: 'placeGuess', generation: 0, questionId: 'a', coordinates: { lat: 0, lng: 0 } },
      { type: 'submit', generation: 0, questionId: 'a' },
      { type: 'next', generation: 0, questionId: 'a' },
      { type: 'replay', generation: 0, selectedQuestions: questions },
    ]
    actions.forEach((action) => expect(roundReducer(state, action)).toBe(state))
  })

  it('owns a separate selection array without modifying its supplied order', () => {
    const selected = [...questions]
    const state = createRoundState(selected)
    selected.reverse()
    expect(state.selectedQuestions).toEqual(questions)
    expect(state.selectedQuestions).not.toBe(selected)
  })
})

describe('guess and submission', () => {
  it('places and replaces independent guesses without changing the selection', () => {
    const initial = createRoundState(questions)
    const coordinates = { lat: 12, lng: 34 }
    const first = place(initial, coordinates)
    coordinates.lat = 50
    expect(first.currentQuestionState).toEqual({ phase: 'guessing', guess: { lat: 12, lng: 34 } })
    const second = place(first, { lat: -20, lng: 70 })
    expect(second.currentQuestionState).toEqual({ phase: 'guessing', guess: { lat: -20, lng: 70 } })
    expect(initial.currentQuestionState.guess).toBeNull()
    expect(second.selectedQuestions).toBe(initial.selectedQuestions)
    expect(second.currentIndex).toBe(0)
    expect(second.completedResults).toHaveLength(0)
  })

  it.each([{ lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: Infinity }, { lat: 0, lng: -181 }])(
    'ignores invalid map coordinates %j without enabling submission', (coordinates) => {
      const initial = createRoundState(questions)
      expect(place(initial, coordinates)).toBe(initial)
      expect(submit(initial)).toBe(initial)
    },
  )

  it('ignores Submit without a guess', () => {
    const initial = createRoundState(questions)
    expect(submit(initial)).toBe(initial)
    expect(initial.completedResults).toHaveLength(0)
    expect(getTotalScore(initial)).toBe(0)
  })

  it('reveals and records the current answer atomically with exact points', () => {
    const placed = place(createRoundState(questions))
    const state = submit(placed)
    expect(state.currentQuestionState).toEqual({
      phase: 'revealed', guess: { lat: 0, lng: 0 }, answer: { lat: 0, lng: 0 }, distanceKm: 0, score: 1000,
    })
    expect(state.completedResults).toEqual([{ questionId: 'a', result: state.currentQuestionState }])
    expect(state.completedResults[0].result).toBe(state.currentQuestionState)
    expect(getTotalScore(state)).toBe(1000)
    expect(state.phase).toBe('active')
    expect(state.currentIndex).toBe(0)
    expect(placed.completedResults).toHaveLength(0)
  })

  it('uses its current Question and the approved unrounded math', () => {
    const state = submit(place(createRoundState([questions[1]])))
    const result = state.completedResults[0].result
    expect(result.answer).toEqual({ lat: 0, lng: 1 })
    expect(result.distanceKm).toBeCloseTo(111.195080, 6)
    expect(result.score).toBe(946)
    expect(getTotalScore(state)).toBe(946)
  })

  it('snapshots submitted coordinates independently of a previous guess', () => {
    const placed = place(createRoundState(questions), { lat: 10, lng: 20 })
    const state = submit(placed)
    const result = state.completedResults[0].result
    expect(result.guess).toEqual({ lat: 10, lng: 20 })
    expect(result.guess).not.toBe(placed.currentQuestionState.guess)
    expect(result.answer).not.toBe(result.guess)
  })

  it('ignores duplicate submission and late guess placement after reveal', () => {
    const state = submit(place(createRoundState(questions)))
    expect(submit(state)).toBe(state)
    expect(place(state, { lat: 10, lng: 20 })).toBe(state)
    expect(state.completedResults).toHaveLength(1)
    expect(getTotalScore(state)).toBe(1000)
  })
})

describe('round progression and summary', () => {
  it('rejects Next before a successful Submit, including after guess placement', () => {
    const initial = createRoundState(questions)
    expect(next(initial)).toBe(initial)
    const placed = place(initial)
    expect(next(placed)).toBe(placed)
  })

  it('advances exactly one question with fresh guessing state and retained results', () => {
    const revealed = submit(place(createRoundState(questions)))
    const state = next(revealed)
    expect(state.currentIndex).toBe(1)
    expect(state.selectedQuestions[state.currentIndex].id).toBe('b')
    expect(state.currentQuestionState).toEqual({ phase: 'guessing', guess: null })
    expect(state.currentQuestionState).not.toHaveProperty('answer')
    expect(state.completedResults).toBe(revealed.completedResults)
    expect(state.selectedQuestions).toBe(revealed.selectedQuestions)
    expect(getTotalScore(state)).toBe(1000)
    expect(state.phase).toBe('active')
  })

  it('rejects two queued Next actions and cannot skip the fresh question', () => {
    const revealed = submit(place(createRoundState(questions)))
    const action: RoundAction = { type: 'next', ...identity(revealed) }
    const advanced = roundReducer(revealed, action)
    expect(roundReducer(advanced, action)).toBe(advanced)
    expect(next(advanced)).toBe(advanced)
    expect(advanced.currentIndex).toBe(1)
  })

  it('adds each submitted score immediately and exactly once in round order', () => {
    let state = submit(place(createRoundState(questions)))
    expect(getTotalScore(state)).toBe(1000)
    state = submit(place(next(state)))
    expect(getTotalScore(state)).toBe(1946)
    expect(submit(state)).toBe(state)
    state = submit(place(next(state)))
    expect(getTotalScore(state)).toBe(1946)
    expect(state.completedResults.map(({ questionId }) => questionId)).toEqual(['a', 'b', 'c'])
    expect(state.completedResults.map(({ result }) => result.score)).toEqual([1000, 946, 0])
    expect(state.currentIndex).toBe(2)
    expect(state.phase).toBe('active')
  })

  it('requires final reveal before entering summary without index overflow', () => {
    const initial = createRoundState([questions[0]])
    expect(next(initial)).toBe(initial)
    const revealed = submit(place(initial))
    expect(revealed.phase).toBe('active')
    const summary = next(revealed)
    expect(summary.phase).toBe('summary')
    expect(summary.currentIndex).toBe(0)
    expect(summary.currentQuestionState).toEqual({ phase: 'guessing', guess: null })
    expect(summary.completedResults).toBe(revealed.completedResults)
    expect(next(summary)).toBe(summary)
    expect(submit(summary)).toBe(summary)
    expect(place(summary)).toBe(summary)
  })

  it('preserves all results and calculates an undersized summary correctly', () => {
    const summary = complete(questions)
    expect(summary.phase).toBe('summary')
    expect(summary.currentIndex).toBe(2)
    expect(summary.completedResults).toHaveLength(3)
    expect(getTotalScore(summary)).toBe(1946)
    expect(getMaxScore(summary)).toBe(3000)
    expect(MAX_QUESTION_SCORE).toBe(1000)
  })

  it('finishes an actual five-question round with the correct maximum', () => {
    const selected = ['a', 'b', 'c', 'd', 'e'].map((id) => fixture(id))
    const summary = complete(selected)
    expect(summary.phase).toBe('summary')
    expect(summary.currentIndex).toBe(4)
    expect(summary.completedResults).toHaveLength(5)
    expect(getTotalScore(summary)).toBe(5000)
    expect(getMaxScore(summary)).toBe(5000)
  })
})

describe('stale actions and replay', () => {
  it.each(['placeGuess', 'submit', 'next'] as const)('rejects %s for another question', (type) => {
    const state = place(createRoundState(questions))
    const action = { type, generation: 0, questionId: 'b', coordinates: { lat: 0, lng: 0 } }
    expect(roundReducer(state, action)).toBe(state)
  })

  it.each(['placeGuess', 'submit', 'next'] as const)('rejects %s for another generation', (type) => {
    const state = submit(place(createRoundState(questions)))
    const action = { type, generation: 99, questionId: 'a', coordinates: { lat: 0, lng: 0 } }
    expect(roundReducer(state, action)).toBe(state)
  })

  it('rejects old placement and Submit after Next even when the new question has a guess', () => {
    const revealed = submit(place(createRoundState(questions)))
    const staleIdentity = identity(revealed)
    const advanced = place(next(revealed), { lat: 10, lng: 20 })
    expect(roundReducer(advanced, { type: 'placeGuess', ...staleIdentity, coordinates: { lat: 0, lng: 0 } }))
      .toBe(advanced)
    expect(roundReducer(advanced, { type: 'submit', ...staleIdentity })).toBe(advanced)
    expect(advanced.completedResults).toHaveLength(1)
  })

  it('allows replay only from summary', () => {
    const initial = createRoundState(questions)
    const action: RoundAction = { type: 'replay', generation: 0, selectedQuestions: [questions[1]] }
    expect(roundReducer(initial, action)).toBe(initial)
    const revealed = submit(place(initial))
    expect(roundReducer(revealed, action)).toBe(revealed)
  })

  it('replays with a supplied fresh selection and resets all round values', () => {
    const summary = complete(questions)
    const newSelection = [fixture('new', 45), fixture('another', 90)]
    const replayed = roundReducer(summary, { type: 'replay', generation: 0, selectedQuestions: newSelection })
    expect(replayed.phase).toBe('active')
    expect(replayed.generation).toBe(1)
    expect(replayed.currentIndex).toBe(0)
    expect(replayed.selectedQuestions).toEqual(newSelection)
    expect(replayed.currentQuestionState).toEqual({ phase: 'guessing', guess: null })
    expect(replayed.completedResults).toEqual([])
    expect(getTotalScore(replayed)).toBe(0)
    expect(getMaxScore(replayed)).toBe(2000)
    expect(summary.completedResults).toHaveLength(3)
  })

  it('rejects old queued actions after replay selects the same question ID', () => {
    const summary = complete([questions[0]])
    const replayAction: RoundAction = { type: 'replay', generation: 0, selectedQuestions: [questions[0]] }
    const replayed = place(roundReducer(summary, replayAction))
    const stale: RoundAction[] = [
      { type: 'placeGuess', generation: 0, questionId: 'a', coordinates: { lat: 10, lng: 20 } },
      { type: 'submit', generation: 0, questionId: 'a' },
      { type: 'next', generation: 0, questionId: 'a' },
      replayAction,
    ]
    stale.forEach((action) => expect(roundReducer(replayed, action)).toBe(replayed))
    expect(submit(replayed).completedResults).toHaveLength(1)
  })

  it('continues incrementing generations through repeated replay sessions', () => {
    let state = complete([questions[0]])
    for (let generation = 0; generation < 3; generation += 1) {
      state = roundReducer(state, { type: 'replay', generation, selectedQuestions: [questions[0]] })
      expect(state.generation).toBe(generation + 1)
      expect(getTotalScore(state)).toBe(0)
      state = next(submit(place(state)))
      expect(state.phase).toBe('summary')
      expect(getTotalScore(state)).toBe(1000)
    }
  })

  it('handles an empty replay selection as unavailable', () => {
    const summary = complete([questions[0]])
    const state = roundReducer(summary, { type: 'replay', generation: 0, selectedQuestions: [] })
    expect(state.phase).toBe('unavailable')
    expect(state.completedResults).toEqual([])
    expect(state.generation).toBe(1)
    expect(getMaxScore(state)).toBe(0)
  })

  it('preserves frozen inputs through submission, progression, summary and replay', () => {
    const selected = freeze([fixture('frozen')])
    const initial = freeze(createRoundState(selected))
    const initialSnapshot = structuredClone(initial)
    const placement = freeze({ type: 'placeGuess', ...identity(initial), coordinates: { lat: 0, lng: 0 } } as const)
    const placed = freeze(roundReducer(initial, placement))
    const placedSnapshot = structuredClone(placed)
    const revealed = freeze(submit(placed))
    const resultSnapshot = structuredClone(revealed.completedResults)
    const summary = freeze(next(revealed))
    const action = freeze({ type: 'replay', generation: 0, selectedQuestions: selected } as const)
    const replayed = roundReducer(summary, action)
    expect(initial).toEqual(initialSnapshot)
    expect(placed).toEqual(placedSnapshot)
    expect(summary.completedResults).toEqual(resultSnapshot)
    expect(replayed.selectedQuestions).not.toBe(selected)
    expect(replayed.completedResults).toEqual([])
    expect(placement.coordinates).toEqual({ lat: 0, lng: 0 })
    expect(action.selectedQuestions).toBe(selected)
  })

  it('is deterministic and performs no random selection in reducer transitions', () => {
    const initial = place(createRoundState(questions))
    const action: RoundAction = { type: 'submit', ...identity(initial) }
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unexpected randomness') })
    const first = roundReducer(initial, action)
    const second = roundReducer(initial, action)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    const summary = complete(questions)
    const replay = { type: 'replay', generation: 0, selectedQuestions: questions } as const
    expect(roundReducer(summary, replay)).toEqual(roundReducer(summary, replay))
    expect(random).not.toHaveBeenCalled()
  })
})
