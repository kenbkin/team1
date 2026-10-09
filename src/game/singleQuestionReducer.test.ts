import { afterEach, describe, expect, it, vi } from 'vitest'
import * as distanceCore from './calculateDistanceKm'
import type { GeographicCoordinates } from './calculateDistanceKm'
import * as scoreCore from './calculateScore'
import type { Question } from './question'
import { initialSingleQuestionState, singleQuestionReducer } from './singleQuestionReducer'
import type { SingleQuestionAction, SingleQuestionState } from './singleQuestionReducer'

const question: Question = {
  id: 'test-question',
  celebrityId: 'test-actor',
  prompt: 'Where is this test location?',
  answerLabel: 'Test location',
  latitude: 40.7128,
  longitude: -74.006,
  category: 'birthplace',
  difficulty: 'easy',
  sourceNote: 'Synthetic fixture for state-transition tests.',
}

function reveal(guess: GeographicCoordinates, selectedQuestion: Question = question) {
  const result = singleQuestionReducer(
    { phase: 'guessing', guess },
    { type: 'submit', question: selectedQuestion },
  )
  expect(result.phase).toBe('revealed')
  if (result.phase !== 'revealed') throw new Error('Expected a revealed result.')
  return result
}

afterEach(() => vi.restoreAllMocks())

describe('singleQuestionReducer', () => {
  it('starts guessing with no guess', () => {
    expect(initialSingleQuestionState).toEqual({ phase: 'guessing', guess: null })
  })

  it('places a guess in an independent coordinate snapshot', () => {
    const coordinates = { lat: 12, lng: 34 }
    const state = singleQuestionReducer(initialSingleQuestionState, { type: 'placeGuess', coordinates })
    expect(state).toEqual({ phase: 'guessing', guess: coordinates })
    expect(state.guess).not.toBe(coordinates)
    coordinates.lat = 56
    expect(state.guess).toEqual({ lat: 12, lng: 34 })
    expect(initialSingleQuestionState.guess).toBeNull()
  })

  it('replaces an earlier guess before submission', () => {
    const state: SingleQuestionState = { phase: 'guessing', guess: { lat: 12, lng: 34 } }
    const next = singleQuestionReducer(state, { type: 'placeGuess', coordinates: { lat: -20, lng: 70 } })
    expect(next).toEqual({ phase: 'guessing', guess: { lat: -20, lng: 70 } })
    expect(state.guess).toEqual({ lat: 12, lng: 34 })
  })

  it('ignores submission without a guess and does not calculate a result', () => {
    const distanceSpy = vi.spyOn(distanceCore, 'calculateDistanceKm')
    const scoreSpy = vi.spyOn(scoreCore, 'calculateScore')
    expect(singleQuestionReducer(initialSingleQuestionState, { type: 'submit', question }))
      .toBe(initialSingleQuestionState)
    expect(distanceSpy).not.toHaveBeenCalled()
    expect(scoreSpy).not.toHaveBeenCalled()
  })

  it('maps Question latitude and longitude to answer lat and lng', () => {
    const result = reveal({ lat: 0, lng: 0 })
    expect(result.answer).toEqual({ lat: 40.7128, lng: -74.006 })
  })

  it('awards 1000 points and exact zero distance for an exact guess', () => {
    const result = reveal({ lat: 40.7128, lng: -74.006 })
    expect(result.distanceKm).toBe(0)
    expect(result.score).toBe(1000)
  })

  it('stores the known one-degree equatorial distance and score', () => {
    const result = reveal({ lat: 0, lng: 0 }, { ...question, latitude: 0, longitude: 1 })
    expect(result.distanceKm).toBeCloseTo(111.195080, 6)
    expect(result.score).toBe(946)
  })

  it('passes full-precision distance to scoring rather than rounded kilometers', () => {
    // Fixed longitude for a 1.001 km equatorial arc with the approved mean radius.
    // Rounding this distance to 1 km before scoring would incorrectly award 1000.
    const scoreSpy = vi.spyOn(scoreCore, 'calculateScore')
    const result = reveal(
      { lat: 0, lng: 0 },
      { ...question, latitude: 0, longitude: 0.009002196840882624 },
    )
    expect(result.distanceKm).toBeCloseTo(1.001, 12)
    expect(scoreSpy).toHaveBeenCalledExactlyOnceWith(result.distanceKm)
    expect(result.score).toBe(999)
  })

  it('snapshots both coordinates independently of the prior state and question', () => {
    const guess = { lat: 10, lng: 20 }
    const selectedQuestion = { ...question }
    const result = reveal(guess, selectedQuestion)
    expect(result.guess).not.toBe(guess)
    expect(result.answer).not.toBe(selectedQuestion)
    expect(result.answer).not.toBe(result.guess)
    guess.lat = 80
    selectedQuestion.latitude = -80
    selectedQuestion.longitude = 170
    expect(result.guess).toEqual({ lat: 10, lng: 20 })
    expect(result.answer).toEqual({ lat: 40.7128, lng: -74.006 })
  })

  it('preserves frozen state, coordinates, question, and action inputs', () => {
    const coordinates = Object.freeze({ lat: 10, lng: 20 })
    const selectedQuestion = Object.freeze({ ...question })
    const placement = Object.freeze({ type: 'placeGuess', coordinates } as const)
    const placed = Object.freeze(singleQuestionReducer(Object.freeze(initialSingleQuestionState), placement))
    const action = Object.freeze({ type: 'submit', question: selectedQuestion } as const)
    const snapshot = structuredClone({ placed, action })
    const result = singleQuestionReducer(placed, action)
    expect(result.phase).toBe('revealed')
    expect({ placed, action }).toEqual(snapshot)
    expect(coordinates).toEqual({ lat: 10, lng: 20 })
  })

  it('ignores placeGuess after reveal', () => {
    const result = reveal({ lat: 10, lng: 20 })
    expect(singleQuestionReducer(result, { type: 'placeGuess', coordinates: { lat: -10, lng: -20 } }))
      .toBe(result)
  })

  it('ignores duplicate submission without recalculating distance or score', () => {
    const result = reveal({ lat: 10, lng: 20 })
    const distanceSpy = vi.spyOn(distanceCore, 'calculateDistanceKm')
    const scoreSpy = vi.spyOn(scoreCore, 'calculateScore')
    expect(singleQuestionReducer(result, { type: 'submit', question: { ...question, latitude: -40 } }))
      .toBe(result)
    expect(distanceSpy).not.toHaveBeenCalled()
    expect(scoreSpy).not.toHaveBeenCalled()
  })

  it('keeps the submitted result fixed throughout later queued actions', () => {
    const result = reveal({ lat: 10, lng: 20 })
    const snapshot = structuredClone(result)
    const actions: SingleQuestionAction[] = [
      { type: 'placeGuess', coordinates: { lat: 1, lng: 2 } },
      { type: 'submit', question },
      { type: 'placeGuess', coordinates: { lat: 3, lng: 4 } },
      { type: 'submit', question: { ...question, longitude: 0 } },
    ]
    let state: SingleQuestionState = result
    for (const action of actions) state = singleQuestionReducer(state, action)
    expect(state).toBe(result)
    expect(state).toEqual(snapshot)
  })

  it('returns deterministic results without mutating inputs when evaluated twice', () => {
    const state: SingleQuestionState = { phase: 'guessing', guess: { lat: 10, lng: 20 } }
    const action: SingleQuestionAction = { type: 'submit', question }
    const snapshot = structuredClone({ state, action })
    const first = singleQuestionReducer(state, action)
    const second = singleQuestionReducer(state, action)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect({ state, action }).toEqual(snapshot)
  })
})
