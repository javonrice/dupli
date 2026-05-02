import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShoppingBag, ExternalLink, ArrowRight, TrendingDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCommunityDupe, type CommunityDupe } from "@/server/discover.functions";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";
import { googleShoppingLink } from "@/lib/retailer-links";

export const Route = createFileRoute("/_app/community/$brand/$product")({
  component: CommunityDupePage,
  head: () => ({
    meta: [{ title: "Dupe — Dupli" }],
  }),
});

function CommunityDupePage() {
  const { brand, product } = Route.useParams();
  const navigate = useNavigate();
  const fetchDupe = useServerFn(getCommunityDupe);
  const [dupes, setDupes] = useState<CommunityDupe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useHideTabBar();

  useEffect(() => {
    let cancelled = false;
    fetchDupe({ data: { brandSlug: brand, productSlug: product } })
      .then((r) => {
        if (cancelled) return;
        if (!r.found) {
          setError("We don't have data for this product yet.");
          return;
        }
        if (!r.dupes.length) {
          setError("No dupes found for this product yet.");
          return;
        }
        setDupes(r.dupes);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [brand, product, fetchDupe]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/" });
  }, [navigate]);

  if (error) {
    return (
      <IOSScreen title="Dupe" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[14px] text-muted-foreground">{error}</p>
          <Link
            to="/"
            className="tap mt-4 inline-flex h-10 items-center justify-center rounded-[12px] bg-foreground px-4 text-[13px] font-semibold text-background"
          >
            Back to home
          </Link>
        </div>
      </IOSScreen>
    );
  }

  if (!dupes) {
    return (
      <IOSScreen title="Dupe" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </IOSScreen>
    );
  }

  const safeIdx = Math.min(selectedIdx, dupes.length - 1);
  const current = dupes[safeIdx];
  const alternates = dupes.slice(1);
  const buyLink = googleShoppingLink(current.dupe.brand, current.dupe.productName);

  return (
    <IOSScreen
      title="Community dupe"
      back={{ onClick: goBack }}
      fullHeight
      bottomBar={
        <a
          href={buyLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tap flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
        >
          <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />
          Shop on Google
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
        </a>
      }
    >
      <div className="space-y-4 px-4 pb-6 pt-3">
        {/* Pair card */}
        <article className="overflow-hidden rounded-[20px] border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground">
              Community match
            </span>
            <div className="flex items-center gap-1 text-[12px] font-semibold text-foreground">
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
              {current.overallMatch}% match
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-border">
            <PairSide
              label="Original"
              brand={current.original.brand}
              name={current.original.productName}
              imageUrl={current.original.imageUrl}
              muted
            />
            <PairSide
              label="The dupe"
              brand={current.dupe.brand}
              name={current.dupe.productName}
              imageUrl={current.dupe.imageUrl}
            />
          </div>

          {/* Match meter */}
          <div className="space-y-2 border-t border-border px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ingredient match
              </span>
              <span className="font-display text-2xl font-bold tabular-nums">
                {current.ingredientMatch ?? current.overallMatch}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${current.ingredientMatch ?? current.overallMatch}%` }}
              />
            </div>
            {typeof current.sharedIngredientsCount === "number" &&
              current.sharedIngredientsCount > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {current.sharedIngredientsCount} shared ingredients
                </p>
              )}
          </div>

          {current.rationale && (
            <div className="border-t border-border bg-secondary/30 px-5 py-4">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Why it matches
              </div>
              <p className="text-[13px] leading-relaxed text-foreground">
                {current.rationale}
              </p>
            </div>
          )}
        </article>

        {/* Alternates rail — other community dupes for the same original */}
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
              {dupes.map((d, i) => {
                if (i === 0) return null;
                const isActive = i === safeIdx;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedIdx(i)}
                    className={`tap snap-start flex w-[160px] shrink-0 flex-col gap-2 rounded-[16px] border bg-card p-3 text-left shadow-soft transition ${
                      isActive ? "border-foreground" : "border-border"
                    }`}
                    aria-pressed={isActive}
                  >
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[12px] border border-border bg-secondary/40">
                      {d.dupe.imageUrl ? (
                        <img
                          src={d.dupe.imageUrl}
                          alt={`${d.dupe.brand} ${d.dupe.productName}`}
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
                        {d.dupe.brand}
                      </div>
                      <div className="mt-0.5 line-clamp-2 font-display text-[13px] font-semibold leading-tight text-foreground">
                        {d.dupe.productName}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">View</span>
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tabular-nums text-background">
                        {d.overallMatch}%
                      </span>
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

        <div className="rounded-[14px] border border-border bg-card px-4 py-3 text-center">
          <p className="text-[12px] text-muted-foreground">
            Have this product? Snap it for a personalized match.
          </p>
          <Link
            to="/"
            className="tap mt-2 inline-flex h-9 items-center justify-center gap-1 rounded-[10px] bg-foreground px-3 text-[12px] font-semibold text-background"
          >
            Scan it
            <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </IOSScreen>
  );
}

function PairSide({
  label,
  brand,
  name,
  imageUrl,
  muted = false,
}: {
  label: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  muted?: boolean;
}) {
  return (
    <div className={`p-5 ${muted ? "bg-background" : "bg-card"}`}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/40">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${brand} ${name}`}
            loading="lazy"
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ShoppingBag className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
        )}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {brand}
      </div>
      <h3 className="mt-1 font-display text-base font-semibold leading-tight">{name}</h3>
    </div>
  );
}
