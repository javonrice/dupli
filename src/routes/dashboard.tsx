import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Download, RefreshCw, ImageIcon } from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import {
  pickRandomDupePair,
  generateCarouselSlides,
} from "@/lib/dashboard.functions";
import type { DupePair, SlideResult } from "@/lib/dupe-types";

import { UgcGenerator } from "@/components/dashboard/ugc-generator";
import { MyVideos } from "@/components/dashboard/my-videos";


export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dupli — Content Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DashboardPage() {
  const pickPair = useServerFn(pickRandomDupePair);
  const generate = useServerFn(generateCarouselSlides);

  const [pair, setPair] = useState<DupePair | null>(null);
  const [results, setResults] = useState<SlideResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"idle" | "picking" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setResults([]);
    setPair(null);
    setLoading(true);
    try {
      setStage("picking");
      const newPair = await pickPair();
      setPair(newPair);
      setStage("generating");
      const { results } = await generate({ data: { pair: newPair } });
      setResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setStage("idle");
      setLoading(false);
    }
  }

  async function retrySlide(slide: 1 | 2 | 3 | 4) {
    if (!pair) return;
    setResults((prev) =>
      prev.map((r) => (r.slide === slide ? { slide, ok: false, error: "retrying…" } : r)),
    );
    try {
      const { results: r } = await generate({ data: { pair, slides: [slide] } });
      const fresh = r[0];
      setResults((prev) => prev.map((p) => (p.slide === slide ? fresh : p)));
    } catch (e) {
      setResults((prev) =>
        prev.map((p) =>
          p.slide === slide
            ? { slide, ok: false, error: e instanceof Error ? e.message : "Failed" }
            : p,
        ),
      );
    }
  }

  async function downloadAll() {
    if (!pair) return;
    const okSlides = results.filter((r): r is Extract<SlideResult, { ok: true }> => r.ok);
    if (okSlides.length === 0) return;
    const zip = new JSZip();
    const slug = `${pair.original.brand}-${pair.original.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    for (const r of okSlides) {
      const b64 = r.dataUrl.split(",")[1];
      zip.file(`${slug}-slide-${r.slide}.png`, b64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dupli-carousel-${slug}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadOne(r: Extract<SlideResult, { ok: true }>) {
    if (!pair) return;
    const slug = `${pair.original.brand}-${pair.original.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const a = document.createElement("a");
    a.href = r.dataUrl;
    a.download = `${slug}-slide-${r.slide}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const slideLabels: Record<1 | 2 | 3 | 4, string> = {
    1: "Hook",
    2: "Scan",
    3: "Compare",
    4: "CTA",
  };

  const allDone = results.length === 4 && results.every((r) => r.ok);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Internal
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight">
              Social Content Generator
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Each click picks a fresh product + its top dupe and generates a 4-slide
              Instagram carousel via Nano Banana.
            </p>
          </div>
          <div className="flex gap-2">
            {allDone && (
              <Button variant="outline" onClick={downloadAll}>
                <Download className="mr-2 h-4 w-4" />
                Download all (.zip)
              </Button>
            )}
            <Button onClick={handleGenerate} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {stage === "picking" ? "Picking dupe…" : "Generating slides…"}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Generate new carousel
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {pair && (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PairCard label="Original" item={pair.original} />
              <PairCard label="Dupe" item={pair.dupe} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                {pair.matchPct}% match
              </span>
              <span className="text-muted-foreground">
                Save{" "}
                <span className="font-semibold text-foreground">
                  ${pair.savingsUsd.toFixed(2)}
                </span>
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((slide) => {
            const r = results.find((x) => x.slide === slide);
            return (
              <div
                key={slide}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="aspect-square w-full bg-muted/40">
                  {r?.ok ? (
                    <img
                      src={r.dataUrl}
                      alt={`Slide ${slide}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      {loading && stage === "generating" ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : r && !r.ok ? (
                        <div className="px-4 text-center text-xs text-destructive">
                          {r.error}
                        </div>
                      ) : (
                        <ImageIcon className="h-6 w-6" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-semibold">
                    {slide}. {slideLabels[slide]}
                  </span>
                  {r?.ok ? (
                    <button
                      onClick={() => downloadOne(r)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  ) : r && !r.ok ? (
                    <button
                      onClick={() => retrySlide(slide)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 space-y-8">
          <BatchGenerator />
          <UgcGenerator />
          <MyVideos />
        </div>

      </div>
    </div>
  );
}

function PairCard({
  label,
  item,
}: {
  label: string;
  item: { brand: string; name: string; imageUrl: string; priceUsd: number };
}) {
  return (
    <div className="flex gap-3">
      <img
        src={item.imageUrl}
        alt={item.name}
        className="h-20 w-20 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">{item.brand}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{item.name}</p>
        <p className="mt-1 text-sm font-bold">${item.priceUsd.toFixed(2)}</p>
      </div>
    </div>
  );
}
