import { isRuntimeBundle, isRuntimeScene, parseRuntimeScene } from "@theras/runtime-format";
import type { TherasEngineBundle, TherasEngineScene } from "../types";

export function isTherasEngineScene(value: unknown): value is TherasEngineScene {
  return isRuntimeScene(value);
}

export function isTherasEngineBundle(value: unknown): value is TherasEngineBundle {
  return isRuntimeBundle(value);
}

export function parseTherasEngineScene(text: string): TherasEngineScene {
  return parseRuntimeScene(text);
}

export async function fetchTherasEngineScene(url: string, init?: RequestInit): Promise<TherasEngineScene> {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch engine scene: ${response.status} ${response.statusText}`);
  }

  return parseTherasEngineScene(await response.text());
}
