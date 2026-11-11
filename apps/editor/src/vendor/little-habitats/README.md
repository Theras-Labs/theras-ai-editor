# Island kit (vendored)

Island kit code, owned by the Theras AI author.

Files keep their original paths and code. Theras changes:
- game/types.ts is a stub: Theras hosts only some systems, so the other systems are typed loosely.
- wonders/placer.ts and landmarks/heights/rope_swing.ts: four parameters typed `any` because of that stub.

Theras adapters that use this code live in apps/editor/src/lib/resources/little-habitats/.
