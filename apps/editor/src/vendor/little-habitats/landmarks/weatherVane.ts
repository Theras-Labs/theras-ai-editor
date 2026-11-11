// Ports index-BwioI7A7.js 26956-27094: the weather vane (Nf).
import * as THREE from 'three';
import { dampAngle } from '../core/anim';
import { Rng } from '../core/rng';
import { MeshKit } from '../ecology/meshKit';
import {
  Sparkles,
  Spinner,
  Spring,
  Stopwatch,
  disposeSprite,
  envelope,
  glowSprite,
  hitCylinder,
  kickSpinner,
  randomSign,
  setGlowSprite,
} from './kit';
import { landmarkMaterials, landmarkMesh } from './materials';
import type { LandmarkDef } from './types';

export const WEATHER_VANE: LandmarkDef = { // Nf (26956)
  id: `weather_vane`,
  name: `Weather vane`,
  icon: `🐓`,
  tint: `#f2d7b0`,
  blurb: `A little copper rooster on the island’s highest point, always facing the breeze.`,
  hint: `Build something taller than anything else on the island, at least three levels high.`,
  priority: 10,
  max: 1,
  detect(ctx) {
    const corner = ctx.highest();
    if (corner < 0 || ctx.h(corner) < 3) return [];
    const top = ctx.top(corner);
    const y = ctx.flat(top.x, top.z, 0.25, 0.12);
    return y === null ? [] : [{ key: `weather_vane:${corner}`, x: top.x, y, z: top.z, radius: 0.35, clear: 0.3 }];
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const post = new MeshKit(new Rng(seed ^ 24301));
    post.cyl(0.05, 0.07, 1.25, 8, 0, 0.06, 0, `#6b4d33`, { grad: 0.3 });
    post.box(0.18, 0.08, 0.18, 0, 0.04, 0, `#8f877d`, { bevel: 0.02 });
    post.box(0.7, 0.035, 0.035, 0, 0.95, 0, `#4b5a52`);
    post.box(0.035, 0.035, 0.7, 0, 0.95, 0, `#4b5a52`);
    const root = new THREE.Group();
    root.add(landmarkMesh(post.build(), mats.base));
    const vaneKit = new MeshKit(new Rng(seed));
    vaneKit.box(0.95, 0.04, 0.04, 0.1, 0, 0, `#b8763a`);
    vaneKit.cone(0.09, 0.2, 4, 0.62, 0, 0, `#c9843f`, { rot: [0, 0, -Math.PI / 2] });
    vaneKit.box(0.02, 0.26, 0.2, -0.4, 0.02, 0, `#b8763a`);
    vaneKit.blob(0.13, 0.06, 0.16, 0, `#c47a3a`, { scale: [1.3, 1, 0.45] });
    vaneKit.blob(0.07, 0.2, 0.28, 0, `#c47a3a`, { scale: [1, 1, 0.5] });
    vaneKit.box(0.05, 0.08, 0.02, 0.21, 0.37, 0, `#d9483b`);
    vaneKit.box(0.1, 0.18, 0.02, -0.1, 0.24, 0, `#b8763a`, { rot: [0, 0, 0.5] });
    const vane = new THREE.Group();
    vane.position.y = 1.18;
    vane.add(landmarkMesh(vaneKit.build(), mats.base));
    root.add(vane);
    const knob = landmarkMesh(new THREE.SphereGeometry(0.045, 10, 8), mats.base);
    knob.position.set(0, 1.34, 0);
    root.add(knob);
    const spinner = new Spinner();
    const hop = new Spring(170, 9);
    const tip = new Spring(90, 6);
    const flash = new Stopwatch();
    const sparkles = new Sparkles(40);
    const halo = glowSprite(2.6, 1.6, 0.7);
    halo.position.set(0, 1.34, 0);
    root.add(hitCylinder(0.3, 1.5));
    sparkles.add(root);
    root.add(halo);
    let trailTimer = 0;
    let gustTime = 0;
    let heading = 0;
    return {
      object: root,
      dispose() {
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
        sparkles.dispose();
        disposeSprite(halo);
      },
      poke(poke) {
        const n = Math.min(3, poke.count);
        spinner.kick(randomSign() * (10 + n * 5));
        kickSpinner(hop, 2.4 + n * 0.7, 5);
        kickSpinner(tip, -2.2 - n * 0.6, 4.5);
        flash.start();
        gustTime = n >= 3 ? 1.4 : 0;
        const count = 6 + n * 3;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 0.35 + Math.random() * 0.5;
          sparkles.emit(
            Math.cos(a) * 0.1,
            1.45,
            Math.sin(a) * 0.1,
            Math.cos(a) * s,
            0.5 + Math.random() * 0.7,
            Math.sin(a) * s,
            0.7 + Math.random() * 0.5,
            0.05 + Math.random() * 0.04,
            1,
            0.72,
            0.3,
            { gravity: 1.6, drag: 1.5, twinkle: 0.5 },
          );
        }
        return true;
      },
      update(ctx) {
        const wind = Math.atan2(-ctx.windDir.y, ctx.windDir.x) + Math.sin(ctx.realTime * 1.3) * 0.18 * ctx.wind;
        heading = dampAngle(heading, wind - (p.rotY ?? 0), 2.2, ctx.dt);
        const spin = spinner.update(ctx.dt, gustTime > 0 ? 0.9 : 1.25);
        vane.rotation.y = heading + spin;
        vane.position.y = 1.18 + hop.update(ctx.dt) * 0.7;
        vane.rotation.z = tip.update(ctx.dt) * 1.4 + Math.min(1, Math.abs(spinner.v) / 20) * -0.1;
        if (Math.abs(spinner.v) > 4)
          for (trailTimer -= ctx.dt; trailTimer <= 0; ) {
            trailTimer += 0.035;
            const a = heading + spin;
            const r = 0.55 + Math.random() * 0.2;
            const c = Math.cos(a);
            const s = -Math.sin(a);
            const dir = Math.sign(spinner.v);
            sparkles.emit(
              c * r,
              vane.position.y + 0.12,
              s * r,
              -s * dir * 0.6,
              0.15 + Math.random() * 0.3,
              c * dir * 0.6,
              0.55,
              0.04 + Math.random() * 0.035,
              1,
              0.7,
              0.3,
              { gravity: 0.6, drag: 2, twinkle: 0.4 },
            );
          }
        if (gustTime > 0 && ((gustTime = Math.max(0, gustTime - ctx.dt)), Math.random() < ctx.dt * 30)) {
          const a = Math.random() * Math.PI * 2;
          sparkles.emit(
            Math.cos(a) * 0.25,
            1 + Math.random() * 0.3,
            Math.sin(a) * 0.25,
            -Math.sin(a) * 1.4,
            0.4,
            Math.cos(a) * 1.4,
            0.9,
            0.06,
            1,
            0.85,
            0.3,
            { gravity: 0.5, drag: 1.2, twinkle: 0.6 },
          );
        }
        sparkles.update(ctx.dt);
        flash.update(ctx.dt);
        setGlowSprite(halo, 0.9 * (0.4 + envelope(flash.t, 0.06, 0.22)), envelope(flash.t, 0.06, 0.22) * 0.9);
      },
    };
  },
};
