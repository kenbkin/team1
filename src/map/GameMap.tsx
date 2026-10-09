import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { MapMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import MapStatus from '../components/MapStatus'
import { resolveMapStyle } from './mapConfig'
import { getGuessCoordinates } from './guessCoordinates'
import type { Coordinates } from './guessCoordinates'

setWorkerUrl(workerUrl)

type GameMapProps = {
  guess: Coordinates | null
  answer: Coordinates | null
  guessLocked: boolean
  onGuess: (coordinates: Coordinates) => void
}

export default function GameMap({ guess, answer, guessLocked, onGuess }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const answerMarkerRef = useRef<Marker | null>(null)
  const [readyMap, setReadyMap] = useState<MapLibreMap | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const compactAttribution = container.clientWidth < 600

    let active = true
    let map: MapLibreMap | undefined
    let initializationTimeout: ReturnType<typeof setTimeout> | undefined

    const onReady = () => {
      if (!active || !map) return
      clearTimeout(initializationTimeout)
      setReadyMap(map)
      setStatus('ready')
      if (compactAttribution) {
        container
          .querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')
          ?.classList.remove('maplibregl-compact-show')
      }
    }

    const onStyleLoad = () => {
      if (!active || !map) return
      map.setProjection({ type: 'globe' })
    }

    try {
      map = new MapLibreMap({
        container,
        center: [15, 20],
        zoom: Math.min(container.clientWidth, container.clientHeight) < 600 ? 0.8 : 2,
        attributionControl: { compact: compactAttribution },
      })
      mapRef.current = map
      map.addControl(new NavigationControl(), 'top-right')

      // A loaded style can remain usable despite individual tile failures.
      map.on('style.load', onStyleLoad)
      map.on('load', onReady)
      map.on('error', (event) => {
        console.warn('Map resource error:', event.error)
      })

      // Only initial load failure becomes a visible error; later resource
      // errors leave the map and its controls available.
      initializationTimeout = setTimeout(() => {
        if (active) setStatus('error')
      }, 20_000)

      const style = resolveMapStyle(import.meta.env.VITE_MAP_STYLE_URL)
      map.setStyle(style.url, style.options)
    } catch (error) {
      console.error('Map initialization failed:', error)
      queueMicrotask(() => {
        if (active) setStatus('error')
      })
    }

    return () => {
      active = false
      clearTimeout(initializationTimeout)
      map?.off('load', onReady)
      map?.off('style.load', onStyleLoad)
      markerRef.current?.remove()
      markerRef.current = null
      answerMarkerRef.current?.remove()
      answerMarkerRef.current = null
      mapRef.current = null
      map?.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMap !== map || guessLocked) return
    let active = true

    const onClick = (event: MapMouseEvent) => {
      if (!active || mapRef.current !== map || event.originalEvent.button !== 0) return
      const target = event.originalEvent.target
      // Allow canvas-container descendants; controls and status overlays are outside it.
      if (!(target instanceof Node) || !map.getCanvasContainer().contains(target)) return
      if (!event.lngLat || !Number.isFinite(event.lngLat.lat) || !Number.isFinite(event.lngLat.lng)) return

      const wrapped = event.lngLat.wrap()
      const coordinates = getGuessCoordinates(wrapped, event.point, (candidate) => map.project(candidate))
      if (coordinates) onGuess(coordinates)
    }

    map.on('click', onClick)
    return () => {
      active = false
      map.off('click', onClick)
    }
  }, [readyMap, guessLocked, onGuess])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMap !== map) return

    if (!guess) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (markerRef.current) {
      markerRef.current.setLngLat([guess.lng, guess.lat])
    } else {
      const marker = new Marker({
        color: '#ff9f43',
        className: 'guess-marker',
        draggable: false,
        opacityWhenCovered: 0,
      })
      marker.getElement().setAttribute('aria-hidden', 'true')
      markerRef.current = marker.setLngLat([guess.lng, guess.lat]).addTo(map)
    }
  }, [guess, readyMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMap !== map) return

    if (!answer) {
      answerMarkerRef.current?.remove()
      answerMarkerRef.current = null
      return
    }

    if (answerMarkerRef.current) {
      answerMarkerRef.current.setLngLat([answer.lng, answer.lat])
    } else {
      const element = document.createElement('div')
      element.setAttribute('aria-hidden', 'true')
      const marker = new Marker({
        element,
        className: 'answer-marker',
        anchor: 'center',
        draggable: false,
        opacityWhenCovered: 0,
      })
      answerMarkerRef.current = marker.setLngLat([answer.lng, answer.lat]).addTo(map)
    }
  }, [answer, readyMap])

  return (
    <div className="game-map" aria-busy={status === 'loading'}>
      <div className="map-container" ref={containerRef} />
      {status !== 'ready' && <MapStatus failed={status === 'error'} />}
    </div>
  )
}
