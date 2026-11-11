export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) {
    return 0;
  }

  return (value - a) / (b - a);
}

export function nearlyEqual(a: number, b: number, epsilon = 1e-5): boolean {
  return Math.abs(a - b) <= epsilon;
}
