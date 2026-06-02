import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Goal = "save" | "luxury" | "smarter" | "impulse";
export type AgeBand = "18-24" | "25-29" | "30-34" | "35+";
export type Pain = "overpay" | "fomo" | "unsure" | "subscription";

export type OnboardingAnswers = {
  goals: Goal[];
  ageBand: AgeBand | null;
  monthlySpend: number; // dollars
  painPoint: Pain | null;
  categories: string[];
  brands: string[];
  committed: boolean;
};

type OnboardingState = OnboardingAnswers & {
  setAnswers: (patch: Partial<OnboardingAnswers>) => void;
  toggle: <K extends "goals" | "categories" | "brands">(
    key: K,
    value: string,
  ) => void;
  reset: () => void;
};

const initial: OnboardingAnswers = {
  goals: [],
  ageBand: null,
  monthlySpend: 120,
  painPoint: null,
  categories: [],
  brands: [],
  committed: false,
};

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      setAnswers: (patch) => set((s) => ({ ...s, ...patch })),
      toggle: (key, value) =>
        set((s) => {
          const arr = s[key] as string[];
          const next = arr.includes(value)
            ? arr.filter((v) => v !== value)
            : [...arr, value];
          return { ...s, [key]: next } as Partial<OnboardingState>;
        }),
      reset: () => set({ ...initial }),
    }),
    { name: "dupli-onboarding" },
  ),
);

/**
 * Loss-aversion framing: monthly spend × 12 × estimated overpay ratio.
 * Overpay ratio increases when user picks "luxury" goal or premium brands.
 */
export function projectedAnnualSavings(a: OnboardingAnswers): number {
  const baseRatio = a.goals.includes("luxury") ? 0.6 : 0.45;
  const brandBoost = Math.min(a.brands.length * 0.02, 0.15);
  const annual = Math.round(a.monthlySpend * 12 * (baseRatio + brandBoost));
  // round to nearest $50, min $480
  return Math.max(480, Math.round(annual / 50) * 50);
}

/**
 * Identity framing: pick a "Dupe Style" from their categories + goals.
 */
export function dupeStyleFor(a: OnboardingAnswers): string {
  const c = new Set(a.categories);
  if (c.has("Skincare") && a.goals.includes("luxury")) return "Luxury Minimalist";
  if (c.has("Makeup") && c.has("Fragrance")) return "Glam Strategist";
  if (c.has("Fashion")) return "Quiet Luxury Curator";
  if (c.has("Tech") || c.has("Home")) return "Smart Spender";
  if (a.goals.includes("impulse")) return "Mindful Maximalist";
  return "Savvy Saver";
}
