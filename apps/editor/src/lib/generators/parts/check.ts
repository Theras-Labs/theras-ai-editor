// Self-check of a validated parts spec, in code (no model call). Method after the img2threejs
// skill (Apache-2.0, ~/.claude/skills/img2threejs: "mid-air parts break the attachment gate"):
// - a part far outside the stated size, or much larger than it, is dropped;
// - a mirror on a part that sits on the mirror plane is removed (it would double the part);
// - parts with no neighbor (a floating group) are snapped to the nearest part when the gap is
//   small, else dropped.
// Re-centering and grounding happen in build.ts.
import * as THREE from "three";
import { partBounds } from "./build";
import { partCount, type Part, type PartsSpec, type Vec3 } from "./spec";

export type CheckReport = { spec: PartsSpec; issues: string[]; dropped: number; snapped: number };

function shiftPart(p: Part, d: THREE.Vector3): Part {
  const add = (a: Vec3): Vec3 => [a[0] + d.x, a[1] + d.y, a[2] + d.z];
  const out: Part = { ...p, at: add(p.at) };
  if (p.repeat?.center) out.repeat = { ...p.repeat, center: add(p.repeat.center) };
  return out;
}

/** Smallest move of box a that makes it touch box b (zero vector when they already touch). */
function gapVector(a: THREE.Box3, b: THREE.Box3): THREE.Vector3 {
  const axis = (amin: number, amax: number, bmin: number, bmax: number) => (amax < bmin ? bmin - amax : amin > bmax ? bmax - amin : 0);
  return new THREE.Vector3(axis(a.min.x, a.max.x, b.min.x, b.max.x), axis(a.min.y, a.max.y, b.min.y, b.max.y), axis(a.min.z, a.max.z, b.min.z, b.max.z));
}

export function checkSpec(input: PartsSpec): CheckReport {
  const issues: string[] = [];
  let dropped = 0;
  let snapped = 0;
  const label = (p: Part, si: number) => `${p.name ?? p.shape} (stage ${si + 1})`;

  type Item = { si: number; part: Part; box: THREE.Box3; vol: number };
  let items: Item[] = [];
  input.stages.forEach((s, si) =>
    s.parts.forEach((part) => {
      let p = part;
      if (p.mirror) {
        const single = partBounds({ ...p, mirror: undefined });
        const c = single.getCenter(new THREE.Vector3());
        const sz = single.getSize(new THREE.Vector3());
        const off = p.mirror === "x" ? Math.abs(c.x) < Math.max(0.002, sz.x * 0.01) : Math.abs(c.z) < Math.max(0.002, sz.z * 0.01);
        if (off) {
          p = { ...p, mirror: undefined };
          issues.push(`${label(p, si)}: sits on the mirror plane, mirror removed`);
        }
      }
      const box = partBounds(p);
      const sz = box.getSize(new THREE.Vector3());
      const finite = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
      if (!finite || box.isEmpty()) {
        issues.push(`${label(p, si)}: empty geometry, dropped`);
        dropped++;
        return;
      }
      items.push({ si, part: p, box, vol: Math.max(1e-9, sz.x * sz.y * sz.z) });
    })
  );

  // Far or huge parts, judged against the stated size around the volume-weighted center.
  const stated = input.size;
  const maxStated = Math.max(...stated);
  // Volume-weighted median per axis: one far outlier does not move it.
  const centers = items.map((it) => ({ c: it.box.getCenter(new THREE.Vector3()), w: it.vol }));
  const total = centers.reduce((n, x) => n + x.w, 0);
  const median = (axis: "x" | "y" | "z") => {
    const sorted = [...centers].sort((a, b) => a.c[axis] - b.c[axis]);
    let acc = 0;
    for (const x of sorted) if ((acc += x.w) >= total / 2) return x.c[axis];
    return 0;
  };
  const center = new THREE.Vector3(median("x"), median("y"), median("z"));
  items = items.filter((it) => {
    const c = it.box.getCenter(new THREE.Vector3());
    const sz = it.box.getSize(new THREE.Vector3());
    const far =
      Math.abs(c.x - center.x) > stated[0] + maxStated * 0.15 ||
      Math.abs(c.y - center.y) > stated[1] + maxStated * 0.15 ||
      Math.abs(c.z - center.z) > stated[2] + maxStated * 0.15;
    const huge = Math.max(sz.x, sz.y, sz.z) > maxStated * 2.5;
    if (far || huge) {
      issues.push(`${label(it.part, it.si)}: ${huge ? "much larger than" : "far outside"} the stated size, dropped`);
      dropped++;
      return false;
    }
    return true;
  });

  // Connectivity: parts touch when their boxes (grown by tol) meet; the ground joins all parts at the lowest level.
  const all = new THREE.Box3();
  items.forEach((it) => all.union(it.box));
  const extent = all.getSize(new THREE.Vector3());
  const maxExtent = Math.max(extent.x, extent.y, extent.z, 1e-3);
  const tol = maxExtent * 0.03 + 0.005;
  const groundY = all.min.y;
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const grown = items.map((it) => it.box.clone().expandByScalar(tol));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (grown[i]!.intersectsBox(items[j]!.box)) join(i, j);
  const grounded = items.map((it) => it.box.min.y <= groundY + tol);
  const firstGround = grounded.indexOf(true);
  if (firstGround >= 0) grounded.forEach((g, i) => g && join(i, firstGround));
  // Main body: the component with the largest volume.
  const volOf = new Map<number, number>();
  items.forEach((it, i) => volOf.set(find(i), (volOf.get(find(i)) ?? 0) + it.vol));
  let main = -1;
  let best = -1;
  for (const [root, vol] of volOf) if (vol > best) [best, main] = [vol, root];

  const keep = new Set<number>();
  const moved = new Map<number, Part>();
  const mainIdx = items.map((_, i) => i).filter((i) => find(i) === main);
  mainIdx.forEach((i) => keep.add(i));
  const comps = new Map<number, number[]>();
  items.forEach((_, i) => {
    const r = find(i);
    if (r !== main) comps.set(r, [...(comps.get(r) ?? []), i]);
  });
  for (const members of comps.values()) {
    let bestGap: THREE.Vector3 | null = null;
    for (const i of members)
      for (const j of mainIdx) {
        const g = gapVector(items[i]!.box, items[j]!.box);
        if (!bestGap || g.length() < bestGap.length()) bestGap = g;
      }
    const names = members.map((i) => label(items[i]!.part, items[i]!.si)).join(", ");
    if (bestGap && bestGap.length() <= maxExtent * 0.25) {
      for (const i of members) {
        moved.set(i, shiftPart(items[i]!.part, bestGap));
        keep.add(i);
      }
      snapped += members.length;
      issues.push(`${names}: floating ${bestGap.length().toFixed(2)} m from the body, snapped`);
    } else {
      dropped += members.length;
      issues.push(`${names}: floating far from the body, dropped`);
    }
  }

  const stages = input.stages
    .map((s, si) => ({
      name: s.name,
      parts: items.map((it, i) => ({ it, i })).filter(({ it, i }) => it.si === si && keep.has(i)).map(({ it, i }) => moved.get(i) ?? it.part)
    }))
    .filter((s) => s.parts.length > 0);
  const spec: PartsSpec = { ...input, stages };
  return { spec, issues, dropped, snapped: partCount(spec) > 0 ? snapped : 0 };
}
