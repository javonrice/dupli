import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Video,
  AlertCircle,
  Download,
  CheckCircle2,
} from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePairs } from "@/lib/dashboard.functions";
import { generateReelScript } from "@/lib/reel-voiceover.functions";
import { saveVideoRecord } from "@/lib/user-videos.functions";
import { fetchImageAsDataUrl } from "@/server/image-proxy.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import {
  renderAndSaveReel,
  renderAndSaveReelViaLambda,
  downloadBlob,
  slugify,
} from "@/lib/reel-pipeline";
import type { RenderProgress } from "@/lib/render-reel";

import {
  DupeReel,
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
} from "@/remotion/DupeReel";

type Stage = "idle" | "picking" | "scripting" | "voicing" | "done" | "failed";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  picking: "Picking dupe pair…",
  scripting: "Writing voiceover script…",
  voicing: "Recording voices with ElevenLabs…",
  done: "",
  failed: "",
};


export function UgcGenerator() {
  const pickPairs = useServerFn(pickRandomDupePairs);
  const writeScript = useServerFn(generateReelScript);
  const saveRecord = useServerFn(saveVideoRecord);
  const proxyImage = useServerFn(fetchImageAsDataUrl);

  const [pairs, setPairs] = useState<DupePair[] | null>(null);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [renderStage, setRenderStage] = useState<RenderProgress["stage"] | null>(null);
  const [renderPct, setRenderPct] = useState(0);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedName, setRenderedName] = useState<string>("");

  const playerRef = useRef<PlayerRef | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  // Clear cached blob when the script changes (new generation)
  useEffect(() => {
    setRenderedBlob(null);
    setRenderedName("");
    setRenderPct(0);
    setRenderStage(null);
  }, [script]);

  const loading =
    stage === "picking" || stage === "scripting" || stage === "voicing";

  async function run() {
    setError(null);
    setScript(null);
    setPairs(null);
    try {
      setStage("picking");
      const rawPairs = await pickPairs({ data: { count: 4 } });

      // Proxy product images → data URLs so frame capture (html-to-image /
      // modern-screenshot) never hits CORS-blocked CDNs mid-render.
      const inlineOne = async (url: string): Promise<string> => {
        if (!url || url.startsWith("data:")) return url;
        try {
          const r = await proxyImage({ data: { url } });
          return r.dataUrl ?? url;
        } catch {
          return url;
        }
      };
      const newPairs: DupePair[] = await Promise.all(
        rawPairs.map(async (p) => ({
          ...p,
          original: { ...p.original, imageUrl: await inlineOne(p.original.imageUrl) },
          dupe: { ...p.dupe, imageUrl: await inlineOne(p.dupe.imageUrl) },
        })),
      );
      setPairs(newPairs);
      setStage("scripting");
      setStage("voicing");
      const s = await writeScript({ data: { pairs: newPairs } });
      setScript(s);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStage("failed");
    }
  }

  const totalFrames = script ? totalDurationInFrames(script) : 0;

  function buildFilename() {
    const slug = pairs
      ? slugify(pairs.map((p) => p.dupe.brand).join("-"))
      : "reel";
    const ts = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "-");
    return `dupli-${slug}-${ts}.mp4`;
  }

  async function handleRender() {
    if (!script || !pairs || pairs.length === 0) return;
    if (!playerRef.current || !captureRef.current) {
      setError("Preview not ready — wait a moment and try again.");
      return;
    }
    setError(null);
    setExporting(true);
    setRenderPct(0);
    setRenderStage("audio");
    try {
      const { blob } = await renderAndSaveReel({
        script,
        pairs,
        playerRef,
        captureEl: captureRef.current,
        saveRecord,
        onProgress: (p) => {
          setRenderStage(p.stage);
          setRenderPct(p.pct);
        },
      });
      const filename = buildFilename();
      setRenderedBlob(blob);
      setRenderedName(filename);
      downloadBlob(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "MP4 export failed");
    } finally {
      setExporting(false);
      setRenderStage(null);
    }
  }

  function handleRedownload() {
    if (renderedBlob && renderedName) {
      downloadBlob(renderedBlob, renderedName);
    }
  }

  const renderStageLabel: Record<RenderProgress["stage"], string> = {
    audio: "Mixing voiceover",
    frames: "Capturing frames",
    encode: "Encoding MP4",
    finalize: "Finalizing",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI UGC
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Dupe Reel (Browser Render)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Picks 4 random dupe pairs, writes a hook + 4 reveals + CTA,
            voices each line with ElevenLabs, and renders a vertical reel
            right in your browser — hardware-accelerated, no upload.
          </p>
        </div>
        <Button onClick={run} disabled={loading || exporting} size="lg">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {STAGE_LABEL[stage]}
            </>
          ) : (
            <>
              <Video className="mr-2 h-4 w-4" />
              {script ? "Generate another" : "Generate reel"}
            </>
          )}
        </Button>
      </div>

      {pairs && (
        <div className="mt-5 space-y-3 rounded-xl border border-border bg-background/40 p-4">
          <ul className="space-y-2 text-sm">
            {pairs.map((p, i) => (
              <li key={p.pairId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <span className="font-semibold">{p.original.brand}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-semibold">{p.dupe.brand}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {p.matchPct}% match
                </span>
                <span className="text-xs text-muted-foreground">
                  Save ${p.savingsUsd.toFixed(0)}
                </span>
              </li>
            ))}
          </ul>
          {script && (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-foreground/80">
              {script.segments.map((s) => (
                <li key={s.key} className="flex gap-3">
                  <span className="w-20 shrink-0 font-mono uppercase text-muted-foreground">
                    {s.key} · {s.durationSec.toFixed(1)}s
                  </span>
                  <span className="italic">"{s.text}"</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium">{STAGE_LABEL[stage]}</span>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Failed</p>
            <p className="mt-1 break-words text-xs opacity-90">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={run}>
            <RefreshCw className="mr-2 h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {script && totalFrames > 0 && (
        <div className="mt-5">
          <div
            ref={captureRef}
            className="mx-auto aspect-[9/16] max-h-[640px] w-auto overflow-hidden rounded-xl border border-border bg-black"
          >
            <Player
              ref={playerRef}
              component={DupeReel}
              inputProps={{ script }}
              durationInFrames={totalFrames}
              fps={FPS}
              compositionWidth={WIDTH}
              compositionHeight={HEIGHT}
              controls
              autoPlay
              loop
              style={{ width: "100%", height: "100%" }}
              acknowledgeRemotionLicense
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Preview plays in-browser with voiceover. Total length{" "}
            {(totalFrames / FPS).toFixed(1)}s.
          </p>

          <div className="mt-4 flex flex-col items-center gap-3">
            {!renderedBlob ? (
              <Button
                onClick={handleRender}
                disabled={exporting}
                size="lg"
                variant="default"
              >
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {renderStage ? renderStageLabel[renderStage] : "Rendering"}…{" "}
                    {Math.round(renderPct * 100)}%
                  </>
                ) : (
                  <>
                    <Video className="mr-2 h-4 w-4" />
                    Render & Download MP4
                  </>
                )}
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  Downloaded {renderedName}
                </div>
                <Button onClick={handleRedownload} size="lg" variant="default">
                  <Download className="mr-2 h-4 w-4" />
                  Download again
                </Button>
              </div>
            )}

            {exporting && (
              <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(renderPct * 100)}%` }}
                />
              </div>
            )}

            <p className="max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
              Rendered right in your browser with hardware-accelerated WebCodecs
              — typically 10–30s for a full reel. No upload, no Lambda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

