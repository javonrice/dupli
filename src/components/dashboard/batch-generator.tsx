import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, AlertCircle, Layers, CheckCircle2, XCircle } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePairs } from "@/lib/dashboard.functions";
import { generateReelScript } from "@/lib/reel-voiceover.functions";
import { saveVideoRecord } from "@/lib/user-videos.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import { renderAndSaveReel } from "@/lib/reel-pipeline";

import {
  DupeReel,
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
} from "@/remotion/DupeReel";
import type { RenderProgress, FrameFailure } from "@/lib/render-reel";

type DebugEntry =
  | (FrameFailure & { kind: "frame" })
  | { kind: "image"; src: string; reason: string };

type ItemStatus = "queued" | "scripting" | "rendering" | "saved" | "failed";
type Item = {
  id: number;
  status: ItemStatus;
  label?: string;
  error?: string;
  progress?: RenderProgress | null;
  debug?: DebugEntry[];
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

export function BatchGenerator({ onComplete }: { onComplete?: () => void }) {
  const pickPairs = useServerFn(pickRandomDupePairs);
  const writeScript = useServerFn(generateReelScript);
  const saveRecord = useServerFn(saveVideoRecord);

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

    await renderAndSaveReel({
      script,
      pairs,
      playerRef: hiddenPlayerRef,
      captureEl: hiddenStageRef.current!,
      saveRecord,
      onProgress: (p) => updateItem(item.id, { progress: p }),
      onDebug: (entry) => {
        const tagged: DebugEntry =
          "type" in entry && entry.type === "image"
            ? { kind: "image", src: entry.src, reason: entry.reason }
            : { kind: "frame", ...(entry as FrameFailure) };
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, debug: [...(it.debug ?? []), tagged].slice(-50) }
              : it,
          ),
        );
      },
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
          const rawPairs = await pickPairs({ data: { count: 4 } });
          const pairs = await inlinePairImages(rawPairs);
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
                className="rounded-lg border border-border bg-background/40 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
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
                </div>
                {it.debug && it.debug.length > 0 && (
                  <details className="mt-1.5 ml-8">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                      {it.debug.length} debug{" "}
                      {it.debug.length === 1 ? "entry" : "entries"}
                      {(() => {
                        const counts = it.debug.reduce<Record<string, number>>(
                          (a, d) => {
                            const k = d.kind === "image" ? "image" : d.cause;
                            a[k] = (a[k] ?? 0) + 1;
                            return a;
                          },
                          {},
                        );
                        const summary = Object.entries(counts)
                          .map(([k, v]) => `${v} ${k}`)
                          .join(", ");
                        return summary ? ` · ${summary}` : "";
                      })()}
                    </summary>
                    <ul className="mt-1 space-y-0.5 font-mono text-[10.5px] leading-snug">
                      {it.debug.map((d, idx) => (
                        <li
                          key={idx}
                          className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-muted-foreground"
                        >
                          {d.kind === "image" ? (
                            <>
                              <span className="text-destructive">image</span>{" "}
                              · {d.reason} ·{" "}
                              <span className="break-all">
                                {d.src || "(empty src)"}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-destructive">
                                frame {d.frame}
                              </span>{" "}
                              [{d.segmentKey}] · {d.cause} · attempts{" "}
                              {d.attempts} ·{" "}
                              <span className="break-all">{d.message}</span>
                              {d.url && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <span className="break-all">{d.url}</span>
                                </>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
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
