# Resource library (code)

One library for the editor, the dock and the AI. `catalog.ts` collects every entry into
`RESOURCES`, gives each one a browsing category, and has the search. Everything below is in
that one list, whatever its implementation: a model file, code that builds the object, or a
shader.

## Where each category lives

| Category | Ids | Implementation | File |
|---|---|---|---|
| Island (terrain) | `lh:terrain:island` | code: editable voxel island, lake and lake bed | `little-habitats/terrain.ts`, `terrain-edit.ts` |
| Island: landmarks | `lh:landmark:*` (windmill, lighthouse, shrine, fountain, gazebo, campfire, greenhouse...) | code builders | `little-habitats/props.ts` (definitions in `src/vendor/little-habitats/landmarks/`) |
| Island: features | `lh:feature:*` (bridge, fence, bench, lantern, rose arch, rowboat, stepping stones, log pile...) | code builders | `little-habitats/props.ts` (builders in `src/vendor/little-habitats/ecology/models.ts`) |
| Plants: garden | `lh:plant:*`, `lh:plant:seed_mix` | code: instanced flora with growth and seasons | `little-habitats/plants.ts` |
| Base trees and bush | `nature:tree:oak-round`, `birch`, `cherry-blossom`, `fir`, `maple-autumn`, `birch-autumn`, `oak-golden`, `nature:bush:round` | code and data: the folio-2025 tree kit (MIT, (c) 2025 Bruno Simon), license text in `nature/folio-tree-data.ts` | `nature/folio-trees.ts` |
| Plants (nature) | `nature:*` | code: procedural trees, bushes, flowers, rocks | `nature/vegetation.ts` |
| Castle, Fantasy village, Buildings, City | `model:<kit>:<piece>` | GLB files | `models/kits.ts`, `models/kits.generated.ts`; files in `public/library/models/` |
| Creatures, Vehicles | `creature:*`, `vehicle:*` | GLB files | `models/creatures.ts` |
| Water | `water:*` | shader (waves, depth color, refraction, foam, caustics, reflection) | `water/stylized-water.ts`, `water/presets.ts` |
| Water: puddles | `water:puddle`, `water:puddle-muddy` | a thin patch that lies on the ground under it and follows its shape (island terrain or a place); sky reflection by Fresnel, no extra render pass | `water/puddle.ts` |
| Water: river | `water:river` (parametric: course in `metadata.params`) | one-pass flowing ribbon shader adapted from the stylized water (flow, bank foam, depth from the cross-section); bed and grass banks on flat ground | `water/river-water.ts`, `generated/river.ts`; course and meshes in `src/lib/generators/river/` |
| Skies | `lh:sky:*` | code: sky dome, sun, light, fog, clouds; lens flare | `little-habitats/environment.ts`, `sky/lens-flare.ts` |
| Skies: photo | `polyhaven:hdri:*` | external HDR image | `catalog.ts` |
| Scanned objects (external) | `scan:<id>` | photo scans of real products at real size (Google Scanned Objects, CC BY 4.0). Not in `RESOURCES`: an entry exists after a search on the Theras server (`GET /api/assets/search`) found it, or when this viewer placed it before. The GLB loads from the Hugging Face host when the object is placed | `external/scanned.ts`, `external/scanned-search.ts`; index in `server/data/assets-index.json` |
| Blocks (primitives) | `theras:recipe:*` | editor primitives (blockouts; last resort) | `src/lib/build-slots/presets.ts` |
| Places: arenas, worlds | `env:*` (alley arena, desert world) | code: a whole place built from a game's own data and textures. A place registers its ground height (`registerPlaceGround`), so placement stands things and fits water on it | `environments/<place>/`, `place-ground.ts` |
| Project models | `project:<project>:<file>` | GLB files of an imported project, served by the local server | `src/lib/projects/projects.ts` |
| Templates | `cozy-island`, `alley-arena`, `desert-world`, imported projects | a whole scene made of the entries above, grouped by source (Island kit, Desert, Alley arena, Your projects) | `templates.ts` |

The island's tap tools (Soil, Stone, Water, and the bridge and gate that the island builds on
tap) are editing tools, not library entries: see `terrain-edit.ts` and
`src/lib/build-slots/`.

## Rules

- Ids and folders name what a thing is, never the project it came from. `origin` and `license`
  are credits only.
- Old ids keep working: `getResource` maps them to the current id (see `currentId` in
  `catalog.ts`).
- Search ranks real models and code-built objects before primitive blocks.
- Local entries win. A scanned object (`scan:*`, tag `scanned`) comes after every local entry in a search, and its score is always less than 0.5. The AI gets scanned objects only for a realistic object or for a thing that the library does not have (`src/lib/copilot/director/scanned.ts`).
- An external entry with a license that asks for a credit sets `credit` and `creditUrl`. The library card shows the credit.
