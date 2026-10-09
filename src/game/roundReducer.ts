import type { GeographicCoordinates } from './calculateDistanceKm'
import type { Question } from './question'
import { initialSingleQuestionState, singleQuestionReducer } from './singleQuestionReducer'
import type { SingleQuestionState } from './singleQuestionReducer'

export const ROUND_QUESTION_COUNT = 5
export const MAX_QUESTION_SCORE = 1000

export type CompletedResult = Readonly<{
  questionId: string
  result: Extract<SingleQuestionState, { phase: 'revealed' }>
}>

export type RoundState = Readonly<{
  selectedQuestions: readonly Question[]
  currentIndex: number
  currentQuestionState: SingleQuestionState
  completedResults: readonly CompletedResult[]
  phase: 'active' | 'summary' | 'unavailable'
  generation: number
}>

type QuestionIdentity = Readonly<{ questionId: string; generation: number }>

export type RoundAction =
  | (QuestionIdentity & Readonly<{ type: 'placeGuess'; coordinates: GeographicCoordinates }>)
  | (QuestionIdentity & Readonly<{ type: 'submit' | 'next' }>)
  | Readonly<{ type: 'replay'; generation: number; selectedQuestions: readonly Question[] }>

// Selection happens outside the reducer; ordinary transitions retain this array.
export function createRoundState(selectedQuestions: readonly Question[], generation = 0): RoundState {
  return {
    selectedQuestions: [...selectedQuestions],
    currentIndex: 0,
    currentQuestionState: initialSingleQuestionState,
    completedResults: [],
    phase: selectedQuestions.length > 0 ? 'active' : 'unavailable',
    generation,
  }
}

export function getTotalScore(state: RoundState): number {
  return state.completedResults.reduce((total, { result }) => total + result.score, 0)
}

export function getMaxScore(state: RoundState): number {
  return state.selectedQuestions.length * MAX_QUESTION_SCORE
}

export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  if (action.generation !== state.generation) return state

  if (action.type === 'replay') {
    return state.phase === 'summary'
      ? createRoundState(action.selectedQuestions, state.generation + 1)
      : state
  }

  const question = state.selectedQuestions[state.currentIndex]
  if (state.phase !== 'active' || !question || action.questionId !== question.id) return state

  switch (action.type) {
    case 'placeGuess': {
      const { lat, lng } = action.coordinates
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
        return state
      }
      const currentQuestionState = singleQuestionReducer(state.currentQuestionState, action)
      return currentQuestionState === state.currentQuestionState ? state : { ...state, currentQuestionState }
    }
    case 'submit': {
      if (state.currentQuestionState.phase !== 'guessing') return state
      const currentQuestionState = singleQuestionReducer(state.currentQuestionState, { type: 'submit', question })
      if (currentQuestionState.phase !== 'revealed') return state
      return {
        ...state,
        currentQuestionState,
        completedResults: [...state.completedResults, { questionId: question.id, result: currentQuestionState }],
      }
    }
    case 'next':
      if (state.currentQuestionState.phase !== 'revealed') return state
      if (state.currentIndex === state.selectedQuestions.length - 1) {
        return { ...state, phase: 'summary', currentQuestionState: initialSingleQuestionState }
      }
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        currentQuestionState: initialSingleQuestionState,
      }
  }
}
