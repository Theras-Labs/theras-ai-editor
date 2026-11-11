// Ports chunk anim-BkMIccNZ.js (lines 1-18).
// Index aliases: Ft clamp, Pt lerp, W smoothstep, Mt easeOutCubic, jt easeInOutSine, At easeOutBack,
// G damp, Nt dampAngle.

export const clamp = (x: number, min = 0, max = 1): number => Math.min(max, Math.max(min, x)); // e (anim 1), Ft

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t; // t (anim 2), Pt

export const smoothstep = (edge0: number, edge1: number, x: number): number => { // n (anim 3), W
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - (1 - clamp(t)) ** 3; // r (anim 7), Mt

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp(t)) - 1) / 2; // i (anim 8), jt

export const easeOutBack = (t: number, overshoot = 1.70158): number => { // a (anim 9), At
  const u = clamp(t) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
};

/** Frame-rate independent exponential approach of `current` to `target`. */
export const damp = (current: number, target: number, lambda: number, dt: number): number => // o (anim 13), G
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Like damp, but takes the shortest way around the circle (radians). */
export const dampAngle = (current: number, target: number, lambda: number, dt: number): number => { // s (anim 14), Nt
  let d = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return current + d * (1 - Math.exp(-lambda * dt));
};
