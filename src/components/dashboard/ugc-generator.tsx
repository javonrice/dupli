import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Video, AlertCircle, Download, CheckCircle2 } from "lucide-react";
import { Player } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePairs } from "@/lib/dashboard.functions";
import { generateReelScript } from "@/lib/reel-voiceover.functions";
import { saveVideoRecord } from "@/lib/user-videos.functions";
import {
  startLambdaRender,
  getLambdaRenderProgress,
} from "@/lib/lambda-render.functions";
import type { DupePair, ReelScript } from "@/lib/dupe-types";
import { slugify } from "@/lib/reel-pipeline";

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
  const startRender = useServerFn(startLambdaRender);
  const getProgress = useServerFn(getLambdaRenderProgress);

  const [pairs, setPairs] = useState<DupePair[] | null>(null);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [renderedName, setRenderedName] = useState<string>("");

  // Clear cached url when the script changes (new generation)
  useEffect(() => {
    setRenderedUrl(null);
    setRenderedName("");
    setRenderPct(0);
  }, [script]);

  const loading =
    stage === "picking" || stage === "scripting" || stage === "voicing";

  async function run() {
    setError(null);
    setScript(null);
    setPairs(null);
    try {
      setStage("picking");
      const newPairs = await pickPairs({ data: { count: 4 } });
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

  async function downloadFromUrl(url: string, filename: string) {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function handleRender() {
    if (!script || !pairs || pairs.length === 0) return;
    setError(null);
    setExporting(true);
    setRenderPct(0);
    try {
      const { renderId, bucketName } = await startRender({
        data: { script },
      });

      // Poll progress every 2s
      let outputFile: string | null = null;
      while (true) {
        await new Promise((r) => setTimeout(r, 4000));
        const p = await getProgress({
          data: { renderId, bucketName },
        });
        setRenderPct(p.overallProgress);
        if (p.fatalErrorEncountered) {
          throw new Error(p.errors[0] ?? "Lambda render failed");
        }
        if (p.done && p.outputFile) {
          outputFile = p.outputFile;
          break;
        }
      }

      const filename = buildFilename();
      setRenderedUrl(outputFile);
      setRenderedName(filename);
      await downloadFromUrl(outputFile, filename);

      // Best-effort save to library (store S3 URL as storage_path)
      try {
        await saveRecord({
          data: {
            storagePath: outputFile,
            thumbnailUrl: pairs[0]?.original.imageUrl ?? null,
            pairs,
            durationSec: totalFrames / FPS,
          },
        });
      } catch (e) {
        console.warn("save record failed", e);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "MP4 export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleRedownload() {
    if (renderedUrl && renderedName) {
      await downloadFromUrl(renderedUrl, renderedName);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI UGC
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Dupe Reel (Remotion + ElevenLabs)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Picks 4 random dupe pairs, writes a hook + 4 reveals + CTA,
            voices each line with ElevenLabs, and renders a vertical reel
            timed to the voiceover — rendered on AWS Lambda in seconds.
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
          <div className="mx-auto aspect-[9/16] max-h-[640px] w-auto overflow-hidden rounded-xl border border-border bg-black">
            <Player
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
            {!renderedUrl ? (
              <Button
                onClick={handleRender}
                disabled={exporting}
                size="lg"
                variant="default"
              >
                {exporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rendering on Lambda… {Math.round(renderPct * 100)}%
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
              Rendered on AWS Lambda — typically 20-60s for a full reel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

