// Island kit terrain: island mesh chunks, shore field, water, rebuilds and height queries (bundle 19084-19356).
import * as THREE from 'three';
import { CONFIG, levelY } from '../core/config';
import type { ClockState } from '../core/clock';
import type { Material, WorldChangedEvent } from '../core/world';
import type { Game } from '../game/types';
import { smooth01, roundDrop, blendField } from './surface';
import { createLandMaterial, POP_DURATION } from './landMaterial';
import { CellMesher, type PopSpec } from './mesher';
import { ShoreField } from './shoreField';
import { createWater } from './water';

/** World units per side of a terrain mesh chunk. */
const CHUNK_SIZE = 8; // vc (19084)

interface Chunk {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  cells: number[];
}

interface Ghost {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  until: number;
}

export interface TerrainStats {
  lastRebuildMs: number;
  lastCells: number;
  lastChunks: number;
  fullBuildMs: number;
  triangles: number;
}

export function createTerrain(game: Game) { // yc (19085)
  const { grid, world } = game,
    root = new THREE.Group();
  root.name = `terrain`;
  const material = createLandMaterial(),
    mesher = new CellMesher(grid, world),
    stats: TerrainStats = { lastRebuildMs: 0, lastCells: 0, lastChunks: 0, fullBuildMs: 0, triangles: 0 },
    half = grid.radius + 1,
    perSide = Math.ceil((2 * half) / CHUNK_SIZE),
    chunkMap = new Map<number, Chunk>(),
    chunkOfCell = new Int32Array(grid.cells.length);
  for (const cell of grid.cells) {
    const col = Math.min(perSide - 1, Math.max(0, Math.floor((cell.cx + half) / CHUNK_SIZE))),
      key = Math.min(perSide - 1, Math.max(0, Math.floor((cell.cz + half) / CHUNK_SIZE))) * perSide + col;
    let chunk = chunkMap.get(key);
    if (!chunk) {
      const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(new THREE.BufferGeometry(), material);
      mesh.name = `terrain-chunk-${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      chunk = { mesh, cells: [] };
      chunkMap.set(key, chunk);
      root.add(mesh);
    }
    chunk.cells.push(cell.id);
    chunkOfCell[cell.id] = key;
  }
  const chunks = [...chunkMap.values()],
    cellData: Float32Array[] = grid.cells.map(() => new Float32Array());

  /** Sets the 20-float interleaved vertex attributes on a geometry. */
  function setVertexAttributes(geometry: THREE.BufferGeometry, data: Float32Array): void {
    const buffer = new THREE.InterleavedBuffer(data, 20);
    geometry.setAttribute(`position`, new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute(`normal`, new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    geometry.setAttribute(`aSurf`, new THREE.InterleavedBufferAttribute(buffer, 4, 6));
    geometry.setAttribute(`aInfo`, new THREE.InterleavedBufferAttribute(buffer, 4, 10));
    geometry.setAttribute(`aPop`, new THREE.InterleavedBufferAttribute(buffer, 4, 14));
    geometry.setAttribute(`aPopC`, new THREE.InterleavedBufferAttribute(buffer, 2, 18));
  }

  /** Concatenates the chunk's cell data into a new geometry. */
  function uploadChunk(chunk: Chunk): void { // p (19114)
    let total = 0;
    for (const id of chunk.cells) total += cellData[id].length;
    const data = new Float32Array(total);
    let offset = 0;
    for (const id of chunk.cells) {
      data.set(cellData[id], offset);
      offset += cellData[id].length;
    }
    const geometry = new THREE.BufferGeometry();
    if (total > 0) {
      setVertexAttributes(geometry, data);
      geometry.computeBoundingBox();
      geometry.boundingBox!.max.y += 0.3;
      geometry.computeBoundingSphere();
    }
    chunk.mesh.geometry.dispose();
    chunk.mesh.geometry = geometry;
    chunk.mesh.visible = total > 0;
  }

  const shore = new ShoreField(grid, world), // m (19135)
    water = createWater(shore); // g (19136)
  root.add(water.bed, water.water);
  game.scene.add(root);

  /** Corner height and material code (0 water, 1 soil, 2 stone) as last meshed. */
  const meshedHeight = new Int8Array(grid.corners.length), // _ (19138)
    meshedMaterial = new Int8Array(grid.corners.length), // v (19139)
    remember = (id: number): void => { // y (19140)
      const c = world.get(id);
      meshedHeight[id] = c.height;
      meshedMaterial[id] = c.material === `stone` ? 2 : +(c.material === `soil`);
    };
  for (let id = 0; id < grid.corners.length; id++) remember(id);
  const now = (): number => game.clock.state.realTime; // b (19145)

  /** Rebuilds every cell, chunk and the whole shore field. `reveal` plays the island rise-from-water intro. */
  function buildAll(reveal: boolean): void { // x (19146)
    const start = performance.now(),
      pop: PopSpec | null = reveal
        ? { flags: [1, 1, 1, 1], pivot: CONFIG.WATER_Y - 0.14, birth: 0, amp: -1, reveal: { t0: now() + 0.25, rate: 0.055 } }
        : null;
    for (const cell of grid.cells) cellData[cell.id] = mesher.build(cell.id, pop);
    for (const chunk of chunks) uploadChunk(chunk);
    shore.sampleRegion(-Infinity, -Infinity, Infinity, Infinity);
    shore.propagate();
    stats.fullBuildMs = performance.now() - start;
    stats.lastRebuildMs = stats.fullBuildMs;
    stats.lastCells = grid.cells.length;
    stats.lastChunks = chunks.length;
    countTriangles();
  }

  function countTriangles(): void { // C (19161)
    let tris = 0;
    for (const chunk of chunks) tris += (chunk.mesh.geometry.getAttribute(`position`)?.count ?? 0) / 3;
    stats.triangles = tris;
  }

  /** popForCell plus the squash center when exactly one corner changed. */
  function popWithCenter(cellId: number, changed: Set<number>, birth: number): PopSpec | null { // T (19166)
    const pop = popForCell(cellId, changed, birth);
    if (pop && changed.size === 1) {
      const c = grid.corners[changed.values().next().value!];
      pop.center = { x: c.x, z: c.z };
    }
    return pop;
  }

  /** Pop animation for a cell whose changed corners rose, fell, or only changed material. */
  function popForCell(cellId: number, changed: Set<number>, birth: number): PopSpec | null { // E (19174)
    const ids = grid.cells[cellId].corners,
      flags = [0, 0, 0, 0];
    let rose = false,
      fell = false,
      minOld = Infinity,
      maxOld = -Infinity,
      minNew = Infinity,
      maxNew = -Infinity;
    for (let k = 0; k < 4; k++) {
      const id = ids[k];
      if (!changed.has(id)) continue;
      flags[k] = 1;
      const old = meshedHeight[id],
        cur = world.get(id).height;
      if (cur > old) rose = true;
      if (cur < old) fell = true;
      minOld = Math.min(minOld, old);
      maxOld = Math.max(maxOld, old);
      minNew = Math.min(minNew, cur);
      maxNew = Math.max(maxNew, cur);
    }
    if (!flags.some(Boolean)) return null;
    if (rose) return { flags, pivot: minOld <= 0 ? CONFIG.WATER_Y - 0.12 : levelY(minOld) - 0.13, birth, amp: -1 };
    if (fell) {
      const top = maxNew <= 0 ? CONFIG.WATER_Y + 0.25 : levelY(maxNew),
        pivot = maxNew <= 0 ? CONFIG.WATER_Y - 0.15 : levelY(maxNew) - 0.5;
      return { flags, pivot, birth, amp: Math.min(1.6, (levelY(maxOld) - top) / Math.max(0.2, top - pivot)) };
    }
    return { flags, pivot: levelY(Math.max(1, maxNew)) - 0.5, birth, amp: 0.28 };
  }

  /** Rebuilds the cells around the given corners (all cells when none are given). */
  function rebuild(corners: Iterable<number> | null | undefined, animate = false): void { // D (19205)
    if (!corners) {
      buildAll(false);
      for (let id = 0; id < grid.corners.length; id++) remember(id);
      return;
    }
    const start = performance.now(),
      changed = new Set<number>();
    for (const id of corners) if (id >= 0 && id < grid.corners.length) changed.add(id);
    if (!changed.size) return;
    const cells = new Set<number>();
    for (const id of changed) for (const c of grid.corners[id].cells) cells.add(c);
    const birth = now(),
      dirty = new Set<number>();
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    if (animate && changed.size === 1) {
      const id = changed.values().next().value!;
      if (meshedHeight[id] > 0 && world.get(id).height === 0) spawnGhost([...cells], id, birth);
    }
    for (const cellId of cells) {
      cellData[cellId] = mesher.build(cellId, animate ? popWithCenter(cellId, changed, birth) : null);
      dirty.add(chunkOfCell[cellId]);
      for (const id of grid.cells[cellId].corners) {
        const p = grid.corners[id];
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }
    for (const key of dirty) uploadChunk(chunkMap.get(key)!);
    shore.sampleRegion(minX, minZ, maxX, maxZ);
    shore.propagate();
    for (const id of changed) remember(id);
    stats.lastRebuildMs = performance.now() - start;
    stats.lastCells = cells.size;
    stats.lastChunks = dirty.size;
    countTriangles();
  }

  const revealOnStart = // O (19239)
      game.params.get(`reveal`) === `1` || (!game.params.has(`shot`) && game.params.get(`reveal`) !== `0`),
    ghosts: Ghost[] = [], // k (19240)
    ghostUV = { u: 0, v: 0 }; // A (19241)

  /** Copies the old land of the cells around a corner lowered to water, and sinks it away. */
  function spawnGhost(cells: number[], cornerId: number, birth: number): void { // j (19242)
    let total = 0;
    for (const c of cells) total += cellData[c].length;
    if (!total) return;
    const data = new Float32Array(total);
    let offset = 0;
    for (const cellId of cells) {
      const src = cellData[cellId];
      data.set(src, offset);
      const corner = grid.cells[cellId].corners.indexOf(cornerId);
      for (let k = offset; k < offset + src.length; k += 20) {
        grid.cellUV(cellId, data[k], data[k + 2], ghostUV);
        const su = smooth01(Math.min(1, Math.max(0, ghostUV.u))),
          sv = smooth01(Math.min(1, Math.max(0, ghostUV.v))),
          w = corner === 0 ? (1 - su) * (1 - sv) : corner === 1 ? su * (1 - sv) : corner === 2 ? su * sv : (1 - su) * sv;
        data[k + 14] = CONFIG.WATER_Y - 0.45;
        data[k + 15] = birth;
        data[k + 16] = -11;
        data[k + 17] = w;
        data[k + 18] = 1e5;
      }
      offset += src.length;
    }
    const geometry = new THREE.BufferGeometry();
    setVertexAttributes(geometry, data);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(geometry, material);
    mesh.name = `terrain-ghost`;
    mesh.receiveShadow = true;
    root.add(mesh);
    ghosts.push({ mesh, until: birth + POP_DURATION + 0.2 });
  }

  function dropGhosts(): void { // M (19273)
    const t = now();
    for (let k = ghosts.length - 1; k >= 0; k--)
      if (!(ghosts[k].until > t)) {
        root.remove(ghosts[k].mesh);
        ghosts[k].mesh.geometry.dispose();
        ghosts.splice(k, 1);
      }
  }

  buildAll(revealOnStart && !game.params.has(`showcase`));
  game.events.on(`world:changed`, (ev: WorldChangedEvent) => {
    if (ev.kind === `sow` || ev.kind === `unsow`) return;
    const changed: number[] = [];
    for (const id of ev.corners) {
      const c = world.get(id),
        code = c.material === `stone` ? 2 : +(c.material === `soil`);
      if (meshedHeight[id] !== c.height || meshedMaterial[id] !== code) changed.push(id);
    }
    if (changed.length) {
      if (ev.tool === null && changed.length > 60) {
        buildAll(revealOnStart);
        for (const id of changed) remember(id);
        return;
      }
      rebuild(changed, true);
    }
  });

  // Last query state, shared by levelAt / heightAt / surfaceAt.
  const queryUV = { u: 0, v: 0 }, // N (19296)
    queryHeights = [0, 0, 0, 0]; // P (19297)
  let queryField = 1, // F (19298)
    queryCell = -1, // I (19299)
    querySU = 0, // L (19300)
    querySV = 0; // R (19301)

  /** Highest land level whose cap covers (x, z); 0 for water or outside the grid. */
  function levelAt(x: number, z: number): number { // ee (19302)
    const cell = grid.cellAt(x, z);
    queryCell = cell;
    if (cell < 0) return 0;
    grid.cellUV(cell, x, z, queryUV);
    const u = Math.min(1, Math.max(0, queryUV.u)),
      v = Math.min(1, Math.max(0, queryUV.v)),
      ids = grid.cells[cell].corners;
    let maxH = 0;
    for (let k = 0; k < 4; k++) {
      queryHeights[k] = world.corners[ids[k]].height;
      if (queryHeights[k] > maxH) maxH = queryHeights[k];
    }
    if (maxH === 0) return 0;
    const su = smooth01(u),
      sv = smooth01(v);
    querySU = su;
    querySV = sv;
    let field = 1,
      level = 0;
    for (let k = 1; k <= maxH; k++) {
      const f = blendField(+(queryHeights[0] >= k), +(queryHeights[1] >= k), +(queryHeights[2] >= k), +(queryHeights[3] >= k), su, sv);
      if (f < field) field = f;
      if (field < 0.5) break;
      level = k;
      queryField = field;
    }
    return level;
  }

  /** Ground (cap surface) y at (x, z); CONFIG.WATER_Y over water. */
  function heightAt(x: number, z: number): number { // z (19324)
    const level = levelAt(x, z);
    return level === 0 ? CONFIG.WATER_Y : levelY(level) - roundDrop(queryField);
  }

  /** Surface material at (x, z): the stone weight of the top level's corners decides stone or soil. */
  function surfaceAt(x: number, z: number): Material { // te (19328)
    const level = levelAt(x, z);
    if (level === 0) return `water`;
    const ids = grid.cells[queryCell].corners,
      su = querySU,
      sv = querySV,
      weights = [(1 - su) * (1 - sv), su * (1 - sv), su * sv, (1 - su) * sv];
    let total = 0,
      stone = 0;
    for (let k = 0; k < 4; k++) {
      const c = world.corners[ids[k]];
      if (c.height < level) continue;
      total += weights[k];
      if (c.material === `stone`) stone += weights[k];
    }
    return total > 0 && stone / total >= 0.5 ? `stone` : `soil`;
  }

  return {
    object: root,
    /** Raycast targets: the chunk meshes and the water plane. */
    pickables: [...chunks.map((chunk) => chunk.mesh), water.water] as THREE.Mesh[],
    stats,
    replayReveal: (): void => buildAll(true),
    shoreDistance: (x: number, z: number): number => shore.distanceAt(x, z),
    rebuild: (corners?: Iterable<number> | null): void => rebuild(corners, false),
    heightAt,
    surfaceAt,
    update(dt: number, clockState: ClockState): void {
      water.update(game.scene);
      if (ghosts.length) dropGhosts();
    },
  };
}

export type Terrain = ReturnType<typeof createTerrain>;
