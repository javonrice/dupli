import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, AlertCircle, Layers, CheckCircle2, XCircle } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePairs } from "@/lib/dashboard.functions";
import { generateReelScript } from "@/lib/reel-voiceover.functions";
import { saveVideoRecord } from "@/lib/user-videos.functions";
import { fetchImageAsDataUrl } from "@/server/image-proxy.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import { renderAndSaveReel } from "@/lib/reel-pipeline";

import {
  DupeReel,
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
} from "@/remotion/DupeReel";
import type { RenderProgress } from "@/lib/render-reel";

type ItemStatus = "queued" | "scripting" | "rendering" | "saved" | "failed";
type Item = {
  id: number;
  status: ItemStatus;
  label?: string;
  error?: string;
  progress?: RenderProgress | null;
};

const BATCH_SIZES = [5, 10, 15, 30] as const;
type BatchSize = (typeof BATCH_SIZES)[number];

const STATUS_LABEL: Record<ItemStatus, string> = {
  queued: "Queued",
  scripting: "Writing script + voiceover",
  rendering: "Rendering MP4",
  saved: "Saved",
  failed: "Failed",
};

  const pickPairs = useServerFn(pickRandomDupePairs);
  const writeScript = useServerFn(generateReelScript);
  const saveRecord = useServerFn(saveVideoRecord);
  const proxyImage = useServerFn(fetchImageAsDataUrl);

  async function inlinePairImages(pairs: DupePair[]): Promise<DupePair[]> {
    const cache = new Map<string, string>();
    async function toData(url: string): Promise<string> {
      if (!url || url.startsWith("data:")) return url;
      const hit = cache.get(url);
      if (hit) return hit;
      try {
        const { dataUrl } = await proxyImage({ data: { url } });
        const out = dataUrl ?? url;
        cache.set(url, out);
        return out;
      } catch {
        return url;
      }
    }
    return Promise.all(
      pairs.map(async (p) => ({
        ...p,
        original: { ...p.original, imageUrl: await toData(p.original.imageUrl) },
        dupe: { ...p.dupe, imageUrl: await toData(p.dupe.imageUrl) },
      })),
    );
  }


  const [size, setSize] = useState<BatchSize>(5);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [activeScript, setActiveScript] = useState<ReelScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const hiddenPlayerRef = useRef<PlayerRef>(null);
  const hiddenStageRef = useRef<HTMLDivElement>(null);

  const totalFrames = activeScript ? totalDurationInFrames(activeScript) : 0;
  const savedCount = items.filter((i) => i.status === "saved").length;
  const failedCount = items.filter((i) => i.status === "failed").length;

  function updateItem(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function waitForStage() {
    for (let i = 0; i < 80; i++) {
      if (hiddenPlayerRef.current && hiddenStageRef.current) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  async function runOne(item: Item, pairs: DupePair[]): Promise<void> {
    updateItem(item.id, { status: "scripting" });
    const script = await writeScript({ data: { pairs } });
    setActiveScript(script);
    updateItem(item.id, {
      status: "rendering",
      label: `${pairs[0].original.brand} → ${pairs[0].dupe.brand}`,
    });

    const ok = await waitForStage();
    if (!ok || !hiddenPlayerRef.current || !hiddenStageRef.current) {
      throw new Error("Renderer didn't mount");
    }

    await renderAndSaveReel({
      script,
      pairs,
      playerRef: hiddenPlayerRef,
      captureEl: hiddenStageRef.current,
      saveRecord,
      onProgress: (p) => updateItem(item.id, { progress: p }),
    });
    updateItem(item.id, { status: "saved", progress: null });
  }

  async function runBatch() {
    setError(null);
    stopRef.current = false;
    setRunning(true);
    const initial: Item[] = Array.from({ length: size }, (_, i) => ({
      id: i,
      status: "queued",
    }));
    setItems(initial);

    try {
      for (const item of initial) {
        if (stopRef.current) break;
        try {
          // Each iteration picks its own 4 fresh pairs.
          const pairs = await pickPairs({ data: { count: 4 } });
          await runOne(item, pairs);
        } catch (e) {
          updateItem(item.id, {
            status: "failed",
            error: e instanceof Error ? e.message : "Failed",
          });
        }
        // Let the DOM/ffmpeg settle between renders.
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch failed");
    } finally {
      setRunning(false);
      setActiveScript(null);
      onComplete?.();
    }
  }

  function stop() {
    stopRef.current = true;
  }

  const activeItem = items.find(
    (i) => i.status === "rendering" || i.status === "scripting",
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            30 days of content
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Batch generator
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Generate a stack of reels in one sitting. Each one picks fresh dupes,
            writes a UGC-style script, renders in your browser, and saves to{" "}
            <span className="font-semibold text-foreground">My Videos</span> with a
            ready-to-paste caption + 5 hashtags. Keep the tab open and focused.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {BATCH_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              disabled={running}
              onClick={() => setSize(n)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                size === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/50"
              } disabled:opacity-50`}
            >
              {n}
            </button>
          ))}
          {running ? (
            <Button variant="outline" onClick={stop}>
              Stop after current
            </Button>
          ) : (
            <Button onClick={runBatch} size="lg">
              <Layers className="mr-2 h-4 w-4" />
              Generate {size} reels
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold">
              Rendered {savedCount} / {items.length}
            </span>
            {failedCount > 0 && (
              <span className="text-destructive">· {failedCount} failed</span>
            )}
            {running && (
              <span className="text-muted-foreground">· running…</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${(savedCount / items.length) * 100}%` }}
            />
          </div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
              >
                <span className="w-6 font-mono text-muted-foreground">
                  #{it.id + 1}
                </span>
                {it.status === "saved" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : it.status === "failed" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : it.status === "queued" ? (
                  <span className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="flex-1 truncate">
                  {it.label ?? STATUS_LABEL[it.status]}
                  {it.status === "rendering" && it.progress && (
                    <span className="ml-1 text-muted-foreground">
                      · {Math.round(it.progress.pct * 100)}%
                    </span>
                  )}
                  {it.status === "failed" && it.error && (
                    <span className="ml-1 text-destructive">· {it.error}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden capture stage — mounted only while a reel is rendering */}
      {activeScript && activeItem && totalFrames > 0 && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: -99999,
            top: 0,
            width: WIDTH,
            height: HEIGHT,
            pointerEvents: "none",
          }}
        >
          <div ref={hiddenStageRef} style={{ width: WIDTH, height: HEIGHT }}>
            <Player
              ref={hiddenPlayerRef}
              component={DupeReel}
              inputProps={{ script: activeScript }}
              durationInFrames={totalFrames}
              fps={FPS}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              style={{ width: WIDTH, height: HEIGHT }}
              acknowledgeRemotionLicense
            />
          </div>
        </div>
      )}
    </div>
  );
}
