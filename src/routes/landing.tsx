import { createFileRoute, Link } from "@tanstack/react-router";
import wordmark from "@/assets/dupli-wordmark.png";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "Dupli — Snap a product, find the dupe" },
      {
        name: "description",
        content:
          "Point your camera at any beauty product and Dupli finds the affordable dupe in seconds.",
      },
      { property: "og:title", content: "Dupli — Snap a product, find the dupe" },
      {
        property: "og:description",
        content:
          "Point your camera at any beauty product and Dupli finds the affordable dupe in seconds.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <img src={wordmark} alt="Dupli" className="h-8 w-auto" width={887} height={414} />
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link
            to="/login"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-12 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          AI Dupe Finder
        </p>
        <h1 className="mt-3 font-display text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Snap any product.{" "}
          <span className="italic text-muted-foreground">Find the dupe.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          Dupli is a beauty dupe finder. Point your camera at any product and we'll
          identify it and surface affordable alternatives in seconds — with side-by-side
          ingredient and price comparisons.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/login"
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </Link>
          <Link
            to="/app"
            className="rounded-full border border-border px-6 py-3 text-sm font-semibold hover:bg-muted"
          >
            Open app
          </Link>
        </div>

        <section className="mt-20 grid gap-6 text-left sm:grid-cols-3">
          <Feature
            title="Snap a photo"
            body="Use your camera or upload an existing photo of any beauty product."
          />
          <Feature
            title="AI identifies it"
            body="We recognize the product, brand, and key ingredients in seconds."
          />
          <Feature
            title="Get the dupe"
            body="See affordable alternatives ranked by ingredient match and price."
          />
        </section>

        <section className="mt-20 rounded-2xl border border-border bg-muted/30 p-6 text-left text-sm text-muted-foreground">
          <h2 className="font-display text-base font-semibold text-foreground">
            How Dupli uses your data
          </h2>
          <p className="mt-2">
            We process the photos you upload to identify products and generate dupe
            recommendations. We never sell your personal data. For full details see our{" "}
            <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>{" "}
            and{" "}
            <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link>.
          </p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl items-center justify-between border-t border-border px-6 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Dupli</span>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
          <a href="mailto:hello@dupli.lovable.app" className="hover:text-foreground">Contact</a>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
