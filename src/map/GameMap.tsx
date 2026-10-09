import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import MapStatus from '../components/MapStatus'
import { resolveMapStyle } from './mapConfig'
import { getGuessCoordinates } from './guessCoordinates'
import type { Coordinates } from './guessCoordinates'
import type { GeodesicLineGeometry } from './geodesicLine'
import { createGeodesicLine, prepareGeodesicPrefix } from './geodesicLine'

setWorkerUrl(workerUrl)

const ROUTE_SOURCE = 'team1-answer-route'
const ROUTE_CASING = 'team1-answer-route-casing'
const ROUTE_LINE = 'team1-answer-route-line'
const ROUTE_DURATION_MS = 800
const ROUTE_UPDATE_INTERVAL_MS = 1000 / 30
type RouteData = {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: Record<string, never>; geometry: GeodesicLineGeometry }[]
}
const EMPTY_ROUTE: RouteData = { type: 'FeatureCollection', features: [] }

function routeFeatureCollection(geometry: GeodesicLineGeometry): RouteData {
  return {
    type: 'FeatureCollection',
    features: geometry.coordinates.length ? [{ type: 'Feature', properties: {}, geometry }] : [],
  }
}

function ensureRouteLayers(map: MapLibreMap, data: RouteData) {
  const existing = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
  if (existing) {
    existing.setData(data)
  } else {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data, tolerance: 0 })
  }
  const before = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
  for (const [id, color, width, opacity] of [
    [ROUTE_CASING, '#10151d', 4.5, 0.9],
    [ROUTE_LINE, '#b9e6ff', 2.5, 0.9],
  ] as const) {
    if (!map.getLayer(id)) {
      map.addLayer({
        id, type: 'line', source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity },
      }, before)
    }
  }
}

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

  const guessLat = guess?.lat
  const guessLng = guess?.lng
  const answerLat = answer?.lat
  const answerLng = answer?.lng
  const routeData = useMemo<RouteData>(() => {
    if (guessLat === undefined || guessLng === undefined || answerLat === undefined || answerLng === undefined) {
      return EMPTY_ROUTE
    }
    return routeFeatureCollection(createGeodesicLine(
      { lat: guessLat, lng: guessLng }, { lat: answerLat, lng: answerLng },
    ))
  }, [guessLat, guessLng, answerLat, answerLng])
  const routeDataRef = useRef<RouteData>(EMPTY_ROUTE)

  // Clear before paint on Next and cancel this result's work before replacing it.
  // Style reloads use the current prefix ref and do not restart the animation.
  useLayoutEffect(() => {
    const map = mapRef.current
    routeDataRef.current = EMPTY_ROUTE
    if (!map || readyMap !== map) return
    let active = true
    let frame: number | undefined
    const publish = (data: RouteData) => {
      if (!active || mapRef.current !== map) return
      routeDataRef.current = data
      const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
      source?.setData(data)
    }
    publish(EMPTY_ROUTE)
    if (!routeData.features.length) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let complete = false
    const finish = () => {
      if (!active || complete || mapRef.current !== map) return
      complete = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      publish(routeData)
    }
    const prefix = prepareGeodesicPrefix(routeData.features[0].geometry)
    const start = performance.now()
    let lastUpdate = start
    const tick = (now: number) => {
      frame = undefined
      if (!active || complete || mapRef.current !== map) return
      const progress = Math.max(0, Math.min(1, (now - start) / ROUTE_DURATION_MS))
      if (progress === 1) {
        finish()
        return
      }
      if (now - lastUpdate >= ROUTE_UPDATE_INTERVAL_MS) {
        lastUpdate = now
        const eased = 1 - (1 - progress) ** 3
        publish(routeFeatureCollection(prefix(eased)))
      }
      frame = requestAnimationFrame(tick)
    }
    // Finish rather than replaying or extending a reveal after a hidden tab.
    const onVisibilityChange = () => { if (document.hidden) finish() }
    const onMotionChange = () => { if (reducedMotion.matches) finish() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    reducedMotion.addEventListener('change', onMotionChange)
    if (reducedMotion.matches || document.hidden) finish()
    else frame = requestAnimationFrame(tick)

    return () => {
      active = false
      if (frame !== undefined) cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      reducedMotion.removeEventListener('change', onMotionChange)
      // Invalidated callbacks cannot republish after this synchronous clear.
      if (mapRef.current === map) {
        routeDataRef.current = EMPTY_ROUTE
        const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
        source?.setData(EMPTY_ROUTE)
      }
    }
  }, [routeData, readyMap])

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
      ensureRouteLayers(map, routeDataRef.current)
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
