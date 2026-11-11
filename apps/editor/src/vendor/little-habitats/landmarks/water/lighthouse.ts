// Ports bundle lines 34488-34727: the lighthouse landmark (b_) and its beam geometry (y_).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { glowSprite, setGlowSprite, SparkPoints, Spring } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef } from '../types';
import { beamMaterial, nightAmount, v3 } from './shared';

const CREAM = `#f3e8d2`; // m_ (34488)
const RED = `#d65a47`; // h_ (34489)
const RED_DARK = `#a8443a`; // g_ (34490)
const IRON = `#4d5552`; // __ (34491)
const LAMP_Y = 2.28; // v_ (34492)

/** Two pairs of tapered light cones (one pair each way), with a per-vertex aFade attribute. */
function beamGeometry(): THREE.BufferGeometry { // y_ (34493)
  const pos: number[] = [],
    nor: number[] = [],
    fade: number[] = [],
    cone = (dir: number, len: number, r0: number, r1: number, alpha: number, droop: number) => {
      const vert = (i: number, j: number) => {
        const t = i / 8,
          a = (j / 18) * Math.PI * 2,
          r = r0 + (r1 - r0) * t,
          d = t * len,
          y = Math.cos(a) * r - d * droop,
          z = Math.sin(a) * r,
          f = alpha * (1 - t) ** 1.7 * Math.min(1, t * 6 + 0.15);
        return { p: [dir * d, y, z], n: [0, Math.cos(a), Math.sin(a)], f };
      };
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 18; j++) {
          const q = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)];
          for (const k of [0, 1, 2, 0, 2, 3]) {
            pos.push(...q[k].p);
            nor.push(...q[k].n);
            fade.push(q[k].f);
          }
        }
    };
  for (const dir of [1, -1]) {
    cone(dir, 10.5, 0.1, 1.15, 0.5, 0.05);
    cone(dir, 7.5, 0.16, 1.9, 0.16, 0.05);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(`position`, new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute(`normal`, new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute(`aFade`, new THREE.Float32BufferAttribute(fade, 1));
  geo.computeBoundingSphere();
  return geo;
}

export const LIGHTHOUSE: LandmarkDef = { // b_ (34524)
  id: `lighthouse`,
  name: `Lighthouse`,
  icon: `🗼`,
  tint: `#f6cfc4`,
  blurb: `A striped little lighthouse keeping watch, its beam sweeping the lake after dark.`,
  hint: `Stack stone four levels high right at the edge of the open lake, where boats would need a light.`,
  priority: 50,
  max: 1,
  detect(ctx) {
    const cands = ctx.corners.filter((c) => ctx.mat(c) === `stone` && ctx.h(c) >= 4 && ctx.shore(c));
    cands.sort((a, b) => ctx.h(b) - ctx.h(a) || ctx.h01(a, 71) - ctx.h01(b, 71));
    for (const c of cands) {
      const top = ctx.top(c),
        y = ctx.flat(top.x, top.z, 0.24, 0.12);
      if (y === null) continue;
      let dx = 0,
        dz = 0;
      for (const n of ctx.nbrs(c)) {
        if (!ctx.lake(n)) continue;
        const t = ctx.top(n);
        dx += t.x - top.x;
        dz += t.z - top.z;
      }
      const rotY = Math.atan2(-dx, -dz);
      return [{ key: `lighthouse:${c}`, x: top.x, y, z: top.z, rotY, radius: 0.12, clear: 0.5, data: { h: ctx.h(c) } }];
    }
    return [];
  },
  build(_p, seed) {
    const mats = landmarkMaterials(),
      rng = new Rng(seed ^ 72007),
      kit = new MeshKit(rng),
      glowKit = new MeshKit(rng),
      rock = shadeColor(PALETTE.stone, 0.02);
    kit.cyl(0.46, 0.5, 0.5, 9, 0, -0.38, 0, PALETTE.stoneDark, { grad: 0.4, rot: [0, 0.2, 0] });
    kit.cyl(0.45, 0.47, 0.14, 9, 0, 0, 0, rock, { grad: 0.2, rot: [0, 0.2, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.next() * 0.8;
      kit.blob(0.07, Math.cos(a) * 0.43, 0.13, Math.sin(a) * 0.43, PALETTE.leafDark, { scale: [1.3, 0.45, 1.1], detail: 0 });
    }
    // Striped tower: six bands tapering from radius 0.41 by 0.12 over 1.85.
    const base = 0.13,
      r0 = 0.41;
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6,
        t1 = (i + 1) / 6,
        rb = r0 + -0.12 * t0,
        rt = r0 + -0.12 * t1;
      kit.cyl(rt, rb, 0.30933333333333335, 14, 0, base + 1.85 * t0, 0, i % 2 ? RED : CREAM, { grad: 0.12, jitter: 0.03 });
    }
    kit.box(0.2, 0.3, 0.06, 0, 0.28, 0.40499999999999997, PALETTE.woodDark, { bevel: 0.02 });
    kit.cyl(0.1, 0.1, 0.06, 10, 0, 0.43, 0.375, PALETTE.woodDark, { rot: [Math.PI / 2, 0, 0] });
    kit.box(0.3, 0.05, 0.16, 0, 0.14, 0.47, PALETTE.stoneLight, { bevel: 0.015 });
    kit.box(0.018, 0.018, 0.02, 0.06, 0.27, 0.43999999999999995, PALETTE.autumnGold);
    /** Lit window at height y, angle a around the tower. */
    const addWindow = (y: number, a: number) => {
      const r = r0 + -0.12 * ((y - base) / 1.85),
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      glowKit.box(0.1, 0.15, 0.05, x, y, z, PALETTE.lanternGlow, { rot: [0, a, 0], ao: false, grad: 0 });
      kit.box(0.14, 0.19, 0.04, Math.sin(a) * (r - 0.004), y, Math.cos(a) * (r - 0.004), IRON, {
        rot: [0, a, 0],
        ao: false,
        bevel: 0.01,
      });
      kit.box(0.15, 0.03, 0.07, Math.sin(a) * (r + 0.02), y - 0.09, Math.cos(a) * (r + 0.02), CREAM, {
        rot: [0, a, 0],
      });
    };
    addWindow(0.95, 0);
    addWindow(1.55, Math.PI * 0.85);
    addWindow(1.25, -Math.PI * 0.55);
    {
      // Life ring on the back of the tower.
      const y = 0.62;
      kit.ring(0.1, 0.03, 6, 14, 0, y, -0.4132162162162162, RED, { rot: [Math.PI / 2, 0, 0], ao: false, grad: 0 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        kit.box(0.045, 0.075, 0.075, Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, -0.4132162162162162, CREAM, {
          rot: [0, 0, a],
          ao: false,
          bevel: 0.012,
          grad: 0,
        });
      }
      kit.box(0.03, 0.05, 0.03, 0, 0.75, -0.38321621621621615, IRON, { ao: false });
    }
    // Gallery, railing, lamp room and roof.
    kit.cyl(0.46, 0.34, 0.1, 14, 0, 1.96, 0, RED_DARK, { grad: 0.3 });
    kit.cyl(0.46, 0.46, 0.035, 14, 0, 2.055, 0, IRON, { grad: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      kit.box(0.025, 0.2, 0.025, Math.cos(a) * 0.43, 2.18, Math.sin(a) * 0.43, IRON, { bevel: 0.006, ao: false });
    }
    kit.ring(0.43, 0.02, 4, 24, 0, 2.28, 0, IRON, { ao: false });
    kit.ring(0.43, 0.012, 4, 24, 0, 2.17, 0, IRON, { ao: false });
    kit.cyl(0.25, 0.27, 0.07, 10, 0, 2.09, 0, CREAM, { grad: 0.1 });
    glowKit.cyl(0.17, 0.17, 0.32, 10, 0, 2.16, 0, PALETTE.lanternGlow, { ao: false, grad: 0, jitter: 0 });
    glowKit.blob(0.12, 0, LAMP_Y, 0, `#fff3d6`, { ao: false, grad: 0, jitter: 0, detail: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      kit.box(0.035, 0.34, 0.035, Math.cos(a) * 0.235, 2.33, Math.sin(a) * 0.235, IRON, {
        rot: [0, -a, 0],
        bevel: 0.008,
        ao: false,
      });
    }
    kit.cyl(0.33, 0.33, 0.045, 12, 0, 2.48, 0, RED_DARK, { grad: 0, ao: false });
    kit.lathe(
      [
        [0.3, 0],
        [0.29, 0.06],
        [0.24, 0.15],
        [0.15, 0.24],
        [0.05, 0.3],
        [0.001, 0.31],
      ],
      12,
      0,
      2.52,
      0,
      RED,
      { grad: 0.2, ao: false },
    );
    kit.cyl(0.018, 0.025, 0.14, 6, 0, 2.81, 0, IRON, { ao: false });
    kit.blob(0.045, 0, 2.9699999999999998, 0, PALETTE.autumnGold, { ao: false });

    const root = new THREE.Group();
    root.add(landmarkMesh(kit.build(), mats.base));
    root.add(landmarkMesh(glowKit.build(), mats.glow, false));
    const beam = new THREE.Mesh(beamGeometry(), beamMaterial());
    beam.position.copy(v3(0, LAMP_Y, 0));
    beam.renderOrder = 3;
    beam.frustumCulled = false;
    root.add(beam);
    const beamMat = beamMaterial();
    beam.raycast = () => undefined;
    const halo = glowSprite(2.2, 1.7, 0.85);
    halo.position.set(0, LAMP_Y, 0);
    const sparks = new SparkPoints(64, true);
    root.add(halo, sparks.points);

    const squash = new Spring(120, 7),
      sway = new Spring(70, 3.5);
    let spin = 0, // _: extra beam angle
      spinV = 0, // v: extra beam angular speed
      flash = 0, // y
      flashDelay = -1, // b
      sparksLeft = 0; // x
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05),
          night = nightAmount(ctx.time.daylight);
        spinV *= Math.exp(-dt / 0.75);
        if (spinV < 0.01) spinV = 0;
        spin = (spin + spinV * dt) % (Math.PI * 2);
        flash *= Math.exp(-dt / 0.4);
        if (flashDelay >= 0) {
          flashDelay -= dt;
          if (flashDelay < 0) flash = Math.max(flash, 1.1);
        }
        const opacity = Math.max(night * 0.62, Math.min(0.5, flash * 0.38 + spinV * 0.03));
        beam.visible = opacity > 0.01;
        beamMat.uniforms.uOpacity.value = opacity;
        beam.rotation.y = ctx.realTime * 0.5 + spin;
        const sq = squash.update(dt);
        root.scale.set(1 - sq * 0.05, 1 + sq * 0.1, 1 - sq * 0.05);
        root.rotation.z = sway.update(dt) * 0.02;
        setGlowSprite(halo, 1 + flash * 1.9, Math.min(1, flash) * 0.95);
        if (sparksLeft > 0) {
          const n = Math.min(sparksLeft, 60 * dt + Math.random());
          for (let i = 0; i < Math.floor(n); i++) {
            sparksLeft--;
            const a = Math.random() * Math.PI * 2,
              sp = 0.5 + Math.random() * 0.9;
            sparks.emit(
              Math.cos(a) * 0.15,
              LAMP_Y + (Math.random() - 0.5) * 0.15,
              Math.sin(a) * 0.15,
              Math.cos(a) * sp,
              0.2 + Math.random() * 0.7,
              Math.sin(a) * sp,
              0.7 + Math.random() * 0.7,
              0.07 + Math.random() * 0.05,
              1.8,
              1.4,
              0.65,
              { gravity: 0.9, drag: 1.6, twinkle: 0.5, grow: 0.5 },
            );
          }
        }
        sparks.update(dt);
      },
      poke(poke) {
        const n = Math.min(3, Math.max(1, poke.count));
        spinV += n === 1 ? 6 : n === 2 ? 9 : 13;
        spinV = Math.min(spinV, 16);
        flash = Math.min(1.7, flash + 0.9 + n * 0.25);
        if (n >= 2) flashDelay = 0.22;
        squash.kick(4.5 + n * 1.6);
        sway.kick((Math.random() < 0.5 ? -1 : 1) * (2 + n));
        sparksLeft += n === 1 ? 10 : n === 2 ? 18 : 34;
        return true;
      },
      dispose() {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        sparks.dispose();
        halo.material.dispose();
      },
    };
  },
};
