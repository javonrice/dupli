import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listScans, type ScanRow } from "@/lib/scans.functions";
import { ScanListItem } from "@/components/scan-list-item";
import { TabBarSpacer } from "@/components/tab-bar";

export const Route = createFileRoute("/_app/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "History — Dupli" },
      { name: "description", content: "Your scan history." },
    ],
  }),
});

function HistoryPage() {
  const list = useServerFn(listScans);
  const [scans, setScans] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setScans(null);
    list({})
      .then((r) => {
        if (r.error) setError(r.error);
        else setScans(r.scans);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history"));
  }, [list]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  return (
    <div className="flex min-h-screen-safe flex-col bg-background">
      <div className="pt-safe sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
        <div className="hairline-b px-5 pb-3 pt-3">
          <h1 className="font-display text-[28px] font-bold tracking-tight">History</h1>
          {scans && (
            <p className="text-[12px] text-muted-foreground">
              {scans.length} {scans.length === 1 ? "scan" : "scans"}
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
            <div>{error}</div>
            <button
              onClick={load}
              className="tap mt-2 inline-flex h-8 items-center justify-center rounded-[10px] bg-destructive px-3 text-[12px] font-semibold text-destructive-foreground"
            >
              Try again
            </button>
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
        <Camera className="h-7 w-7 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <h2 className="font-display text-[18px] font-semibold">No scans yet</h2>
      <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
        Snap a product on the Scan tab. Every scan you take shows up here.
      </p>
      <Link
        to="/app"
        className="tap mt-5 flex h-[44px] items-center justify-center gap-2 rounded-[14px] bg-foreground px-5 text-[14px] font-semibold text-background"
      >
        <Camera className="h-4 w-4" strokeWidth={2} />
        Start scanning
      </Link>
    </div>
  );
}
