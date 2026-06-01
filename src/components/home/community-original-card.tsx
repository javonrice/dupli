import { Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles, Layers } from "lucide-react";
import type { TrendingOriginal } from "@/lib/discover.functions";

type Variant = "card" | "tile";

function fmtPrice(p: number | null | undefined): string {
  if (p == null || p <= 0) return "—";
  return p < 10 ? `$${p.toFixed(2)}` : `$${Math.round(p)}`;
}

/** Routing: prefer the catalog product page when we have a real id;
 *  fall back to the save-driven community route by brand/product slug. */
function originalLinkProps(o: TrendingOriginal) {
  if (o.original.id) {
    return { to: "/p/$productId" as const, params: { productId: o.original.id } };
  }
  return {
    to: "/community/$brand/$product" as const,
    params: { brand: o.original.brandSlug, product: o.original.productSlug },
  };
}

/** Hub card: original product as the hero, with a summary of available dupes. */
export function CommunityOriginalCard({
  item,
  variant = "tile",
}: {
  item: TrendingOriginal;
  variant?: Variant;
}) {
  const compact = variant === "card";
  const widthClass = compact ? "w-[200px] shrink-0" : "w-full";
  const linkProps = originalLinkProps(item);
  const showSavings = item.maxSavingsPct != null && item.maxSavingsPct >= 25;

  const nameClass = compact
    ? "line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground"
    : "line-clamp-2 font-display text-[14px] font-semibold leading-tight text-foreground";

  return (
    <Link
      {...linkProps}
      className={`tap snap-start group flex ${widthClass} flex-col overflow-hidden rounded-[16px] border border-border bg-card text-left shadow-soft`}
    >
      {/* Hero image: the original product */}
      <div className="relative">
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-secondary/40">
          {item.original.imageUrl ? (
            <img
              src={item.original.imageUrl}
              alt={`${item.original.brand} ${item.original.productName}`}
              loading="lazy"
              className="h-full w-full object-contain p-3"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ShoppingBag className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
          )}
        </div>
        {showSavings && (
          <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-foreground shadow-soft">
            <Sparkles className="h-3 w-3" strokeWidth={2.75} />
            Save {item.maxSavingsPct}%
          </div>
        )}
      </div>

      {/* Brand · price (original price) */}
      <div className="space-y-1 px-3 pt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.original.brand}
          </div>
          {item.original.lowestPriceUsd != null && item.original.lowestPriceUsd > 0 && (
            <div className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {fmtPrice(item.original.lowestPriceUsd)}
            </div>
          )}
        </div>
        <div className={nameClass}>{item.original.productName}</div>
      </div>

      {/* Dupes summary */}
      <div className="mt-2 flex items-center gap-2 border-t border-border bg-secondary/40 px-3 py-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-foreground" strokeWidth={2.25} />
        <div className="min-w-0 flex-1 text-[11px] font-semibold leading-tight text-foreground">
          <span className="tabular-nums">{item.dupeCount}</span>{" "}
          {item.dupeCount === 1 ? "dupe" : "dupes"}
          {item.avgDupePriceUsd != null && (
            <>
              {" · "}
              <span className="font-medium text-muted-foreground">
                avg {fmtPrice(item.avgDupePriceUsd)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Tiny dupe thumbnail strip */}
      {item.dupes.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 pb-3 pt-2">
          {item.dupes.slice(0, 4).map((d, i) => (
            <div
              key={`${d.brandSlug}-${d.productSlug}-${i}`}
              className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[6px] border border-border bg-card"
              aria-hidden
            >
              {d.imageUrl ? (
                <img
                  src={d.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <ShoppingBag className="h-3 w-3 text-muted-foreground/60" strokeWidth={1.5} />
              )}
            </div>
          ))}
          {item.dupeCount > item.dupes.length && (
            <div className="text-[10px] font-semibold tabular-nums text-muted-foreground">
              +{item.dupeCount - item.dupes.length}
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
