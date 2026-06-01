import { Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles } from "lucide-react";
import type { CommunityDupe } from "@/lib/discover.functions";

type Variant = "card" | "tile";

/** Save-sourced cards encode `saved:<pair_key>:<scanId>` in their id and link
 *  to the public scan view; catalog cards link to the product page as before. */
function dupeLinkProps(dupe: CommunityDupe) {
  if (dupe.id.startsWith("saved:")) {
    const scanId = dupe.id.split(":")[2] ?? "";
    return { to: "/scan/$id" as const, params: { id: scanId } };
  }
  return { to: "/p/$productId" as const, params: { productId: dupe.dupe.id } };
}

/** Steal detection — same 25% buffer rule as the scanner. */
function detectSteal(dupe: CommunityDupe): number | null {
  const op = dupe.original.lowestPriceUsd;
  const dp = dupe.dupe.lowestPriceUsd;
  if (op == null || dp == null || op <= 0 || dp <= 0) return null;
  if (op > dp * 1.25) {
    return Math.round(((op - dp) / op) * 100);
  }
  return null;
}

function fmtPrice(p: number | null | undefined): string {
  if (p == null || p <= 0) return "—";
  return p < 10 ? `$${p.toFixed(2)}` : `$${Math.round(p)}`;
}

/** Side-by-side comparison: original on the left, dupe on the right.
 *  Equal-weight columns so the swap is unambiguous. */
export function CommunityDupeCard({
  dupe,
  variant = "tile",
}: {
  dupe: CommunityDupe;
  variant?: Variant;
}) {
  const compact = variant === "card";
  const widthClass = compact ? "w-[220px] shrink-0" : "w-full";
  const linkProps = dupeLinkProps(dupe);
  const stealPct = detectSteal(dupe);

  const nameClass = compact
    ? "line-clamp-2 font-display text-[12px] font-semibold leading-tight text-foreground"
    : "line-clamp-2 font-display text-[14px] font-semibold leading-tight text-foreground";
  const brandClass = compact
    ? "truncate text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
    : "truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
  const priceBaseClass = compact
    ? "font-display text-[13px] tabular-nums"
    : "font-display text-[16px] tabular-nums";

  return (
    <Link
      {...linkProps}
      className={`tap snap-start group flex ${widthClass} flex-col overflow-hidden rounded-[16px] border border-border bg-card text-left shadow-soft`}
    >
      {/* Image row — two equal squares with a vs pill between */}
      <div className="relative grid grid-cols-2">
        <div className="relative border-r border-border">
          <ImageBox src={dupe.original.imageUrl} alt={dupe.original.productName} />
          <div className="absolute left-1.5 top-1.5 rounded-full bg-background/85 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted-foreground backdrop-blur">
            Original
          </div>
        </div>
        <div className="relative">
          <ImageBox src={dupe.dupe.imageUrl} alt={dupe.dupe.productName} />
          <div className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-background">
            Dupe
          </div>
          {stealPct != null && (
            <div className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-success px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success-foreground shadow-soft">
              <Sparkles className="h-2.5 w-2.5" strokeWidth={2.75} />
              {stealPct}% off
            </div>
          )}
        </div>
        {/* vs pill on the divider */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground shadow-soft">
            vs
          </div>
        </div>
      </div>

      {/* Text row — equal columns, vertical divider mirrors the image split */}
      <div className="grid grid-cols-2 px-3 pb-2.5 pt-2.5">
        <div className="space-y-0.5 border-r border-border pr-2.5">
          <div className={brandClass}>{dupe.original.brand}</div>
          <div className={nameClass}>{dupe.original.productName}</div>
          <div className={`${priceBaseClass} pt-0.5 font-semibold text-muted-foreground`}>
            {fmtPrice(dupe.original.lowestPriceUsd)}
          </div>
        </div>
        <div className="space-y-0.5 pl-2.5">
          <div className={brandClass}>{dupe.dupe.brand}</div>
          <div className={nameClass}>{dupe.dupe.productName}</div>
          <div className={`${priceBaseClass} pt-0.5 font-bold text-foreground`}>
            {fmtPrice(dupe.dupe.lowestPriceUsd)}
          </div>
        </div>
      </div>

      {/* Match-% bottom band */}
      <div className="flex items-center justify-center border-t border-border bg-secondary/40 px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest tabular-nums text-foreground">
          {dupe.overallMatch}% match
        </span>
      </div>
    </Link>
  );
}

function ImageBox({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="flex aspect-square h-full w-full items-center justify-center overflow-hidden bg-secondary/40">
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain p-2"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <ShoppingBag className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
      )}
    </div>
  );
}
