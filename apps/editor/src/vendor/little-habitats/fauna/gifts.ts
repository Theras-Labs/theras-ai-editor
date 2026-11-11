// Ports index-BwioI7A7.js 26303-26355: friendship gifts and the garden / visitor names in localStorage
// (Vd, Hd, Ud, Wd, Gd, Kd, qd, Jd, Yd, Xd, Zd, Qd, $d).

/** One gift a friend left at a corner of the island. */
export interface Gift {
  corner: number;
  from: string;
}

const GIFTS_KEY = `scaper.gifts.v1`; // Vd (26303)
const NAME_KEY = `scaper.name`; // Hd (26304)
let giftOverride: Gift[] | null = null; // Ud (26305)
let visitGift: Gift | null = null; // Wd (26306)

/** While visiting another garden, its gift list replaces the local one. */
export function setGiftOverride(gifts: Gift[] | null): void { // Gd (26307)
  giftOverride = gifts;
}

/** Adds (or moves) the one gift the visitor leaves during a visit. Only while an override is set. */
export function addVisitGift(gift: Gift): void { // Kd (26310)
  if (giftOverride) {
    if (visitGift) giftOverride = giftOverride.filter((g) => g !== visitGift);
    visitGift = { corner: gift.corner, from: gift.from.slice(0, 24) };
    giftOverride = [...giftOverride, visitGift];
  }
}

export function loadGifts(): Gift[] { // qd (26313)
  if (giftOverride) return giftOverride;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GIFTS_KEY) ?? `[]`);
    return Array.isArray(parsed)
      ? (parsed as Partial<Gift>[]).filter((g) => Number.isInteger(g?.corner) && typeof g?.from == `string`) as Gift[]
      : [];
  } catch {
    return [];
  }
}

/** Stores a received gift. Returns false when the same gift is already stored. */
export function addGift(gift: Gift): boolean { // Jd (26322)
  const gifts = loadGifts();
  if (gifts.some((g) => g.corner === gift.corner && g.from === gift.from)) return false;
  gifts.push({ corner: gift.corner, from: gift.from.slice(0, 24) });
  try {
    localStorage.setItem(GIFTS_KEY, JSON.stringify(gifts.slice(-40)));
  } catch {}
  return true;
}

export function loadGardenName(): string { // Yd (26331)
  try {
    return localStorage.getItem(NAME_KEY) || ``;
  } catch {
    return ``;
  }
}

const VISITOR_NAME_KEY = `scaper.visitorName`; // Xd (26338)

export function loadVisitorName(): string { // Zd (26339)
  try {
    return localStorage.getItem(VISITOR_NAME_KEY) || localStorage.getItem(NAME_KEY) || ``;
  } catch {
    return ``;
  }
}

export function saveVisitorName(name: string): void { // Qd (26346)
  try {
    localStorage.setItem(VISITOR_NAME_KEY, name.slice(0, 24));
  } catch {}
}

export function saveGardenName(name: string): void { // $d (26351)
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 32));
  } catch {}
}
