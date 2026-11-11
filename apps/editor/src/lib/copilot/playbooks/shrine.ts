// Shrine: a quiet sacred place with stone, moss, cherry and pine, in evening light.
import type { Playbook } from "./types";

export const SHRINE_PLAYBOOK: Playbook = {
  id: "shrine",
  name: "Shrine",
  triggers: ["shrine", "temple", "zen", "torii", "sacred", "sanctuary", "hot spring", "onsen", "standing stones", "stone circle"],
  palette: "moss",
  environment: "lh:sky:anime_sunset",
  water: "water:clear-lake",
  focal: ["lh:landmark:island_shrine", "lh:landmark:standing_stones"],
  support: ["lh:landmark:hot_spring", "lh:plant:cherry", "lh:plant:pine", "lh:landmark:friendship_lantern"],
  accents: ["lh:feature:lantern", "lh:plant:moss"],
  rules: [
    "The shrine is the focal point; the camera sees it from the front.",
    "Symmetry only at the shrine: 2 lanterns as a pair in front.",
    "Further out no symmetry: cherry and pine in groups of 3.",
    "Moss in small groups at stones and tree bases.",
    "Keep the ground in front of the shrine empty.",
    "Soft evening light; 5 lanterns at most.",
    "No benches, toys or bright flower beds."
  ],
  example: {
    folder: "Shrine",
    items: [
      { id: "lh:landmark:island_shrine", layout: { pattern: "single" } },
      { id: "lh:feature:lantern", count: 2, layout: { pattern: "ring", radius: 2.5, facing: "anchor" } },
      { id: "lh:plant:cherry", count: 3, layout: { pattern: "cluster", radius: 8 } },
      { id: "lh:plant:moss", count: 5, layout: { pattern: "scatter", radius: 6 } }
    ]
  }
};
