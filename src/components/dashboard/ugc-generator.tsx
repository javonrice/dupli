import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Video, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickRandomDupePair, type DupePair } from "@/lib/dashboard.functions";
import {
  generateUgcScript,
  submitUgcVideo,
  pollUgcVideo,
} from "@/lib/ugc-video.functions";

type Stage =
  | "idle"
  | "picking"
  | "scripting"
  | "submitting"
  | "rendering"
  | "done"
  | "failed";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  picking: "Picking dupe pair…",
  scripting: "Writing UGC script…",
  submitting: "Submitting to HeyGen…",
  rendering: "Rendering talking-avatar video…",
  done: "",
  failed: "",
};

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function UgcGenerator() {
  const pickPair = useServerFn(pickRandomDupePair);
  const writeScript = useServerFn(generateUgcScript);
  const submitVideo = useServerFn(submitUgcVideo);
  const pollVideo = useServerFn(pollUgcVideo);

  const [pair, setPair] = useState<DupePair | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const cancelRef = useRef(false);

  // Tick the elapsed counter while rendering.
  useEffect(() => {
    if (stage !== "rendering" && stage !== "submitting") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [stage]);

  const loading = stage !== "idle" && stage !== "done" && stage !== "failed";

  async function run() {
    cancelRef.current = false;
    setError(null);
    setVideoUrl(null);
    setScript(null);
    setPair(null);
    setStartedAt(Date.now());
    setNow(Date.now());

    try {
      setStage("picking");
      const newPair = await pickPair();
      if (cancelRef.current) return;
      setPair(newPair);

      setStage("scripting");
      const { script: s } = await writeScript({ data: { pair: newPair } });
      if (cancelRef.current) return;
      setScript(s);

      setStage("submitting");
      const { videoId } = await submitVideo({
        data: { script: s, productImageUrl: newPair.dupe.imageUrl },
      });
      if (cancelRef.current) return;

      setStage("rendering");
      // Poll every 5s for up to 6 minutes
      const deadline = Date.now() + 6 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        if (cancelRef.current) return;
        const result = await pollVideo({ data: { videoId } });
        if (result.status === "completed") {
          setVideoUrl(result.videoUrl);
          setStage("done");
          return;
        }
        if (result.status === "failed") {
          setError(result.error);
          setStage("failed");
          return;
        }
      }
      setError("Timed out after 6 minutes waiting for HeyGen.");
      setStage("failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStage("failed");
    }
  }

  const elapsed = startedAt ? now - startedAt : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            AI UGC
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Talking-avatar review (HeyGen)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Picks a dupe pair, writes a 2-sentence UGC script, renders a vertical
            talking-avatar video via HeyGen.
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
              Generate UGC video
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
            <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm italic text-foreground/90">
              “{script}”
            </p>
          )}
        </div>
      )}

      {(stage === "submitting" || stage === "rendering") && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium">{STAGE_LABEL[stage]}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {formatElapsed(elapsed)} / ~2:00
          </span>
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

      {videoUrl && (
        <div className="mt-5">
          <video
            src={videoUrl}
            controls
            className="mx-auto aspect-[9/16] max-h-[640px] w-auto rounded-xl border border-border bg-black"
          />
          <div className="mt-3 flex justify-center">
            <a
              href={videoUrl}
              download
              className="text-xs font-semibold text-primary hover:underline"
            >
              Download MP4
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
