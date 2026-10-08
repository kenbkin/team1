import { useState } from 'react'
import { questionBank } from '../game/questionBank'
import { selectQuestions } from '../game/selectQuestions'
import GameMap from '../map/GameMap'
import type { Coordinates } from '../map/guessCoordinates'

export default function App() {
  const [question] = useState(() => selectQuestions(questionBank, 1)[0])
  const [guess, setGuess] = useState<Coordinates | null>(null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Team1</h1>
        <h2 className="question-prompt">
          {question?.prompt ?? 'No question is available right now.'}
        </h2>
        {question && (
          <>
            <p className="question-instruction">Tap or click the globe to place your guess.</p>
            <p className="guess-status" role="status" aria-atomic="true">
              {guess ? 'Guess placed. Tap another point to move it.' : ''}
            </p>
          </>
        )}
      </header>
      <main className="map-area" aria-label="World map">
        {question && <GameMap guess={guess} onGuess={setGuess} />}
      </main>
    </div>
  )
}
