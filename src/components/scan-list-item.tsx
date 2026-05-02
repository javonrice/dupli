import type { ScanRow } from "@/server/scans.functions";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function ScanListItem({ scan, linkable = true }: { scan: ScanRow; linkable?: boolean }) {
  const thumb = scan.thumbnail_data_url ?? scan.original_image_url;
  const isHigherRisk = scan.analysis?.riskLevel === "Higher risk";
  const date = new Date(scan.created_at);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const inner = (
    <div className="tap flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-soft">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border border-border bg-secondary/40">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{scan.original_brand}</span>
          <span aria-hidden>·</span>
          <span>{dateLabel}</span>
        </div>
        <p className="mt-0.5 truncate font-display text-[15px] font-semibold leading-tight">
          {scan.original_product_name}
        </p>
        {scan.dupe_product_name ? (
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <ArrowRight className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            <span className="truncate">
              {scan.dupe_brand} {scan.dupe_product_name}
            </span>
          </div>
        ) : (
          <div className="mt-1 text-[12px] italic text-muted-foreground">
            No dupe found
          </div>
        )}
      </div>
      {typeof scan.match_score === "number" && (
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {isHigherRisk && (
            <span
              aria-label="Higher risk than original"
              title="Higher risk than original"
              className="h-2 w-2 rounded-full bg-warning"
            />
          )}
          <div className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-bold text-background tabular-nums">
            {scan.match_score}%
          </div>
        </div>
      )}
    </div>
  );

  return (
    <li>
      {linkable ? (
        <Link to="/scan/$id" params={{ id: scan.id }} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}
