// Generator registry. "compose" (library objects with place_resources) is handled by the director core.
import { architectureGenerator } from "./architecture";
import { cityGenerator } from "./city";
import { interiorGenerator } from "./interior";
import { objectGenerator } from "./object";
import { riverGenerator } from "./river";
import type { Generator } from "../types";

export const GENERATORS: Generator[] = [cityGenerator, riverGenerator, objectGenerator, architectureGenerator, interiorGenerator].filter(
  (g): g is Generator => g !== null
);

export function getGenerator(id: string): Generator | undefined {
  return GENERATORS.find((g) => g.id === id);
}
