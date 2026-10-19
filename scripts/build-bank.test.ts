import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectBank, shapeWarnings, stats, type SourceCeleb } from "./build-bank";
import { slugify } from "../src/lib/slug";

const c = (name: string, rating: number): SourceCeleb => ({ name, rating, category: "actor" });

describe("bank", () => {
  it("keeps only celebs with an image, or everyone before any images exist", () => {
    const all = [c("A B", 5), c("C D", 6)];
    expect(selectBank(all, {})).toHaveLength(2);
    expect(selectBank(all, { "a-b": {} }).map((x) => x.name)).toEqual(["A B"]);
  });
  it("computes mean, SD and integer buckets", () => {
    const s = stats([c("a", 3.5), c("b", 4.5), c("c", 5.0)]);
    expect(s.size).toBe(3);
    expect(s.mean).toBeCloseTo(13 / 3);
    expect(s.histogram[3]).toBe(1);
    expect(s.histogram[4]).toBe(1);
    expect(s.histogram[5]).toBe(1);
  });
  it("flags a bucket that lost more than 30% and names the missing celebs", () => {
    const all = [c("a", 5.1), c("b", 5.2), c("c", 5.3)];
    const w = shapeWarnings(all, [all[0]]).find((x) => x.bucket === "5.x");
    expect(w?.missing).toEqual(["b", "c"]);
    expect(shapeWarnings(all, all).find((x) => x.bucket === "5.x")).toBeUndefined();
  });
  it("data/bank.json is in sync with celebs.json and celeb-images.json (run npm run bank)", () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", f), "utf8"));
    const expected = selectBank(read("data/celebs.json").celebs as SourceCeleb[], read("data/celeb-images.json")).map((x) => x.name);
    expect(read("data/bank.json").celebs.map((x: SourceCeleb) => x.name)).toEqual(expected);
    const images = read("data/celeb-images.json") as Record<string, { file: string }>;
    for (const name of expected) {
      const img = images[slugify(name)];
      if (img) expect(fs.existsSync(path.resolve(import.meta.dirname, "../public/celebs", img.file))).toBe(true);
    }
  });
});
