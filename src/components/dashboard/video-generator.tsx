import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Download, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickRandomDupePair, type DupePair } from "@/lib/dashboard.functions";
import {
  buildScript,
  generateVoiceover,
  submitScanClip,
  pollScanClip,
  generateVideoStills,
  fetchScanClipBytes,
} from "@/lib/dashboard-video.functions";



type Stage =
  | "idle"
  | "picking"
  | "voiceover"
  | "scan"
  | "stills"
  | "composing"
  | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  picking: "Picking dupe pair…",
  voiceover: "Generating voiceover…",
  scan: "Generating scan clip…",
  stills: "Generating still frames…",
  composing: "Composing video…",
  done: "",
};

export function VideoGenerator() {
  const pickPair = useServerFn(pickRandomDupePair);
  const voice = useServerFn(generateVoiceover);
  const submitScan = useServerFn(submitScanClip);
  const pollScan = useServerFn(pollScanClip);

  const stills = useServerFn(generateVideoStills);
  const fetchScan = useServerFn(fetchScanClipBytes);

  const [pair, setPair] = useState<DupePair | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const loading = stage !== "idle" && stage !== "done";

  async function handleGenerate() {
    setError(null);
    setVideoUrl(null);
    setProgress(0);
    setPair(null);

    try {
      setStage("picking");
      const newPair = await pickPair();
      setPair(newPair);

      const script = buildScript(newPair);

      // Parallel: voiceover + scan clip + stills
      setStage("voiceover");
      const [voiceResult, scanResult, stillsResult] = await Promise.all([
        voice({ data: { script } }),
        (async () => {
          setStage((s) => (s === "voiceover" ? "scan" : s));
          return scan({
            data: {
              imageUrl: newPair.original.imageUrl,
              productName: newPair.original.name,
              brand: newPair.original.brand,
            },
          });
        })(),
        (async () => {
          return stills({ data: { pair: newPair } });
        })(),
      ]);

      // Fetch fal.ai mp4 bytes via server proxy (avoid CORS)
      setStage("stills");
      const scanBytes = await fetchScan({ data: { videoUrl: scanResult.videoUrl } });

      const stillMap = new Map(stillsResult.stills.map((s) => [s.slide, s.imageBase64]));
      const hookPng = stillMap.get("hook");
      const resultsPng = stillMap.get("results");
      const ctaPng = stillMap.get("cta");
      if (!hookPng || !resultsPng || !ctaPng) throw new Error("Missing stills");

      setStage("composing");
      const { composeReel } = await import("@/lib/ffmpeg-compose");
      const blob = await composeReel({
        hookPngBase64: hookPng,
        scanMp4Base64: scanBytes.base64,
        resultsPngBase64: resultsPng,
        ctaPngBase64: ctaPng,
        voiceMp3Base64: voiceResult.audioBase64,
        sceneDurations: voiceResult.sceneDurations,
        onProgress: (r) => setProgress(r),
      });

      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStage("idle");
    }
  }

  function downloadVideo() {
    if (!videoUrl || !pair) return;
    const slug = `${pair.original.brand}-${pair.original.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `dupli-reel-${slug}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Standalone
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Video Reel Generator
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Voiceover + scan clip + stills, composed in your browser. ~15s, 1080×1920.
          </p>
        </div>
        <div className="flex gap-2">
          {videoUrl && (
            <Button variant="outline" size="sm" onClick={downloadVideo}>
              <Download className="mr-2 h-4 w-4" />
              .mp4
            </Button>
          )}
          <Button onClick={handleGenerate} disabled={loading} size="sm">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {STAGE_LABEL[stage]}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {videoUrl ? "Regenerate" : "Generate new video"}
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {pair && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-xs">
          <img
            src={pair.original.imageUrl}
            alt={pair.original.name}
            className="h-12 w-12 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{pair.original.brand}</p>
            <p className="truncate text-muted-foreground">vs {pair.dupe.brand}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
            {pair.matchPct}%
          </span>
        </div>
      )}

      <div className="relative aspect-[9/16] w-full max-w-[280px] mx-auto overflow-hidden rounded-2xl bg-muted/40">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            {loading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-xs">{STAGE_LABEL[stage]}</p>
                {stage === "composing" && (
                  <div className="w-3/4">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Video className="h-8 w-8" />
                <p className="text-xs">No video yet</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
