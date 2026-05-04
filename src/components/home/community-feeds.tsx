import type { TrendingOriginal } from "@/server/discover.functions";
import { CommunityOriginalCard } from "./community-original-card";

/** Horizontal swipeable rail of trending originals (each shows N dupes summary). */
export function TrendingRail({
  items,
  title = "Trending this week",
}: {
  items: TrendingOriginal[];
  title?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <SectionHeader title={title} />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <CommunityOriginalCard key={it.id} item={it} variant="card" />
        ))}
      </div>
    </section>
  );
}

/** 2-column grid of trending originals — the "For you" / popular feed. */
export function ForYouGrid({ items }: { items: TrendingOriginal[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <SectionHeader title="Popular originals" />
      <div className="grid grid-cols-2 gap-3 pt-1">
        {items.map((it) => (
          <CommunityOriginalCard key={it.id} item={it} variant="tile" />
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
    </div>
  );
}
