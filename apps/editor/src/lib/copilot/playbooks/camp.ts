// Camp: a campfire with seats around it, framed by pines, in warm dusk light.
import type { Playbook } from "./types";

export const CAMP_PLAYBOOK: Playbook = {
  id: "camp",
  name: "Camp",
  triggers: ["camp", "camping", "campsite", "campfire", "camp fire", "bonfire", "fire pit", "tent", "outpost", "hideout"],
  palette: "ember",
  environment: "lh:sky:dusk",
  focal: ["lh:landmark:campfire"],
  support: ["lh:feature:bench", "lh:feature:log_pile", "lh:plant:pine"],
  accents: ["lh:feature:lantern", "lh:plant:fern", "lh:plant:mushroom"],
  rules: [
    "Campfire is the focal point, on open ground near the view center.",
    "Seats face the fire in a loose ring; leave a gap toward the camera.",
    "Pines in groups of 3 or 5 frame the camp; none between camera and fire.",
    "Log pile and lanterns at the edge of the ring, not inside it.",
    "Ferns and toadstools in small groups at tree bases only.",
    "Keep the ground inside the ring open.",
    "Dusk or night only, so the fire glow reads.",
    "No tables, fences or houses."
  ],
  example: {
    folder: "Camp",
    items: [
      { id: "lh:landmark:campfire", layout: { pattern: "single" } },
      { id: "lh:feature:bench", count: 3, layout: { pattern: "ring", radius: 2.5, facing: "anchor" } },
      { id: "lh:feature:log_pile", layout: { pattern: "cluster", radius: 4 } },
      { id: "lh:plant:pine", count: 5, layout: { pattern: "cluster", radius: 9 } }
    ]
  }
};
