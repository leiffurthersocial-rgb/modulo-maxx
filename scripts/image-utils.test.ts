import { describe, expect, it } from "vitest";
import {
  isFreeLicense,
  normalizeOverride,
  parseArgs,
  parseYear,
  recencyScore,
  resolveOnly,
  rejectReason,
  scoreCandidate,
  stripHtml,
  yearFromTitle,
  type Candidate,
} from "./image-utils";

const base: Candidate = {
  title: "File:Ryan Gosling in 2018 (cropped).jpg",
  width: 1200,
  height: 1500,
  mime: "image/jpeg",
  url: "https://example.org/a.jpg",
  descriptionUrl: "https://commons.wikimedia.org/wiki/File:a.jpg",
  license: "CC BY-SA 4.0",
  author: "Someone",
  year: 2018,
  yearSource: "taken",
  description: "",
  categories: "",
  fromPageImage: false,
};

describe("licenses", () => {
  it("accepts CC BY, CC BY-SA, CC0 and public domain", () => {
    for (const l of ["CC BY 2.0", "CC BY-SA 3.0", "CC0", "Public domain", "PD-USGov"]) expect(isFreeLicense(l)).toBe(true);
  });
  it("rejects NC, ND, fair use and unknown", () => {
    for (const l of ["CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 2.0", "Fair use", "All rights reserved", ""])
      expect(isFreeLicense(l)).toBe(false);
  });
});

describe("filters", () => {
  it("parses years from messy dates", () => {
    expect(parseYear("<span>2019-05-04 12:00</span>")).toBe(2019);
    expect(parseYear("circa 1999")).toBe(1999);
    expect(parseYear("unknown")).toBeUndefined();
  });
  it("rejects low-res, non-free and art, but not old photos", () => {
    expect(rejectReason(base)).toBeNull();
    expect(rejectReason({ ...base, year: 2003 })).toBeNull();
    expect(rejectReason({ ...base, width: 300 })).toBe("lowres");
    expect(rejectReason({ ...base, license: "CC BY-NC 2.0" })).toBe("license");
    expect(rejectReason({ ...base, categories: "Caricatures of actors" })).toBe("art");
  });
  it("prefers photos from the celeb's era when one is set", () => {
    const era: [number, number] = [2005, 2012];
    const prime = { ...base, year: 2008 };
    const recent = { ...base, year: 2024 };
    expect(scoreCandidate(prime, "Ryan Gosling", era)).toBeGreaterThan(scoreCandidate(recent, "Ryan Gosling", era));
  });
  it("prefers photos from the last 10 years when no era is set", () => {
    const old = { ...base, year: 2008 };
    const recent = { ...base, year: 2022 };
    expect(scoreCandidate(recent, "Ryan Gosling", undefined, 2026)).toBeGreaterThan(scoreCandidate(old, "Ryan Gosling", undefined, 2026));
    expect(recencyScore({ ...base, year: 2022, yearSource: "uploaded" }, 2026)).toBeLessThan(recencyScore(recent, 2026));
    expect(recencyScore({ ...base, year: undefined }, 2026)).toBeLessThan(recencyScore(recent, 2026));
  });
  it("gives a stale page image less of a head start", () => {
    const fresh = scoreCandidate({ ...base, year: 2022, fromPageImage: true }, "Ryan Gosling", undefined, 2026);
    const stale = scoreCandidate({ ...base, year: 2006, fromPageImage: true }, "Ryan Gosling", undefined, 2026);
    expect(fresh - scoreCandidate({ ...base, year: 2022 }, "Ryan Gosling", undefined, 2026)).toBe(6);
    expect(stale - scoreCandidate({ ...base, year: 2006 }, "Ryan Gosling", undefined, 2026)).toBe(3);
  });
  it("penalises sunglasses, hats and profile shots", () => {
    for (const title of ["File:Ryan Gosling in sunglasses.jpg", "File:Ryan Gosling wearing a hat.jpg", "File:Ryan Gosling profile.jpg"])
      expect(scoreCandidate({ ...base, title }, "Ryan Gosling")).toBeLessThan(scoreCandidate(base, "Ryan Gosling"));
  });
  it("prefers the Wikidata image and demotes search hits outside the person's category", () => {
    expect(scoreCandidate({ ...base, fromWikidata: true }, "Ryan Gosling")).toBeGreaterThan(scoreCandidate(base, "Ryan Gosling"));
    expect(scoreCandidate({ ...base, offCategory: true }, "Ryan Gosling")).toBeLessThan(scoreCandidate(base, "Ryan Gosling"));
  });
  it("reads years from file titles but not from Flickr ids", () => {
    expect(yearFromTitle("File:Ryan Gosling in 2018 (cropped).jpg")).toBe(2018);
    expect(yearFromTitle("File:Gosling (53388157347) (cropped).jpg")).toBeUndefined();
    expect(yearFromTitle("File:Gosling_BFI_081223.jpg")).toBeUndefined();
  });
  it("prefers cropped single portraits over group and action shots", () => {
    const group = { ...base, title: "File:Ryan Gosling and Emma Stone at premiere.jpg", width: 1600, height: 1000 };
    const action = { ...base, title: "File:Ryan Gosling performing live.jpg" };
    expect(scoreCandidate(base, "Ryan Gosling")).toBeGreaterThan(scoreCandidate(group, "Ryan Gosling"));
    expect(scoreCandidate(base, "Ryan Gosling")).toBeGreaterThan(scoreCandidate(action, "Ryan Gosling"));
  });
  it("strips HTML from author fields", () => {
    expect(stripHtml('<a href="x">Gage Skidmore</a> from Peoria, AZ')).toBe("Gage Skidmore from Peoria, AZ");
  });
});

describe("cli and overrides", () => {
  it("parses --only and --force", () => {
    expect(parseArgs(["--only", "Ryan Gosling, Drake", "--force"])).toMatchObject({ only: ["Ryan Gosling, Drake"], force: true });
    expect(parseArgs(["--only=Drake"]).only).toEqual(["Drake"]);
  });
  it("resolves --only names, including names with commas", () => {
    const names = ["Ryan Gosling", "Drake", "Tyler, the Creator"];
    expect(resolveOnly(["ryan gosling, Drake"], names)).toEqual({ names: ["Ryan Gosling", "Drake"], unknown: [] });
    expect(resolveOnly(["Drake,Tyler, the Creator"], names)).toEqual({ names: ["Drake", "Tyler, the Creator"], unknown: [] });
    expect(resolveOnly(["Drake, Nobody"], names)).toEqual({ names: ["Drake"], unknown: ["Nobody"] });
  });
  it("normalises override shapes", () => {
    expect(normalizeOverride("Foo_bar.jpg").file).toBe("File:Foo bar.jpg");
    expect(normalizeOverride({ reject: ["File:X.jpg"] })).toEqual({ file: undefined, reject: ["File:X.jpg"], drop: false, years: undefined });
    expect(normalizeOverride({ years: [2005, 2012] }).years).toEqual([2005, 2012]);
    expect(normalizeOverride({ drop: true }).drop).toBe(true);
  });
});
