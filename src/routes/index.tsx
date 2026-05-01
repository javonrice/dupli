import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Scanner } from "@/components/scanner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Dupli — Snap a product, find the dupe" },
      {
        name: "description",
        content: "Point your camera at any beauty product and Dupli finds the affordable dupe in seconds.",
      },
    ],
  }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-8">
        <section className="mb-7">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            AI-powered dupe finder
          </p>
          <h1 className="font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-4xl">
            Snap any product.<br />
            <span className="italic text-muted-foreground">Find the dupe.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Vetted by licensed estheticians. Save up to <span className="font-semibold text-foreground">97%</span> on the viral skincare you already love.
          </p>
        </section>

        <Scanner />
      </main>
    </div>
  );
}
