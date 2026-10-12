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

// Keep in sync with GameMap's route animation without changing the map implementation.
const REVEAL_PROTECTION_MS = 800
// No animation with reduced motion, but retain a brief repeat-tap guard.
const REDUCED_MOTION_PROTECTION_MS = 400
// Absorb leftover double/triple taps when View Results exposes Play Again.
const SUMMARY_REPLAY_PROTECTION_MS = 600

type RevealProtection = { questionId: string; generation: number; durationMs: number }
type ReplayProtection = { generation: number }

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
  const [revealProtection, setRevealProtection] = useState<RevealProtection | null>(null)
  // Lock synchronously on Submit, before React commits the replacement action.
  const revealProtectionRef = useRef<RevealProtection | null>(null)
  const [replayProtection, setReplayProtection] = useState<ReplayProtection | null>(null)
  const replayProtectionRef = useRef<ReplayProtection | null>(null)
  const questionHeadingRef = useRef<HTMLHeadingElement>(null)
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null)
  const advanceButtonRef = useRef<HTMLButtonElement>(null)
  const keyboardSubmissionRef = useRef(false)
  const questionHeadingId = useId()
  const detailsId = useId()
  const summaryHeadingId = useId()
  const { phase, generation, currentIndex, currentQuestionState } = state
  const question = phase === 'active' ? state.selectedQuestions[currentIndex] : undefined
  const questionId = question?.id
  const result = phase === 'active' && currentQuestionState.phase === 'revealed'
    ? currentQuestionState : null
  const revealed = result !== null
  const revealInProgress = revealed && revealProtection !== null && revealProtection.questionId === questionId
    && revealProtection.generation === generation
  const replayProtected = phase === 'summary' && replayProtection?.generation === generation
  const totalScore = getTotalScore(state)
  const maxScore = getMaxScore(state)
  const lastQuestion = currentIndex === state.selectedQuestions.length - 1

  const onGuess = useCallback((coordinates: Coordinates) => {
    if (questionId) dispatch({ type: 'placeGuess', coordinates, questionId, generation })
  }, [questionId, generation])

  useEffect(() => {
    if (!revealed || !revealProtection || revealProtection.questionId !== questionId
      || revealProtection.generation !== generation) return

    revealProtectionRef.current = revealProtection
    const timer = window.setTimeout(() => {
      // A cancelled or previous question's timer cannot release a newer lock.
      if (revealProtectionRef.current !== revealProtection) return
      revealProtectionRef.current = null
      setRevealProtection(null)
    }, revealProtection.durationMs)

    return () => {
      window.clearTimeout(timer)
      if (revealProtectionRef.current === revealProtection) revealProtectionRef.current = null
    }
  }, [revealed, revealProtection, questionId, generation])

  useEffect(() => {
    if (phase !== 'summary' || !replayProtection || replayProtection.generation !== generation) return

    replayProtectionRef.current = replayProtection
    const timer = window.setTimeout(() => {
      if (replayProtectionRef.current !== replayProtection) return
      replayProtectionRef.current = null
      setReplayProtection(null)
    }, SUMMARY_REPLAY_PROTECTION_MS)

    return () => {
      window.clearTimeout(timer)
      if (replayProtectionRef.current === replayProtection) replayProtectionRef.current = null
    }
  }, [phase, generation, replayProtection])

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
      + (revealInProgress ? ' Revealing. Please wait.' : lastQuestion ? ' View Results available.' : ' Next Question available.')
    : phase === 'summary'
      ? 'Round complete. ' + state.completedResults.length + ' questions completed. Total: '
        + formatPoints(totalScore) + ' out of ' + formatPoints(maxScore) + ' points.'
        + (replayProtected ? ' Play Again temporarily unavailable. Please wait.' : ' Play Again available.')
      : phase === 'active' && currentQuestionState.guess
        ? 'Guess placed. Tap another point to move it.'
        : ''

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Team1</h1>
        <p className="sr-only" role="status" aria-atomic="true">{statusMessage}</p>
      </header>
      <main className="map-area" aria-label="World map">
        <div className="gameplay-overlay">
          <div className="overlay-top">
            {phase === 'unavailable' && (
              <section className="question-panel" aria-label="Game unavailable">
                <div className="question-info" role="region" aria-label="Game information" tabIndex={0}>
                  <h2 className="question-prompt">No question is available right now.</h2>
                </div>
              </section>
            )}
            {question && (
              <section className="question-panel" aria-labelledby={questionHeadingId}>
                <div className="round-progress">
                  <span>Question {currentIndex + 1} of {state.selectedQuestions.length}</span>
                  <span>Total: <strong>{formatPoints(totalScore)}</strong> points</span>
                </div>
                <div className="question-info" role="region" aria-label="Question information" tabIndex={0}>
                  <h2 className="question-prompt" id={questionHeadingId} ref={questionHeadingRef} tabIndex={-1}>{question.prompt}</h2>
                  <p className="question-instruction">
                    {revealed
                      ? 'Rotate the globe to compare both locations.'
                      : 'Tap or click the globe to place your guess.'}
                  </p>
                </div>
              </section>
            )}
            {phase === 'summary' && (
              <section className="round-summary" aria-labelledby={summaryHeadingId}>
                <div className="summary-overview" role="region" aria-label="Round summary information" tabIndex={0}>
                  <div className="summary-title">
                    <span className="summary-celebration" aria-hidden="true">🏆</span>
                    <div>
                      <h2 id={summaryHeadingId} ref={summaryHeadingRef} tabIndex={-1}>Round Complete!</h2>
                      <p>You completed {state.completedResults.length} {state.completedResults.length === 1 ? 'question' : 'questions'}</p>
                    </div>
                  </div>
                  <div className="summary-totals">
                    <p className="summary-score">
                      <strong>{formatPoints(totalScore)}</strong><span> / {formatPoints(maxScore)}</span>
                    </p>
                    <p className="summary-score-label">TOTAL POINTS</p>
                  </div>
                </div>
              </section>
            )}
          </div>
          <div className="overlay-bottom">
            {question && (
              <section
                className={'response-panel' + (revealed ? '' : ' response-panel-guessing')}
                aria-label={revealed ? 'Answer and next question' : 'Submit your guess'}
              >
                <div className="response-info" role="region" aria-label={revealed ? 'Answer details' : 'Guess guidance'} tabIndex={0}>
                  {result ? (
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
                  ) : (
                    <p className="guess-status">
                      {currentQuestionState.guess ? 'Guess placed. Tap again to move it.' : 'Choose a point on the globe.'}
                    </p>
                  )}
                </div>
                <div className="question-actions">
                  {revealed ? (
                    <button
                      type="button"
                      className="action-button"
                      ref={advanceButtonRef}
                      aria-disabled={revealInProgress}
                      onClick={() => {
                        const protection = revealProtectionRef.current
                        if (revealInProgress || (protection?.questionId === question.id
                          && protection.generation === generation)) return
                        if (lastQuestion) {
                          // Lock before rendering summary; repeated View Results activations cannot restart it.
                          if (replayProtectionRef.current?.generation === generation) return
                          const protection: ReplayProtection = { generation }
                          replayProtectionRef.current = protection
                          setReplayProtection(protection)
                        }
                        setDetailsOpen(false)
                        dispatch({ type: 'next', questionId: question.id, generation })
                      }}
                    >
                      {revealInProgress ? 'Revealing…' : lastQuestion ? 'View Results' : 'Next Question'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="submit-button"
                      disabled={!currentQuestionState.guess}
                      onClick={(event) => {
                        const pending = revealProtectionRef.current
                        if (!currentQuestionState.guess || (pending?.questionId === question.id
                          && pending.generation === generation)) return
                        const protection: RevealProtection = {
                          questionId: question.id,
                          generation,
                          durationMs: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? REDUCED_MOTION_PROTECTION_MS : REVEAL_PROTECTION_MS,
                        }
                        revealProtectionRef.current = protection
                        setRevealProtection(protection)
                        keyboardSubmissionRef.current = event.detail === 0
                        dispatch({ type: 'submit', questionId: question.id, generation })
                      }}
                    >
                      Submit
                    </button>
                  )}
                </div>
              </section>
            )}
            {phase === 'summary' && (
              <section className="response-panel summary-response" aria-label="Round actions and details">
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
                    aria-disabled={replayProtected}
                    onClick={() => {
                      if (phase !== 'summary' || replayProtected
                        || replayProtectionRef.current?.generation === generation) return
                      replayProtectionRef.current = null
                      setReplayProtection(null)
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
          </div>
        </div>
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
