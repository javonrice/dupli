export type CatalogItem = {
  id: string;
  brand: string;
  name: string;
  category: string;
  priceUsd: number;
  imageHint: string;
  keyIngredients: string[];
};

export type DupePair = {
  id: string;
  original: CatalogItem;
  dupe: CatalogItem;
  matchScore: number; // 0-100 ingredient similarity
  estheticianVerdict: "Worth the hype" | "Mixed" | "Skip";
  notes: string;
  bestFor: string[];
  // search aliases used for matching scanned products
  aliases: string[];
};

export const dupes: DupePair[] = [
  {
    id: "hydra-serum",
    matchScore: 94,
    estheticianVerdict: "Worth the hype",
    notes:
      "Ingredient lists are shockingly close. A great anti-aging hydrating serum at a fraction of the price.",
    bestFor: ["Anti-aging", "Hydration", "Dry skin"],
    aliases: ["hydra serum", "hydrating serum", "summer fridays hydrating serum", "jet lag serum"],
    original: {
      id: "sf-hydrating-serum",
      brand: "Summer Fridays",
      name: "Dream Lip Hydrating Serum",
      category: "Serum",
      priceUsd: 44,
      imageHint: "blue serum bottle",
      keyIngredients: ["Hyaluronic Acid", "Peptides", "Glycerin", "Niacinamide"],
    },
    dupe: {
      id: "dt-hydra-serum",
      brand: "Dermasil",
      name: "Hydra Serum — Jet-Set-Reset",
      category: "Serum",
      priceUsd: 1.25,
      imageHint: "blue dermasil serum",
      keyIngredients: ["Hyaluronic Acid", "Peptides", "Glycerin", "Niacinamide"],
    },
  },
  {
    id: "hydra-mist",
    matchScore: 91,
    estheticianVerdict: "Worth the hype",
    notes:
      "Actually preferred over the original — fewer comedogenic ingredients while delivering the same dewy, soothing finish.",
    bestFor: ["Dewy skin", "Soothing", "Acne-prone"],
    aliases: ["hydration mist", "hydra mist", "jet lag hydration mist", "summer fridays mist"],
    original: {
      id: "sf-hydration-mist",
      brand: "Summer Fridays",
      name: "Jet Lag Skin Soothing Hydration Mist",
      category: "Face Mist",
      priceUsd: 28,
      imageHint: "tall blue mist bottle",
      keyIngredients: ["Hyaluronic Acid", "Niacinamide", "Polyglutamic Acid", "Aloe"],
    },
    dupe: {
      id: "dt-hydra-mist",
      brand: "Dermasil",
      name: "Hydra Mist — Jet-Set-Reset",
      category: "Face Mist",
      priceUsd: 1.25,
      imageHint: "blue mist bottle white cap",
      keyIngredients: ["Hyaluronic Acid", "Niacinamide", "Aloe", "Glycerin"],
    },
  },
  {
    id: "moisture-lock",
    matchScore: 86,
    estheticianVerdict: "Worth the hype",
    notes:
      "Not quite as potent as the original, but still excellent for an impaired moisture barrier or persistent redness.",
    bestFor: ["Barrier repair", "Redness", "Overnight mask"],
    aliases: ["moisture lock", "jet lag mask", "summer fridays jet lag mask", "overnight mask"],
    original: {
      id: "sf-jet-lag-mask",
      brand: "Summer Fridays",
      name: "Jet Lag Mask",
      category: "Mask / Moisturizer",
      priceUsd: 49,
      imageHint: "blue squeeze tube",
      keyIngredients: ["Niacinamide", "Vitamin E", "Glycerin", "Ceramides"],
    },
    dupe: {
      id: "dt-moisture-lock",
      brand: "Dermasil",
      name: "Moisture Lock — Jet-Set-Reset",
      category: "Mask / Moisturizer",
      priceUsd: 1.25,
      imageHint: "blue tube white cap",
      keyIngredients: ["Niacinamide", "Vitamin E", "Glycerin", "Shea Butter"],
    },
  },
  {
    id: "anti-baggage",
    matchScore: 89,
    estheticianVerdict: "Worth the hype",
    notes:
      "Very similar formula to the original. Targets puffiness and under-eye bags effectively overnight.",
    bestFor: ["Puffiness", "Under-eye bags", "Overnight"],
    aliases: ["anti baggage", "eye serum", "jet lag eye serum", "overnight eye serum"],
    original: {
      id: "sf-eye-serum",
      brand: "Summer Fridays",
      name: "Jet Lag Overnight Eye Serum",
      category: "Eye Serum",
      priceUsd: 38,
      imageHint: "small blue tube nozzle",
      keyIngredients: ["Caffeine", "Peptides", "Niacinamide", "Hyaluronic Acid"],
    },
    dupe: {
      id: "dt-anti-baggage",
      brand: "Dermasil",
      name: "Anti-Baggage — Jet-Set-Reset",
      category: "Eye Serum",
      priceUsd: 1.25,
      imageHint: "small blue tube",
      keyIngredients: ["Caffeine", "Peptides", "Niacinamide", "Hyaluronic Acid"],
    },
  },
];

export function findDupeByAlias(query: string): DupePair | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  for (const d of dupes) {
    if (d.aliases.some((a) => q.includes(a) || a.includes(q))) return d;
    if (q.includes(d.original.name.toLowerCase()) || q.includes(d.dupe.name.toLowerCase())) return d;
  }
  return null;
}
