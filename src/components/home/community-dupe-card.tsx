import { Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles } from "lucide-react";
import type { CommunityDupe } from "@/server/discover.functions";

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

/** Steal detection — same 25% buffer rule as the scanner. Returns the savings %
 *  when the dupe (cheap side) is meaningfully cheaper than the original. */
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

/** A community-sourced dupe pairing rendered as a tappable card.
 *  Layout: dupe is the hero (image + brand + name + price), the original is
 *  shown as a small footer reference so the comparison is unambiguous. */
export function CommunityDupeCard({
  dupe,
  variant = "tile",
}: {
  dupe: CommunityDupe;
  variant?: Variant;
}) {
  const widthClass = variant === "card" ? "w-[200px] shrink-0" : "w-full";
  const linkProps = dupeLinkProps(dupe);
  const stealPct = detectSteal(dupe);
  return (
    <Link
      {...linkProps}
      className={`tap snap-start group flex ${widthClass} flex-col overflow-hidden rounded-[16px] border border-border bg-card text-left shadow-soft`}
    >
      {/* Hero: the dupe — what the user actually buys */}
      <div className="relative">
        <ImageBox src={dupe.dupe.imageUrl} alt={dupe.dupe.productName} rounded={false} aspect="square" />
        {stealPct != null && (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-foreground shadow-soft">
            <Sparkles className="h-3 w-3" strokeWidth={2.75} />
            Steal · {stealPct}% off
          </div>
        )}
      </div>

      {/* Match-% divider pill */}
      <div className="flex items-center justify-center border-y border-border bg-secondary/40 px-3 py-1">
        <span className="text-[10px] font-bold uppercase tracking-widest tabular-nums text-foreground">
          {dupe.overallMatch}% match
        </span>
      </div>

      {/* Dupe identity + price */}
      <div className="space-y-1 px-3 pt-2.5">
        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {dupe.dupe.brand}
        </div>
        <div className="line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground">
          {dupe.dupe.productName}
        </div>
        <div className="pt-0.5 font-display text-[16px] font-bold tabular-nums text-foreground">
          {fmtPrice(dupe.dupe.lowestPriceUsd)}
        </div>
      </div>

      {/* Original as small reference footer */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-border bg-secondary/30 px-3 py-2">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[6px] border border-border bg-card">
          <ImageBox src={dupe.original.imageUrl} alt={dupe.original.productName} rounded={false} aspect="square" iconSize="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
            dupe for
          </div>
          <div className="truncate text-[11px] font-semibold leading-tight text-foreground">
            {dupe.original.brand}
          </div>
        </div>
        {dupe.original.lowestPriceUsd != null && dupe.original.lowestPriceUsd > 0 && (
          <div className="text-[11px] font-semibold tabular-nums text-muted-foreground line-through">
            {fmtPrice(dupe.original.lowestPriceUsd)}
          </div>
        )}
      </div>
    </Link>
  );
}

function ImageBox({
  src,
  alt,
  rounded = true,
  aspect = "square",
  iconSize = "md",
}: {
  src: string | null;
  alt: string;
  rounded?: boolean;
  aspect?: "square";
  iconSize?: "sm" | "md";
}) {
  return (
    <div
      className={`flex ${aspect === "square" ? "aspect-square" : ""} h-full w-full items-center justify-center overflow-hidden bg-secondary/40 ${
        rounded ? "rounded-[12px] border border-border" : ""
      }`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <ShoppingBag
          className={iconSize === "sm" ? "h-3.5 w-3.5 text-muted-foreground/60" : "h-7 w-7 text-muted-foreground/60"}
          strokeWidth={1.5}
        />
      )}
    </div>
  );
}
