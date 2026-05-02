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
  };
}
