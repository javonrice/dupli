import type { DupeAnalysis } from "@/server/scan.functions";
import { Check, TrendingDown, AlertCircle, Sparkles, AlertTriangle, ShieldCheck, Eye } from "lucide-react";
import wordmark from "@/assets/dupli-wordmark.png";

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
  // Older saved scans may not have framing/savingsPct — fall back to classic.
  const framing = analysis.framing ?? "classic-dupe";
  const isSteal = framing === "steal-find";
  const v = verdictStyles[verdict];
  const Icon = v.icon;

  const fallbackSavings =
    dupe && original.estimatedPriceUsd > 0
      ? Math.max(0, Math.round(((original.estimatedPriceUsd - dupe.estimatedPriceUsd) / original.estimatedPriceUsd) * 100))
      : 0;
  const savings = analysis.savingsPct ?? fallbackSavings;

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
      {/* Lookalike band (risk chip moved to header) */}
      {showLookalikeBand && ((dupeType && dupeType !== "Neither") || (typeof packagingSimilarity === "number" && packagingSimilarity > 0)) && (
        <div className={`flex items-center gap-2 px-5 py-2.5 ${riskLevel === "Higher risk" ? "bg-warning-soft" : riskLevel === "Lower risk" ? "bg-success-soft" : "bg-secondary/40"}`}>
          <Eye className="h-3.5 w-3.5 shrink-0 text-foreground/70" strokeWidth={2.25} />
          <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-foreground">
            {isSteal && dupeType === "Lookalike packaging" && "Caught a lookalike — "}
            {dupeType ?? "Dupe"}
            {typeof packagingSimilarity === "number" && packagingSimilarity > 0 && (
              <span className="ml-1.5 font-bold tabular-nums">· {packagingSimilarity}% visual</span>
            )}
          </span>
        </div>
      )}

      {/* Hero header — mirrors share card */}
      <header className="bg-gradient-to-br from-secondary/50 to-card px-5 pt-4 pb-6">
        <div className="flex items-center justify-between gap-2">
          <img src={wordmark} alt="Dupli" className="h-6 w-auto" width={887} height={414} />
          <div className="flex items-center gap-1.5">
            {riskLevel && (
              <div className={`inline-flex shrink-0 items-center gap-1 rounded-full border-2 bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                riskLevel === "Higher risk" ? "border-warning text-warning" :
                riskLevel === "Lower risk" ? "border-success text-success" :
                "border-foreground text-foreground"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  riskLevel === "Higher risk" ? "bg-warning" :
                  riskLevel === "Lower risk" ? "bg-success" :
                  "bg-foreground"
                }`} />
                Risk: {riskLevel.replace(" risk", "")}
              </div>
            )}
            <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${v.bg} ${v.fg}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />
              {verdict}
            </div>
          </div>
        </div>

        {dupe && savings > 0 && (
          <div className="mt-4">
            <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] ${isSteal ? "text-success" : "text-muted-foreground"}`}>
              {isSteal && <Sparkles className="h-3 w-3" strokeWidth={2.5} />}
              {isSteal ? "You found a steal" : "We found the dupe"}
            </div>
            <div className="mt-1.5 font-display text-5xl font-extrabold leading-none tracking-tight text-foreground">
              {isSteal ? `${savings}% cheaper` : `Save ${savings}%`}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {isSteal ? (
                <>
                  <span className="font-bold text-foreground">{priceTag(original.estimatedPriceUsd)}</span>
                  {" vs "}{priceTag(dupe.estimatedPriceUsd)} name brand
                </>
              ) : (
                <>
                  {priceTag(original.estimatedPriceUsd)} →{" "}
                  <span className="font-bold text-foreground">{priceTag(dupe.estimatedPriceUsd)}</span>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Pair grid — share-card style cards */}
      {dupe ? (
        <div className="grid grid-cols-2 gap-3 px-3 pb-4">
          <ProductSide
            label={isSteal ? "You scanned" : "Original"}
            item={original}
            accent={isSteal}
          />
          <ProductSide
            label={isSteal ? "What it dupes" : "The dupe"}
            item={dupe}
            accent={!isSteal}
          />
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
  accent = false,
}: {
  label: string;
  item: {
    brand: string;
    productName: string;
    category: string;
    estimatedPriceUsd: number;
    imageUrl?: string;
    links?: { merchant: string; url: string; priceUsd: number | null }[];
  };
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-2xl bg-background p-3 shadow-sm ${
        accent ? "border-2 border-foreground" : "border border-border"
      }`}
    >
      <div
        className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${
          accent ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="mb-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-secondary/40">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={`${item.brand} ${item.productName}`}
            loading="lazy"
            className="h-full w-full object-contain p-1.5"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="text-3xl text-muted-foreground/40">·</div>
        )}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {item.brand}
      </div>
      <h3 className="mt-0.5 line-clamp-2 font-display text-sm font-semibold leading-tight">
        {item.productName}
      </h3>
      <div className="mt-auto pt-2 font-display text-2xl font-extrabold tracking-tight">
        {priceTag(item.estimatedPriceUsd)}
      </div>
      {item.links && item.links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.links.slice(0, 2).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-foreground hover:bg-secondary"
            >
              {link.merchant}
              {link.priceUsd != null && (
                <span className="tabular-nums text-muted-foreground">
                  · ${link.priceUsd.toFixed(2)}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
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
