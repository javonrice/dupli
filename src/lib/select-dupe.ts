import type { DupeAnalysis } from "@/server/scan.functions";

/**
 * Returns a copy of the analysis with the selected candidate promoted to the
 * headline `dupe` (and the top-level mirrored fields synced). Used by the
 * results screen and the share page so both stay consistent when the user
 * picks an alternate from the "Also could be a dupe" rail.
 */
export function selectDupe(analysis: DupeAnalysis, idx: number): DupeAnalysis {
  const candidates = analysis.dupes ?? (analysis.dupe ? [analysis.dupe] : []);
  if (candidates.length === 0) return analysis;
  const safeIdx = Math.min(Math.max(0, idx), candidates.length - 1);
  if (safeIdx === 0 && analysis.dupe === candidates[0]) return analysis;
  const c = candidates[safeIdx];

  // Recompute framing + savings for this specific candidate so the hero
  // headline ("X% cheaper" / "Save X%") and price subtitle stay accurate
  // when the user picks an alternate.
  const originalPrice = analysis.original.estimatedPriceUsd;
  const dupePrice = c.estimatedPriceUsd;
  let framing: DupeAnalysis["framing"] = analysis.framing ?? "classic-dupe";
  let savingsPct = 0;
  if (originalPrice > 0 && dupePrice > 0) {
    if (dupePrice > originalPrice) {
      // Scanned item is the cheap one — the alternate is the pricier name brand.
      framing = "steal-find";
      savingsPct = Math.max(0, Math.round(((dupePrice - originalPrice) / dupePrice) * 100));
    } else {
      framing = "classic-dupe";
      savingsPct = Math.max(0, Math.round(((originalPrice - dupePrice) / originalPrice) * 100));
    }
  }

  return {
    ...analysis,
    dupe: c,
    matchScore: typeof c.matchScore === "number" ? c.matchScore : analysis.matchScore,
    sharedIngredients: c.sharedIngredients ?? analysis.sharedIngredients,
    uniqueToOriginal: c.uniqueToOriginal ?? analysis.uniqueToOriginal,
    uniqueToDupe: c.uniqueToDupe ?? analysis.uniqueToDupe,
    contextMatch: c.contextMatch ?? analysis.contextMatch,
    dupeType: c.dupeType ?? analysis.dupeType,
    packagingSimilarity:
      typeof c.packagingSimilarity === "number"
        ? c.packagingSimilarity
        : analysis.packagingSimilarity,
    riskLevel: c.riskLevel ?? analysis.riskLevel,
    riskFactors: c.riskFactors ?? analysis.riskFactors,
    missingActives: c.missingActives ?? analysis.missingActives,
    safetyNote: c.safetyNote ?? analysis.safetyNote,
    notes: c.notes && c.notes.trim() ? c.notes : analysis.notes,
    framing,
    savingsPct,
  };
}
