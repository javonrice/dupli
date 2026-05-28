import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Loader2, RefreshCw, Video, AlertCircle, Download } from "lucide-react";
import { Player, type PlayerRef } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePairs, type DupePair } from "@/lib/dashboard.functions";
import {
  generateReelScript,
  type ReelScript,
} from "@/lib/reel-voiceover.functions";

import {
  DupeReel,
  FPS,
  WIDTH,
  HEIGHT,
  totalDurationInFrames,
  audioStartFrames,
} from "@/remotion/DupeReel";
import { renderReelToMp4, type RenderProgress } from "@/lib/render-reel";

type Stage = "idle" | "picking" | "scripting" | "voicing" | "done" | "failed";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  picking: "Picking dupe pair…",
  scripting: "Writing voiceover script…",
  voicing: "Recording voices with ElevenLabs…",
  done: "",
  failed: "",
};

const PROGRESS_LABEL: Record<RenderProgress["stage"], string> = {
  audio: "Mixing audio",
  frames: "Capturing frames",
  encode: "Encoding MP4",
};

export function UgcGenerator() {
  const pickPairs = useServerFn(pickRandomDupePairs);
  const writeScript = useServerFn(generateReelScript);

  const [pairs, setPairs] = useState<DupePair[] | null>(null);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const hiddenPlayerRef = useRef<PlayerRef>(null);
  const hiddenStageRef = useRef<HTMLDivElement>(null);

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

  async function handleDownload() {
    if (!script || !pairs || pairs.length === 0) return;
    setError(null);
    setExporting(true);
    setProgress({ stage: "audio", pct: 0 });
    try {
      for (let i = 0; i < 60; i++) {
        if (hiddenPlayerRef.current && hiddenStageRef.current) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!hiddenPlayerRef.current || !hiddenStageRef.current) {
        throw new Error("Renderer didn't mount in time");
      }

      const blob = await renderReelToMp4({
        playerRef: hiddenPlayerRef,
        captureEl: hiddenStageRef.current,
        script,
        totalFrames,
        fps: FPS,
        width: WIDTH,
        height: HEIGHT,
        segmentStartFrames: audioStartFrames(script),
        onProgress: setProgress,
      });

      const slug = pairs
        .map((p) => p.dupe.brand)
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dupli-reel-${slug}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "MP4 export failed");
    } finally {
      setExporting(false);
      setProgress(null);
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
            timed to the voiceover. Download as MP4 — rendered in your browser.
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
            <Button
              onClick={handleDownload}
              disabled={exporting}
              size="lg"
              variant="default"
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress
                    ? `${PROGRESS_LABEL[progress.stage]} ${Math.round(
                        progress.pct * 100,
                      )}%`
                    : "Preparing…"}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download MP4
                </>
              )}
            </Button>

            {exporting && progress && (
              <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round(progress.pct * 100)}%` }}
                />
              </div>
            )}

            <p className="max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
              Rendering happens entirely in your browser — no server, no API
              keys. Expect roughly 1 frame/second on a modern laptop (a 15s reel
              ≈ 8–10 minutes). Keep the tab focused while it runs.
            </p>
          </div>
        </div>
      )}

      {/* Hidden full-resolution stage used only for capture. Mounted while
          exporting so html-to-image can read the composition at native size. */}
      {script && exporting && (
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
              inputProps={{ script }}
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
