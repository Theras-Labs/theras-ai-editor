// Ports index-BwioI7A7.js 26661-26900: the friendship lantern (Tf), with its paper colours (bf) and paper
// material cache (Cf, wf).
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import { Rng, hashString } from '../core/rng';
import { MeshKit, shadeColor } from '../ecology/meshKit';
import { loadGifts } from '../fauna/gifts';
import { patchWorldMaterial } from '../fx/pokefx';
import { Spring, SparkPoints, disposeSprite, envelope, glowSprite, setGlowSprite } from './kit';
import { landmarkMaterials, landmarkMesh } from './materials';
import type { LandmarkDef, LandmarkInstanceInfo, LandmarkPlacement } from './types';

const PAPER_COLORS = [`#f07a5f`, `#f4a261`, `#f6cf6a`, `#f49ac1`, `#b9a3e8`, `#8fcfb8`, `#f2b8a0`]; // bf (26661)
const TAU = Math.PI * 2; // xf (26662)
const MOTE_RGB = [1, 0.72, 0.36]; // Sf (26663)
const paperMaterials = new Map<string, THREE.MeshStandardMaterial>(); // Cf (26664)

/** Glowing paper material of one colour, cached by colour. */
function paperMaterial(color: string): THREE.MeshStandardMaterial { // wf (26665)
  let material = paperMaterials.get(color);
  if (!material) {
    const c = new THREE.Color(color);
    material = patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: c,
        emissive: c.clone().lerp(new THREE.Color(`#ffd7a0`), 0.25),
        emissiveIntensity: 1.35,
        roughness: 0.7,
        flatShading: true,
      }),
      {
        fragment: `
          float lmNight = 1.0 - smoothstep(0.08, 0.6, uDaylight);
          float lmFlick = 0.93 + 0.07 * sin(uTime * 5.3 + vScWorldPos.x * 5.0) * sin(uTime * 2.9 + vScWorldPos.z * 4.0);
          totalEmissiveRadiance *= mix(0.06, 1.0, lmNight) * lmFlick;`,
        cacheKey: `lm-paper`,
      },
    );
    paperMaterials.set(color, material);
  }
  return material;
}

