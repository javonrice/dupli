import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShoppingBag, ExternalLink, RotateCw, Bookmark, Share2, X } from "lucide-react";
import type { DupeAnalysis, DupeSuggestion } from "@/server/scan.functions";
import { DupeCard } from "@/components/dupe-card";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";
import { googleShoppingLink } from "@/lib/retailer-links";
import { selectDupe } from "@/lib/select-dupe";

/* ---------------- Scanning (full-screen modal, no scroll) ---------------- */

export function ScanningScreen({ preview }: { preview: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex h-screen-safe flex-col bg-background">
      <div className="pt-safe" />
      <div className="relative flex-1 overflow-hidden">
        {preview && (
          <img
            src={preview}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Scrim */}
        <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
        {/* Sweeping scan line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] animate-[ios-scan_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-background to-transparent shadow-[0_0_24px_rgba(255,255,255,0.55)]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-background" strokeWidth={2} />
          <p className="font-display text-[17px] font-semibold text-background">
            Finding the dupe…
          </p>
          <p className="text-[13px] text-background/80">
            Reading the label and scanning ingredients.
          </p>
        </div>
      </div>
      <div className="pb-safe" />
      <style>{`
        @keyframes ios-scan {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ---------------- Results (scrollable Detail view) ---------------- */

export function ResultsScreen({
  analysis,
  preview,
  scanId,
  onReset,
  isSaved,
  canSave,
  onToggleSave,
  onShare,
  preparingShare,
}: {
  analysis: DupeAnalysis;
  preview: string | null;
  scanId?: string | null;
  onReset: () => void;
  isSaved: boolean;
  canSave: boolean;
  onToggleSave: () => void | Promise<void>;
  onShare?: (dupeIdx?: number) => void | Promise<void>;
  preparingShare?: boolean;
}) {
  // Hide the bottom tab bar while results are shown for extra spacing.
  useHideTabBar();

  // The AI returns up to 7 ranked candidates. Index 0 is the headline pick;
  // the rest live in the "Also could be a dupe" rail and can be promoted by tapping.
  const candidates: DupeSuggestion[] =
    analysis.dupes && analysis.dupes.length > 0
      ? analysis.dupes
      : analysis.dupe
        ? [analysis.dupe]
        : [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, Math.max(0, candidates.length - 1));
  const displayedAnalysis: DupeAnalysis = selectDupe(analysis, safeIdx);

  const dupe = displayedAnalysis.dupe;
  const link = dupe ? googleShoppingLink(dupe.brand, dupe.productName) : null;
  const alternates = candidates.slice(1);
  return (
    <IOSScreen
      title="Result"
      back={{ onClick: onReset }}
      fullHeight
      trailing={
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSave}
            disabled={!canSave}
            aria-label={isSaved ? "Remove from saved" : "Save"}
            aria-pressed={isSaved}
            className={
              isSaved
                ? "tap flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40"
                : "tap flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-foreground disabled:opacity-40"
            }
          >
            <Bookmark
              className="h-[18px] w-[18px]"
              strokeWidth={2}
              fill={isSaved ? "currentColor" : "none"}
            />
          </button>
          <button
            onClick={onReset}
            aria-label="New scan"
            className="tap flex h-9 w-9 items-center justify-center rounded-full bg-secondary/60 text-foreground"
          >
            <RotateCw className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      }
      bottomBar={
        <div className="flex items-stretch gap-2">
          {dupe &&
            (scanId ? (
              <Link
                to="/scan/$id/share"
                params={{ id: scanId }}
                search={safeIdx > 0 ? { dupe: safeIdx } : undefined}
                aria-label="Share this dupe as image"
                className="tap flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-card px-4 text-[13px] font-semibold text-foreground"
              >
                <Share2 className="h-[16px] w-[16px]" strokeWidth={2.25} />
                Share this dupe
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onShare?.(safeIdx)}
                disabled={preparingShare}
                aria-label="Share this dupe as image"
                className="tap flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-card px-4 text-[13px] font-semibold text-foreground disabled:opacity-60"
              >
                {preparingShare ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                ) : (
                  <Share2 className="h-[16px] w-[16px]" strokeWidth={2.25} />
                )}
                Share this dupe
              </button>
            ))}
          {link ? (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />
              Shop on Google
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
          ) : (
            <button
              onClick={onReset}
              className="tap flex h-[50px] flex-1 items-center justify-center rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
            >
              Scan another product
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-6 pt-3">
        {preview && (
          <div className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-3 shadow-soft">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-border bg-secondary/40">
              <img
                src={preview}
                alt="Your scan"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your scan
              </div>
              <p className="mt-0.5 truncate font-display text-[15px] font-semibold text-foreground">
                {analysis.original.productName}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {analysis.original.brand}
              </p>
            </div>
            <button
              onClick={onReset}
              className="tap flex h-9 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-[12px] font-semibold text-foreground"
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2.25} />
              New scan
            </button>
          </div>
        )}
        <DupeCard analysis={displayedAnalysis} />

        {alternates.length > 0 && (
          <section className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Also could be a dupe
              </div>
              <div className="text-[10px] font-medium text-muted-foreground">
                {alternates.length} more
              </div>
            </div>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {candidates.map((c, i) => {
                if (i === 0) return null;
                const isActive = i === safeIdx;
                return (
                  <button
                    key={`${c.brand}-${c.productName}-${i}`}
                    type="button"
                    onClick={() => setSelectedIdx(i)}
                    className={`tap snap-start flex w-[160px] shrink-0 flex-col gap-2 rounded-[16px] border bg-card p-3 text-left shadow-soft transition ${
                      isActive ? "border-foreground" : "border-border"
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[12px] border border-border bg-secondary/40">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={`${c.brand} ${c.productName}`}
                          loading="lazy"
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <ShoppingBag
                          className="h-6 w-6 text-muted-foreground/60"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {c.brand}
                      </div>
                      <div className="mt-0.5 line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground">
                        {c.productName}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="font-display text-[15px] font-bold tabular-nums">
                        {c.estimatedPriceUsd < 10
                          ? `$${c.estimatedPriceUsd.toFixed(2)}`
                          : `$${Math.round(c.estimatedPriceUsd)}`}
                      </span>
                      {typeof c.matchScore === "number" && c.matchScore > 0 && (
                        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tabular-nums text-background">
                          {c.matchScore}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {safeIdx > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIdx(0)}
                className="tap mx-auto block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to top pick
              </button>
            )}
          </section>
        )}
      </div>
    </IOSScreen>
  );
}

/* close-button atom kept for potential future overlays */
export function IOSCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="tap flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground backdrop-blur"
    >
      <X className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
