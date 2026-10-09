import { useCallback, useReducer, useState } from 'react'
import { questionBank } from '../game/questionBank'
import { selectQuestions } from '../game/selectQuestions'
import { initialSingleQuestionState, singleQuestionReducer } from '../game/singleQuestionReducer'
import GameMap from '../map/GameMap'
import type { Coordinates } from '../map/guessCoordinates'

export default function App() {
  const [question] = useState(() => selectQuestions(questionBank, 1)[0])
  const [state, dispatch] = useReducer(singleQuestionReducer, initialSingleQuestionState)
  const onGuess = useCallback((coordinates: Coordinates) => {
    dispatch({ type: 'placeGuess', coordinates })
  }, [dispatch])
  const revealed = state.phase === 'revealed'
  const formattedDistance = state.phase === 'revealed'
    ? state.distanceKm === 0
      ? '0 km'
      : state.distanceKm < 1
        ? '<1 km'
        : `${Math.round(state.distanceKm).toLocaleString('en-US')} km`
    : null

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Team1</h1>
        <h2 className="question-prompt">
          {question?.prompt ?? 'No question is available right now.'}
        </h2>
        {question && (
          <>
            <p className="question-instruction">
              {revealed
                ? 'Rotate and zoom the globe to compare both locations.'
                : 'Tap or click the globe to place your guess.'}
            </p>
            <div className="question-actions">
              <button
                type="button"
                className="submit-button"
                disabled={!state.guess || revealed}
                onClick={() => dispatch({ type: 'submit', question })}
              >
                {revealed ? 'Submitted' : 'Submit'}
              </button>
              <p className="guess-status" role="status" aria-atomic="true">
                {revealed
                  ? 'Answer submitted. Your guess is locked.'
                  : state.guess ? 'Guess placed. Tap another point to move it.' : ''}
              </p>
            </div>
            {state.phase === 'revealed' && (
              <div className="question-result">
                <p className="correct-answer"><strong>Correct answer:</strong> {question.answerLabel}</p>
                <div className="result-metrics">
                  <p><strong>Distance:</strong> {formattedDistance}</p>
                  <p><strong>Score:</strong> {state.score} / 1000</p>
                </div>
                <p className="marker-legend">
                  <span className="guess-legend">Orange pin: Your guess</span>
                  <span className="answer-legend">Green ring: Correct location</span>
                </p>
              </div>
            )}
          </>
        )}
      </header>
      <main className="map-area" aria-label="World map">
        {question && (
          <GameMap
            guess={state.guess}
            answer={state.phase === 'revealed' ? state.answer : null}
            guessLocked={revealed}
            onGuess={onGuess}
          />
        )}
      </main>
    </div>
  )
}
