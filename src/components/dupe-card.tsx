import type { DupePair } from "@/data/catalog";
import { Check, TrendingDown } from "lucide-react";

function priceTag(n: number) {
  return n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

export function DupeCard({ pair }: { pair: DupePair }) {
  const savings = Math.round(((pair.original.priceUsd - pair.dupe.priceUsd) / pair.original.priceUsd) * 100);
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {/* Verdict bar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground">
            {pair.estheticianVerdict}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
          <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          Save {savings}%
        </div>
      </div>

      {/* Pair grid */}
      <div className="grid grid-cols-2 divide-x divide-border">
        <ProductSide label="Original" item={pair.original} muted />
        <ProductSide label="The dupe" item={pair.dupe} />
      </div>

      {/* Match meter */}
      <div className="space-y-2 border-t border-border px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ingredient match
          </span>
          <span className="font-display text-2xl font-bold tabular-nums">{pair.matchScore}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${pair.matchScore}%` }}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-3 border-t border-border px-5 py-4">
        <p className="text-sm leading-relaxed text-foreground">{pair.notes}</p>
        <div className="flex flex-wrap gap-1.5">
          {pair.bestFor.map((b) => (
            <span
              key={b}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {b}
            </span>
          ))}
        </div>
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
  item: DupePair["original"];
  muted?: boolean;
}) {
  return (
    <div className={`p-5 ${muted ? "bg-background" : "bg-card"}`}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {item.brand}
      </div>
      <h3 className="mt-1 font-display text-base font-semibold leading-tight">{item.name}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold">{priceTag(item.priceUsd)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{item.category}</p>
    </div>
  );
}
