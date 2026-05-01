import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { DupeCard } from "@/components/dupe-card";
import { dupes } from "@/data/catalog";

export const Route = createFileRoute("/library")({
  component: Library,
  head: () => ({
    meta: [
      { title: "Dupe library — Dupli" },
      { name: "description", content: "Browse every esthetician-vetted dupe in the Dupli library." },
    ],
  }),
});

function Library() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
        <section className="mb-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            The library
          </p>
          <h1 className="font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl">
            Every dupe, vetted.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {dupes.length} dupes verified by licensed estheticians. More added weekly.
          </p>
        </section>

        <div className="space-y-5">
          {dupes.map((d) => (
            <DupeCard key={d.id} pair={d} />
          ))}
        </div>
      </main>
    </div>
  );
}
