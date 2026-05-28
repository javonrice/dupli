import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2,
  Download,
  Trash2,
  Copy,
  CheckCircle2,
  Film,
} from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import {
  listMyVideos,
  deleteMyVideo,
  getVideoSignedUrl,
  type SavedVideo,
} from "@/lib/user-videos.functions";

export function MyVideos({ refreshKey }: { refreshKey?: number }) {
  const list = useServerFn(listMyVideos);
  const del = useServerFn(deleteMyVideo);
  const sign = useServerFn(getVideoSignedUrl);
  const qc = useQueryClient();

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["my-videos", refreshKey ?? 0],
    queryFn: () => list(),
    refetchInterval: 5000,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === videos.length) setSelected(new Set());
    else setSelected(new Set(videos.map((v) => v.id)));
  }

  async function downloadOne(v: SavedVideo) {
    const { url } = await sign({ data: { storagePath: v.storage_path } });
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameFor(v);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadZip() {
    const picks = videos.filter((v) => selected.has(v.id));
    if (picks.length === 0) return;
    setBusy(true);
    setZipProgress({ done: 0, total: picks.length });
    try {
      const zip = new JSZip();
      for (let i = 0; i < picks.length; i++) {
        const v = picks[i];
        const { url } = await sign({ data: { storagePath: v.storage_path } });
        const res = await fetch(url);
        const blob = await res.blob();
        zip.file(filenameFor(v), blob);
        if (v.caption) zip.file(filenameFor(v).replace(/\.mp4$/, ".txt"), v.caption);
        setZipProgress({ done: i + 1, total: picks.length });
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dupli-videos-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
      setZipProgress(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this video? This can't be undone.")) return;
    await del({ data: { id } });
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    qc.invalidateQueries({ queryKey: ["my-videos"] });
  }

  async function copyCaption(v: SavedVideo) {
    if (!v.caption) return;
    await navigator.clipboard.writeText(v.caption);
    setCopied(v.id);
    setTimeout(() => setCopied((c) => (c === v.id ? null : c)), 1500);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Your library
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            My Videos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every reel you generate is saved here. Copy the caption, download
            individually, or bundle a selection as a zip.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {videos.length > 0 && (
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selected.size === videos.length ? "Clear" : "Select all"}
            </Button>
          )}
          <Button
            size="sm"
            disabled={selected.size === 0 || busy}
            onClick={downloadZip}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {zipProgress
                  ? `Zipping ${zipProgress.done}/${zipProgress.total}`
                  : "Preparing…"}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download {selected.size > 0 ? selected.size : ""} (.zip)
              </>
            )}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground">
          <Film className="h-6 w-6" />
          No videos yet. Generate one above and it'll land here.
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => {
            const isSel = selected.has(v.id);
            return (
              <li
                key={v.id}
                className={`overflow-hidden rounded-xl border bg-background/40 transition ${
                  isSel ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(v.id)}
                  className="relative block aspect-[9/16] w-full overflow-hidden bg-muted"
                >
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Film className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2 rounded-full bg-background/80 p-1">
                    {isSel ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <span className="block h-5 w-5 rounded-full border-2 border-white/70" />
                    )}
                  </div>
                </button>
                <div className="space-y-2 p-3 text-xs">
                  <div className="font-semibold">
                    {v.original_brand ?? "Original"}{" "}
                    <span className="text-muted-foreground">→</span>{" "}
                    {v.dupe_brand ?? "Dupe"}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(v.created_at).toLocaleDateString()} ·{" "}
                    {v.duration_sec ? `${Math.round(v.duration_sec)}s` : ""}
                  </div>
                  {v.caption && (
                    <p className="line-clamp-3 whitespace-pre-line text-foreground/80">
                      {v.caption}
                    </p>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => downloadOne(v)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      MP4
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyCaption(v)}
                    >
                      {copied === v.id ? (
                        <CheckCircle2 className="mr-1 h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="mr-1 h-3 w-3" />
                      )}
                      Caption
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(v.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function filenameFor(v: SavedVideo): string {
  const slug = `${v.dupe_brand ?? "dupe"}-${v.dupe_name ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `dupli-${slug}-${v.id.slice(0, 6)}.mp4`;
}
