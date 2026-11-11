// Ports bundle lines 33816-34143: the fountain landmark (n_).
import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { envelope, glowSprite, setGlowSprite, SparkPoints, Spring } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import {
  addArcStream,
  fitScale,
  FOUNTAIN_FOAM,
  FOUNTAIN_ICE,
  FOUNTAIN_WATER,
  nearestFeatureDistance,
  SplashRing,
  WATER_FX,
  WaterFxKit,
  waterFxMaterial,
} from './shared';

export const FOUNTAIN: LandmarkDef = { // n_ (33816)
  id: `fountain`,
  name: `Fountain`,
  icon: `⛲`,
  tint: `#cfe9ec`,
  blurb: `A tiered stone fountain burbling away in the middle of the paving. Listen!`,
  hint: `Dig a single spot of water right in the middle of flat stone paving.`,
  priority: 40,
  max: 3,
  detect(ctx) {
    const out: LandmarkPlacement[] = [];
    for (const pond of ctx.ponds) {
      if (pond.corners.length !== 1) continue;
      const c = pond.corners[0],
        nbrs = ctx.nbrs(c);
      if (nbrs.some((n) => ctx.mat(n) !== `stone` || ctx.h(n) > 2)) continue;
      const hs = nbrs.map((n) => ctx.h(n));
      if (Math.max(...hs) - Math.min(...hs) > 1) continue;
      const top = ctx.top(c),
        s = fitScale(nearestFeatureDistance(ctx, top.x, top.z), 0.5, 1.12);
      out.push({
        key: `fountain:${c}`,
        x: top.x,
        y: 0,
        z: top.z,
        rotY: ctx.h01(c, 41) * Math.PI * 2,
        radius: 0.06,
        clear: 0.62,
        data: { s },
      });
    }
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials(),
      rng = new Rng(seed ^ 61607),
      kit = new MeshKit(rng),
      light = shadeColor(PALETTE.stoneLight, -0.02),
      stone = PALETTE.stone,
      moss = PALETTE.leafDark;
    kit.cyl(0.2, 0.24, 0.5, 8, 0, -0.42, 0, stone, { grad: 0.45, rot: [0, Math.PI / 8, 0] });
    kit.cyl(0.21, 0.22, 0.06, 8, 0, 0.06, 0, light, { rot: [0, Math.PI / 8, 0] });
    kit.lathe(
      [
        [0.001, 0],
        [0.13, 0],
        [0.1, 0.06],
        [0.075, 0.16],
        [0.07, 0.28],
        [0.09, 0.36],
        [0.001, 0.37],
      ],
      8,
      0,
      0.1,
      0,
      light,
      { grad: 0.3 },
    );
    kit.lathe(
      [
        [0.001, 0],
        [0.1, 0],
        [0.25, 0.06],
        [0.36, 0.14],
        [0.39, 0.19],
        [0.37, 0.21],
        [0.32, 0.19],
        [0.001, 0.15],
      ],
      12,
      0,
      0.47,
      0,
      light,
      { grad: 0.25 },
    );
    kit.lathe(
      [
        [0.001, 0],
        [0.075, 0],
        [0.055, 0.08],
        [0.05, 0.2],
        [0.07, 0.26],
        [0.001, 0.27],
      ],
      8,
      0,
      0.62,
      0,
      light,
      { grad: 0.2 },
    );
    kit.lathe(
      [
        [0.001, 0],
        [0.06, 0],
        [0.15, 0.04],
        [0.21, 0.1],
        [0.225, 0.13],
        [0.2, 0.145],
        [0.17, 0.13],
        [0.001, 0.1],
      ],
      10,
      0,
      0.86,
      0,
      light,
      { grad: 0.2 },
    );
    kit.cyl(0.035, 0.05, 0.1, 6, 0, 0.96, 0, light);
    kit.blob(0.045, 0, 1.07, 0, light, { detail: 0 });
    for (let i = 0; i < 3; i++) {
      const a = rng.next() * Math.PI * 2;
      kit.blob(0.05, Math.cos(a) * 0.21, 0.08, Math.sin(a) * 0.21, moss, { scale: [1.2, 0.5, 1], detail: 0, ao: false });
    }
    kit.blob(0.04, 0.3, 0.6599999999999999, 0.18, moss, { scale: [1.3, 0.45, 1], detail: 0, ao: false });

    // Pools, ripples, hops and falls into the basins.
    const pools = new WaterFxKit(rng);
    pools.part(WATER_FX.STILL, 0, (k) => {
      k.cyl(0.33, 0.33, 0.02, 14, 0, 0.635, 0, FOUNTAIN_WATER, { ao: false, grad: 0, jitter: 0 });
      k.cyl(0.18, 0.18, 0.02, 12, 0, 0.965, 0, FOUNTAIN_WATER, { ao: false, grad: 0, jitter: 0 });
    });
    // The jet: column, bubbling crown and the top arcs (scaled on poke).
    const jet = new WaterFxKit(rng);
    jet.part(WATER_FX.FALL, 0, (k) =>
      k.cyl(0.026, 0.036, 0.17, 8, 0, 1.06, 0, FOUNTAIN_WATER, { ao: false, grad: 0, smooth: true }),
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2,
        x = Math.cos(a) * 0.035,
        z = Math.sin(a) * 0.035;
      jet.part(WATER_FX.BUBBLE, i * 0.31, (k) =>
        k.blob(0.055, x, 1.23, z, FOUNTAIN_FOAM, { ao: false, grad: 0, pivot: true, detail: 1, smooth: true }),
      );
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      jet.part(WATER_FX.FALL, 0, (k) => addArcStream(k, a, 0.03, 1.23, 0.1, 1.22, 0.15, 0.96, 0.018));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      pools.part(WATER_FX.FALL, 0, (k) => addArcStream(k, a, 0.2, 1, 0.26, 0.96, 0.29, 0.62, 0.022));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2,
        r = 0.41;
      pools.part(WATER_FX.FALL, 0, (k) => addArcStream(k, a, 0.375, 0.6599999999999999, 0.45, 0.59, r, -0.01, 0.026));
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      pools.part(WATER_FX.RIPPLE, (i * 0.37) % 1, (k) =>
        k.ring(0.13, 0.012, 3, 14, x, 0.018, z, FOUNTAIN_FOAM, {
          ao: false,
          grad: 0,
          jitter: 0,
          center: [x, 0.018, z],
          scale: [1, 0.5, 1],
        }),
      );
      pools.part(WATER_FX.HOP, (i * 0.53) % 1, (k) =>
        k.blob(0.028, x + Math.cos(a + 1) * 0.03, 0.02, z + Math.sin(a + 1) * 0.03, FOUNTAIN_FOAM, {
          ao: false,
          grad: 0,
          pivot: true,
          detail: 0,
        }),
      );
      pools.part(WATER_FX.HOP, (i * 0.53 + 0.5) % 1, (k) =>
        k.blob(0.022, x - Math.cos(a + 1) * 0.04, 0.02, z - Math.sin(a + 1) * 0.04, FOUNTAIN_FOAM, {
          ao: false,
          grad: 0,
          pivot: true,
          detail: 0,
        }),
      );
    }
    for (let i = 0; i < 2; i++)
      pools.part(WATER_FX.RIPPLE, i * 0.5, (k) =>
        k.ring(0.52, 0.014, 3, 24, 0, 0.02, 0, FOUNTAIN_FOAM, {
          ao: false,
          grad: 0,
          jitter: 0,
          center: [0, 0.02, 0],
          scale: [1, 0.5, 1],
        }),
      );

    // Frozen version: ice discs and icicles.
    const ice = new MeshKit(rng);
    ice.cyl(0.33, 0.33, 0.03, 14, 0, 0.62, 0, FOUNTAIN_ICE, { ao: false, grad: 0, jitter: 0 });
    ice.cyl(0.18, 0.18, 0.03, 12, 0, 0.95, 0, FOUNTAIN_ICE, { ao: false, grad: 0, jitter: 0 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.next() * 0.3,
        len = 0.08 + rng.next() * 0.1;
      ice.cone(0.018, len, 4, Math.cos(a) * 0.37, 0.64, Math.sin(a) * 0.37, FOUNTAIN_ICE, {
        rot: [Math.PI, 0, 0],
        ao: false,
        grad: 0,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5,
        len = 0.05 + rng.next() * 0.06;
      ice.cone(0.014, len, 4, Math.cos(a) * 0.215, 0.98, Math.sin(a) * 0.215, FOUNTAIN_ICE, {
        rot: [Math.PI, 0, 0],
        ao: false,
        grad: 0,
      });
    }

    const root = new THREE.Group();
    root.scale.setScalar(p.data?.s ?? 1.12);
    root.add(landmarkMesh(kit.build(), mats.base));
    const poolMesh = landmarkMesh(pools.build(), waterFxMaterial(), false);
    poolMesh.renderOrder = 1;
    root.add(poolMesh);
    const jetMesh = landmarkMesh(jet.build(), waterFxMaterial(), false);
    jetMesh.renderOrder = 1;
    root.add(jetMesh);
    const iceMesh = landmarkMesh(ice.build(), mats.base, false);
    iceMesh.visible = false;
    root.add(iceMesh);

    const jetSpring = new Spring(150, 10.5),
      iceSpring = new Spring(120, 6),
      drops = new SparkPoints(56, false),
      sparks = new SparkPoints(40, true),
      halo = glowSprite(0.9, 1.5, 1.7);
    halo.position.set(0, 1.32, 0);
    const ring = new SplashRing();
    ring.mesh.visible = false;
    root.add(drops.points, sparks.points, halo, ring.mesh);

    let burst = 0, // x: seconds of spray left
      rate = 0, // S: drops per second
      glowT = 0, // C
      glow = 0, // T
      frozen = false, // E
      ringDelay = -1, // D
      power = 1; // O
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05);
        frozen = ctx.time.snow > 0.45;
        poolMesh.visible = !frozen;
        jetMesh.visible = !frozen;
        iceMesh.visible = frozen;
        const sy = 1 + jetSpring.update(dt),
          sxz = 1 + (sy - 1) * 0.22;
        jetMesh.scale.set(sxz, sy, sxz);
        jetMesh.position.y = 0.965 * (1 - sy);
        const wob = iceSpring.update(dt);
        iceMesh.rotation.y = wob * 0.6;
        iceMesh.scale.set(1 - wob * 0.05, 1 + wob * 0.1, 1 - wob * 0.05);
        if (burst > 0) {
          burst -= dt;
          const e = rate * dt;
          let n = Math.floor(e) + +(Math.random() < e - Math.floor(e));
          for (; n-- > 0; ) {
            const a = Math.random() * Math.PI * 2,
              sp = 0.12 + Math.random() * 0.5 * (0.6 + power * 0.25),
              big = Math.random() < 0.3;
            drops.emit(
              Math.cos(a) * 0.03,
              1.24,
              Math.sin(a) * 0.03,
              Math.cos(a) * sp,
              1.1 + Math.random() * 1.1 + power * 0.2,
              Math.sin(a) * sp,
              0.9 + Math.random() * 0.5,
              big ? 0.065 : 0.045,
              0.8,
              0.95,
              1,
              { gravity: 5.2, drag: 0.25, a: 0.9 },
            );
            if (Math.random() < 0.35)
              sparks.emit(
                Math.cos(a) * 0.05,
                1.32,
                Math.sin(a) * 0.05,
                Math.cos(a) * sp * 0.8,
                1.2 + Math.random() * 1.6,
                Math.sin(a) * sp * 0.8,
                0.7 + Math.random() * 0.4,
                0.07,
                0.75,
                1.15,
                1.3,
                { gravity: 4.5, drag: 0.3, twinkle: 0.6 },
              );
          }
        }
        if (ringDelay >= 0) {
          ringDelay -= dt;
          if (ringDelay < 0) ring.start(0, 0.03, 0, 0.2, 0.5, 1, 0.75);
        }
        ring.update(dt);
        glowT += dt;
        setGlowSprite(halo, (0.5 + glow * 0.3) * (0.7 + 0.3 * Math.min(1, glowT * 10)), glow * envelope(glowT, 0.06, 0.32));
        drops.update(dt);
        sparks.update(dt);
      },
      poke(poke) {
        const n = Math.min(3, Math.max(1, poke.count));
        power = n;
        if (frozen) {
          iceSpring.kick(2.6 + n);
          for (let i = 0; i < 6 + n * 5; i++) {
            const a = Math.random() * Math.PI * 2,
              r = 0.1 + Math.random() * 0.3;
            drops.emit(
              Math.cos(a) * r,
              0.6699999999999999 + Math.random() * 0.15,
              Math.sin(a) * r,
              0,
              0.35 + Math.random() * 0.5,
              0,
              0.7 + Math.random() * 0.5,
              0.06,
              0.5,
              0.78,
              1,
              { drag: 1.4, twinkle: 0.6 },
            );
          }
          glow = 0.5;
          glowT = 0;
          return true;
        }
        jetSpring.kick(5.5 + n * 2.6);
        burst = 0.35 + n * 0.25;
        rate = 55 + n * 22;
        glow = 0.5 + n * 0.2;
        glowT = 0;
        ringDelay = 0.1;
        return true;
      },
      dispose() {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && o !== ring.mesh) o.geometry.dispose();
        });
        drops.dispose();
        sparks.dispose();
        halo.material.dispose();
        ring.dispose();
      },
    };
  },
};
