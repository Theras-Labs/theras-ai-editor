// External assets (plan docs/plans/realtime-ai-harness.md, section 6): the index filter and the
// server search (server/src/assets.ts), the ranking of scanned entries in the editor's library
// search, and the rule that local entries win. No test here makes a network request.
import { describe, expect, test } from "bun:test";
import {
  ASSET_ATTRIBUTION,
  MAX_ASSET_BYTES,
  MAX_ASSET_TRIANGLES,
  REDISTRIBUTABLE_LICENSES,
  assetQueryWords,
  buildAssetIndex,
  judgeRow,
  loadAssetIndex,
  normalLicense,
  searchAssets,
  toAssetEntry,
  type DatasetRow
} from "../../../server/src/assets";
import { attributionMarkdown, indexFileText } from "../../../server/scripts/build-asset-index";
import { getResource, searchResources, searchResourcesScored } from "../src/lib/resources/catalog";
import {
  SCANNED_URL_PREFIX,
  getScannedEntry,
  isScannedAsset,
  isScannedId,
  registerScanned,
  scannedEntry,
  scannedScore,
  wantsRealistic,
  type ScannedAsset
} from "../src/lib/resources/external/scanned";
import { buildDirectorSystemPrompt, resolveNouns } from "../src/lib/copilot/director/brief";
import { pickScanned, scannedContext, scannedMatchesToText, scannedQuery } from "../src/lib/copilot/director/scanned";
import { matchThing } from "../src/lib/copilot/instant-path";
import { libraryIndex } from "../src/lib/copilot/system-prompt";

const REV = "0123456789abcdef0123456789abcdef01234567";

function row(over: Partial<DatasetRow> = {}): DatasetRow {
  const id = over.id ?? "Test_Coffee_Mug";
  return {
    id,
    name: "Test Coffee Mug, Blue",
    category: "kitchen",
    brand: "Acme",
    license: "CC-BY-4.0",
    file: `objects/${id}/${id}.glb`,
    thumb: `thumbs/${id}.webp`,
    size_metres: [0.12, 0.1, 0.09],
    triangles: 9000,
    pack_bytes: 250_000,
    source: `https://fuel.gazebosim.org/1.0/GoogleResearch/models/${id}`,
    ...over
  };
}

const asset = (over: Partial<DatasetRow> = {}): ScannedAsset => toAssetEntry(row(over), REV);

