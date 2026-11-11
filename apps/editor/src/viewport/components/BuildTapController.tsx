// While a dock slot is active, a tap (or click) on the scene places that slot's recipe
// at the tapped grid cell. Erase removes the tapped node. A drag still moves the camera.
// In touch mode a long press erases, whatever slot is active.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Box3, Plane, Raycaster, Vector2, Vector3, type Object3D } from "three";
import { snapshot } from "valtio";
import { buildSlotStore } from "@/lib/build-slots/store";
import { eraseNodes, placeCopy, placeRecipe } from "@/lib/build-slots/runner";
import { toast } from "sonner";
import { TILE } from "@/lib/build-slots/presets";
import { placeResource } from "@/lib/resources/place";
import { applyTerrainTool, isTerrainSurface, raycastTerrain, terrainNodeIds } from "@/lib/resources/terrain-edit";
import { placeGroundAt } from "@/lib/resources/place-ground";

const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 450;
const LONG_PRESS_MS = 550;

const raycaster = new Raycaster();
const ndc = new Vector2();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const tmpBox = new Box3();
const tmpPoint = new Vector3();

function findNodeRoot(object: Object3D | null): Object3D | null {
  for (let o = object; o; o = o.parent) {
    if (o.name.startsWith("node:")) return o;
  }
  return null;
}

type Hit = { point: Vector3; normal: Vector3; nodeRoot: Object3D | null };

