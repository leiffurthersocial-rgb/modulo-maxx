import { describe, expect, it } from "vitest";
import { isFreeLicense, normalizeOverride, parseArgs, parseYear, rejectReason, scoreCandidate, stripHtml, type Candidate } from "./image-utils";

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
  it("rejects low-res, old, non-free and art", () => {
    expect(rejectReason(base, 2026)).toBeNull();
    expect(rejectReason({ ...base, width: 300 }, 2026)).toBe("lowres");
    expect(rejectReason({ ...base, year: 2009 }, 2026)).toBe("old");
    expect(rejectReason({ ...base, year: 2009 }, 2026, { ignoreAge: true })).toBeNull();
    expect(rejectReason({ ...base, license: "CC BY-NC 2.0" }, 2026)).toBe("license");
    expect(rejectReason({ ...base, categories: "Caricatures of actors" }, 2026)).toBe("art");
  });
  it("prefers cropped single portraits over group and action shots", () => {
    const group = { ...base, title: "File:Ryan Gosling and Emma Stone at premiere.jpg", width: 1600, height: 1000 };
    const action = { ...base, title: "File:Ryan Gosling performing live.jpg" };
    expect(scoreCandidate(base, "Ryan Gosling", 2026)).toBeGreaterThan(scoreCandidate(group, "Ryan Gosling", 2026));
    expect(scoreCandidate(base, "Ryan Gosling", 2026)).toBeGreaterThan(scoreCandidate(action, "Ryan Gosling", 2026));
  });
  it("strips HTML from author fields", () => {
    expect(stripHtml('<a href="x">Gage Skidmore</a> from Peoria, AZ')).toBe("Gage Skidmore from Peoria, AZ");
  });
});

describe("cli and overrides", () => {
  it("parses --only and --force", () => {
    expect(parseArgs(["--only", "Ryan Gosling, Drake", "--force"])).toMatchObject({ only: ["Ryan Gosling", "Drake"], force: true });
    expect(parseArgs(["--only=Drake"]).only).toEqual(["Drake"]);
  });
  it("normalises override shapes", () => {
    expect(normalizeOverride("Foo_bar.jpg").file).toBe("File:Foo bar.jpg");
    expect(normalizeOverride({ reject: ["File:X.jpg"] })).toEqual({ file: undefined, reject: ["File:X.jpg"], drop: false });
    expect(normalizeOverride({ drop: true }).drop).toBe(true);
  });
});
