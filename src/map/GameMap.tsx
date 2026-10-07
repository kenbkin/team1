import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import MapStatus from '../components/MapStatus'
import { resolveMapStyle } from './mapConfig'

setWorkerUrl(workerUrl)

export default function GameMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const compactAttribution = container.clientWidth < 600

    let active = true
    let map: MapLibreMap | undefined
    let initializationTimeout: ReturnType<typeof setTimeout> | undefined

    try {
      map = new MapLibreMap({
        container,
        center: [15, 20],
        zoom: Math.min(container.clientWidth, container.clientHeight) < 600 ? 0.8 : 2,
        attributionControl: { compact: compactAttribution },
      })
      map.addControl(new NavigationControl(), 'top-right')

      const onReady = () => {
        if (!active) return
        clearTimeout(initializationTimeout)
        setStatus('ready')
        if (compactAttribution) {
          container
            .querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')
            ?.classList.remove('maplibregl-compact-show')
        }
      }

      // A loaded style can remain usable despite individual tile failures.
      map.on('style.load', () => {
        if (!active || !map) return

        map.setProjection({
          type: 'globe',
        })
      })
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
      map?.remove()
    }
  }, [])

  return (
    <div className="game-map" aria-busy={status === 'loading'}>
      <div className="map-container" ref={containerRef} />
      {status !== 'ready' && <MapStatus failed={status === 'error'} />}
    </div>
  )
}
