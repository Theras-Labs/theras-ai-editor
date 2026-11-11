# Game mode

Game mode lets the user walk through the scene as a person, with physics, while Ask Theras
keeps building. First person is the default view; third person is an option (V). It starts
from the Play button in the header, from Mod+P, or from the AI tool `game_mode`. Loose
objects move only in the physics world and go back to their places on Reset (X) and on exit.
The only thing game mode writes to the scene document is the "Player start" marker, and only
when the user sets it.

## Files

| File | Contents |
|---|---|
| `src/lib/game/game-store.ts` | The shared contract: on or off, `phase` (wrapping, playing), `tools` (editor tools shown), wrap progress, live colliders (`bodies`), the last push (`fire`), view, physics settings, per-object overrides (targets), player pose for the AI. `gameControlsActive()` and `gameHidesEditor()` are the two tests the UI uses. Settings are kept in localStorage `theras:game`. |
| `src/lib/game/game-input.ts` | Keys. `routeGameKey()` is the pure routing rule (state + key -> action). The handlers are installed once, by the HUD and by the player. |
| `src/lib/game/player-start.ts` | `findPlayerStart(editor)` and `setPlayerStart(editor, point, yaw)`: the "Player start" marker node. |
| `src/viewport/components/game/GameWorld.tsx` | Inside the viewport canvas: the Rapier world, the wrap, the start point, the player and the camera. Mounted for the whole game. |
| `src/viewport/components/game/scene-colliders.ts` | Builds colliders from the live three.js scene, a few at a time, in the browser only. |
| `src/viewport/components/game/Player.tsx` | The player: the Ecctrl body, mouse look, the camera (first person by default), the push click, the pose for the AI. |
| `src/viewport/components/game/PlayerCharacter.tsx` | The player figure: the rigged library person with idle, walk, jog, sprint and jump animations. |
| `src/lib/resources/models/people.ts` | The rigged person of the library (`creature:person`), also used by the player. Model: `public/library/models/people/animation-library.glb`. |
| `src/viewport/components/game/WrapSweep.ts` | The sweep that shows each new collider. |
| `src/viewport/components/game/GameSky.tsx` | A plain day sky while the user plays, for scenes with no sky of their own. |
| `src/lib/game/wrap-plan.ts`, `src/lib/game/spawn.ts` | Pure logic: the order and pace of the wrap; the choice of the start point (the marker, else open ground outdoors). |
| `src/lib/resources/game/player-start.ts` | The "Player start" marker object. |
| `src/components/editor-shell/GameHud.tsx` | Overlay: badge with Exit, wrap card, "Editing in game mode" chip, physics panel, crosshair, hints. Pure helpers (hint choice by width, tree mark counts, mark cycle) are exported for tests. |
| `src/components/editor-shell/SceneOutliner.tsx` | Physics marks in the scene tree. |
| `tests/game-ui.test.ts` | Tests of the pure UI logic and the key routing. |

## States

| State | What the user sees | Keys |
|---|---|---|
| Wrapping | The editor stays shown. The scene gets its colliders a few at a time. A card at the top left shows "Wrapping the scene in physics", done / total, a progress bar, the object wrapped last and Skip. | Enter or Space: skip. Escape: exit. Other keys: the editor. |
| Playing | The editor panels are hidden. Badge (top left), physics pill (top right), crosshair in first person (it pulses on a push, green on a hit), hints (bottom center). | The player has the keys (see below). |
| Tools view | The editor panels, selection and tools work again. The player stands still and the physics world keeps running. The editor camera starts behind and above the player. A chip "Editing in game mode" has Resume play. | Tab: resume play. All other keys: the editor. |

Rules:

- The editor is hidden only while `gameHidesEditor(game)` is true (playing, tools not shown).
- Editor hotkeys and the shared shortcut list are off only while `gameControlsActive(game)`.
- While the editor is shown, the HUD stays in one stack at the top left, so it does not cover
  the tool bar (top center), the inspector (top right) or the build dock (bottom center).
- The bottom right corner stays free for the Ask Theras orb. The hints hide while the chat is
  open as a prompt bar.
- The HUD sizes by the viewport area (container queries and a measured width), not by the
  window: a docked chat makes the area narrower. The hints show fewer items as the area gets
  narrower and never wrap to two lines. The physics panel scrolls inside.

## Keys while playing

| Key | Action |
|---|---|
| WASD or arrows, Shift, Space | walk, run, jump |
| Click | capture the pointer; then push a loose object |
| V | first or third person |
| Tab | show the editor tools (Tab again: resume play) |
| Enter or T | ask Theras (frees the mouse) |
| P, C, X | pause physics, show colliders, reset loose objects |
| R | back to the start point |
| Escape | free the mouse, then exit |

Keys go to the game only while no text field has focus. Cmd or Ctrl combinations still reach
the editor (Ask bar, new chat, game mode toggle). The movement input is cleared when the
controls stop (tools view, exit, chat focus, window blur).

## Start point

The player starts at the "Player start" marker when the scene has one (a group with
`metadata.playerStart === true`; it has no collider). Else the start is open, dry, flat
ground near where the editor camera looks. The physics panel has a "Start point" row: the
current rule, "Set here" (puts the marker where the player stands, facing the same way, one
undo step) and "Go to start" (R).

## Scene tree marks

While colliders exist, each wrapped object row has a mark at the right: solid (teal green),
loose (orange), tree trunk (yellow green), ghost (grey, only for a ghost override). The
tooltip names the mode and the collider shape. A click on the mark cycles the override:
default, loose, ghost, solid. A folder row shows the icon of its main mode and the number of
wrapped objects under it. The counts are made in one pass per change of the colliders.

## Physics rules

Each object that the viewport draws as `node:<id>` is one unit.

| Unit | Collider |
|---|---|
| Terrain, lake bed, buildings, landmarks, features, kit pieces, primitives | solid: one fixed trimesh (a box above 400,000 triangles) |
| Trees (kind plant, 1.8 m or taller) | a fixed capsule at the trunk; the canopy does not block |
| Small plants (flowers, grass) | none |
| Water surfaces, sky, lights, the Player start marker | none |
| Targets set to loose | a dynamic convex hull that falls and can be pushed |

Targets: the objects selected when Play starts become loose. The physics panel, the scene
tree marks and the AI tool `set_physics` (loose, solid, ghost, default) change a target.
"Targets + small props" makes every object up to 1.6 m loose. "Targets only" gives colliders
only to targets and the terrain.

## AI

While game mode is on, the scene digest has a "Game mode" line with the player position and
facing direction. "Here" and "in front of me" mean the point 4 m in front of the player. The
system prompt asks for human-scale detail (doors 2.1 m, rails 1 m, small props on tables).
