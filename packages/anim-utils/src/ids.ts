let nextIdCounter = 0;

export function createStableId(prefix = "id"): string {
  nextIdCounter += 1;
  return `${prefix}-${nextIdCounter.toString(36)}`;
}
