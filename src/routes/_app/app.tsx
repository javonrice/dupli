import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { IOSScreen } from "@/components/ios-screen";
import { TabBarSpacer } from "@/components/tab-bar";
import { ScanningScreen, ResultsScreen } from "@/components/scanner";
import { DupeOfTheDay } from "@/components/home/dupe-of-the-day";
import { TrendingRail, ForYouGrid } from "@/components/home/community-feeds";
import { RecentScansSection } from "@/components/home/recent-scans";
import { ScanFab } from "@/components/home/scan-fab";
import { useScanFlow } from "@/lib/use-scan-flow";
import { getRecentScans, type CommunityDupe } from "@/server/discover.functions";
import {
  getDupeOfTheDayBlended,
  getTrendingDupesBlended,
  type TrendingSource,
} from "@/server/trending.functions";
import type { ScanRow } from "@/server/scans.functions";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/_app/app")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Dupli — Snap a product, find the dupe" },
      {
        name: "description",
        content:
          "Discover trending dupes for your favorite beauty products. Snap any product to find an affordable alternative in seconds.",
      },
    ],
  }),
});

function Index() {
  const flow = useScanFlow();

  // While scanning or showing results, take over the screen exactly like before.
  if (flow.stage === "scanning") {
    return (
      <>
        <ScanningScreen preview={flow.preview} />
        <FileInputs flow={flow} />
      </>
    );
  }

  if (flow.stage === "results" && flow.analysis) {
    return (
      <>
        <ResultsScreen
          analysis={flow.analysis}
          preview={flow.preview}
          scanId={flow.scanId}
          isSaved={flow.isSaved}
          canSave={flow.canSave}
          onToggleSave={flow.handleToggleSave}
          onReset={flow.reset}
          onShare={flow.handleShare}
          preparingShare={flow.preparingShare}
        />
        <FileInputs flow={flow} />
      </>
    );
  }

  // Idle = Discovery Hub
  return (
    <>
      <DiscoveryHub error={flow.error} />
      <ScanFab onCamera={flow.openCamera} onLibrary={flow.openLibrary} />
      <FileInputs flow={flow} />
    </>
  );
}

function FileInputs({ flow }: { flow: ReturnType<typeof useScanFlow> }) {
  return (
    <>
      <input
        ref={flow.cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && flow.handleFile(e.target.files[0])}
      />
      <input
        ref={flow.libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && flow.handleFile(e.target.files[0])}
      />
    </>
  );
}

function DiscoveryHub({ error }: { error: string | null }) {
  const fetchHero = useServerFn(getDupeOfTheDayBlended);
  const fetchTrending = useServerFn(getTrendingDupesBlended);
  const fetchRecent = useServerFn(getRecentScans);

  const [hero, setHero] = useState<CommunityDupe | null>(null);
  const [trending, setTrending] = useState<CommunityDupe[]>([]);
  const [trendingSource, setTrendingSource] = useState<TrendingSource>("catalog");
  const [popular, setPopular] = useState<CommunityDupe[]>([]);
  const [recent, setRecent] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHero({}),
      fetchTrending({ data: { limit: 10 } }),
      fetchTrending({ data: { limit: 24 } }),
      fetchRecent({ data: { limit: 3 } }).catch(() => ({ scans: [] as ScanRow[] })),
    ])
      .then(([heroRes, trendRes, popRes, recentRes]) => {
        if (cancelled) return;
        setHero(heroRes.dupe);
        setTrending(trendRes.dupes);
        setTrendingSource(trendRes.source);
        const seen = new Set<string>();
        if (heroRes.dupe) seen.add(heroRes.dupe.id);
        for (const d of trendRes.dupes) seen.add(d.id);
        setPopular(popRes.dupes.filter((d: CommunityDupe) => !seen.has(d.id)).slice(0, 12));
        setRecent(recentRes.scans);
      })
      .catch((e) => console.warn("Discovery hub load failed", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchHero, fetchTrending, fetchRecent]);

  return (
    <IOSScreen
      title=""
      trailing={
        <img src={wordmark} alt="Dupli" className="h-9 w-auto" width={887} height={414} />
      }
    >
      <div className="space-y-6 px-4 pb-6 pt-3">
        {/* Tagline */}
        <div className="px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI Dupe Finder
          </p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">
            Snap any product.{" "}
            <span className="italic text-muted-foreground">Find the dupe.</span>
          </h1>
        </div>

        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-center text-[13px] text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center pt-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DupeOfTheDay dupe={hero} />
            <TrendingRail dupes={trending} />
            <RecentScansSection scans={recent} />
            <ForYouGrid dupes={popular} />
          </>
        )}

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 pt-2 text-[12px] text-muted-foreground">
          <a href="/privacy" className="hover:text-foreground hover:underline">Privacy</a>
          <span aria-hidden>·</span>
          <a href="/terms" className="hover:text-foreground hover:underline">Terms</a>
        </div>

        {/* Extra space so the FAB doesn't cover the last card */}
        <div className="h-16" />
      </div>
      <TabBarSpacer />
    </IOSScreen>
  );
}
