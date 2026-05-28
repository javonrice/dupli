import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw, Video, AlertCircle } from "lucide-react";
import { Player } from "@remotion/player";
import { Button } from "@/components/ui/button";
import { pickRandomDupePair, type DupePair } from "@/lib/dashboard.functions";
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
  const pickPair = useServerFn(pickRandomDupePair);
  const writeScript = useServerFn(generateReelScript);

  const [pair, setPair] = useState<DupePair | null>(null);
  const [script, setScript] = useState<ReelScript | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const loading =
    stage === "picking" || stage === "scripting" || stage === "voicing";

  async function run() {
    setError(null);
    setScript(null);
    setPair(null);
    try {
      setStage("picking");
      const newPair = await pickPair();
      setPair(newPair);

      setStage("scripting");
      // The same server fn writes the script AND renders TTS for all 4 lines;
      // we briefly show "voicing" so the user knows the longer step is TTS.
      setStage("voicing");
      const s = await writeScript({ data: { pair: newPair } });
      setScript(s);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStage("failed");
    }
  }

  const totalFrames = script ? totalDurationInFrames(script) : 0;

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
            Picks a dupe pair, writes a 4-beat script, voices each line with
            ElevenLabs, and renders a vertical reel where every scene is timed
            to its voiceover.
          </p>
        </div>
        <Button onClick={run} disabled={loading} size="lg">
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

      {pair && (
        <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">{pair.original.brand}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold">{pair.dupe.brand}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {pair.matchPct}% match
            </span>
            <span className="text-muted-foreground">
              Save ${pair.savingsUsd.toFixed(0)}
            </span>
          </div>
          {script && (
            <ul className="mt-3 space-y-1.5 text-xs text-foreground/80">
              {script.segments.map((s) => (
                <li key={s.key} className="flex gap-3">
                  <span className="w-16 shrink-0 font-mono uppercase text-muted-foreground">
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
        </div>
      )}
    </div>
  );
}
