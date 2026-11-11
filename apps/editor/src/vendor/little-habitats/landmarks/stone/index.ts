// Ports index-BwioI7A7.js 33251-33560: the stone landmark list Ng (the sundial entry is inline there and lives in
// sundial.ts). The order is kept: B_ sorts the catalog by priority with a stable sort.
import type { LandmarkDef } from '../types';
import { CAMPFIRE } from './campfire';
import { GAZEBO } from './gazebo';
import { HOT_SPRING } from './hot_spring';
import { STANDING_STONES } from './standing_stones';
import { SUNDIAL } from './sundial';

export { CAMPFIRE, GAZEBO, HOT_SPRING, STANDING_STONES, SUNDIAL };

export const STONE_LANDMARKS: LandmarkDef[] = [STANDING_STONES, HOT_SPRING, GAZEBO, SUNDIAL, CAMPFIRE]; // Ng (33251)