describe("index filter (server/src/assets.ts)", () => {
  test("keeps a complete row with a free license, a small file and few triangles", () => {
    expect(judgeRow(row())).toBe("keep");
  });

  test("the size limit is 1 MB after packing, and the limit itself is kept", () => {
    expect(MAX_ASSET_BYTES).toBe(1_000_000);
    expect(judgeRow(row({ pack_bytes: 1_000_000 }))).toBe("keep");
    expect(judgeRow(row({ pack_bytes: 1_000_001 }))).toBe("bytes");
  });

  test("the triangle limit is 20,000, and the limit itself is kept", () => {
    expect(MAX_ASSET_TRIANGLES).toBe(20_000);
    expect(judgeRow(row({ triangles: 20_000 }))).toBe("keep");
    expect(judgeRow(row({ triangles: 20_001 }))).toBe("triangles");
  });

  test("a license that does not allow redistribution is left out", () => {
    expect(REDISTRIBUTABLE_LICENSES).toContain("cc-by-4.0");
    expect(normalLicense("CC BY 4.0")).toBe("cc-by-4.0");
    expect(judgeRow(row({ license: "cc-by-4.0" }))).toBe("keep");
    for (const license of ["CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "unknown", "", "proprietary"]) expect(judgeRow(row({ license }))).toBe("license");
    // The license is checked before the size: a large model with a closed license counts as "license".
    expect(judgeRow(row({ license: "CC-BY-NC-4.0", pack_bytes: 5_000_000 }))).toBe("license");
  });

  test("rows that cannot be read are left out", () => {
    expect(judgeRow(null)).toBe("invalid");
    expect(judgeRow(row({ id: "Pokémon_Game" }))).toBe("invalid");
    expect(judgeRow(row({ file: "objects/../secret.glb" }))).toBe("invalid");
    expect(judgeRow(row({ file: "objects/a/a.obj" }))).toBe("invalid");
    expect(judgeRow(row({ size_metres: [0.1, 0, 0.1] }))).toBe("invalid");
    expect(judgeRow(row({ size_metres: [0.1, 0.1] as unknown as [number, number, number] }))).toBe("invalid");
    expect(judgeRow(row({ triangles: Number.NaN }))).toBe("invalid");
    expect(judgeRow(row({ source: "http://example.com/x" }))).toBe("invalid");
    expect(judgeRow({ ...row(), name: undefined })).toBe("invalid");
  });

  test("buildAssetIndex counts each reason and writes URLs of one commit", () => {
    const index = buildAssetIndex(
      [row({ id: "B" }), row({ id: "A" }), row({ id: "A" }), row({ id: "C", pack_bytes: 2_000_000 }), row({ id: "D", triangles: 50_000 }), row({ id: "E", license: "CC-BY-NC-4.0" }), "junk"],
      REV,
      "2026-11-11T00:00:00.000Z"
    );
    expect(index.counts).toEqual({ source: 7, kept: 2, license: 1, bytes: 1, triangles: 1, invalid: 2 });
    expect(index.assets.map((a) => a.id)).toEqual(["A", "B"]);
    const a = index.assets[0]!;
    expect(a.glb).toBe(`https://huggingface.co/datasets/codepawl/scanned-objects-glb/resolve/${REV}/objects/A/A.glb`);
    expect(a.thumb).toBe(`https://huggingface.co/datasets/codepawl/scanned-objects-glb/resolve/${REV}/thumbs/A.webp`);
    expect(a.bytes).toBe(250_000);
    expect(a.size_metres).toEqual([0.12, 0.1, 0.09]);
    expect(a.tags).toEqual(["kitchen", "acme"]);
    expect(a.styleTags).toEqual(["scanned"]);
    expect(a.license).toBe("CC-BY-4.0");
    expect(a.attribution).toBe(ASSET_ATTRIBUTION);
    // The file text is valid JSON and gives the same index back.
    expect(JSON.parse(indexFileText(index))).toEqual(index);
  });

  test("the credits file names the author, the license and each model", () => {
    const index = buildAssetIndex([row({ id: "A", name: "Mug | large" }), row({ id: "B" })], REV, "2026-11-11T00:00:00.000Z");
    const text = attributionMarkdown(index);
    expect(text).toContain("Google Research. Copyright 2020 Google LLC.");
    expect(text).toContain("https://creativecommons.org/licenses/by/4.0/");
    expect(text).toContain(`commit \`${REV}\``);
    expect(text).toContain("| Mug \\| large | kitchen | https://fuel.gazebosim.org/1.0/GoogleResearch/models/A |");
    expect(text.split("\n").filter((l) => l.includes("fuel.gazebosim.org/1.0/")).length).toBe(2);
  });
});

describe("the index file (server/data/assets-index.json)", () => {
  const index = loadAssetIndex();

  test("every model obeys the limits, has a free license and files of one commit", () => {
    expect(index.assets.length).toBeGreaterThan(0);
    expect(index.assets.length).toBe(index.counts.kept);
    expect(index.limits).toEqual({ maxBytes: MAX_ASSET_BYTES, maxTriangles: MAX_ASSET_TRIANGLES });
    const prefix = `${SCANNED_URL_PREFIX}${index.revision}/`;
    expect(index.revision).toMatch(/^[0-9a-f]{40}$/);
    const ids = new Set<string>();
    for (const a of index.assets) {
      expect(a.bytes).toBeLessThanOrEqual(MAX_ASSET_BYTES);
      expect(a.triangles).toBeLessThanOrEqual(MAX_ASSET_TRIANGLES);
      expect(REDISTRIBUTABLE_LICENSES).toContain(normalLicense(a.license));
      expect(a.glb.startsWith(prefix)).toBe(true);
      expect(a.thumb.startsWith(prefix)).toBe(true);
      expect(a.attribution.length).toBeGreaterThan(10);
      // The editor accepts the record as the server gives it.
      expect(isScannedAsset(a)).toBe(true);
      ids.add(a.id);
    }
    expect(ids.size).toBe(index.assets.length);
  });

  test("a search of the real index finds a mug for 'realistic mug'", () => {
    const { words, hits } = searchAssets(index.assets, "add a realistic mug", 5);
    expect(words).toEqual(["mug"]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.asset.name.toLowerCase()).toContain("mug");
  });
});

describe("server search ranking (searchAssets)", () => {
  const assets = [
    asset({ id: "Mug_Big", name: "Plain Mug", pack_bytes: 400_000 }),
    asset({ id: "Mug_Small", name: "Plain Mug", pack_bytes: 100_000 }),
    asset({ id: "Coffee_Mug", name: "Threshold Coffee Mug", pack_bytes: 300_000 }),
    asset({ id: "Coffee_Jar", name: "Instant Coffee, 7 oz", category: "food and drink", brand: null }),
    asset({ id: "Shoe_A", name: "11pro SL TRX FG", category: "shoe", brand: "adidas" }),
    asset({ id: "Table", name: "3D Dollhouse TablePurple", category: "toy", brand: null }),
    asset({ id: "Mugwort", name: "Mugwort Tea Box", category: "food and drink", brand: null })
  ];
  const ids = (q: string, limit = 12) => searchAssets(assets, q, limit).hits.map((h) => h.asset.id);

  test("style words and verbs are not search words; plural words become singular", () => {
    expect(assetQueryWords("Add a realistic scanned Coffee MUGS, please")).toEqual(["coffee", "mug"]);
    expect(assetQueryWords("the real thing")).toEqual([]);
  });

  test("a result that matches more words comes first; then the higher score; then the smaller file", () => {
    // Coffee_Mug has both words. Then one word in the name (3), smaller file first. Last: the start of a word (1).
    expect(ids("coffee mug")).toEqual(["Coffee_Mug", "Mug_Small", "Coffee_Jar", "Mug_Big", "Mugwort"]);
    // One word: the name (3), smaller file first, comes before the start of a word (1, "mugwort").
    expect(ids("mug")).toEqual(["Mug_Small", "Coffee_Mug", "Mug_Big", "Mugwort"]);
  });

  test("a category or a brand finds a model whose name does not have the word", () => {
    expect(ids("shoe")).toEqual(["Shoe_A"]);
    expect(ids("adidas")).toEqual(["Shoe_A"]);
    expect(searchAssets(assets, "shoe").hits[0]!.score).toBe(2);
  });

  test("a name in camel case is split into its words", () => {
    expect(ids("table")).toEqual(["Table"]);
    expect(ids("purple table")[0]).toBe("Table");
  });

  test("no match gives no result; an empty query lists one model of each category in turn", () => {
    expect(ids("spaceship")).toEqual([]);
    const browse = searchAssets(assets, "realistic", 3).hits.map((h) => h.asset.category);
    expect(new Set(browse).size).toBe(3);
  });

  test("the limit is obeyed and has a ceiling of 50", () => {
    expect(ids("mug", 2).length).toBe(2);
    const many = Array.from({ length: 80 }, (_, i) => asset({ id: `Mug_${i}`, name: "Mug" }));
    expect(searchAssets(many, "mug", 500).hits.length).toBe(50);
  });
});

describe("scanned entries in the editor library", () => {
  // Names that the local library also has ("flower", "lamp"), and one that it does not have.
  const flower = asset({ id: "Scan_Flower_Pot", name: "Flower", category: "household", size_metres: [0.26, 0.22, 0.26] });
  const lamp = asset({ id: "Scan_Lamp", name: "Lamp", category: "toy", size_metres: [0.05, 0.11, 0.05] });
  const zither = asset({ id: "Scan_Zither", name: "Zither", category: "toy", size_metres: [0.4, 0.05, 0.2] });
  registerScanned([flower, lamp, zither]);

  test("an entry has the tag scanned, the real size, the credit, and loads from the source host", () => {
    const entry = scannedEntry(flower);
    expect(entry.id).toBe("scan:Scan_Flower_Pot");
    expect(entry.tags).toContain("scanned");
    expect(entry.source).toBe("external");
    expect(entry.license).toBe("CC BY 4.0");
    expect(entry.credit).toBe(ASSET_ATTRIBUTION);
    expect(entry.creditUrl).toBe(flower.source);
    expect(entry.description).toContain("0.26 x 0.26 x 0.22 m (w x d x h)");
    expect(entry.footprint).toBeCloseTo(0.13, 5);
    expect(entry.preview!.startsWith(SCANNED_URL_PREFIX)).toBe(true);
  });

  test("a record with a file on another host, or with no size, is not registered", () => {
    expect(registerScanned([{ ...zither, id: "Evil", glb: "https://example.com/evil.glb" }])).toEqual([]);
    expect(registerScanned([{ ...zither, id: "NoSize", size_metres: [0, 0, 0] }])).toEqual([]);
    expect(registerScanned([null, "x", {}])).toEqual([]);
    expect(getResource("scan:Evil")).toBeUndefined();
  });

  test("getResource finds a registered scanned id and no other scan id", () => {
    expect(getResource("scan:Scan_Lamp")?.name).toBe("Lamp");
    expect(getScannedEntry("scan:Scan_Lamp")).toBe(getResource("scan:Scan_Lamp"));
    expect(getResource("scan:Not_In_The_Index")).toBeUndefined();
  });

  test("local entries win: every local match comes before every scanned match", () => {
    for (const query of ["flower", "lamp", "flower lamp", "toy", ""]) {
      const results = searchResourcesScored(query, {}, 2000);
      const firstScanned = results.findIndex((r) => isScannedId(r.entry.id));
      expect(firstScanned).toBeGreaterThan(0);
      const local = results.slice(0, firstScanned);
      const scanned = results.slice(firstScanned);
      expect(scanned.every((r) => isScannedId(r.entry.id))).toBe(true);
      // Also by score: the weakest local match is above the best scanned match.
      expect(Math.min(...local.map((r) => r.score))).toBeGreaterThan(Math.max(...scanned.map((r) => r.score)));
    }
  });

  test("a scanned entry whose name is the query still comes after a weak local match", () => {
    const results = searchResourcesScored("lamp", {}, 2000);
    const scan = results.find((r) => r.entry.id === "scan:Scan_Lamp")!;
    expect(scan.score).toBeLessThan(0.5);
    expect(results.indexOf(scan)).toBeGreaterThan(0);
    expect(searchResources("lamp", {}, 1)[0]!.source).toBe("local");
    expect(scannedScore(3)).toBeLessThan(0.5);
    expect(scannedScore(30)).toBeLessThan(0.5);
    expect(scannedScore(6)).toBeGreaterThan(scannedScore(3));
  });

  test("with no local match the scanned entry is found, with a score that no strict rule accepts", () => {
    const results = searchResourcesScored("zither", {}, 12);
    expect(results.map((r) => r.entry.id)).toEqual(["scan:Scan_Zither"]);
    expect(results[0]!.score).toBeLessThan(0.5);
    // The instant path and the noun matches of the director take only strong local matches.
    expect(matchThing("zither")).toBeNull();
    expect(resolveNouns("add a zither next to the lamp").flatMap((m) => m.ids).some((i) => isScannedId(i.id))).toBe(false);
  });

  test("the library index of the AI prompts does not list scanned entries", () => {
    expect(libraryIndex()).not.toContain("scan:");
    const prompt = buildDirectorSystemPrompt([{ id: "compose", describe: "scanned-assets test" }]);
    expect(prompt).toContain("- Scanned objects: an id that starts with scan: comes only from a [Scanned objects] block");
    expect(prompt).not.toContain("Scan_Lamp");
  });
});

describe("scanned objects for the director (director/scanned.ts)", () => {
  const mug = { ...asset({ id: "Cole_Mug", name: "Cole Hardware Mug, Classic Blue" }), score: 3, matched: 1 };
  const coffeeMug = { ...asset({ id: "Coffee_Mug", name: "Threshold Coffee Mug" }), score: 6, matched: 2 };
  const bowl = { ...asset({ id: "Dog_Bowl", name: "Dog Bowl", category: "kitchen" }), score: 2, matched: 1 };

  test("wantsRealistic reads the user's words", () => {
    for (const p of ["add a realistic mug", "a real shoe", "place a scanned toy", "a photorealistic cup", "a lifelike apple"]) expect(wantsRealistic(p)).toBe(true);
    for (const p of ["add a mug", "make it really big", "a surreal tower", "realism is not asked"]) expect(wantsRealistic(p)).toBe(false);
  });

  test("a realistic request searches for the thing, without style words, colors and the anchor", () => {
    expect(scannedQuery("add a realistic coffee mug next to the windmill", [])).toEqual({ realistic: true, words: ["coffee", "mug"] });
    expect(scannedQuery("Add 3 realistic red shoes", [])).toEqual({ realistic: true, words: ["shoes"] });
    // Realistic wins over a local match: the user asked for it.
    expect(scannedQuery("add a realistic lamp", [{ term: "lamp", ids: [{ id: "creature:lamp-moth", name: "Lamp moth" }] }])).toEqual({ realistic: true, words: ["lamp"] });
  });

  test("local entries win: a thing that the library has makes no scanned search", () => {
    const local = resolveNouns("add a windmill");
    expect(local.length).toBeGreaterThan(0);
    expect(scannedQuery("add a windmill", local)).toBeNull();
  });

  test("a simple add request for a thing with no local match searches; other prompts do not", () => {
    expect(scannedQuery("add a zither", [])).toEqual({ realistic: false, words: ["zither"] });
    expect(scannedQuery("build a city with a river and make the tower taller", [])).toBeNull();
    expect(scannedQuery("make it bigger", [])).toBeNull();
    expect(scannedQuery("add a realistic one", [])).toBeNull();
    // A change to a thing that exists is not a request for a new thing.
    expect(scannedQuery("make the tower taller", [])).toBeNull();
    expect(scannedQuery("make the tower red", [])).toBeNull();
    expect(scannedQuery("put that zither near the lamp", [])).toBeNull();
    // Size words are not search words.
    expect(scannedQuery("add a realistic big mug", [])).toEqual({ realistic: true, words: ["mug"] });
  });

  test("pickScanned: realistic takes the best matches; no local match takes only full name matches", () => {
    const realistic = { realistic: true, words: ["coffee", "mug"] };
    expect(pickScanned([coffeeMug, mug, bowl], realistic).map((a) => a.id)).toEqual(["Coffee_Mug"]);
    expect(pickScanned([mug, bowl], { realistic: true, words: ["mug"] }).map((a) => a.id)).toEqual(["Cole_Mug", "Dog_Bowl"]);
    // No local match: the category hit (score 2) is not enough, the name must have every word.
    expect(pickScanned([mug, bowl], { realistic: false, words: ["mug"] }).map((a) => a.id)).toEqual(["Cole_Mug"]);
    expect(pickScanned([mug], { realistic: false, words: ["coffee", "mug"] })).toEqual([]);
    expect(pickScanned([], realistic)).toEqual([]);
  });

  test("the context block gives the id, the name, the category and the real size", () => {
    const text = scannedMatchesToText([mug], { realistic: true, words: ["mug"] });
    expect(text).toContain("[Scanned objects: photo scans of real products at real size");
    expect(text).toContain("scan:Cole_Mug (Cole Hardware Mug, Classic Blue; kitchen; 0.12 x 0.09 x 0.10 m (w x d x h))");
    expect(scannedMatchesToText([], { realistic: true, words: ["mug"] })).toBe("[Scanned objects: none match this request]");
    expect(scannedMatchesToText([], { realistic: false, words: ["mug"] })).toBe("");
  });

  test("scannedContext makes one search for a realistic request and none when the library has the thing", async () => {
    const calls: string[] = [];
    const search = async (query: string) => {
      calls.push(query);
      return { total: 2, assets: [coffeeMug, mug] };
    };
    const text = await scannedContext("add a realistic coffee mug", [], search);
    expect(calls).toEqual(["coffee mug"]);
    expect(text).toContain("scan:Coffee_Mug");
    expect(text).not.toContain("scan:Cole_Mug");
    expect(await scannedContext("add a windmill", resolveNouns("add a windmill"), search)).toBe("");
    expect(await scannedContext("make the tower taller", [], search)).toBe("");
    expect(calls.length).toBe(1);
  });
});
