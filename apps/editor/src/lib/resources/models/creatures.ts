// Creature and character models (public/library/models/creatures). Each is scaled to a set
// height, centered, and stood on the ground. Owned by the Theras AI author.
import type { ResourceEntry } from "../types";
import { LIBRARY_BASE, modelInstance, titleCase } from "./gltf-model";

const LICENSE = "Owned by the Theras AI author";

type CreatureSpec = { slug: string; height: number; tags: string[]; description: string };

const CREATURES: CreatureSpec[] = [
  { slug: "bell", height: 1.1, tags: ["bell", "metal", "machine"], description: "A walking bronze bell." },
  { slug: "bellows-toad", height: 0.6, tags: ["toad", "animal", "machine"], description: "A squat toad with a bellows body." },
  { slug: "blot", height: 0.5, tags: ["blob", "ink", "small"], description: "A small ink blot creature." },
  { slug: "cart", height: 1.0, tags: ["cart", "wheels", "machine"], description: "A wheeled cart creature." },
  { slug: "centipede", height: 0.4, tags: ["insect", "bug", "long"], description: "A long centipede." },
  { slug: "cloud-jelly", height: 1.2, tags: ["jelly", "floating", "sky"], description: "A floating cloud jellyfish." },
  { slug: "compasswarden", height: 1.6, tags: ["guardian", "compass", "tall"], description: "A tall compass warden." },
  { slug: "crawler", height: 0.5, tags: ["insect", "bug", "small"], description: "A low crawling creature." },
  { slug: "drone", height: 0.7, tags: ["flying", "machine", "robot"], description: "A small flying drone." },
  { slug: "dunemummer", height: 1.4, tags: ["desert", "masked", "figure"], description: "A masked desert mummer." },
  { slug: "fencer", height: 1.5, tags: ["warrior", "blade", "figure"], description: "A thin fencer with a blade." },
  { slug: "hound", height: 0.9, tags: ["dog", "animal", "beast"], description: "A lean hound." },
  { slug: "hulk", height: 1.9, tags: ["giant", "brute", "big"], description: "A heavy brute." },
  { slug: "kilnbeetle", height: 0.7, tags: ["beetle", "insect", "fire"], description: "A beetle with a kiln shell." },
  { slug: "lamp-moth", height: 0.8, tags: ["moth", "light", "flying", "insect"], description: "A moth with a lamp body." },
  { slug: "mummerking", height: 1.8, tags: ["king", "masked", "boss", "figure"], description: "The masked mummer king." },
  { slug: "oracle", height: 1.6, tags: ["seer", "mystic", "figure"], description: "A hooded oracle." },
  { slug: "pebblehare", height: 0.5, tags: ["hare", "rabbit", "animal", "stone"], description: "A hare made of pebbles." },
  { slug: "plumbwalker", height: 1.4, tags: ["walker", "machine", "pipes"], description: "A walker built from pipes." },
  { slug: "prowler", height: 1.0, tags: ["beast", "animal", "hunter"], description: "A low prowling beast." },
  { slug: "roller", height: 0.8, tags: ["ball", "rolling", "machine"], description: "A rolling creature." },
  { slug: "rootknot", height: 0.9, tags: ["root", "plant", "wood", "forest"], description: "A knot of living roots." },
  { slug: "sentinel", height: 1.8, tags: ["guard", "tower", "statue"], description: "A standing sentinel." },
  { slug: "shade", height: 1.5, tags: ["ghost", "shadow", "spirit"], description: "A drifting shade." },
  { slug: "shellback", height: 0.8, tags: ["turtle", "shell", "animal"], description: "A creature with a heavy shell." },
  { slug: "shovelmole", height: 0.6, tags: ["mole", "digger", "animal"], description: "A mole with shovel claws." },
  { slug: "skitter", height: 0.35, tags: ["insect", "bug", "small", "fast"], description: "A tiny skittering bug." },
  { slug: "storm-ray", height: 0.6, tags: ["ray", "flying", "storm", "sky"], description: "A flying storm ray." },
  { slug: "surveyor", height: 1.5, tags: ["explorer", "instrument", "figure"], description: "A surveyor with instruments." },
  { slug: "tripod", height: 1.7, tags: ["walker", "machine", "three legs"], description: "A three-legged walker." },
  { slug: "warlord", height: 1.9, tags: ["warrior", "armor", "boss", "figure"], description: "An armored warlord." },
  { slug: "wisp", height: 0.6, tags: ["spirit", "light", "floating"], description: "A glowing wisp." },
  { slug: "woodcutter", height: 1.5, tags: ["woodcutter", "axe", "forest", "figure"], description: "A woodcutter with an axe." },
  { slug: "worm", height: 0.5, tags: ["worm", "earth", "long"], description: "A burrowing worm." }
];

export const CREATURE_ENTRIES: ResourceEntry[] = CREATURES.map((c) => ({
  id: `creature:${c.slug}`,
  name: titleCase(c.slug),
  kind: "creature",
  source: "local",
  origin: "Theras samples",
  license: LICENSE,
  category: "Creatures",
  tags: ["creature", "character", "monster", ...c.tags],
  description: `${c.description} About ${c.height} m tall.`,
  footprint: Math.max(0.3, c.height * 0.45),
  create: () => modelInstance(`${LIBRARY_BASE}/models/creatures/${c.slug}.glb`, { height: c.height })
}));

export const VEHICLE_ENTRIES: ResourceEntry[] = [
  {
    id: "vehicle:caravan-ship",
    name: "Caravan ship",
    kind: "landmark",
    source: "local",
    origin: "Theras samples",
    license: LICENSE,
    category: "Vehicles",
    tags: ["ship", "boat", "vehicle", "caravan", "sail", "airship"],
    description: "A colorful caravan ship with an awning and cockpit, about 2 m tall.",
    footprint: 2.6,
    create: () => modelInstance(`${LIBRARY_BASE}/models/vehicles/caravan-ship.glb`, { height: 2 })
  }
];
