// Generated (parametric) library entries. One file for each generator family.
import { ARCHITECTURE_ENTRIES } from "./architecture";
import { INTERIOR_ENTRIES } from "./interior";
import { PARTS_ENTRIES } from "./parts";
import { RIVER_ENTRIES } from "./river";
import { ROADS_ENTRIES } from "./roads";
import type { ResourceEntry } from "../types";

export const GENERATED_ENTRIES: ResourceEntry[] = [...ROADS_ENTRIES, ...RIVER_ENTRIES, ...PARTS_ENTRIES, ...ARCHITECTURE_ENTRIES, ...INTERIOR_ENTRIES];
