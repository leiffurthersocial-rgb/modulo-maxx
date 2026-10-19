// Build slider steps. Swap `label` for a picture later without touching the scoring logic:
// scoring only reads `value`, a muscularity level where 0 = average,
// negative = less muscle than average, positive = more.

export interface Build {
  id: string;
  label: string;
  value: number;
}

export const BUILDS: Build[] = [
  { id: "skinny", label: "Skinny", value: -1 },
  { id: "slim", label: "Slim", value: -0.5 },
  { id: "average", label: "Average", value: 0 },
  { id: "fit", label: "Fit", value: 0.5 },
  { id: "athletic", label: "Athletic", value: 1 },
  { id: "muscular", label: "Muscular", value: 1.5 },
  { id: "very-muscular", label: "Very muscular", value: 2 },
];

export const DEFAULT_BUILD_ID = "average";

export function getBuild(id: string | undefined): Build {
  return BUILDS.find((b) => b.id === id) ?? BUILDS.find((b) => b.id === DEFAULT_BUILD_ID)!;
}
