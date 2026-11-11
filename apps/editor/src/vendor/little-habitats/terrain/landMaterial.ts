// Island kit terrain: the land material (caps, earth and masonry walls, pop animation) (bundle 17845-18030).
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import { patchWorldMaterial } from '../fx/pokefx';

/** Seconds of the raise / lower pop animation (shader uniform uPopDur). */
export const POP_DURATION = 0.55; // ec (17845)

const colorUniform = (color: THREE.ColorRepresentation) => ({ value: new THREE.Color(color) }); // tc (17846)

export function createLandMaterial(): THREE.MeshStandardMaterial { // nc (17847)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
  material.name = `terrain-land`;
  patchWorldMaterial(material, {
    snow: 1,
    uniforms: {
      uGrass: colorUniform(PALETTE.grass),
      uGrassLight: colorUniform(PALETTE.grassLight),
      uGrassDark: colorUniform(PALETTE.grassDark),
      uGrassAutumn: colorUniform(PALETTE.grassAutumn),
      uGrassWinter: colorUniform(PALETTE.grassWinter),
      uEarth: colorUniform(PALETTE.earth),
      uEarthDark: colorUniform(PALETTE.earthDark),
      uEarthDeep: colorUniform(PALETTE.earthDeep),
      uStone: colorUniform(PALETTE.stone),
      uStoneLight: colorUniform(PALETTE.stoneLight),
      uStoneDark: colorUniform(PALETTE.stoneDark),
      uSand: colorUniform(PALETTE.sand),
      uPebble: colorUniform(PALETTE.pebble),
      uMoss: colorUniform(`#7f9a52`),
      uPopDur: { value: POP_DURATION },
    },
    vertexHeader: `
      attribute vec4 aSurf;
      attribute vec4 aInfo;
      attribute vec4 aPop;
      attribute vec2 aPopC;
      uniform float uPopDur;
      varying vec4 vSurf;
      varying vec4 vInfo;
    `,
    vertex: `
      if (aPop.z < -5.0) {
        // ghost of removed land: sink & flatten away (ease-in)
        float gt = clamp((uTime - aPop.y) / (uPopDur * 0.75), 0.0, 1.0);
        float f = 1.0 - gt * gt * aPop.w;
        float dy = transformed.y - aPop.x;
        if (dy > 0.0) transformed.y = aPop.x + dy * f;
      } else {
        float pt = (uTime - aPop.y) / uPopDur;
        if (aPop.w > 0.0 && pt < 1.0) {
          pt = clamp(pt, 0.0, 1.0);
          float x1 = pt - 1.0;
          float k = 1.0 + 2.70158 * x1 * x1 * x1 + 1.70158 * x1 * x1;
          float f = 1.0 + aPop.z * (1.0 - k) * aPop.w;
          float dy = transformed.y - aPop.x;
          if (dy > 0.0) {
            transformed.y = aPop.x + dy * f;
            // squash & stretch: wider while squashed, slimmer while overshooting
            if (aPopC.x < 9.0e4) transformed.xz += (transformed.xz - aPopC) * (1.0 - f) * 0.22 * smoothstep(0.0, 0.2, dy);
          }
        }
      }
      vSurf = aSurf;
      vInfo = aInfo;
    `,
    fragmentHeader: `
      uniform vec3 uGrass; uniform vec3 uGrassLight; uniform vec3 uGrassDark; uniform vec3 uGrassAutumn; uniform vec3 uGrassWinter;
      uniform vec3 uEarth; uniform vec3 uEarthDark; uniform vec3 uEarthDeep;
      uniform vec3 uStone; uniform vec3 uStoneLight; uniform vec3 uStoneDark;
      uniform vec3 uSand; uniform vec3 uPebble; uniform vec3 uMoss;
      varying vec4 vSurf;
      varying vec4 vInfo;
      float t_hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      // voronoi: x = F1, y = F2 - F1 (≈ distance to border), z = cell id hash
      vec3 t_vor(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        float d1 = 8.0; float d2 = 8.0; float id = 0.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(sc_hash(i + g), sc_hash(i + g + 17.31)) * 0.76 + 0.12;
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; id = sc_hash(i + g + 5.13); }
            else if (d < d2) { d2 = d; }
          }
        }
        d1 = sqrt(d1); d2 = sqrt(d2);
        return vec3(d1, d2 - d1, id);
      }
    `,
    fragment: `
      {
        vec3 P = vScWorldPos;
        float isWall = step(0.5, vSurf.y);
        float nA = sc_noise(P.xz * 0.42 + 3.1);
        float nB = sc_noise(P.xz * 1.6 + 11.7);
        float nC = sc_noise(P.xz * 5.3 + vec2(1.3, P.y * 3.0));
        float stoneW = smoothstep(0.42, 0.58, vSurf.x + (nB - 0.5) * 0.22);

        // ---------------- caps ----------------
        float gv = nA * 0.55 + nB * 0.3 + nC * 0.15;
        vec3 grass = mix(uGrassDark, uGrass, smoothstep(0.25, 0.55, gv));
        grass = mix(grass, uGrassLight, smoothstep(0.55, 0.8, gv) * 0.8);
        grass = mix(grass, vec3(dot(grass, vec3(0.3, 0.59, 0.11))), 0.1);
        grass *= 0.95 + 0.1 * sc_noise(P.xz * 11.0 + 4.1);
        float rim = 1.0 - vSurf.z;
        grass = mix(grass, uGrassLight * vec3(1.05, 1.06, 0.98), rim * 0.6);
        grass = mix(grass, uGrassAutumn, uAutumn * smoothstep(0.15, 0.65, nA + 0.3 * nC));
        grass = mix(grass, uGrassWinter, uSnow * 0.85);

        vec3 vo = t_vor(P.xz * 2.4 + 0.37);
        vec3 flag = mix(uStone, uStoneLight, 0.3 + 0.55 * vo.z);
        flag *= 0.94 + 0.1 * nC;
        float joint = 1.0 - smoothstep(0.035, 0.1, vo.y);
        vec3 jointCol = mix(uStoneDark * 0.8, uMoss, 0.5 * (1.0 - uSnow) * (1.0 - 0.6 * uAutumn));
        flag = mix(flag, jointCol, joint * (1.0 - rim * 0.7));
        flag = mix(flag, uStoneLight * 1.04, rim * 0.4);

        // low meadows (level 1) get a sun-bleached sandy rim where they meet the water
        float beach = (1.0 - step(1.5, vInfo.z)) * smoothstep(0.45, 0.95, rim + (nC - 0.5) * 0.3) * (1.0 - uSnow);
        grass = mix(grass, mix(uSand, uGrassLight, 0.25), beach * 0.75);
        vec3 topCol = mix(grass, flag, stoneW);
        topCol *= mix(0.6, 1.0, vInfo.x);

        // ---------------- walls ----------------
        float y = P.y;
        float wTop = vInfo.y;
        float wBot = vInfo.z;
        float lipF = step(0.08, vSurf.w);

        // earth: soft irregular layers, mottling and embedded pebbles
        float wob = sc_noise(P.xz * 1.7 + vec2(y * 0.3, 0.0)) - 0.5;
        float layer = y * 3.4 + wob * 0.6;
        float li = floor(layer);
        float lf = fract(layer);
        float lt = sc_hash(vec2(li, 3.7));
        vec3 earth = mix(uEarth, uEarthDark, 0.15 + 0.55 * lt);
        earth *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.1, lf));
        earth *= 0.9 + 0.2 * sc_noise(P.xz * 6.0 + vec2(y * 5.0, y * 3.0));
        vec3 q = P * 7.0;
        vec3 qi = floor(q);
        vec3 qf = fract(q) - 0.5;
        float peb = step(0.78, t_hash3(qi)) * (1.0 - smoothstep(0.2, 0.28, length(qf)));
        vec3 pebCol = mix(uPebble, uStoneDark, t_hash3(qi + 3.7)) * (0.9 + 0.35 * (-qf.y));
        earth = mix(earth, pebCol, peb * 0.85);
        // grassy lip: rounded lobes hanging over the wall top
        float sc = vSurf.z * 2.5;
        float lobe = fract(sc) * 2.0 - 1.0;
        float lh = sc_hash(vec2(floor(sc), floor(vInfo.w * 53.0)));
        float scal = 0.03 + (0.025 + 0.055 * lh) * sqrt(max(0.0, 1.0 - lobe * lobe));
        float lipG = step(wTop - y, scal) * lipF;
        vec3 soilWall = mix(earth, grass * vec3(0.8, 0.86, 0.8), lipG);
        soilWall *= 1.0 - 0.28 * lipF * (1.0 - smoothstep(0.0, 0.06, (wTop - y) - scal)) * (1.0 - lipG);

        // masonry
        float course = 0.125;
        float ry = (y + 8.0) / course;
        float row = floor(ry);
        float bx = vSurf.z + mod(row, 2.0) * 0.5;
        float bi = floor(bx);
        vec2 bf = vec2(fract(bx), fract(ry));
        float jd = min(min(bf.x, 1.0 - bf.x) * 0.42, min(bf.y, 1.0 - bf.y) * course);
        float mortar = 1.0 - smoothstep(0.006, 0.016, jd);
        float br = sc_hash(vec2(bi, row) + floor(vInfo.w * 97.0) * 1.31);
        vec3 brick = mix(uStoneDark, uStoneLight, 0.2 + 0.65 * br);
        brick *= 1.0 + 0.1 * smoothstep(0.62, 1.0, bf.y) - 0.13 * smoothstep(0.38, 0.0, bf.y);
        brick = mix(brick, uMoss * 0.9, smoothstep(0.62, 0.8, sc_noise(P.xz * 3.0 + y * 2.0)) * 0.35 * (1.0 - uSnow));
        vec3 masonry = mix(brick, uStoneDark * 0.6, mortar);
        masonry = mix(masonry, uStoneLight * 1.02, step(wTop - y, 0.04) * lipF);

        vec3 wallCol = mix(soilWall, masonry, stoneW);

        // waterline: sandy / pebbly band, wet & darker below
        float wl = 0.06 + (nC - 0.5) * 0.045;
        float sandBand = smoothstep(wl + 0.012, wl - 0.012, y) * smoothstep(-0.2, -0.13, y);
        vec3 sandCol = mix(uSand, uPebble, step(0.72, t_hash3(floor(P * 18.0))));
        wallCol = mix(wallCol, sandCol, sandBand * (1.0 - 0.45 * stoneW));
        float wet = smoothstep(-0.1, -0.2, y);
        wallCol = mix(wallCol, wallCol * vec3(0.52, 0.66, 0.66), wet);
        // lapping wet line just above the water surface
        float lap = 0.018 + 0.012 * sin(uTime * 1.3 + dot(P.xz, vec2(1.7, 2.3))) + 0.008 * sin(uTime * 2.9 + P.x * 5.0);
        wallCol *= 1.0 - 0.28 * (1.0 - smoothstep(lap, lap + 0.035, y)) * smoothstep(-0.08, 0.0, y) * (1.0 - uSnow);
        wallCol *= mix(0.58, 1.0, smoothstep(wBot, wBot + 0.32, y));

        diffuseColor.rgb = mix(topCol, wallCol, isWall);
      }
    `,
  });
  return material;
}
