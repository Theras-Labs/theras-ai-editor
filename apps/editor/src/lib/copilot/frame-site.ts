// Camera framing for a thing that a generator built (Director v2). A city of 190 x 250 m built
// around the camera target leaves the camera inside a tower; the user must see what was built.
// Pure math here; the hook (app/hooks/useCopilot.ts) writes the result to the viewport camera.
export type Vec3Like = { x: number; y: number; z: number };

export type FrameTarget = { center: { x: number; z: number }; rect: { x0: number; z0: number; x1: number; z1: number }; height?: number };

export type CameraPose = { position: Vec3Like; target: Vec3Like; fov?: number };

/** The largest target by ground area (the city, when there is one), or undefined. */
export function largestTarget<T extends FrameTarget>(targets: T[]): T | undefined {
  const area = (t: FrameTarget) => (t.rect.x1 - t.rect.x0) * (t.rect.z1 - t.rect.z0);
  return targets.reduce<T | undefined>((best, t) => (!best || area(t) > area(best) ? t : best), undefined);
}

/**
 * A camera pose that shows the whole target, or null when the present view already shows it.
 * The view keeps its compass direction; it looks down at 28 to 55 degrees.
 */
export function frameForSite(camera: CameraPose, site: FrameTarget): { position: Vec3Like; target: Vec3Like } | null {
  const w = site.rect.x1 - site.rect.x0;
  const d = site.rect.z1 - site.rect.z0;
  const h = site.height ?? 0;
  // A tall thing needs more distance than its footprint asks for.
  const size = Math.max(Math.hypot(w, d), h * 1.9, 6);
  const fov = ((camera.fov ?? 50) * Math.PI) / 180;
  // Distance at which the target fills most of the view (its diagonal is wider than what the
  // camera sees of it from above, so the sphere distance is shortened).
  const need = (size / 2 / Math.sin(fov / 2)) * 0.82;

  const off = { x: camera.position.x - camera.target.x, y: camera.position.y - camera.target.y, z: camera.position.z - camera.target.z };
  const dist = Math.hypot(off.x, off.y, off.z) || 1;
  const targetOff = Math.hypot(camera.target.x - site.center.x, camera.target.z - site.center.z);
  const inside =
    camera.position.x > site.rect.x0 && camera.position.x < site.rect.x1 && camera.position.z > site.rect.z0 && camera.position.z < site.rect.z1 && camera.position.y < Math.max(h, 4) * 1.2;
  const shows = !inside && dist >= need * 0.7 && dist <= need * 4 && targetOff <= size * 0.5;
  if (shows) return null;

  const flat = Math.hypot(off.x, off.z);
  const dir = flat > 1e-3 ? { x: off.x / flat, z: off.z / flat } : { x: 0.7071, z: 0.7071 };
  const elevation = Math.min((55 * Math.PI) / 180, Math.max((28 * Math.PI) / 180, Math.atan2(off.y, flat || 1)));
  const target = { x: site.center.x, y: Math.max(1, h * 0.45), z: site.center.z };
  return {
    target,
    position: {
      x: target.x + dir.x * Math.cos(elevation) * need,
      y: target.y + Math.sin(elevation) * need,
      z: target.z + dir.z * Math.cos(elevation) * need
    }
  };
}

/** A room that a camera looks into: its floor center, its turn about y, its size and its entrance side. */
export type RoomView = { x: number; z: number; rotY: number; width: number; depth: number; front: "+z" | "-z" | "+x" | "-x"; floorY: number };

/**
 * The camera pose inside a room (an interior site): 1.2 m inside the entrance side, 1.7 m above
 * the floor, looking at the room center 1.3 m above the floor.
 */
export function interiorCameraPose(room: RoomView): { position: Vec3Like; target: Vec3Like } {
  const dir = room.front === "+z" ? { x: 0, z: 1 } : room.front === "-z" ? { x: 0, z: -1 } : room.front === "+x" ? { x: 1, z: 0 } : { x: -1, z: 0 };
  const half = dir.x !== 0 ? room.width / 2 : room.depth / 2;
  const inset = Math.max(0, half - 1.2);
  const lx = dir.x * inset;
  const lz = dir.z * inset;
  const c = Math.cos(room.rotY);
  const s = Math.sin(room.rotY);
  return {
    position: { x: room.x + lx * c + lz * s, y: room.floorY + 1.7, z: room.z - lx * s + lz * c },
    target: { x: room.x, y: room.floorY + 1.3, z: room.z }
  };
}

/** The room of an interior site from its stored params (at, width, depth, front), or null. */
export function roomViewOfSite(params: Record<string, unknown>, floorY: number): RoomView | null {
  const at = params.at as { x?: unknown; z?: unknown; rotY?: unknown } | undefined;
  if (!at || typeof at.x !== "number" || typeof at.z !== "number") return null;
  const width = typeof params.width === "number" ? params.width : 10;
  const depth = typeof params.depth === "number" ? params.depth : 8;
  const front = params.front === "-z" || params.front === "+x" || params.front === "-x" ? params.front : "+z";
  return { x: at.x, z: at.z, rotY: typeof at.rotY === "number" ? at.rotY : 0, width, depth, front, floorY };
}