export function BuildTapController() {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number; t: number }>();
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    let longPressFired = false;
    let shiftHeld = false;

    const raycast = (clientX: number, clientY: number): Hit | null => {
      const rect = el.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const root = findNodeRoot(hit.object);
        if (!root || !(hit.object as { isMesh?: boolean }).isMesh || !hit.face) continue;
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        return { point: hit.point.clone(), normal, nodeRoot: root };
      }
      if (raycaster.ray.intersectPlane(groundPlane, tmpPoint)) {
        return { point: tmpPoint.clone(), normal: new Vector3(0, 1, 0), nodeRoot: null };
      }
      return null;
    };

    const eraseAt = (clientX: number, clientY: number) => {
      const hit = raycast(clientX, clientY);
      const nodeId = hit?.nodeRoot?.name.slice("node:".length);
      if (nodeId) eraseNodes([nodeId]);
    };

    const placeAt = (clientX: number, clientY: number) => {
      const state = snapshot(buildSlotStore);
      if (state.activeIndex === null) return;
      const slot = state.slots[state.activeIndex];
      if (!slot) return;
      const terrainIds = terrainNodeIds();
      const onTerrain = (hit: Hit | null) => {
        const id = hit?.nodeRoot?.name.slice("node:".length);
        return id !== undefined && isTerrainSurface(id);
      };
      if (slot.kind === "erase") {
        // Erase on the island lowers the land instead of deleting the whole terrain.
        const hit = raycast(clientX, clientY);
        if (hit && onTerrain(hit)) applyTerrainTool("water", hit.point, false);
        else eraseAt(clientX, clientY);
        return;
      }
      if (slot.terrainTool && terrainIds.length > 0) {
        // With an island in the scene, Soil, Stone and Water always shape its terrain
        // (they aim through objects on top) and never place the old box blocks.
        raycast(clientX, clientY); // sets the ray
        const point = raycastTerrain(raycaster.ray);
        // Default size 1 = one terrain point (Island kit); larger = a wider brush.
        const radius = Math.max(0, ((slot.scale ?? 1) - 1) * 1.5);
        if (point && applyTerrainTool(slot.terrainTool, point, shiftHeld, radius) && state.touchMode) navigator.vibrate?.(8);
        return;
      }
      if (!slot.recipe && !(slot.kind === "resource" && slot.resourceId) && !(slot.kind === "copy" && slot.copyOf)) return;
      const hit = raycast(clientX, clientY);
      if (!hit) return;
      if (slot.kind === "copy" && slot.copyOf) {
        // A copy of a scene object: its bottom goes exactly where the tap hit.
        const source = scene.getObjectByName(`node:${slot.copyOf}`);
        let bottomOffset = 0;
        if (source) {
          source.updateWorldMatrix(true, true);
          tmpBox.setFromObject(source);
          source.getWorldPosition(tmpPoint);
          if (!tmpBox.isEmpty()) bottomOffset = tmpPoint.y - tmpBox.min.y;
        }
        try {
          placeCopy(slot.copyOf, hit.point, bottomOffset, state.rotation);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not place the copy.");
        }
        if (state.touchMode) navigator.vibrate?.(8);
        return;
      }

      let x: number;
      let z: number;
      let y: number;
      if (slot.kind === "resource") {
        // Library objects go exactly where the tap hit (terrain is not on the 1 m grid).
        x = hit.point.x;
        z = hit.point.z;
        y = hit.point.y;
      } else if (hit.normal.y > 0.5) {
        // Top face: build on the surface, in the cell under the tap.
        x = Math.round(hit.point.x / TILE) * TILE;
        z = Math.round(hit.point.z / TILE) * TILE;
        y = hit.point.y;
      } else {
        // Side face: the next cell outward, on the same base as the node that was hit.
        x = Math.round((hit.point.x + hit.normal.x * TILE * 0.5) / TILE) * TILE;
        z = Math.round((hit.point.z + hit.normal.z * TILE * 0.5) / TILE) * TILE;
        y = hit.nodeRoot ? tmpBox.setFromObject(hit.nodeRoot).min.y : hit.point.y;
      }
      const placeGround = placeGroundAt(hit.point.x, hit.point.z);
      const onGround = hit.nodeRoot === null || (placeGround !== null && Math.abs(placeGround - hit.point.y) < 0.3);
      if (slot.terrainTool === "water" && onGround) {
        // Water with no island (a desert, a street): a puddle that lies on the ground under the
        // tap and follows its shape. A flat water block would hang over any slope.
        try {
          placeResource("water:puddle", { x: hit.point.x, y: hit.point.y, z: hit.point.z }, { rotationY: Math.random() * Math.PI * 2, scale: slot.scale ?? 1 });
        } catch (error) {
          console.warn("[build] could not place a puddle", error);
        }
      } else if (slot.kind === "resource" && slot.resourceId) {
        try {
          placeResource(slot.resourceId, { x, y, z }, { rotationY: state.rotation * (Math.PI / 2), scale: slot.scale ?? 1 });
        } catch (error) {
          console.warn("[build] could not place", slot.resourceId, error);
        }
      } else if (slot.recipe) {
        placeRecipe(structuredClone(slot.recipe) as never, { x, y, z }, state.rotation, 0, 70, slot.label, slot.scale ?? 1);
      }
      if (state.touchMode) navigator.vibrate?.(8);
    };

    const onDown = (e: PointerEvent) => {
      if (buildSlotStore.activeIndex === null && !buildSlotStore.touchMode) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      clearTimeout(longPressTimer);
      longPressFired = false;
      if (buildSlotStore.touchMode && pointers.size === 1) {
        longPressTimer = setTimeout(() => {
          const p = pointers.get(e.pointerId);
          if (!p) return;
          longPressFired = true;
          eraseAt(p.x, p.y);
          navigator.vibrate?.(20);
        }, LONG_PRESS_MS);
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_MAX_MOVE_PX) clearTimeout(longPressTimer);
    };

    const onUp = (e: PointerEvent) => {
      shiftHeld = e.shiftKey;
      const p = pointers.get(e.pointerId);
      const multiTouch = pointers.size > 1;
      pointers.delete(e.pointerId);
      clearTimeout(longPressTimer);
      if (!p || multiTouch || longPressFired || e.button > 0) return;
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (moved > TAP_MAX_MOVE_PX || performance.now() - p.t > TAP_MAX_MS) return;
      placeAt(e.clientX, e.clientY);
    };

    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      clearTimeout(longPressTimer);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      clearTimeout(longPressTimer);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [camera, gl, scene]);

  return null;
}
