import { Link } from "@tanstack/react-router";
import { ShoppingBag, TrendingDown } from "lucide-react";
import type { CommunityDupe } from "@/server/discover.functions";

type Variant = "card" | "tile";

/** A community-sourced dupe pairing rendered as a tappable card.
 *  - "tile" (default) — vertical card for grids.
 *  - "card" — wider card for horizontal rails.
 */
export function CommunityDupeCard({
  dupe,
  variant = "tile",
}: {
  dupe: CommunityDupe;
  variant?: Variant;
}) {
  const widthClass =
    variant === "card" ? "w-[200px] shrink-0" : "w-full";
  return (
    <Link
      to="/p/$productId"
      params={{ productId: dupe.dupe.id }}
      className={`tap snap-start group flex ${widthClass} flex-col gap-2 rounded-[16px] border border-border bg-card p-3 text-left shadow-soft`}
    >
      {/* Pair preview: original on the left, dupe on the right with a savings chip */}
      <div className="relative grid grid-cols-2 gap-1.5">
        <ImageBox src={dupe.original.imageUrl} alt={dupe.original.productName} />
        <ImageBox src={dupe.dupe.imageUrl} alt={dupe.dupe.productName} />
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tabular-nums text-background shadow-soft">
          {dupe.overallMatch}%
        </div>
      </div>
      <div className="mt-2 min-w-0 space-y-1.5">
        <ProductLine
          label="Original"
          brand={dupe.original.brand}
          name={dupe.original.productName}
        />
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <TrendingDown className="h-3 w-3" strokeWidth={2.5} />
          Dupe
        </div>
        <ProductLine
          brand={dupe.dupe.brand}
          name={dupe.dupe.productName}
          emphasized
        />
        {dupe.dupe.lowestPriceUsd != null && (
          <div className="pt-0.5 font-display text-[14px] font-bold tabular-nums text-foreground">
            ${dupe.dupe.lowestPriceUsd.toFixed(2)}
          </div>
        )}
      </div>
    </Link>
  );
}

function ImageBox({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[12px] border border-border bg-secondary/40">
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
        <ShoppingBag className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
      )}
    </div>
  );
}

function ProductLine({
  label,
  brand,
  name,
  emphasized = false,
}: {
  label?: string;
  brand: string;
  name: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0">
      {label && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {brand}
      </div>
      <div
        className={
          emphasized
            ? "line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground"
            : "line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground"
        }
      >
        {name}
      </div>
    </div>
  );
}
