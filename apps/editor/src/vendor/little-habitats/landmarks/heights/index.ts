// Ports index-BwioI7A7.js 30920-31189: the heights landmark list xh (the windmill entry is inline there and lives in
// windmill.ts). The order is kept: B_ sorts the catalog by priority with a stable sort.
import type { LandmarkDef } from '../types';
import { BELL_TOWER } from './bell_tower';
import { KITE } from './kite';
import { LOOKOUT_TOWER } from './lookout_tower';
import { ROPE_SWING } from './rope_swing';
import { WINDMILL } from './windmill';

export { BELL_TOWER, KITE, LOOKOUT_TOWER, ROPE_SWING, WINDMILL };

export const HEIGHTS_LANDMARKS: LandmarkDef[] = [BELL_TOWER, WINDMILL, LOOKOUT_TOWER, ROPE_SWING, KITE]; // xh (30920)
