import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShoppingBag, ArrowRight, TrendingDown } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getCommunityDupe, type CommunityDupe } from "@/lib/discover.functions";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";

export const Route = createFileRoute("/_app/community/$brand/$product")({
  component: CommunityDupePage,
  head: () => ({
    meta: [{ title: "Dupe — Dupli" }],
  }),
});

function fmtPrice(p: number | null | undefined): string {
  if (p == null || p <= 0) return "—";
  return p < 10 ? `$${p.toFixed(2)}` : `$${Math.round(p)}`;
}

function CommunityDupePage() {
  const { brand, product } = Route.useParams();
  const navigate = useNavigate();
  const fetchDupe = useServerFn(getCommunityDupe);
  const [dupes, setDupes] = useState<CommunityDupe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    else navigate({ to: "/app" });
  }, [navigate]);

  if (error) {
    return (
      <IOSScreen title="Dupe" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[14px] text-muted-foreground">{error}</p>
          <Link
            to="/app"
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

  // All entries share the same `original` (the queried product).
  const original = dupes[0].original;

  return (
    <IOSScreen
      title="Original"
      back={{ onClick: goBack }}
      fullHeight
      bottomBar={
        <Link
          to="/app"
          className="tap flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
        >
          Scan a product
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
      }
    >
      <div className="space-y-4 px-4 pb-6 pt-3">
        {/* Original product hero — image + brand + name + price */}
        <article className="overflow-hidden rounded-[20px] border border-border bg-card shadow-soft">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-secondary/40">
            {original.imageUrl ? (
              <img
                src={original.imageUrl}
                alt={`${original.brand} ${original.productName}`}
                loading="lazy"
                className="h-full w-full object-contain p-6"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <ShoppingBag className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
            )}
          </div>
          <div className="space-y-1 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {original.brand}
            </div>
            <h1 className="font-display text-[20px] font-semibold leading-tight text-foreground">
              {original.productName}
            </h1>
            {original.lowestPriceUsd != null && original.lowestPriceUsd > 0 && (
              <div className="pt-1 font-display text-[16px] font-bold tabular-nums text-foreground">
                {fmtPrice(original.lowestPriceUsd)}
              </div>
            )}
          </div>
        </article>

        {/* Dupes for this product — image + price tiles, ranked by match */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
            Dupes for this
          </h2>
          <div className="grid grid-cols-2 gap-3 pt-1">
            {dupes.map((d) => {
              const price = d.dupe.lowestPriceUsd;
              const Inner = (
                <>
                  <div className="relative">
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-secondary/40">
                      {d.dupe.imageUrl ? (
                        <img
                          src={d.dupe.imageUrl}
                          alt={`${d.dupe.brand} ${d.dupe.productName}`}
                          loading="lazy"
                          className="h-full w-full object-contain p-3"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <ShoppingBag
                          className="h-7 w-7 text-muted-foreground/60"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                    <div className="absolute right-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold tabular-nums text-background shadow-soft">
                      {d.overallMatch}%
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {d.dupe.brand}
                      </div>
                      <div className="line-clamp-1 font-display text-[13px] font-semibold leading-tight text-foreground">
                        {d.dupe.productName}
                      </div>
                    </div>
                    <div className="shrink-0 font-display text-[15px] font-bold tabular-nums text-foreground">
                      {fmtPrice(price)}
                    </div>
                  </div>
                </>
              );
              // Save-driven entries have empty product ids; render as static tiles in that case.
              return d.dupe.id ? (
                <Link
                  key={d.id}
                  to="/p/$productId"
                  params={{ productId: d.dupe.id }}
                  className="tap group flex flex-col overflow-hidden rounded-[16px] border border-border bg-card text-left shadow-soft"
                >
                  {Inner}
                </Link>
              ) : (
                <div
                  key={d.id}
                  className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-card text-left shadow-soft"
                >
                  {Inner}
                </div>
              );
            })}
          </div>
        </section>

        <div className="rounded-[14px] border border-border bg-card px-4 py-3 text-center">
          <p className="text-[12px] text-muted-foreground">
            Have this product? Snap it for a personalized match.
          </p>
          <Link
            to="/app"
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
