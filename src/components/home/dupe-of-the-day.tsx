import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, ShoppingBag } from "lucide-react";
import type { CommunityDupe } from "@/server/discover.functions";

/** The "Dupe of the Day" hero card — prominent editorial moment at the top of the hub. */
export function DupeOfTheDay({ dupe }: { dupe: CommunityDupe | null }) {
  if (!dupe) return null;
  return (
    <Link
      to="/community/$brand/$product"
      params={{ brand: dupe.original.brandSlug, product: dupe.original.productSlug }}
      className="tap group block overflow-hidden rounded-[20px] border border-border bg-card shadow-lift"
    >
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-foreground" strokeWidth={2.25} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground">
            Dupe of the Day
          </span>
        </div>
        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tabular-nums text-background">
          {dupe.overallMatch}% match
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border">
        <HeroSide
          label="Original"
          brand={dupe.original.brand}
          name={dupe.original.productName}
          imageUrl={dupe.original.imageUrl}
        />
        <HeroSide
          label="The dupe"
          brand={dupe.dupe.brand}
          name={dupe.dupe.productName}
          imageUrl={dupe.dupe.imageUrl}
          emphasized
        />
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="text-[12px] text-muted-foreground">
          See ingredients & verdict
        </span>
        <ArrowRight
          className="h-4 w-4 text-foreground transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
        />
      </div>
    </Link>
  );
}

function HeroSide({
  label,
  brand,
  name,
  imageUrl,
  emphasized = false,
}: {
  label: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  emphasized?: boolean;
}) {
  return (
    <div className={`p-4 ${emphasized ? "bg-card" : "bg-background"}`}>
      <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mb-2.5 flex aspect-square items-center justify-center overflow-hidden rounded-[14px] border border-border bg-secondary/40">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${brand} ${name}`}
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
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {brand}
      </div>
      <h3 className="mt-0.5 line-clamp-2 font-display text-[14px] font-semibold leading-tight">
        {name}
      </h3>
    </div>
  );
}
