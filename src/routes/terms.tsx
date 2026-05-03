import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Dupli" },
      { name: "description", content: "The terms governing your use of Dupli." },
      { property: "og:title", content: "Terms of Service — Dupli" },
      { property: "og:description", content: "The terms governing your use of Dupli." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 3, 2026</p>

      <div className="prose mt-8 space-y-6 text-[15px] leading-relaxed text-foreground">
        <section>
          <h2 className="font-display text-xl font-semibold">1. Acceptance</h2>
          <p>By using Dupli you agree to these Terms. If you do not agree, do not use the service.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">2. The Service</h2>
          <p>Dupli identifies beauty products from images and suggests affordable alternatives. Results are informational and may be inaccurate; always verify ingredients and suitability before purchase.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">3. Accounts</h2>
          <p>You are responsible for safeguarding your credentials and for all activity under your account. You must be at least 13 years old to use Dupli.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">4. Acceptable Use</h2>
          <ul className="list-disc pl-6">
            <li>Do not upload content you do not have rights to.</li>
            <li>Do not attempt to reverse engineer, scrape, or overload the service.</li>
            <li>Do not use Dupli for unlawful purposes.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">5. Content</h2>
          <p>You retain ownership of images you upload. You grant us a limited license to process them to provide the service and improve product matching.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">6. Disclaimers</h2>
          <p>The service is provided "as is" without warranties. Product matches, ingredient analyses, and price information may be outdated or incorrect.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">7. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, Dupli is not liable for indirect, incidental, or consequential damages arising from your use of the service.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">8. Termination</h2>
          <p>We may suspend or terminate accounts that violate these Terms. You may stop using the service at any time.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">9. Contact</h2>
          <p>Questions? <a className="underline" href="mailto:hello@dupli.lovable.app">hello@dupli.lovable.app</a></p>
        </section>

        <p className="pt-6 text-sm text-muted-foreground">
          See also: <Link to="/privacy" className="underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
