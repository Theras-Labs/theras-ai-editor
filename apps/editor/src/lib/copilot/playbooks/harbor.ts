// Island harbor: a lighthouse on the shore, boats and a few dock goods.
import type { Playbook } from "./types";

export const HARBOR_PLAYBOOK: Playbook = {
  id: "harbor",
  name: "Island harbor",
  triggers: ["harbor", "harbour", "port", "dock", "pier", "wharf", "marina", "jetty", "lighthouse", "ship", "fishing village", "seaside", "coast"],
  sceneHints: ["water"],
  palette: "harbor",
  environment: "lh:sky:anime_day",
  water: "water:lagoon",
  focal: ["lh:landmark:lighthouse"],
  support: ["lh:feature:rowboat", "vehicle:caravan-ship", "model:fantasy:dock-side"],
  accents: ["model:fantasy:barrels", "lh:feature:lantern", "lh:plant:reeds"],
  rules: [
    "Lighthouse is the one focal point: on the shore, off-center in the view.",
    "Keep the sight line from the camera to it clear; nothing tall in front.",
    "Boats at the shore: 1 ship or 1 to 3 rowboats, never in a row.",
    "Barrels in tight groups of 3 or 5 at the dock; reeds at the water line.",
    "Leave half of the shore and the water open.",
    "One light mood: day, or night with 3 to 5 lanterns.",
    "No trees, fences or houses on the dock."
  ],
  example: {
    folder: "Harbor",
    items: [
      { id: "lh:landmark:lighthouse", layout: { pattern: "shore" } },
      { id: "lh:feature:rowboat", count: 2, layout: { pattern: "shore", radius: 5 } },
      { id: "model:fantasy:barrels", count: 3, layout: { pattern: "shore", radius: 3 } },
      { id: "lh:plant:reeds", count: 5, layout: { pattern: "shore", radius: 7 } }
    ]
  }
};
