import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { createPhysicalHybridStyle, resolveMapStyle } from './mapConfig'

function createStyleFixture(): StyleSpecification {
  const borders: LayerSpecification[] = ['boundary_2', 'boundary_disputed'].map(
    (id) => ({
      id,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['!=', ['get', 'maritime'], 1],
      paint: { 'line-color': '#333', 'line-dasharray': [1, 2] },
    }),
  )
  const labels: LayerSpecification[] = [
    'label_country_1', 'label_country_2', 'label_country_3',
    'water_name_point_label', 'water_name_line_label',
  ].map((id) => ({
    id,
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': id.startsWith('water_name') ? 'water_name' : 'place',
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: id === 'label_country_3' ? 2 : 0,
    layout: { 'text-field': ['get', 'name'], 'text-allow-overlap': false },
    paint: { 'text-color': '#000' },
  }))

  return {
    version: 8,
    glyphs: 'https://example.com/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://example.com/sprite',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
      },
      unused: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'background', type: 'background' },
      {
        id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
        filter: [
          'all',
          ['!=', ['get', 'intermittent'], 1],
          ['!=', ['get', 'brunnel'], 'tunnel'],
        ],
        paint: { 'fill-color': '#AECFE2' },
      },
      { id: 'water-intermittent', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' },
      { id: 'waterway-river', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
      { id: 'waterway-stream-canal', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
      ...['landcover-wood', 'park', 'building'].map((id): LayerSpecification => ({
        id, type: 'fill', source: 'openmaptiles', 'source-layer': id,
      })),
      { id: 'highway-primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' },
      ...borders,
      ...['poi_r1', 'label_city', 'airport', 'highway-shield-us-interstate'].map((id): LayerSpecification => ({
        id, type: 'symbol', source: 'openmaptiles',
      })),
      ...labels,
    ],
  }
}

describe('resolveMapStyle', () => {
  it('selects the physical hybrid default for missing or blank configuration', () => {
    for (const value of [undefined, '', '   ', '\t\n']) {
      const config = resolveMapStyle(value)
      expect(config.url).toBe('https://tiles.openfreemap.org/styles/bright')
      const style = createStyleFixture()
      expect(config.options.transformStyle?.(undefined, style)).toEqual(
        createPhysicalHybridStyle(style),
      )
    }
  })

  it('trims explicit URLs and bypasses the transform, even for the template URL', () => {
    for (const url of ['https://example.com/style.json', 'https://tiles.openfreemap.org/styles/bright']) {
      expect(resolveMapStyle(`  ${url}\n`)).toEqual({ url, options: {} })
    }
  })
})

describe('createPhysicalHybridStyle', () => {
  it('places imagery beneath only the intended geographic overlays, removing clutter', () => {
    const input = createStyleFixture()
    // The final order must not depend on the remote template's order.
    input.layers.reverse()
    expect(createPhysicalHybridStyle(input).layers.map((layer) => layer.id)).toEqual([
      'team1-physical', 'water', 'boundary_2', 'boundary_disputed',
      'label_country_1', 'label_country_2', 'label_country_3',
      'water_name_point_label', 'water_name_line_label',
    ])
  })

  it('retains permanent water with its original filter and an opaque deep blue fill', () => {
    const input = createStyleFixture()
    const original = input.layers.find((layer) => layer.id === 'water')
    const result = createPhysicalHybridStyle(input)
    const water = result.layers[1]
    expect(water).toMatchObject({
      id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
      paint: { 'fill-color': '#08354A', 'fill-opacity': 1 },
    })
    expect(water.type === 'fill' && water.filter).toEqual(
      original?.type === 'fill' && original.filter,
    )
  })

  it('preserves vector attribution and glyphs, and credits the physical raster', () => {
    const input = createStyleFixture()
    const result = createPhysicalHybridStyle(input)
    expect(result.sources.openmaptiles).toEqual(input.sources.openmaptiles)
    expect(result.glyphs).toBe(input.glyphs)
    expect(result.sources['team1-physical']).toEqual({
      type: 'raster',
      tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 6,
      attribution: '<a href="https://www.naturalearthdata.com/">Natural Earth</a>',
    })
    expect(result.sources).not.toHaveProperty('unused')
    expect(result.sprite).toBeUndefined()
    expect(result.projection).toEqual({ type: 'globe' })
    expect(result.sky?.['sky-color']).toBe('#05070b')
  })

  it('limits disputed borders to countries and water labels to oceans/seas', () => {
    const result = createPhysicalHybridStyle(createStyleFixture())
    const disputed = result.layers.find((layer) => layer.id === 'boundary_disputed')
    const water = result.layers.find((layer) => layer.id === 'water_name_point_label')
    expect(disputed && 'filter' in disputed && disputed.filter).toEqual([
      'all', ['!=', ['get', 'maritime'], 1], ['==', ['get', 'admin_level'], 2],
    ])
    expect(water && 'filter' in water && water.filter).toEqual([
      'all', ['==', ['geometry-type'], 'Point'],
      ['match', ['get', 'class'], ['ocean', 'sea'], true, false],
    ])
    expect(disputed?.paint).toMatchObject({ 'line-color': '#e5eaf0', 'line-dasharray': [1, 2] })
    expect(water?.paint).toMatchObject({ 'text-color': '#f1f5f9', 'text-halo-color': '#10151d' })
    const country = result.layers.find((layer) => layer.id === 'label_country_3')
    expect(country?.minzoom).toBe(2)
    expect(country && 'layout' in country && country.layout).toMatchObject({ 'text-allow-overlap': false })
  })

  it('does not mutate input, including nested layers and sources', () => {
    const input = createStyleFixture()
    const snapshot = structuredClone(input)
    const result = createPhysicalHybridStyle(input)
    expect(input).toEqual(snapshot)
    const country = result.layers.find((layer) => layer.id === 'label_country_1')
    if (country?.type === 'symbol') country.layout!['text-allow-overlap'] = true
    const source = result.sources.openmaptiles
    if (source.type === 'vector') source.attribution = 'Changed'
    const water = result.layers.find((layer) => layer.id === 'water')
    if (water?.type === 'fill') {
      water.paint!['fill-color'] = '#fff'
      if (Array.isArray(water.filter)) water.filter.pop()
    }
    expect(input).toEqual(snapshot)
  })

  it('handles absent overlay layers without throwing', () => {
    const input = createStyleFixture()
    input.layers = []
    expect(createPhysicalHybridStyle(input).layers).toEqual([
      { id: 'team1-physical', type: 'raster', source: 'team1-physical' },
    ])
  })

  it('omits overlays whose source is absent instead of creating invalid references', () => {
    const input = createStyleFixture()
    input.sources = {}
    const result = createPhysicalHybridStyle(input)
    expect(result.layers).toHaveLength(1)
    expect(Object.keys(result.sources)).toEqual(['team1-physical'])
  })

  it('handles a missing water layer while preserving the remaining overlay order', () => {
    const input = createStyleFixture()
    input.layers = input.layers.filter((layer) => layer.id !== 'water')
    expect(createPhysicalHybridStyle(input).layers.map((layer) => layer.id)).toEqual([
      'team1-physical', 'boundary_2', 'boundary_disputed',
      'label_country_1', 'label_country_2', 'label_country_3',
      'water_name_point_label', 'water_name_line_label',
    ])
  })
})
