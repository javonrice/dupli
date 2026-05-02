import type { DupeAnalysis } from "@/server/scan.functions";
import { Check, TrendingDown, AlertCircle, Sparkles, AlertTriangle, ShieldCheck, Eye } from "lucide-react";

function priceTag(n: number) {
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

const verdictStyles: Record<DupeAnalysis["verdict"], { icon: typeof Check; bg: string; fg: string }> = {
  "Worth the hype": { icon: Check, bg: "bg-success", fg: "text-success-foreground" },
  Mixed: { icon: AlertCircle, bg: "bg-foreground", fg: "text-background" },
  "Risky dupe": { icon: AlertTriangle, bg: "bg-warning", fg: "text-warning-foreground" },
  Skip: { icon: AlertCircle, bg: "bg-destructive", fg: "text-destructive-foreground" },
  "No dupe found": { icon: AlertCircle, bg: "bg-muted-foreground", fg: "text-background" },
};

export function DupeCard({ analysis }: { analysis: DupeAnalysis }) {
  const {
    original, dupe, matchScore, verdict, notes, bestFor,
    sharedIngredients, uniqueToOriginal, uniqueToDupe, contextMatch,
    dupeType, packagingSimilarity, riskLevel, riskFactors, missingActives, safetyNote,
  } = analysis;
  const v = verdictStyles[verdict];
  const Icon = v.icon;

  const savings =
    dupe && original.estimatedPriceUsd > 0 && dupe.estimatedPriceUsd > 0 && dupe.estimatedPriceUsd < original.estimatedPriceUsd
      ? Math.round(((original.estimatedPriceUsd - dupe.estimatedPriceUsd) / original.estimatedPriceUsd) * 100)
      : 0;

  const showLookalikeBand =
    !!dupe && (
      (dupeType && dupeType !== "Neither") ||
      (typeof packagingSimilarity === "number" && packagingSimilarity > 0) ||
      (riskLevel && riskLevel !== "Comparable")
    );

  const riskTone =
    riskLevel === "Higher risk"
      ? { bg: "bg-warning-soft", fg: "text-foreground", chipBg: "bg-warning", chipFg: "text-warning-foreground", Icon: AlertTriangle }
      : riskLevel === "Lower risk"
        ? { bg: "bg-success-soft", fg: "text-foreground", chipBg: "bg-success", chipFg: "text-success-foreground", Icon: ShieldCheck }
        : { bg: "bg-secondary/40", fg: "text-foreground", chipBg: "bg-foreground", chipFg: "text-background", Icon: ShieldCheck };

  const showRiskPanel =
    !!dupe && (!!riskLevel || (riskFactors && riskFactors.length > 0) || (missingActives && missingActives.length > 0) || !!safetyNote);

  return (
    <article className="overflow-hidden rounded-[20px] border border-border bg-card shadow-soft">
      {/* Lookalike + risk band */}
      {showLookalikeBand && (
        <div className={`flex items-center justify-between gap-3 px-5 py-2.5 ${riskLevel === "Higher risk" ? "bg-warning-soft" : riskLevel === "Lower risk" ? "bg-success-soft" : "bg-secondary/40"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <Eye className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.25} />
            <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-foreground">
              {dupeType ?? "Dupe"}
              {typeof packagingSimilarity === "number" && packagingSimilarity > 0 && (
                <span className="ml-1.5 font-bold tabular-nums">· {packagingSimilarity}% visual</span>
              )}
            </span>
          </div>
          {riskLevel && (
            <div className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${riskTone.chipBg} ${riskTone.chipFg}`}>
              <riskTone.Icon className="h-3 w-3" strokeWidth={2.5} />
              {riskLevel}
            </div>
          )}
        </div>
      )}
      {/* Verdict bar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${v.bg} ${v.fg}`}>
            <Icon className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground">{verdict}</span>
        </div>
        {dupe && savings > 0 && (
          <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
            <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
            Save {savings}%
          </div>
        )}
      </div>

      {/* Pair grid */}
      {dupe ? (
        <div className="grid grid-cols-2 divide-x divide-border">
          <ProductSide label="Original" item={original} muted />
          <ProductSide label="The dupe" item={dupe} />
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="font-display text-base font-semibold">No credible dupe found yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We couldn't confidently match this product to an affordable alternative.
          </p>
        </div>
      )}

      {/* Match meter */}
      {dupe && (
        <div className="space-y-2 border-t border-border px-5 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ingredient match
            </span>
            <span className="font-display text-2xl font-bold tabular-nums">{matchScore}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${matchScore}%` }} />
          </div>
        </div>
      )}

      {/* Formula breakdown */}
      {dupe &&
        ((sharedIngredients?.length ?? 0) +
          (uniqueToOriginal?.length ?? 0) +
          (uniqueToDupe?.length ?? 0) > 0 ||
          !!contextMatch) && (
          <div className="space-y-4 border-t border-border bg-secondary/30 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Formula breakdown
            </div>

            {contextMatch && (
              <p className="flex items-start gap-2 text-xs italic leading-relaxed text-muted-foreground">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
                <span>{contextMatch}</span>
              </p>
            )}

            {sharedIngredients && sharedIngredients.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-success" strokeWidth={3} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                    In both
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sharedIngredients.map((i) => (
                    <span
                      key={i}
                      className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background"
                    >
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {((uniqueToOriginal?.length ?? 0) > 0 || (uniqueToDupe?.length ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-4">
                <UniqueColumn label="Only in original" items={uniqueToOriginal ?? []} />
                <UniqueColumn label="Only in dupe" items={uniqueToDupe ?? []} />
              </div>
            )}
          </div>
        )}

      {/* Risk check */}
      {showRiskPanel && (
        <div className={`space-y-3 border-t border-border px-5 py-4 ${riskTone.bg}`}>
          <div className="flex items-center gap-1.5">
            <riskTone.Icon className="h-3.5 w-3.5 text-foreground" strokeWidth={2.5} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground">
              Risk check
            </span>
          </div>

          {riskFactors && riskFactors.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Concerns in the dupe
              </div>
              <div className="flex flex-wrap gap-1.5">
                {riskFactors.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    <AlertTriangle className="h-3 w-3 text-warning" strokeWidth={2.5} />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingActives && missingActives.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                What you give up
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingActives.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {safetyNote && (
            <p className="text-xs italic leading-relaxed text-foreground/85">
              "{safetyNote}"
            </p>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-3 border-t border-border px-5 py-4">
        <p className="text-sm leading-relaxed text-foreground">{notes}</p>
        {bestFor.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bestFor.map((b) => (
              <span
                key={b}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ProductSide({
  label,
  item,
  muted = false,
}: {
  label: string;
  item: { brand: string; productName: string; category: string; estimatedPriceUsd: number; imageUrl?: string };
  muted?: boolean;
}) {
  return (
    <div className={`p-5 ${muted ? "bg-background" : "bg-card"}`}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      {item.imageUrl && (
        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/40">
          <img
            src={item.imageUrl}
            alt={`${item.brand} ${item.productName}`}
            loading="lazy"
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{item.brand}</div>
      <h3 className="mt-1 font-display text-base font-semibold leading-tight">{item.productName}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold">{priceTag(item.estimatedPriceUsd)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{item.category}</p>
    </div>
  );
}

function UniqueColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] italic text-muted-foreground/70">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground"
            >
              {i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
