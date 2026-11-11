// Ports index-BwioI7A7.js 36234-36377: the confetti burst (q_..Q_ scratch objects, $_ Confetti).
import * as THREE from 'three';
import { XorShift } from './sparks';

const tmpQuat = new THREE.Quaternion(); // q_ (36234)
const tmpAxis = new THREE.Vector3(); // J_ (36235)
const tmpScale = new THREE.Vector3(); // Y_ (36236)
const tmpPos = new THREE.Vector3(); // X_ (36237)
const tmpMatrix = new THREE.Matrix4(); // Z_ (36238)
const tmpColor = new THREE.Color(); // Q_ (36239)

export class Confetti { // $_ (36240)
  mesh: THREE.InstancedMesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  n: number;
  head = 0;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  ax: Float32Array;
  ay: Float32Array;
  az: Float32Array;
  ang: Float32Array;
  spin: Float32Array;
  age: Float32Array;
  life: Float32Array;
  floor: Float32Array;
  sc: Float32Array;
  ph: Float32Array;
  rnd: XorShift;
  dirty = true;

  constructor(count: number, seed = 3) {
    this.n = count;
    this.rnd = new XorShift(seed);
    const make = () => new Float32Array(count);
    this.px = make();
    this.py = make();
    this.pz = make();
    this.vx = make();
    this.vy = make();
    this.vz = make();
    this.ax = make();
    this.ay = make();
    this.az = make();
    this.ang = make();
    this.spin = make();
    this.age = make();
    this.life = make();
    this.floor = make();
    this.sc = make();
    this.ph = make();
    const geometry = new THREE.CircleGeometry(0.06, 6);
    geometry.scale(1, 0.62, 1);
    const position = geometry.attributes.position;
    for (let e = 0; e < position.count; e++) position.setZ(e, (position.getX(e) ** 2 + position.getY(e) ** 2) * 4);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0,
      emissive: new THREE.Color(`#3a2a2a`),
      emissiveIntensity: 0.5,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = `wonder-confetti`;
    tmpMatrix.makeScale(0, 0, 0);
    for (let t = 0; t < count; t++) {
      this.age[t] = 1;
      this.life[t] = 0;
      this.mesh.setMatrixAt(t, tmpMatrix);
      this.mesh.setColorAt(t, tmpColor.set(`#ffffff`));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  /** Throws `count` pieces from (x, y, z). They come to rest at `floor`. */
  burst(x: number, y: number, z: number, count: number, colors: readonly string[], floor: number, power = 1): void {
    const s = this.rnd;
    for (let k = 0; k < count; k++) {
      const r = this.head;
      this.head = (this.head + 1) % this.n;
      const c = s.next() * Math.PI * 2;
      const l = s.range(0.2, 1);
      const u = Math.sqrt(1 - l * l);
      const d = s.range(1.2, 3.2) * power;
      this.px[r] = x + s.range(-0.1, 0.1);
      this.py[r] = y + s.range(-0.1, 0.1);
      this.pz[r] = z + s.range(-0.1, 0.1);
      this.vx[r] = Math.cos(c) * u * d;
      this.vy[r] = l * d * 1.1;
      this.vz[r] = Math.sin(c) * u * d;
      let f = s.range(-1, 1);
      let p = s.range(-1, 1);
      let m = s.range(-1, 1);
      const h = Math.hypot(f, p, m) || 1;
      f /= h;
      p /= h;
      m /= h;
      this.ax[r] = f;
      this.ay[r] = p;
      this.az[r] = m;
      this.ang[r] = s.next() * 6.28;
      this.spin[r] = s.range(4, 11) * (s.next() < 0.5 ? -1 : 1);
      this.age[r] = 0;
      this.life[r] = s.range(4.5, 7);
      this.floor[r] = floor + 0.02;
      this.sc[r] = s.range(0.8, 1.35);
      this.ph[r] = s.next() * 50;
      this.mesh.setColorAt(r, tmpColor.set(colors[Math.floor(s.next() * colors.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = true;
  }

  update(dt: number, time: number, windX: number, windZ: number, scale = 1): void {
    let any = false;
    for (let o = 0; o < this.n; o++) {
      if (this.age[o] >= this.life[o]) continue;
      any = true;
      this.age[o] += dt;
      const s = this.age[o] / this.life[o];
      if (s >= 1) {
        tmpMatrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(o, tmpMatrix);
        continue;
      }
      let c = this.sc[o];
      if (this.py[o] > this.floor[o]) {
        const i = Math.exp(-2.4 * dt);
        this.vx[o] = this.vx[o] * i + (windX * 0.35 + Math.sin(time * 2.3 + this.ph[o]) * 0.5) * dt * 2.4;
        this.vz[o] = this.vz[o] * i + (windZ * 0.35 + Math.cos(time * 2.1 + this.ph[o]) * 0.5) * dt * 2.4;
        this.vy[o] = this.vy[o] * i - 2.2 * dt * 2.4 * 0.4;
        if (this.vy[o] < -0.55) this.vy[o] = -0.55;
        this.px[o] += this.vx[o] * dt;
        this.py[o] += this.vy[o] * dt;
        this.pz[o] += this.vz[o] * dt;
        this.ang[o] += this.spin[o] * dt;
        if (this.py[o] <= this.floor[o]) {
          this.py[o] = this.floor[o];
          this.ax[o] = 1;
          this.ay[o] = 0;
          this.az[o] = 0;
          this.ang[o] = -Math.PI / 2 + (this.ph[o] % 0.4) - 0.2;
        }
      }
      if (s > 0.85) c *= (1 - s) / 0.15;
      if (s < 0.04) c *= s / 0.04;
      c *= scale;
      tmpQuat.setFromAxisAngle(tmpAxis.set(this.ax[o], this.ay[o], this.az[o]), this.ang[o]);
      tmpMatrix.compose(tmpPos.set(this.px[o], this.py[o], this.pz[o]), tmpQuat, tmpScale.set(c, c, c));
      this.mesh.setMatrixAt(o, tmpMatrix);
    }
    if (any || this.dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
