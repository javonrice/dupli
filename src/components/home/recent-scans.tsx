import type { ScanRow } from "@/lib/scans.functions";
import { ScanListItem } from "@/components/scan-list-item";

/** "Pick up where you left off" — last few scans from the user's history. */
export function RecentScansSection({ scans }: { scans: ScanRow[] }) {
  if (!scans.length) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pick up where you left off
        </div>
      </div>
      <ul className="space-y-2 pt-1">
        {scans.map((s) => (
          <ScanListItem key={s.id} scan={s} />
        ))}
      </ul>
    </section>
  );
}
