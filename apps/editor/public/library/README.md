# Theras library files

This folder holds the file-based part of the Theras resource library. The library is
organized by what a thing is (its category), not by where it came from.

The code that turns these files into library entries is in
`apps/editor/src/lib/resources/` (see the README there). Code-built objects (the island,
its landmarks and features, plants, water, skies) have no files here; they are listed in the
same library and in the same catalog.

## Layout

| Folder | Contents | Library category | Scale |
|---|---|---|---|
| `models/castle/` | Modular castle: walls, towers, gates, bridges, siege engines, flags, rocks, trees | Castle | 2 m per unit |
| `models/fantasy/` | Fantasy village: timber and fortified walls, towers, roofs, docks, stairs, crates, barrels | Fantasy village | 2 m per unit |
| `models/buildings/modular/` | Modular building parts: walls, doors, windows, floors, roofs, stairs, columns | Buildings: modular | 1.5 m per unit |
| `models/city/commercial/` | Whole city buildings and skyscrapers, awnings, parasols | City: commercial | 3 m per unit |
| `models/city/industrial/` | Factories, chimneys, tanks, containers, solar panels, water tower, windmills | City: industrial | 3 m per unit |
| `models/creatures/` | Creature and character bodies | Creatures | scaled to a set height |
| `models/vehicles/` | Vehicles (caravan ship) | Vehicles | scaled to a set height |
| `models/people/` | The rigged, animated human figure (46 animations): library entry `creature:person` and the player in game mode | People | 1.75 m |
| `textures/water/` | Normal, foam, noise and caustic maps for the stylized water | (used by Water) | |

Each kit folder has its `.glb` files, a `Textures/` folder that the `.glb` files refer to, a
`previews/` folder with one image per model (shown on the library cards) and its `LICENSE.txt`.

## Licenses

- `models/castle`, `models/fantasy`, `models/buildings/modular`, `models/city/*`: CC0 1.0, by
  Kenney (kenney.nl). No attribution is required; the credit is kept in each entry.
- `models/creatures`, `models/vehicles`: owned by the Theras AI author.
- `models/people`: the example character of Ecctrl (MIT, (c) 2023-2026 Erdong Chen). Its animations are based on the Universal
  Animation Library by Quaternius (CC0). See `models/people/LICENSE.txt`.
- `textures/water`: MIT, (c) 2025 MatrixRex and (c) 2026 norio. See `textures/water/LICENSE.txt`.

## Adding a kit

1. Copy the kit's `GLB format` folder (with `Textures/`) into `models/<category>/`, and its
   preview images into `models/<category>/previews/`.
2. Add the kit to `KIT_MODELS` in `apps/editor/src/lib/resources/models/kits.generated.ts`
   (slug and size of each model) and to `KITS` in `models/kits.ts` (category, scale, tags).
