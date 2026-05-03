import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Dupli" },
      { name: "description", content: "How Dupli collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy — Dupli" },
      { property: "og:description", content: "How Dupli collects, uses, and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: May 3, 2026</p>

      <div className="prose mt-8 space-y-6 text-[15px] leading-relaxed text-foreground">
        <section>
          <h2 className="font-display text-xl font-semibold">1. Overview</h2>
          <p>Dupli ("we", "us") helps you find affordable beauty product alternatives by analyzing photos you submit. This policy explains what we collect, why, and your rights.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">2. Information We Collect</h2>
          <ul className="list-disc pl-6">
            <li><strong>Account data:</strong> email address and authentication credentials.</li>
            <li><strong>Scan data:</strong> photos you upload, products identified, dupes returned, and items you save.</li>
            <li><strong>Usage data:</strong> device type, browser, and basic analytics to improve the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">3. How We Use It</h2>
          <p>To run scans, return matches, save your history, secure your account, and improve product accuracy. We do not sell your personal data.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">4. Third Parties</h2>
          <p>We use service providers for hosting, authentication, and AI inference (image and text models). These providers process data on our behalf under their own security obligations.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">5. Data Retention</h2>
          <p>Scans and saved items are retained while your account is active. You can delete your account at any time to remove associated data.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">6. Your Rights</h2>
          <p>You may access, correct, export, or delete your data. Contact us at <a className="underline" href="mailto:hello@dupli.lovable.app">hello@dupli.lovable.app</a>.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">7. Changes</h2>
          <p>We may update this policy. Material changes will be announced in-app.</p>
        </section>

        <p className="pt-6 text-sm text-muted-foreground">
          See also: <Link to="/terms" className="underline">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
