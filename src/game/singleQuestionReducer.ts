import { calculateDistanceKm } from './calculateDistanceKm'
import type { GeographicCoordinates } from './calculateDistanceKm'
import { calculateScore } from './calculateScore'
import type { Question } from './question'

export type SingleQuestionState =
  | Readonly<{ phase: 'guessing'; guess: GeographicCoordinates | null }>
  | Readonly<{
    phase: 'revealed'
    guess: GeographicCoordinates
    answer: GeographicCoordinates
    distanceKm: number
    score: number
  }>

export type SingleQuestionAction =
  | Readonly<{ type: 'placeGuess'; coordinates: GeographicCoordinates }>
  | Readonly<{ type: 'submit'; question: Question }>

export const initialSingleQuestionState: SingleQuestionState = {
  phase: 'guessing',
  guess: null,
}

export function singleQuestionReducer(
  state: SingleQuestionState,
  action: SingleQuestionAction,
): SingleQuestionState {
  // This guard also rejects late map events and queued duplicate submissions.
  if (state.phase === 'revealed') return state

  switch (action.type) {
    case 'placeGuess':
      return {
        phase: 'guessing',
        guess: { lat: action.coordinates.lat, lng: action.coordinates.lng },
      }
    case 'submit': {
      if (!state.guess) return state

      const guess = { lat: state.guess.lat, lng: state.guess.lng }
      const answer = { lat: action.question.latitude, lng: action.question.longitude }
      const distanceKm = calculateDistanceKm(guess, answer)

      return { phase: 'revealed', guess, answer, distanceKm, score: calculateScore(distanceKm) }
    }
  }
}
