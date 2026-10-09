import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { questionBank } from '../game/questionBank'
import type { Question } from '../game/question'
import {
  createRoundState, getMaxScore, getTotalScore, MAX_QUESTION_SCORE,
  ROUND_QUESTION_COUNT, roundReducer,
} from '../game/roundReducer'
import { selectQuestions } from '../game/selectQuestions'
import GameMap from '../map/GameMap'
import type { Coordinates } from '../map/guessCoordinates'

function initializeRound(bank: readonly Question[]) {
  return createRoundState(selectQuestions(bank, ROUND_QUESTION_COUNT))
}

function formatDistance(distanceKm: number): string {
  if (distanceKm === 0) return '0 km'
  if (distanceKm < 1) return '<1 km'
  return Math.round(distanceKm).toLocaleString('en-US') + ' km'
}

function formatPoints(points: number): string {
  return points.toLocaleString('en-US')
}

export default function App() {
  const [state, dispatch] = useReducer(roundReducer, questionBank, initializeRound)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null)
  const advanceButtonRef = useRef<HTMLButtonElement>(null)
  const keyboardSubmissionRef = useRef(false)
  const detailsId = useId()
  const summaryHeadingId = useId()
  const { phase, generation, currentIndex, currentQuestionState } = state
  const question = phase === 'active' ? state.selectedQuestions[currentIndex] : undefined
  const questionId = question?.id
  const result = phase === 'active' && currentQuestionState.phase === 'revealed'
    ? currentQuestionState : null
  const revealed = result !== null
  const totalScore = getTotalScore(state)
  const maxScore = getMaxScore(state)
  const lastQuestion = currentIndex === state.selectedQuestions.length - 1

  const onGuess = useCallback((coordinates: Coordinates) => {
    if (questionId) dispatch({ type: 'placeGuess', coordinates, questionId, generation })
  }, [questionId, generation])

  // Focus only on transitions, never on guess movement or details toggles.
  const previousTransition = useRef({ phase, generation, currentIndex, revealed })
  useEffect(() => {
    const previous = previousTransition.current
    previousTransition.current = { phase, generation, currentIndex, revealed }
    if (phase === 'summary' && previous.phase !== 'summary') {
      summaryHeadingRef.current?.focus()
    } else if (phase === 'active' && (generation !== previous.generation || currentIndex !== previous.currentIndex)) {
      questionHeadingRef.current?.focus()
    } else if (revealed && !previous.revealed && keyboardSubmissionRef.current) {
      advanceButtonRef.current?.focus()
    }
    keyboardSubmissionRef.current = false
  }, [phase, generation, currentIndex, revealed])

  const statusMessage = result && question
    ? 'Correct answer: ' + question.answerLabel + '. Distance: ' + formatDistance(result.distanceKm)
      + '. Score: ' + result.score + ' out of ' + MAX_QUESTION_SCORE + '. Total: ' + formatPoints(totalScore) + ' points.'
    : phase === 'summary'
      ? 'Round complete. ' + state.completedResults.length + ' questions completed. Total: '
        + formatPoints(totalScore) + ' out of ' + formatPoints(maxScore) + ' points.'
      : phase === 'active' && currentQuestionState.guess
        ? 'Guess placed. Tap another point to move it.'
        : ''

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Team1</h1>
        <p className="sr-only" role="status" aria-atomic="true">{statusMessage}</p>
        {phase === 'unavailable' && <h2 className="question-prompt">No question is available right now.</h2>}
        {question && (
          <>
            <div className="round-progress">
              <span>Question {currentIndex + 1} of {state.selectedQuestions.length}</span>
              <span>Total: <strong>{formatPoints(totalScore)}</strong> points</span>
            </div>
            <h2 className="question-prompt" ref={questionHeadingRef} tabIndex={-1}>{question.prompt}</h2>
            <p className="question-instruction">
              {revealed
                ? 'Rotate and zoom the globe to compare both locations.'
                : 'Tap or click the globe to place your guess.'}
            </p>
            <div className="question-actions">
              <button
                type="button"
                className="submit-button"
                disabled={!currentQuestionState.guess || revealed}
                onClick={(event) => {
                  keyboardSubmissionRef.current = event.detail === 0
                  dispatch({ type: 'submit', questionId: question.id, generation })
                }}
              >
                {revealed ? 'Submitted' : 'Submit'}
              </button>
              {revealed && (
                <button
                  type="button"
                  className="action-button"
                  ref={advanceButtonRef}
                  onClick={() => {
                    setDetailsOpen(false)
                    dispatch({ type: 'next', questionId: question.id, generation })
                  }}
                >
                  {lastQuestion ? 'View Results' : 'Next Question'}
                </button>
              )}
              <p className="guess-status">
                {revealed
                  ? 'Answer submitted. Your guess is locked.'
                  : currentQuestionState.guess ? 'Guess placed. Tap another point to move it.' : ''}
              </p>
            </div>
            {result && (
              <div className="question-result">
                <p className="correct-answer"><strong>Correct answer:</strong> {question.answerLabel}</p>
                <div className="result-metrics">
                  <p><strong>Distance:</strong> {formatDistance(result.distanceKm)}</p>
                  <p><strong>Score:</strong> {result.score} / {MAX_QUESTION_SCORE}</p>
                </div>
                <p className="marker-legend">
                  <span className="guess-legend">Orange pin: Your guess</span>
                  <span className="answer-legend">Green ring: Correct location</span>
                </p>
              </div>
            )}
          </>
        )}
        {phase === 'summary' && (
          <section className="round-summary" aria-labelledby={summaryHeadingId}>
            <div className="summary-title">
              <span className="summary-celebration" aria-hidden="true">🏆</span>
              <div>
                <h2 id={summaryHeadingId} ref={summaryHeadingRef} tabIndex={-1}>Round Complete!</h2>
                <p>You completed {state.completedResults.length} {state.completedResults.length === 1 ? 'question' : 'questions'}</p>
              </div>
            </div>
            <p className="summary-score">
              <strong>{formatPoints(totalScore)}</strong><span> / {formatPoints(maxScore)}</span>
            </p>
            <p className="summary-score-label">TOTAL POINTS</p>
            <div className="summary-actions">
              <button
                type="button"
                className="action-button"
                aria-expanded={detailsOpen}
                aria-controls={detailsId}
                onClick={() => setDetailsOpen((open) => !open)}
              >
                {detailsOpen ? 'Hide Details' : 'View Round Details'}
              </button>
              <button
                type="button"
                className="submit-button"
                onClick={() => {
                  const selectedQuestions = selectQuestions(questionBank, ROUND_QUESTION_COUNT)
                  setDetailsOpen(false)
                  dispatch({ type: 'replay', selectedQuestions, generation })
                }}
              >
                Play Again
              </button>
            </div>
            <div id={detailsId} className="round-details" hidden={!detailsOpen} role="region" aria-label="Round details" tabIndex={0}>
              {detailsOpen && (
                <ol className="result-cards">
                  {state.completedResults.map(({ questionId: completedId, result: completed }, index) => (
                    <li className="result-card" key={completedId}>
                      <h3>
                        <span className="question-badge">Q{index + 1}</span>
                        <span>{state.selectedQuestions[index].prompt}</span>
                      </h3>
                      <p className="detail-answer">Correct: {state.selectedQuestions[index].answerLabel}</p>
                      <div className="detail-metrics">
                        <p>{completed.distanceKm === 0 ? 'Perfect guess · 0 km' : 'Missed by ' + formatDistance(completed.distanceKm)}</p>
                        <p className="detail-points"><strong>{completed.score}</strong> / {MAX_QUESTION_SCORE} pts</p>
                      </div>
                      <progress value={completed.score} max={MAX_QUESTION_SCORE} aria-label={'Question ' + (index + 1) + ' points'} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}
      </header>
      <main className="map-area" aria-label="World map">
        {phase !== 'unavailable' && (
          <GameMap
            guess={phase === 'active' ? currentQuestionState.guess : null}
            answer={result ? result.answer : null}
            guessLocked={phase !== 'active' || revealed}
            onGuess={onGuess}
          />
        )}
      </main>
    </div>
  )
}
