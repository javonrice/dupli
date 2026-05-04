import type { CommunityDupe } from "@/server/discover.functions";
import { CommunityDupeCard } from "./community-dupe-card";

/** Horizontal swipeable rail of trending community dupes. */
export function TrendingRail({
  dupes,
  title = "Trending this week",
}: {
  dupes: CommunityDupe[];
  title?: string;
}) {
  if (!dupes.length) return null;
  return (
    <section className="space-y-2">
      <SectionHeader title={title} />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {dupes.map((d) => (
          <CommunityDupeCard key={d.id} dupe={d} variant="card" />
        ))}
      </div>
    </section>
  );
}

/** 2-column grid of community dupes — the "For you" / popular feed. */
export function ForYouGrid({ dupes }: { dupes: CommunityDupe[] }) {
  if (!dupes.length) return null;
  return (
    <section className="space-y-2">
      <SectionHeader title="Popular dupes" />
      <div className="grid grid-cols-2 gap-3 pt-1">
        {dupes.map((d) => (
          <CommunityDupeCard key={d.id} dupe={d} variant="tile" />
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