export const FRIENDSHIP_LANTERN: LandmarkDef = { // Tf (26689)
  id: `friendship_lantern`,
  name: `Friendship lantern`,
  icon: `🏮`,
  tint: `#f9d6c4`,
  blurb: `Hung by a friend who came to visit. It glows for you every night.`,
  hint: `Share your garden with a friend (⋯ → Share). They can hang a lantern here for you.`,
  priority: 1,
  max: 40,
  detect(ctx) {
    const gifts = loadGifts();
    if (!gifts.length) return [];
    const live: LandmarkInstanceInfo[] = ctx.game.landmarks?.instances?.() ?? [];
    const others = live.filter((l) => l.id !== `friendship_lantern`);
    const taken: { x: number; y: number; z: number }[] = [];
    const cornerCount = ctx.grid.corners.length;
    const spotAt = (corner: number): { x: number; y: number; z: number } | null => {
      if (ctx.rim(corner) || !ctx.land(corner)) return null;
      const top = ctx.top(corner);
      if (
        others.some((l) => (l.x - top.x) ** 2 + (l.z - top.z) ** 2 < 1.1 ** 2) ||
        taken.some((l) => (l.x - top.x) ** 2 + (l.z - top.z) ** 2 < 0.62 ** 2)
      )
        return null;
      const y = ctx.flat(top.x, top.z, 0.16, 0.12);
      return y === null ? null : { x: top.x, y, z: top.z };
    };
    const out: LandmarkPlacement[] = [];
    gifts.forEach((gift, gi) => {
      if (!(gift.corner >= 0 && gift.corner < cornerCount)) return;
      let frontier = [gift.corner];
      const seen = new Set(frontier);
      for (let ring = 0; ring < 4 && frontier.length; ring++) {
        for (const corner of frontier) {
          const spot = spotAt(corner);
          if (spot) {
            taken.push(spot);
            out.push({
              key: `friendship_lantern:${gi}:${gift.from}`,
              ...spot,
              rotY: ctx.h01(gift.corner, gi, 311) * TAU,
              radius: 0.3,
              clear: 0.26,
            });
            return;
          }
        }
        const next: number[] = [];
        for (const corner of frontier)
          for (const n of ctx.nbrs(corner))
            if (!seen.has(n)) {
              seen.add(n);
              next.push(n);
            }
        frontier = next;
      }
    });
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(seed ^ hashString(p.key));
    const post = new MeshKit(rng);
    const wood = shadeColor(PALETTE.woodDark, rng.range(-0.04, 0.04));
    post.blob(0.11, 0, 0.02, 0, shadeColor(PALETTE.stone, -0.04), { scale: [1.2, 0.45, 1.05], detail: 1 });
    post.cyl(0.022, 0.028, 0.86, 6, 0, 0.02, 0, wood, { grad: 0.25 });
    const hookPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * Math.PI * 0.62;
      hookPts.push(new THREE.Vector3(0.1 - Math.cos(a) * 0.1, 0.86 + Math.sin(a) * 0.1, 0));
    }
    hookPts.push(new THREE.Vector3(0.26, 0.93, 0));
    for (let i = 0; i < hookPts.length - 1; i++) post.beam(hookPts[i], hookPts[i + 1], 0.034, 0.034, wood, { extend: 0.012 });
    post.blob(0.018, 0.26, 0.93, 0, wood, { detail: 0 });
    const ribbon = PAPER_COLORS[(hashString(p.key) >>> 3) % PAPER_COLORS.length];
    post.ring(0.03, 0.009, 4, 10, 0, 0.62, 0, ribbon, { grad: 0 });
    post.beam({ x: 0.02, y: 0.62, z: 0.02 }, { x: 0.06, y: 0.5, z: 0.07 }, 0.03, 0.006, ribbon);
    const root = new THREE.Group();
    root.scale.setScalar(1.25);
    root.add(landmarkMesh(post.build(), mats.base));
    const hook = new THREE.Group();
    hook.position.set(0.26, 0.92, 0);
    root.add(hook);
    const paperColor = PAPER_COLORS[hashString(p.key) % PAPER_COLORS.length];
    const frame = new MeshKit(rng);
    frame.cyl(0.003, 0.003, 0.09, 3, 0, -0.09, 0, `#3f3431`, { ao: false });
    frame.cyl(0.04, 0.05, 0.022, 8, 0, -0.112, 0, PALETTE.woodDark, { ao: false });
    frame.cyl(0.05, 0.04, 0.02, 8, 0, -0.33, 0, PALETTE.woodDark, { ao: false });
    frame.cyl(0.004, 0.004, 0.04, 3, 0, -0.37, 0, `#c9463d`, { ao: false });
    frame.cone(0.018, 0.06, 6, 0, -0.43, 0, `#c9463d`, { rot: [Math.PI, 0, 0], ao: false });
    const lantern = new THREE.Group();
    hook.add(lantern);
    lantern.add(landmarkMesh(frame.build(), mats.base, false));
    const paperKit = new MeshKit(rng);
    const profile: [number, number][] = [[0.045, 0]];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      profile.push([0.045 + Math.sin(t * Math.PI) * 0.058 + (i % 2 ? 0.004 : -0.002), t * 0.21]);
    }
    profile[profile.length - 1][0] = 0.045;
    paperKit.lathe(profile, 10, 0, -0.32, 0, paperColor, { ao: false, grad: 0.1, jitter: 0.02 });
    const paper = landmarkMesh(paperKit.build(), paperMaterial(paperColor), false);
    lantern.add(paper);
    const phase = rng.next() * TAU;
    const tiltX = new Spring(26, 1.5);
    const tiltZ = new Spring(26, 1.5);
    const bob = new Spring(95, 4.2);
    const squash = new Spring(150, 5.5);
    let spinV = 0;
    let spin = 0;
    const halo = glowSprite(3.4, 2.2, 1.2);
    halo.position.set(0, -0.22, 0);
    const tint = new THREE.Color(paperColor);
    halo.material.color.setRGB(3 + tint.r * 0.6, 1.9 + tint.g * 0.4, 1 + tint.b * 0.3);
    hook.add(halo);
    const motes = new SparkPoints(56, true);
    root.add(motes.points);
    const pulses = [1 / 0, 1 / 0, 1 / 0];
    let active = 0;
    let trickle = 0;
    const emitMotes = (count: number, speed: number, rise: number): void => {
      const x = hook.position.x;
      const y = hook.position.y - 0.22;
      for (let n = 0; n < count; n++) {
        const a = Math.random() * TAU;
        const s = 0.5 + Math.random() * 0.8;
        const bright = Math.random() < 0.35 ? 1.35 : 1;
        motes.emit(
          x + Math.cos(a) * 0.05,
          y + (Math.random() - 0.5) * 0.14,
          Math.sin(a) * 0.05,
          Math.cos(a) * speed * s,
          rise * (0.4 + Math.random()),
          Math.sin(a) * speed * s,
          1.2 + Math.random() * 1.1,
          0.045 + Math.random() * 0.04,
          MOTE_RGB[0] * 2.2 * bright,
          MOTE_RGB[1] * 2.2 * bright,
          MOTE_RGB[2] * 2.2 * bright,
          { drag: 1.3, gravity: -0.12, twinkle: 0.55 },
        );
      }
    };
    return {
      object: root,
      update(ctx) {
        const t = ctx.realTime;
        const gust = 0.35 + ctx.wind * 0.65;
        hook.rotation.z = Math.sin(t * 1.7 + phase) * 0.09 * gust + tiltZ.x;
        hook.rotation.x = Math.sin(t * 1.23 + phase * 1.7) * 0.06 * gust + tiltX.x;
        paper.rotation.y = Math.sin(t * 0.6 + phase) * 0.4;
        const dt = ctx.dt;
        const dim = 1 - 0.5 * ctx.night;
        motes.update(dt);
        if (!active) return;
        for (let i = 0; i < 3; i++) if (pulses[i] !== 1 / 0) pulses[i] += dt;
        tiltX.update(dt);
        tiltZ.update(dt);
        hook.position.y = 0.92 + bob.update(dt) * 0.05;
        if (spinV > 0.001) {
          spin += spinV * dt;
          spinV *= Math.exp(-dt / 1.1);
        }
        lantern.rotation.y = spin;
        const sq = squash.update(dt);
        paper.scale.set(1 + sq * 0.2, 1, 1 + sq * 0.2);
        let glow = 0;
        for (let i = 0; i < 3; i++) glow = Math.max(glow, envelope(pulses[i], 0.09, 0.65) * (1 - i * 0.15));
        setGlowSprite(halo, 0.42 + glow * 0.55, glow * dim);
        if (trickle > 0 && glow > 0.15 && Math.random() < dt * 22) {
          emitMotes(1, 0.15, 0.35);
          trickle--;
        }
        if (glow < 0.02 && spinV < 0.02 && tiltX.settled && tiltZ.settled && bob.settled && squash.settled) {
          active = 0;
          spinV = 0;
          tiltX.set(0);
          tiltZ.set(0);
          hook.position.y = 0.92;
          paper.scale.set(1, 1, 1);
        }
      },
      poke(poke) {
        const n = Math.min(poke.count, 4);
        const dx = poke.point.x - poke.from.x;
        const dz = poke.point.z - poke.from.z;
        const len = Math.hypot(dx, dz) || 1;
        const c = Math.cos(p.rotY ?? 0);
        const s = Math.sin(p.rotY ?? 0);
        const lx = (dx * c - dz * s) / len;
        const lz = (dx * s + dz * c) / len;
        tiltX.v = Math.max(-5, Math.min(5, tiltX.v + lz * (1.6 + n * 0.5)));
        tiltZ.v = Math.max(-5, Math.min(5, tiltZ.v - lx * (1.6 + n * 0.5)));
        bob.v = Math.min(8, bob.v + 2.2 + n * 0.7);
        squash.v = Math.min(9, squash.v + 2.6 + n * 0.5);
        spinV = Math.min(11, spinV + 4 + n * 2);
        pulses[0] = 0;
        pulses[1] = n >= 2 ? -0.5 : 1 / 0;
        pulses[2] = n >= 3 ? -1 : 1 / 0;
        emitMotes(6 + n * 4, 0.25, 0.4);
        trickle = n * 8;
        if (n >= 3)
          for (let i = 0; i < 20; i++) {
            const a = (i / 20) * TAU;
            motes.emit(
              hook.position.x + Math.cos(a) * 0.1,
              hook.position.y - 0.2,
              Math.sin(a) * 0.1,
              Math.cos(a) * 0.55,
              0.2 + Math.random() * 0.3,
              Math.sin(a) * 0.55,
              1.2 + Math.random() * 0.8,
              0.05 + Math.random() * 0.04,
              MOTE_RGB[0] * 2.4,
              MOTE_RGB[1] * 2.4,
              MOTE_RGB[2] * 2.4,
              { drag: 1.6, gravity: -0.1, twinkle: 0.6 },
            );
          }
        active = 1;
        return true;
      },
      dispose() {
        root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        motes.dispose();
        disposeSprite(halo);
      },
    };
  },
};
