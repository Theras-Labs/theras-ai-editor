// Ports bundle lines 21940-21967: the table of plant geometry builders by species.
import type * as THREE from 'three';
import type { SpeciesId } from '../species';
import { buildApple, buildBirch, buildCherry, buildOak, buildPine, buildWillow } from './trees';
import { buildBerryBush, buildHedge, buildHydrangea, buildLavender, buildRoseBush } from './shrubs';
import { buildBluebell, buildDaisy, buildFoxglove, buildPoppy, buildSunflower, buildTulip } from './flowers';
import {
  buildClover,
  buildFern,
  buildGrassTuft,
  buildLilyPad,
  buildMoss,
  buildMushroom,
  buildReeds,
  buildSucculent,
  buildWaterLily,
} from './ground';

export const PLANT_BUILDERS: Record<SpeciesId, () => THREE.BufferGeometry> = { // Ul (21940)
  oak: buildOak,
  birch: buildBirch,
  cherry: buildCherry,
  apple: buildApple,
  pine: buildPine,
  willow: buildWillow,
  rose_bush: buildRoseBush,
  lavender: buildLavender,
  hydrangea: buildHydrangea,
  hedge: buildHedge,
  berry_bush: buildBerryBush,
  tulip: buildTulip,
  daisy: buildDaisy,
  poppy: buildPoppy,
  sunflower: buildSunflower,
  foxglove: buildFoxglove,
  bluebell: buildBluebell,
  grass_tuft: buildGrassTuft,
  clover: buildClover,
  fern: buildFern,
  mushroom: buildMushroom,
  lily_pad: buildLilyPad,
  water_lily: buildWaterLily,
  reeds: buildReeds,
  moss: buildMoss,
  succulent: buildSucculent,
};
