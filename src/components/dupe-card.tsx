import type { DupeAnalysis } from "@/server/scan.functions";
import { Check, TrendingDown, AlertCircle, MapPin, ExternalLink, ShoppingBag } from "lucide-react";
import { resolveBuyLink, buildAlternateRetailerLinks, type RetailerLink } from "@/lib/retailer-links";

function priceTag(n: number) {
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

const verdictStyles: Record<DupeAnalysis["verdict"], { icon: typeof Check; bg: string; fg: string }> = {
  "Worth the hype": { icon: Check, bg: "bg-success", fg: "text-success-foreground" },
  Mixed: { icon: AlertCircle, bg: "bg-foreground", fg: "text-background" },
  Skip: { icon: AlertCircle, bg: "bg-destructive", fg: "text-destructive-foreground" },
  "No dupe found": { icon: AlertCircle, bg: "bg-muted-foreground", fg: "text-background" },
};

export function DupeCard({ analysis }: { analysis: DupeAnalysis }) {
  const { original, dupe, matchScore, verdict, notes, bestFor } = analysis;
  const v = verdictStyles[verdict];
  const Icon = v.icon;

  const savings =
    dupe && original.estimatedPriceUsd > 0
      ? Math.max(0, Math.round(((original.estimatedPriceUsd - dupe.estimatedPriceUsd) / original.estimatedPriceUsd) * 100))
      : 0;

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
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

      {/* Notes */}
      <div className="space-y-3 border-t border-border px-5 py-4">
        <p className="text-sm leading-relaxed text-foreground">{notes}</p>
        {dupe && (() => {
          const primary = resolveBuyLink({
            brand: dupe.brand,
            productName: dupe.productName,
            whereToBuy: dupe.whereToBuy,
            buyUrl: dupe.buyUrl,
          });
          const alternates = buildAlternateRetailerLinks({
            brand: dupe.brand,
            productName: dupe.productName,
            excludeLabel: primary.label,
          });
          return (
            <div className="space-y-2">
              <a
                href={primary.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90"
              >
                <MapPin className="h-3.5 w-3.5" />
                Buy at {primary.label}
                <ExternalLink className="h-3 w-3" />
              </a>
              {alternates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <ShoppingBag className="h-3 w-3" />
                    Also search
                  </span>
                  {alternates.map((alt: RetailerLink) => (
                    <a
                      key={alt.label}
                      href={alt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-secondary/60"
                    >
                      {alt.label}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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
  item: { brand: string; productName: string; category: string; estimatedPriceUsd: number };
  muted?: boolean;
}) {
  return (
    <div className={`p-5 ${muted ? "bg-background" : "bg-card"}`}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{item.brand}</div>
      <h3 className="mt-1 font-display text-base font-semibold leading-tight">{item.productName}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold">{priceTag(item.estimatedPriceUsd)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{item.category}</p>
    </div>
  );
}
