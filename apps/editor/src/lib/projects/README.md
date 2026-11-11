# Project import

The user gives the path of a project folder on this computer (a game repository, an asset
folder). Theras scans it and loads what it can use.

## How to import

- In Ask Theras: put the folder path in the message, for example
  `import /Users/me/games/my-game` or `load @/Users/me/games/my-game`. A message that only asks
  to import loads the project's environment at once, without a model call. A longer message
  ("import /path and add a market in front of the hotel") goes to the AI after the scan.
- In Templates: type the path in "Import a project folder".

Each imported project gets a card in Templates under "Your projects". Projects are kept per
viewer (localStorage `theras:projects`) and scanned again when the editor starts.

## What a scan finds

| Found | Becomes |
|---|---|
| A known project (see adapters) | Its place, rebuilt by a Theras library builder from the project's own files |
| `.glb`, `.gltf`, `.vrm` models | Library entries, category "Project: <name>" (id `project:<name>:<file>`) |
| A model named level, world, map, arena, scene, terrain... | The environment, when no adapter matches |
| Images in reference, concept or screenshot folders, and camera photos (`IMG_1234.jpg`) | Reference images: a click in Templates sends one to Ask Theras to build from |

## Adapters (`PROJECT_ADAPTERS` in `projects.ts`)

| Adapter | Recognized by | Library builder |
|---|---|---|
| alley-arena | `src/shared/cheddar-alley/arena.generated.ts` or the arena texture manifest | `env:alley-arena`, textures loaded from the project |
| desert-world | `src/world/desert/buildDesert.ts` or `readable/assets/desert-data-*` | `env:desert-ruins` |
| island | `src/landmarks/`, `src/flora/`, `src/ecology/` | the island template (`lh:terrain:island`) |

To add an adapter: write the place builder as a library entry (see
`src/lib/resources/README.md`), then add one row to `PROJECT_ADAPTERS` with the files that
identify the project and the params (file URLs) the builder needs.

## Server and safety (`server/src/projects.ts`)

- `POST /api/project/scan {path}` walks the folder (no hidden folders, no node_modules, dist,
  build or target; at most 20,000 files, depth 12) and reads only package.json and the README.
- `GET /api/project/<id>/file/<path>` serves one asset file: only from a folder scanned in this
  server run, only model, texture and image extensions (JSON only from asset folders), never
  from a hidden folder, never through a link that leads out of the folder.
- Both routes work only when the server listens on a loopback address, and the scan accepts
  only local editor origins.
