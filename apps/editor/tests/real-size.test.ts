// Tests for the size of a new modeled object (src/lib/generators/parts/real-size.ts).
// The failure these tests come from (2026-11-15): "a yellow diesel site generator on a skid"
// came out 4.2 m long, as big as the forklift beside it. A real one is about 2.2 m.
// Run: cd apps/editor && bun test tests/real-size.test.ts
import { describe, expect, test } from "bun:test";
import { buildDirectorSystemPrompt } from "../src/lib/copilot/director/brief";
import { objectGenerator } from "../src/lib/copilot/director/generators/object";
import { modelerUserMessage } from "../src/lib/generators/parts";
import { SIZE_TOLERANCE, asksForSize, realSizeOf, settleSize } from "../src/lib/generators/parts/real-size";

describe("the real size of a thing", () => {
  test("the head noun of the subject is looked up, not its place or its extras", () => {
    expect(realSizeOf("yellow diesel site generator on a skid")).toEqual({ meters: 2.2, word: "generator" });
    expect(realSizeOf("red forklift with a raised mast")?.word).toBe("forklift");
    expect(realSizeOf("Old Oil Drums")).toEqual({ meters: 0.9, word: "oil drum" });
    expect(realSizeOf("orange traffic cone, worn")?.meters).toBe(0.75);
  });

  test("two words win over one word", () => {
    expect(realSizeOf("blue pickup truck")?.word).toBe("pickup truck");
    expect(realSizeOf("grand piano")?.meters).toBe(2.2);
    expect(realSizeOf("upright piano")?.meters).toBe(1.5);
  });

  test("a thing with no usual size, or a word with two meanings, is not known", () => {
    for (const subject of ["battle tank", "robot", "sailing ship", "oak tree", "ice cream cone", "bass drum", "food container", ""]) expect(realSizeOf(subject)).toBeUndefined();
  });

  test("only the head noun counts: a car wash is not a car", () => {
    expect(realSizeOf("car wash")).toBeUndefined();
    expect(realSizeOf("generator shed")).toBeUndefined();
  });
});

describe("words that ask for a size", () => {
  test("size words and lengths are found", () => {
    for (const text of ["a giant cactus", "tiny car", "a toy forklift", "generator 3 m long", "a 40cm drum", "make it twice as big"]) expect(asksForSize(text)).toBe(true);
  });

  test("the verb 'model' and plain words are not size words", () => {
    expect(asksForSize("model a new yellow diesel site generator on a skid from parts here, realistic")).toBe(false);
    expect(asksForSize(undefined, "a red car")).toBe(false);
  });
});

describe("the size a new object is built at", () => {
  const prompt = "model a new yellow diesel site generator on a skid from parts here, realistic";

  test("no size from the director: the real size", () => {
    expect(settleSize({ subject: "yellow diesel site generator", prompt })).toEqual({ meters: 2.2, source: "real", word: "generator" });
  });

  test("a director size that is far off is set to the real size (the failed case)", () => {
    expect(settleSize({ subject: "yellow diesel site generator", prompt, asked: 4.2 })).toEqual({ meters: 2.2, source: "corrected", word: "generator" });
    expect(settleSize({ subject: "office chair", asked: 0.3 }).meters).toBe(1.1);
  });

  test("a director size near the real one stands", () => {
    expect(settleSize({ subject: "site generator", prompt, asked: 2.6 })).toEqual({ meters: 2.6, source: "asked" });
    expect(settleSize({ subject: "car", asked: 4.5 * SIZE_TOLERANCE - 0.01 }).source).toBe("asked");
    expect(settleSize({ subject: "car", asked: 4.5 / SIZE_TOLERANCE + 0.01 }).source).toBe("asked");
  });

  test("the user's own size stands, in the subject or in the request", () => {
    expect(settleSize({ subject: "giant traffic cone", asked: 6 })).toEqual({ meters: 6, source: "asked" });
    expect(settleSize({ subject: "forklift", prompt: "a toy forklift on the desk", asked: 0.3 })).toEqual({ meters: 0.3, source: "asked" });
  });

  test("a thing the table does not know: the director's size, or the modeler's own", () => {
    expect(settleSize({ subject: "battle robot", asked: 3 })).toEqual({ meters: 3, source: "asked" });
    expect(settleSize({ subject: "battle robot" })).toEqual({ source: "spec" });
  });
});

describe("the prompts say it", () => {
  test("the director is told to send the real size for a new object", () => {
    const text = buildDirectorSystemPrompt([objectGenerator]);
    expect(text).toContain("A new object always gets sizeMeters");
    expect(objectGenerator.describe).toContain("REAL longest side");
    expect(objectGenerator.describe.length).toBeLessThanOrEqual(600);
  });

  test("the modeler is told to write the parts at the real size", () => {
    const text = modelerUserMessage({ subject: "site generator", sizeMeters: 2.2, style: "realistic" });
    expect(text).toContain("Longest side: 2.2 m");
    expect(text).toContain("real meters");
  });
});
