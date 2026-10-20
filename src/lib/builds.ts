import buildPhotoData from "@data/build-photo-credits.json";

// Body types for the subject form. Scoring reads `muscle` and `fat`; `shape` only drives the
// picture (see BodyFigure).
//
//   muscle: 0 = average, negative = less muscle than average, positive = more (bodybuilder 2.5)
//   fat:    0 = average for the weight, positive = softer / carries more of it as fat

export interface BodyShape {
  /** Half-widths in a 100-wide viewBox. */
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  /** Extra outward curve at the stomach. */
  belly: number;
  arm: number;
  leg: number;
  neck: number;
}

export interface Build {
  id: string;
  label: string;
  muscle: number;
  fat: number;
  shape: BodyShape;
}

// Ids "fit" and "very-muscular" are kept from the old slider so saved sessions still load.
export const BUILDS: Build[] = [
  { id: "skinny", label: "Skinny", muscle: -1, fat: 0, shape: { shoulder: 19, chest: 14, waist: 11.5, hip: 13, belly: 0, arm: 4.5, leg: 7.5, neck: 4 } },
  { id: "slim", label: "Slim", muscle: -0.5, fat: 0, shape: { shoulder: 21, chest: 16, waist: 13.5, hip: 14.5, belly: 0, arm: 5.5, leg: 8.5, neck: 4.5 } },
  { id: "fit", label: "Lean", muscle: 0.5, fat: 0, shape: { shoulder: 24, chest: 19.5, waist: 14.5, hip: 15.5, belly: 0, arm: 7, leg: 9.5, neck: 5 } },
  { id: "average", label: "Average", muscle: 0, fat: 0, shape: { shoulder: 23, chest: 19.5, waist: 17.5, hip: 17, belly: 1, arm: 7, leg: 10.5, neck: 5 } },
  { id: "athletic", label: "Athletic", muscle: 1, fat: 0, shape: { shoulder: 27, chest: 23, waist: 15.5, hip: 16.5, belly: 0, arm: 8.5, leg: 11, neck: 6 } },
  { id: "muscular", label: "Muscular", muscle: 1.5, fat: 0, shape: { shoulder: 30, chest: 26, waist: 17, hip: 17.5, belly: 0, arm: 11, leg: 12.5, neck: 7 } },
  { id: "very-muscular", label: "Bodybuilder", muscle: 2.5, fat: 0, shape: { shoulder: 34, chest: 30, waist: 19, hip: 18.5, belly: 0, arm: 13.5, leg: 14.5, neck: 8.5 } },
  { id: "soft", label: "Soft", muscle: 0, fat: 1, shape: { shoulder: 23, chest: 21.5, waist: 20.5, hip: 19.5, belly: 4, arm: 8, leg: 11.5, neck: 5.5 } },
  { id: "stocky", label: "Stocky", muscle: 0.75, fat: 1, shape: { shoulder: 28, chest: 26, waist: 22.5, hip: 20.5, belly: 3, arm: 10, leg: 13, neck: 7 } },
  { id: "heavy", label: "Heavy", muscle: 0, fat: 2, shape: { shoulder: 27, chest: 27, waist: 26.5, hip: 24, belly: 7, arm: 11, leg: 15, neck: 7 } },
];

export const DEFAULT_BUILD_ID = "average";

export interface BuildPhoto {
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
}

/** Torso photos for some body types (scripts/fetch-build-photos.ts); the rest use a drawn figure. */
export const BUILD_PHOTOS = buildPhotoData as Record<string, BuildPhoto>;

export function getBuild(id: string | undefined): Build {
  return BUILDS.find((b) => b.id === id) ?? BUILDS.find((b) => b.id === DEFAULT_BUILD_ID)!;
}
