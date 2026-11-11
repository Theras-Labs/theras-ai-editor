// Garden: one centerpiece, flower beds of few kinds, open lawn, soft morning light.
import type { Playbook } from "./types";

export const GARDEN_PLAYBOOK: Playbook = {
  id: "garden",
  name: "Garden",
  triggers: ["garden", "gardens", "flower bed", "flowerbed", "flowers", "park", "courtyard", "orchard", "backyard", "greenhouse"],
  palette: "blossom",
  environment: "lh:sky:anime_morning",
  focal: ["lh:landmark:fountain", "lh:landmark:gazebo"],
  support: ["lh:feature:rose_arch", "lh:feature:bench", "lh:plant:hedge", "lh:plant:cherry"],
  accents: ["lh:plant:rose_bush", "lh:plant:lavender", "lh:feature:birdbath"],
  rules: [
    "One centerpiece: a fountain or a gazebo, not both.",
    "Flowers in groups of 3 or 5 of one kind; 2 or 3 kinds in total.",
    "Hedges frame the edge; keep the walk from the camera open.",
    "1 bench faces the centerpiece; 1 rose arch on the camera side.",
    "Small trees in 1 group of 3, behind the centerpiece.",
    "Leave a third of the ground as open lawn.",
    "Soft morning light; no lanterns by day.",
    "No houses, rocks or a mix of every flower."
  ],
  example: {
    folder: "Garden",
    items: [
      { id: "lh:landmark:fountain", layout: { pattern: "single" } },
      { id: "lh:plant:rose_bush", count: 5, layout: { pattern: "cluster", radius: 4 } },
      { id: "lh:plant:lavender", count: 5, layout: { pattern: "ring", radius: 3 } },
      { id: "lh:plant:cherry", count: 3, layout: { pattern: "cluster", radius: 8 } }
    ]
  }
};
