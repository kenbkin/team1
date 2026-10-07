import GameMap from '../map/GameMap'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Team1</h1>
      </header>
      <main className="map-area" aria-label="World map">
        <GameMap />
      </main>
    </div>
  )
}
