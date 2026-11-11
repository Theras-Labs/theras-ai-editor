// City plan -> site facts in WORLD meters (pure). The generator stores these facts in its site
// record, other generators (river, landmark) route and place by them, and the "How big?"
// question draws them as plan thumbnails. The city is axis aligned: world = center + plan * scale.
import type { CitySiteFacts, SiteRect } from "../../copilot/director/types";
import type { CityFit } from "./fit";
import { ASPHALT_Y } from "./ids";
import type { Rect } from "./layout";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Facts of a fitted city plan, in world meters. */
export function cityFacts(fit: Pick<CityFit, "plan" | "scale" | "center" | "y">): CitySiteFacts {
  const { plan, scale: s, center } = fit;
  const X = (x: number) => r2(center.x + x * s);
  const Z = (z: number) => r2(center.z + z * s);
  const rect = (r: Rect): SiteRect => ({ x0: X(r.x0), z0: Z(r.z0), x1: X(r.x1), z1: Z(r.z1) });
  const tallest = new Map<string, number>();
  for (const b of plan.buildings) {
    const key = `${b.block[0]},${b.block[1]}`;
    tallest.set(key, Math.max(tallest.get(key) ?? 0, b.height * s));
  }
  return {
    scale: s,
    y: r2(fit.y + ASPHALT_Y * s),
    streetsRect: rect(plan.streetsRect),
    groundRect: rect(plan.groundRect),
    avenueAxis: plan.avenueAxis,
    streets: plan.streets.map((st) => ({
      id: st.id,
      name: st.name,
      axis: st.axis,
      pos: st.axis === "x" ? Z(st.pos) : X(st.pos),
      from: st.axis === "x" ? X(st.from) : Z(st.from),
      to: st.axis === "x" ? X(st.to) : Z(st.to),
      width: r2((st.carriage + 2 * st.sidewalk) * s),
      carriage: r2(st.carriage * s),
      median: r2(st.median * s),
      avenue: st.avenue
    })),
    blocks: plan.blocks.map((b) => ({
      i: b.i,
      j: b.j,
      rect: rect(b.lot),
      kind: b.kind,
      zone: b.zone,
      tallest: r2(tallest.get(`${b.i},${b.j}`) ?? 0)
    })),
    kit: plan.params.kit,
    trees: plan.params.streetTrees
  };
}

/** Tallest building of a plan in world meters (its own height, from the lot top). */
export function cityTallest(fit: Pick<CityFit, "plan" | "scale">): number {
  return r2(fit.plan.buildings.reduce((h, b) => Math.max(h, b.height * fit.scale), 0));
}
