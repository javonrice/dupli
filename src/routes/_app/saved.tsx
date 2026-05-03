import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Bookmark } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listSaved, type ScanRow } from "@/server/scans.functions";
import { ScanListItem } from "@/components/scan-list-item";
import { TabBarSpacer } from "@/components/tab-bar";

export const Route = createFileRoute("/_app/saved")({
  component: SavedPage,
  head: () => ({
    meta: [
      { title: "Saved — Dupli" },
      { name: "description", content: "Your saved dupes." },
    ],
  }),
});

function SavedPage() {
  const list = useServerFn(listSaved);
  const [scans, setScans] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    list({})
      .then((r) => {
        if (r.error) setError(r.error);
        else setScans(r.scans);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [list]);

  return (
    <div className="flex min-h-screen-safe flex-col bg-background">
      <div className="pt-safe sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
        <div className="hairline-b px-5 pb-3 pt-3">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Saved</h1>
          {scans && (
            <p className="text-[12px] text-muted-foreground">
              {scans.length} {scans.length === 1 ? "dupe" : "dupes"}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pt-3">
        {scans === null && !error && (
          <div className="flex justify-center pt-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}
        {scans && scans.length === 0 && <EmptyState />}
        {scans && scans.length > 0 && (
          <ul className="space-y-2">
            {scans.map((s) => (
              <ScanListItem key={s.id} scan={s} />
            ))}
          </ul>
        )}
      </div>

      <TabBarSpacer />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-secondary">
        <Bookmark className="h-7 w-7 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <h2 className="font-display text-[18px] font-semibold">Nothing saved yet</h2>
      <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
        Tap the bookmark on a result to save your favorite dupes here.
      </p>
      <Link
        to="/app"
        className="tap mt-5 flex h-[44px] items-center justify-center gap-2 rounded-[14px] bg-foreground px-5 text-[14px] font-semibold text-background"
      >
        Start scanning
      </Link>
    </div>
  );
}
