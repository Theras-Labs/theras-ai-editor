// Library ids and shared levels of the city generator (pure; roads.ts and the planner both use them).

/** One street: carriageway, sidewalks, curbs, markings, and the intersections it owns. */
export const STREET_ENTRY_ID = "gen:city-street";
/** The ground slab under the city: lots, park lawn and paths, grass verge, plinth sides. */
export const GROUND_ENTRY_ID = "gen:city-ground";
/** A street lamp (single or double arm). */
export const LAMP_ENTRY_ID = "gen:street-lamp";

export const PARK_FOUNTAIN_ID = "lh:landmark:fountain";
export const PARK_BENCH_ID = "lh:feature:bench";

/** Height of the asphalt top, the markings, and the sidewalk / lot top above the city base. */
export const ASPHALT_Y = 0.02;
export const MARKING_Y = 0.032;
export const CURB_Y = 0.17;
