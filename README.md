# Team1

Browser geography game foundation built with React, TypeScript, Vite, and MapLibre GL JS.

The current milestone provides a minimal header, an interactive world map with navigation
and attribution, a physical hybrid globe, loading/initialization error messages,
and map configuration tests.
Questions, markers, scoring, and round gameplay are not implemented yet.

## Requirements and commands

Use Node.js 24 LTS and pnpm 12.5.1.

```sh
pnpm install
pnpm dev
pnpm lint
pnpm test:run
pnpm build
```

If PowerShell execution policy blocks the pnpm shim, use equivalent `pnpm.cmd`
commands, for example `pnpm.cmd install` and `pnpm.cmd run test:run`.

`pnpm test` starts Vitest in watch mode. `pnpm preview` serves the
production build locally after building.

## Map configuration

MapLibre renders the globe. With missing or blank configuration, Team1 transforms
[OpenFreeMap Bright](https://tiles.openfreemap.org/styles/bright) into a physical hybrid:
[Natural Earth](https://www.naturalearthdata.com/) shaded-relief raster imagery beneath
country borders, country labels, and ocean/sea labels. Roads, POIs, buildings, and
local place clutter are removed. Source attribution remains visible.

These no-key services are development/demo infrastructure; no production map provider
is selected yet. Natural Earth imagery has a maximum source zoom of 6; zooming further
overzooms that imagery. OpenFreeMap public hosting has no SLA guarantee.

Optionally create an ignored `.env.local` based on `.env.example`:

```dotenv
VITE_MAP_STYLE_URL=
```

A non-empty URL overrides the default without applying the OpenFreeMap-specific
transformation. Globe projection still applies; the provider style controls its own
layers and atmosphere. All `VITE_*` configuration is public browser-side configuration;
do not put secret keys in it.

Map rendering requires WebGL and network access to the style and tile resources.
Individual resource failures are logged without replacing the map. A construction
failure or a map that has not finished its initial load after 20 seconds shows an error message;
a later successful load clears it. Production map-provider selection is a later task.
