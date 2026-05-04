import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ShoppingBag,
  ExternalLink,
  TrendingDown,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getProductDetail, type ProductDetail } from "@/server/discover.functions";
import { IOSScreen } from "@/components/ios-screen";
import { useHideTabBar } from "@/lib/tab-bar-visibility";


export const Route = createFileRoute("/_app/p/$productId")({
  component: ProductDetailPage,
  head: () => ({
    meta: [{ title: "Product — Dupli" }],
  }),
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const fetchProduct = useServerFn(getProductDetail);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useHideTabBar();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProduct({ data: { productId } })
      .then((r) => {
        if (cancelled) return;
        if (!r.found || !r.product) {
          setError("We don't have data for this product.");
          return;
        }
        setProduct(r.product);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, fetchProduct]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/app" });
  }, [navigate]);

  if (loading) {
    return (
      <IOSScreen title="Product" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </IOSScreen>
    );
  }

  if (error || !product) {
    return (
      <IOSScreen title="Product" back={{ onClick: goBack }} fullHeight>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[14px] text-muted-foreground">
            {error ?? "Product not found."}
          </p>
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

  const topVendor = product.vendors[0];

  return (
    <IOSScreen
      title={product.brand}
      back={{ onClick: goBack }}
      fullHeight
      bottomBar={
        topVendor ? (
          <a
            href={topVendor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-foreground text-[15px] font-semibold text-background"
          >
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />
            {topVendor.priceUsd != null
              ? `Buy at ${topVendor.merchant} · $${topVendor.priceUsd.toFixed(2)}`
              : `Shop at ${topVendor.merchant}`}
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : null
      }
    >
      <div className="space-y-5 px-4 pb-6 pt-3">
        {/* Hero */}
        <article className="overflow-hidden rounded-[20px] border border-border bg-card shadow-soft">
          <div className="flex aspect-square items-center justify-center overflow-hidden bg-secondary/40">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={`${product.brand} ${product.productName}`}
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <ShoppingBag
                className="h-12 w-12 text-muted-foreground/60"
                strokeWidth={1.5}
              />
            )}
          </div>
          <div className="space-y-2 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {product.brand}
            </div>
            <h1 className="font-display text-[20px] font-bold leading-tight tracking-tight">
              {product.productName}
            </h1>
            {product.category && (
              <div className="text-[12px] text-muted-foreground">{product.category}</div>
            )}
            {product.lowestPriceUsd != null && (
              <div className="flex items-baseline gap-2 pt-1">
                <span className="font-display text-[26px] font-bold tabular-nums">
                  ${product.lowestPriceUsd.toFixed(2)}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  lowest price
                </span>
              </div>
            )}
          </div>
        </article>

        {/* Vendor list */}
        {product.vendors.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Where to buy
            </h2>
            <div className="overflow-hidden rounded-[16px] border border-border bg-card divide-y divide-border">
              {product.vendors.map((v) => (
                <a
                  key={`${v.merchant}-${v.rank}`}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-display text-[14px] font-semibold text-foreground">
                      {v.merchant}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {v.priceUsd != null ? (
                      <span className="font-display text-[15px] font-bold tabular-nums text-foreground">
                        ${v.priceUsd.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        See price
                      </span>
                    )}
                    <ExternalLink
                      className="h-3.5 w-3.5 text-muted-foreground"
                      strokeWidth={2}
                    />
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Tag groups */}
        {(product.goodFor.length > 0 ||
          product.freeFrom.length > 0 ||
          product.contains.length > 0) && (
          <section className="space-y-3">
            {product.goodFor.length > 0 && (
              <TagGroup
                icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />}
                label="Good for"
                tags={product.goodFor}
              />
            )}
            {product.freeFrom.length > 0 && (
              <TagGroup
                icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />}
                label="Free from"
                tags={product.freeFrom}
              />
            )}
            {product.contains.length > 0 && (
              <TagGroup
                icon={<AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />}
                label="Contains"
                tags={product.contains}
              />
            )}
          </section>
        )}

        {/* Ingredients */}
        {product.ingredients.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Ingredients
              </h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {product.ingredientsCount ?? product.ingredients.length}
              </span>
            </div>
            <div className="rounded-[16px] border border-border bg-card px-4 py-3">
              <p className="text-[12px] leading-relaxed text-foreground/90">
                {product.ingredients.join(", ")}
              </p>
            </div>
          </section>
        )}

        {/* Dupes for this product */}
        {product.dupesForThis.length > 0 && (
          <section className="space-y-2">
            <h2 className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
              Dupes for this
            </h2>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {product.dupesForThis.map((d) => (
                <CommunityDupeCard key={d.id} dupe={d} variant="card" />
              ))}
            </div>
          </section>
        )}

        {/* This is also a dupe for ... */}
        {product.alsoDupeFor.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Also a dupe for
            </h2>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {product.alsoDupeFor.map((d) => (
                <CommunityDupeCard key={d.id} dupe={d} variant="card" />
              ))}
            </div>
          </section>
        )}

        {product.sourceUrl && (
          <a
            href={product.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-1 text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            View source
          </a>
        )}
      </div>
    </IOSScreen>
  );
}

function TagGroup({
  icon,
  label,
  tags,
}: {
  icon: React.ReactNode;
  label: string;
  tags: string[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-foreground"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
