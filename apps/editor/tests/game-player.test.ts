// Game mode player: the animation choice from the controller state, the push strength, and the
// "Person" library entry. Nothing here loads the GLB (no DOM, no loader).
import { describe, expect, test } from "bun:test";
import { getResource, searchResources } from "../src/lib/resources/catalog";
import { PERSON_CLIPS, personAnimationClip } from "../src/lib/resources/models/people";
import { chooseClip, clipTimeScale, type MotionState } from "../src/viewport/components/game/PlayerCharacter";

const ground = (speed: number, run = false, sinceLanded = Infinity): MotionState => ({
  onGround: true,
  speed,
  run,
  jumped: false,
  airTime: 0,
  sinceLanded
});

const air = (airTime: number, jumped: boolean): MotionState => ({
  onGround: false,
  speed: 2,
  run: false,
  jumped,
  airTime,
  sinceLanded: Infinity
});

describe("chooseClip", () => {
  test("idle when standing or nearly still", () => {
    expect(chooseClip(ground(0))).toBe("Idle_Loop");
    expect(chooseClip(ground(0.2))).toBe("Idle_Loop");
  });
  test("walk without Shift", () => {
    expect(chooseClip(ground(1.4))).toBe("Walk_Loop");
    expect(chooseClip(ground(3))).toBe("Walk_Loop");
  });
  test("jog with Shift, sprint above about 6 m/s", () => {
    expect(chooseClip(ground(4, true))).toBe("Jog_Fwd_Loop");
    expect(chooseClip(ground(1.5, true))).toBe("Walk_Loop");
    expect(chooseClip(ground(6.3, true))).toBe("Sprint_Loop");
  });
  test("jump start, then in the air", () => {
    expect(chooseClip(air(0.05, true))).toBe("Jump_Start");
    expect(chooseClip(air(0.6, true))).toBe("Jump_Loop");
  });
  test("a fall without a jump is in the air after a short grace", () => {
    expect(chooseClip(air(0.05, false))).toBe("Walk_Loop");
    expect(chooseClip(air(0.5, false))).toBe("Jump_Loop");
  });
  test("landing plays briefly, then back to idle; moving on skips it", () => {
    expect(chooseClip(ground(0, false, 0.1))).toBe("Jump_Land");
    expect(chooseClip(ground(0, false, 1))).toBe("Idle_Loop");
    expect(chooseClip(ground(3, false, 0.1))).toBe("Walk_Loop");
  });
  test("walk and run time follow the real speed", () => {
    expect(clipTimeScale("Walk_Loop", 2.6)).toBeGreaterThan(clipTimeScale("Walk_Loop", 1.3));
    expect(clipTimeScale("Idle_Loop", 0)).toBe(1);
  });
});

describe("push", async () => {
  // Player.tsx imports the controller and the editor stores; skip quietly if that is not loadable here.
  const mod = await import("../src/viewport/components/game/Player").catch(() => null);
  test.skipIf(!mod)("a light body moves clearly, a heavy one a little", () => {
    const pushImpulse = mod!.pushImpulse;
    const crate = pushImpulse(20) / 20;
    const heavy = pushImpulse(2000) / 2000;
    expect(crate).toBeGreaterThan(4);
    expect(heavy).toBeLessThan(0.5);
    expect(heavy).toBeGreaterThan(0);
    expect(pushImpulse(0)).toBe(0);
  });
});

describe("Person library entry", () => {
  test("exists with the expected fields", () => {
    const entry = getResource("creature:person");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Person");
    expect(entry!.kind).toBe("creature");
    expect(entry!.category).toBe("People");
    for (const tag of ["person", "human", "npc", "character", "basic", "rigged", "animated"]) expect(entry!.tags).toContain(tag);
    expect(typeof entry!.create).toBe("function");
  });
  for (const query of ["person", "human", "character", "npc"]) {
    test(`"${query}" finds the person first`, () => {
      expect(searchResources(query)[0]?.id).toBe("creature:person");
    });
  }
  test("animation words map to clips of the file", () => {
    expect(personAnimationClip(undefined)).toBe("Idle_Loop");
    expect(personAnimationClip("walk")).toBe("Walk_Loop");
    expect(personAnimationClip("Sit Talk")).toBe("Sitting_Talking_Loop");
    expect(personAnimationClip("dancing")).toBe("Dance_Loop");
    expect(personAnimationClip("Push_Loop")).toBe("Push_Loop");
    expect(personAnimationClip("nonsense")).toBe("Idle_Loop");
    for (const word of ["idle", "walk", "jog", "run", "dance", "talk", "sit", "sit-talk", "crouch", "push"]) {
      expect(PERSON_CLIPS).toContain(personAnimationClip(word));
    }
  });
});
