import celebData from "@data/celebs.json";
import imageData from "@data/celeb-images.json";
import type { Celeb } from "./engine";
import { slugify } from "./slug";

export interface CelebImage {
  name: string;
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  width: number;
  height: number;
  year?: number;
}

export interface BankCeleb extends Celeb {
  image?: CelebImage;
}

const images = imageData as Record<string, CelebImage>;

export const HAS_IMAGES = Object.keys(images).length > 0;

const all: BankCeleb[] = celebData.celebs.map((c) => {
  const id = slugify(c.name);
  return { id, name: c.name, rating: c.rating, category: c.category, image: images[id] };
});

/**
 * The rating bank. Once images have been fetched, celebs without a usable image are dropped.
 * Before that (fresh checkout), everyone stays in and the UI shows a name card instead.
 */
export const BANK: BankCeleb[] = HAS_IMAGES ? all.filter((c) => c.image) : all;

const byId = new Map(BANK.map((c) => [c.id, c]));

export function getCeleb(id: string): BankCeleb | undefined {
  return byId.get(id);
}

export function imageCredits(): CelebImage[] {
  return Object.values(images).sort((a, b) => a.name.localeCompare(b.name));
}
