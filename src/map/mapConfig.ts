import type { ExpressionSpecification, StyleSpecification, StyleSwapOptions } from 'maplibre-gl'

const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'
const GEOGRAPHIC_LAYER_ORDER = [
  'water',
  'boundary_2',
  'boundary_disputed',
  'label_country_1',
  'label_country_2',
  'label_country_3',
  'water_name_point_label',
  'water_name_line_label',
]

export function createPhysicalHybridStyle(style: StyleSpecification): StyleSpecification {
  const overlays = GEOGRAPHIC_LAYER_ORDER.flatMap((id) => {
    const layer = style.layers.find((candidate) => candidate.id === id)
    if (!layer || !('source' in layer) || !style.sources[layer.source]) return []
    return [structuredClone(layer)]
  })

  for (const layer of overlays) {
    if (layer.type === 'fill') {
      layer.paint = {
        ...layer.paint,
        'fill-color': '#08354A',
        'fill-opacity': 1,
      }
    } else if (layer.type === 'line') {
      layer.paint = {
        ...layer.paint,
        'line-color': '#e5eaf0',
        'line-opacity': 0.7,
        'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 6, 1.2],
      }
      if (layer.id === 'boundary_disputed') {
        layer.filter = [
          'all',
          // Bright uses expression filters rather than legacy property filters.
          ...(layer.filter ? [layer.filter as ExpressionSpecification] : []),
          ['==', ['get', 'admin_level'], 2],
        ]
      }
    } else if (layer.type === 'symbol') {
      layer.paint = {
        ...layer.paint,
        'text-color': '#f1f5f9',
        'text-halo-color': '#10151d',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5,
      }
      if (layer['source-layer'] === 'water_name') {
        layer.filter = [
          'all',
          ...(layer.filter ? [layer.filter as ExpressionSpecification] : []),
          ['match', ['get', 'class'], ['ocean', 'sea'], true, false],
        ]
      }
    }
  }

  const sources: StyleSpecification['sources'] = {}
  for (const layer of overlays) {
    if ('source' in layer) {
      sources[layer.source] = structuredClone(style.sources[layer.source])
    }
  }
  sources['team1-physical'] = {
    type: 'raster',
    tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 6,
    attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  }

  return {
    version: 8,
    name: 'Team1 physical hybrid',
    glyphs: style.glyphs,
    sources,
    layers: [
      { id: 'team1-physical', type: 'raster', source: 'team1-physical' },
      ...overlays,
    ],
    projection: { type: 'globe' },
    sky: {
      'sky-color': '#05070b',
      'horizon-color': '#05070b',
      'fog-color': '#05070b',
      'atmosphere-blend': [
        'interpolate', ['linear'], ['zoom'], 0, 0.25, 4, 0.25, 7, 0,
      ],
    },
  }
}

export function resolveMapStyle(configuredStyle?: string): {
  url: string
  options: StyleSwapOptions
} {
  const override = configuredStyle?.trim()
  if (override) return { url: override, options: {} }

  return {
    url: DEFAULT_MAP_STYLE_URL,
    options: {
      transformStyle: (_previous, next) => createPhysicalHybridStyle(next),
    },
  }
}
